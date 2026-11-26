// 5ABI.FX Trade Journal for Quantower, v1.00
// A Quantower strategy that sends every closed trade (entry, exit, partial closes, stop, target, candles)
// to your 5ABI.FX journal, the same way the MT5 Trade Journal EA does. It never places, changes or cancels orders.
//
// Install: copy the folder "5ABI Journal" (with 5ABI Journal.dll inside) to
//   <Quantower folder>\Settings\Scripts\Strategies\
// then restart Quantower. Open Strategies Manager, add "5ABI Journal", paste your journal key, press Start.
// It reads every connected account. Each account name must be added on My EAs on the website.
//
// Build (owner only): Visual Studio + Quantower Algo extension, or reference
//   <Quantower folder>\TradingPlatform\<version>\bin\TradingPlatform.BusinessLayer.dll (target .NET 10, class library).
// Files: %AppData%\5ABI\journal-qt\ (trades waiting to send, and the list already sent)
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using TradingPlatform.BusinessLayer;

namespace Journal5ABI
{
    public class Journal5ABI : Strategy
    {
        private const string EaCode = "JOURNAL";             // same licence as the MT5 Trade Journal
        private const string Server = "https://5abifx.com";   // website address, no trailing slash
        private const string Version = "1.00";
        private const int MaxCandles = 1500;

        [InputParameter("Journal key", 10)]
        public string JournalKey = "";

        [InputParameter("Only these accounts (blank = all)", 20)]
        public string OnlyAccounts = "";

        [InputParameter("Candles before entry", 30, 10, 500, 1, 0)]
        public int BarsBefore = 90;

        [InputParameter("Candles after exit", 40, 5, 300, 1, 0)]
        public int BarsAfter = 45;

        [InputParameter("Send trades of the last N days on start", 50, 0, 365, 1, 0)]
        public int CatchUpDays = 30;

        private class Fill { public DateTime Utc; public double Price, Qty, Fee, Gross; public bool Buy; public string Id; }

        private class Round
        {
            public string Account, Symbol;
            public Symbol Sym;
            public Account Acct;
            public bool Buy;
            public double Net;
            public List<Fill> Ins = new List<Fill>(), Outs = new List<Fill>();
            public double Sl, Tp, FeeTotal;
        }

        private class Pending { public string Account, PosId, Json, File; public DateTime Due; public bool Final; }

        private readonly object gate = new object();
        private readonly Dictionary<string, Round> open = new Dictionary<string, Round>();
        private readonly List<Pending> queue = new List<Pending>();
        private readonly HashSet<string> sent = new HashSet<string>();
        private readonly HashSet<string> seenTrade = new HashSet<string>();
        private readonly Dictionary<string, string> licence = new Dictionary<string, string>();
        private readonly Dictionary<string, DateTime> licenceNext = new Dictionary<string, DateTime>();
        private readonly Dictionary<string, Tuple<DateTime, Round, int>> resendAt = new Dictionary<string, Tuple<DateTime, Round, int>>();
        private Timer timer;
        private int busy, sentToday;
        private DateTime sentDay = DateTime.MinValue;
        private string dir, lastSync = "nothing sent yet";
        private TimeZoneInfo nyTz;

        public Journal5ABI() : base()
        {
            Name = "5ABI Journal";
            Description = "5ABI.FX Trade Journal: sends every closed trade on your Quantower accounts to your journal. Never trades.";
        }

        protected override void OnRun()
        {
            try { nyTz = TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time"); }
            catch { try { nyTz = TimeZoneInfo.FindSystemTimeZoneById("America/New_York"); } catch { nyTz = TimeZoneInfo.Utc; } }
            try { ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12; } catch { }
            dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "5ABI", "journal-qt");
            Directory.CreateDirectory(dir);
            LoadSent();
            LoadPending();
            if (string.IsNullOrWhiteSpace(JournalKey))
                Log("Paste your journal key (Journal page on " + Server + ") into the settings, then Start again.", StrategyLoggingLevel.Error);
            CatchUp();
            Core.Instance.TradeAdded += OnTrade;
            Core.Instance.OrderAdded += OnOrder;
            timer = new Timer(_ => Tick(), null, 2000, 10000);
            Log("5ABI Journal v" + Version + " running.", StrategyLoggingLevel.Info);
        }

        protected override void OnStop()
        {
            Core.Instance.TradeAdded -= OnTrade;
            Core.Instance.OrderAdded -= OnOrder;
            if (timer != null) { timer.Dispose(); timer = null; }
        }

        // short lines for the Strategies Manager panel
        protected override List<StrategyMetric> OnGetMetrics()
        {
            List<StrategyMetric> m = base.OnGetMetrics();
            lock (gate)
            {
                foreach (var kv in licence)
                    m.Add(new StrategyMetric { Name = kv.Key, FormattedValue = kv.Value == "OK" ? "OK" : kv.Value.Contains("not registered") ? "add it on My EAs" : Short(kv.Value) });
                m.Add(new StrategyMetric { Name = "Sent today", FormattedValue = (sentDay == DateTime.Today ? sentToday : 0).ToString(CultureInfo.InvariantCulture) });
                m.Add(new StrategyMetric { Name = "Waiting", FormattedValue = queue.Count.ToString(CultureInfo.InvariantCulture) });
            }
            m.Add(new StrategyMetric { Name = "Last", FormattedValue = Short(lastSync) });
            if (string.IsNullOrWhiteSpace(JournalKey)) m.Add(new StrategyMetric { Name = "Key", FormattedValue = "paste your journal key" });
            return m;
        }

        // ---------------- accounts ----------------
        private static string Clean(string name)
        {
            var sb = new StringBuilder();
            foreach (char c in (name ?? "").Trim()) sb.Append(char.IsLetterOrDigit(c) && c < 128 || c == '.' || c == '_' || c == '-' ? c : '-');
            string s = sb.ToString();
            return s.Length > 40 ? s.Substring(0, 40) : s;
        }

        private bool Wanted(Account a)
        {
            if (a == null) return false;
            if (string.IsNullOrWhiteSpace(OnlyAccounts)) return true;
            return OnlyAccounts.Split(',', ';').Select(x => x.Trim()).Any(x => x.Length > 0 && (string.Equals(x, a.Name, StringComparison.OrdinalIgnoreCase) || string.Equals(x, Clean(a.Name), StringComparison.OrdinalIgnoreCase)));
        }

        // trades the broker still has for the last N days: rebuild the ones closed while Quantower was off
        private void CatchUp()
        {
            if (CatchUpDays <= 0) return;
            try
            {
                var p = new TradesHistoryRequestParameters { From = DateTime.UtcNow.AddDays(-CatchUpDays), To = DateTime.UtcNow };
                var list = Core.Instance.GetTrades(p);
                if (list == null) return;
                foreach (Trade t in list.OrderBy(t => t.DateTime)) Feed(t, true);
            }
            catch (Exception ex) { Log("Catch-up: " + ex.Message, StrategyLoggingLevel.Error); }
        }

        private void OnTrade(Trade t)
        {
            try { Feed(t, false); }
            catch (Exception ex) { Log(ex.Message, StrategyLoggingLevel.Error); }
        }

        // the first stop / limit on the other side while a position is open = initial stop / target
        private void OnOrder(Order o)
        {
            try
            {
                if (o == null || o.Account == null || o.Symbol == null) return;
                lock (gate)
                {
                    Round r;
                    if (!open.TryGetValue(Key(o.Account, o.Symbol), out r)) return;
                    Levels(o, r);
                }
            }
            catch { }
        }

        private static void Levels(Order o, Round r)
        {
            bool sells = o.Side == Side.Sell;
            if (sells != r.Buy) return;
            string type = o.OrderTypeId ?? "";
            if ((type == OrderType.Stop || type == OrderType.StopLimit) && r.Sl == 0) r.Sl = o.TriggerPrice;
            else if (type == OrderType.Limit && r.Tp == 0) r.Tp = o.Price;
        }

        private static string Key(Account a, Symbol s) { return (a == null ? "" : a.Id) + "|" + (s == null ? "" : s.Id); }

        private static double Pnl(PnLItem p) { return p == null || double.IsNaN(p.Value) ? 0 : p.Value; }

        private void Feed(Trade x, bool replay)
        {
            if (x == null || x.Account == null || x.Symbol == null || x.Quantity <= 0 || !Wanted(x.Account)) return;
            string key = Key(x.Account, x.Symbol);
            string fid = x.Id ?? (x.DateTime.Ticks + "|" + x.Price);
            bool buy = x.Side == Side.Buy;
            double qty = x.Quantity;
            DateTime utc = x.DateTime.Kind == DateTimeKind.Local ? x.DateTime.ToUniversalTime() : DateTime.SpecifyKind(x.DateTime, DateTimeKind.Utc);
            double fee = Math.Abs(Pnl(x.Fee)), gross = Pnl(x.GrossPnl);
            Round done = null;
            lock (gate)
            {
                if (!seenTrade.Add(x.Account.Id + "|" + fid)) return;
                Round r;
                open.TryGetValue(key, out r);
                if (r == null)
                {
                    // a closing fill with nothing open is half of an older trade: skip it
                    if (gross != 0 && replay) return;
                    r = NewRound(x.Account, x.Symbol, buy);
                    open[key] = r;
                }
                if ((r.Net >= 0) == buy || r.Net == 0)
                {
                    r.Ins.Add(new Fill { Utc = utc, Price = x.Price, Qty = qty, Buy = buy, Fee = fee, Id = fid });
                    r.Net += buy ? qty : -qty;
                    r.FeeTotal += fee;
                    if (r.Sl == 0 || r.Tp == 0)
                        try { foreach (Order o in Core.Instance.Orders) if (o.Account == x.Account && o.Symbol == x.Symbol) Levels(o, r); } catch { }
                }
                else
                {
                    double close = Math.Min(qty, Math.Abs(r.Net)), part = close / qty;
                    r.Outs.Add(new Fill { Utc = utc, Price = x.Price, Qty = close, Buy = buy, Fee = fee * part, Gross = gross * part, Id = fid });
                    r.FeeTotal += fee * part;
                    r.Net += buy ? close : -close;
                    if (Math.Abs(r.Net) < 1e-9)
                    {
                        open.Remove(key);
                        done = r;
                        double rest = qty - close;
                        if (rest > 1e-9)
                        {
                            Round next = NewRound(x.Account, x.Symbol, buy);
                            next.Ins.Add(new Fill { Utc = utc, Price = x.Price, Qty = rest, Buy = buy, Fee = fee * (1 - part), Id = fid + "r" });
                            next.Net = buy ? rest : -rest;
                            next.FeeTotal = fee * (1 - part);
                            open[key] = next;
                        }
                    }
                }
            }
            if (done != null) Closed(done);
        }

        private static Round NewRound(Account a, Symbol s, bool buy)
        {
            return new Round { Account = Clean(a.Name), Acct = a, Symbol = s.Name, Sym = s, Buy = buy };
        }

        // ---------------- a trade closed: candles, then queue ----------------
        private static string PosId(Round r)
        {
            long t = (long)(r.Ins[0].Utc - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;
            string s = "QT" + t + Clean(r.Symbol);
            return s.Length > 40 ? s.Substring(0, 40) : s;
        }

        private static int Tf(Round r, int before, int after)
        {
            int[] steps = { 1, 5, 15, 60, 240, 1440 };
            double mins = (r.Outs[r.Outs.Count - 1].Utc - r.Ins[0].Utc).TotalMinutes;
            foreach (int m in steps) if (mins / m + before + after <= MaxCandles) return m;
            return 1440;
        }

        private void Closed(Round r)
        {
            string id = PosId(r);
            lock (gate) { if (sent.Contains(r.Account + "|" + id) || queue.Any(q => q.Account == r.Account && q.PosId == id)) return; }
            int tf = Tf(r, BarsBefore, BarsAfter);
            DateTime closeUtc = r.Outs[r.Outs.Count - 1].Utc, afterDone = closeUtc.AddMinutes(BarsAfter * tf);
            bool complete = afterDone <= DateTime.UtcNow;
            Enqueue(r, id, tf, complete);
            if (!complete) lock (gate) resendAt[r.Account + "|" + id] = new Tuple<DateTime, Round, int>(afterDone.AddSeconds(30), r, tf);
        }

        private void Enqueue(Round r, string id, int tf, bool final)
        {
            DateTime from = r.Ins[0].Utc.AddMinutes(-BarsBefore * tf), to = r.Outs[r.Outs.Count - 1].Utc.AddMinutes(BarsAfter * tf);
            if (to > DateTime.UtcNow) to = DateTime.UtcNow;
            List<double[]> bars = GetBars(r.Sym, tf, from, to);
            var p = new Pending { Account = r.Account, PosId = id, Json = BuildJson(r, id, tf, bars), Due = DateTime.UtcNow, Final = final };
            p.File = Path.Combine(dir, "wait_" + r.Account + "_" + id + ".json");
            try { File.WriteAllText(p.File, p.Json); } catch { }
            lock (gate) { queue.RemoveAll(q => q.Account == p.Account && q.PosId == p.PosId); queue.Add(p); }
        }

        private static Period PeriodOf(int minutes)
        {
            switch (minutes)
            {
                case 1: return Period.MIN1;
                case 5: return Period.MIN5;
                case 15: return Period.MIN15;
                case 60: return Period.HOUR1;
                case 240: return Period.HOUR4;
                default: return Period.DAY1;
            }
        }

        // candles from Quantower's history, times in UTC
        private List<double[]> GetBars(Symbol sym, int minutes, DateTime fromUtc, DateTime toUtc)
        {
            var list = new List<double[]>();
            if (sym == null) return list;
            try
            {
                HistoricalData hd = sym.GetHistory(PeriodOf(minutes), sym.HistoryType, fromUtc, toUtc);
                if (hd == null) return list;
                for (int i = 0; i < hd.Count; i++)
                {
                    var b = hd[i, SeekOriginHistory.Begin] as HistoryItemBar;
                    if (b == null) continue;
                    DateTime t = b.TimeLeft.Kind == DateTimeKind.Local ? b.TimeLeft.ToUniversalTime() : DateTime.SpecifyKind(b.TimeLeft, DateTimeKind.Utc);
                    list.Add(new[] { Broker(t), b.Open, b.High, b.Low, b.Close });
                }
                hd.Dispose();
            }
            catch (Exception ex) { Log("Candles " + sym.Name + ": " + ex.Message, StrategyLoggingLevel.Error); }
            list = list.OrderBy(b => b[0]).ToList();
            if (list.Count > MaxCandles) list = list.Skip(list.Count - MaxCandles).ToList();
            return list;
        }

        // ---------------- times: the journal works in "broker time" like most MT5 brokers (New York + 7 h) ----------------
        private DateTime BrokerTime(DateTime utc) { return TimeZoneInfo.ConvertTimeFromUtc(utc, nyTz).AddHours(7); }
        private double Broker(DateTime utc) { return Math.Floor((BrokerTime(utc) - new DateTime(1970, 1, 1)).TotalSeconds); }
        private string Iso(DateTime utc) { return BrokerTime(utc).ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture); }

        // ---------------- JSON ----------------
        private static string N(double v, int d = 2) { return double.IsNaN(v) || double.IsInfinity(v) ? "0" : v.ToString("F" + d, CultureInfo.InvariantCulture); }
        private static string S(string v)
        {
            var sb = new StringBuilder("\"");
            foreach (char c in v ?? "")
            {
                if (c == '"' || c == '\\') sb.Append('\\').Append(c);
                else if (c < 32) sb.Append(' ');
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }

        private static int Digits(double tick)
        {
            int d = 0;
            while (d < 8 && Math.Abs(tick * Math.Pow(10, d) - Math.Round(tick * Math.Pow(10, d))) > 1e-7) d++;
            return d;
        }

        private string BuildJson(Round r, string id, int tf, List<double[]> bars)
        {
            Symbol sym = r.Sym;
            double tick = sym.TickSize > 0 ? sym.TickSize : 0.01;
            int dg = Digits(tick);
            double inQty = r.Ins.Sum(f => f.Qty), outQty = r.Outs.Sum(f => f.Qty);
            double entry = r.Ins.Sum(f => f.Price * f.Qty) / inQty;
            double exit = r.Outs[r.Outs.Count - 1].Price, avgExit = r.Outs.Sum(f => f.Price * f.Qty) / outQty;
            double dir = r.Buy ? 1 : -1;
            // money per 1 price unit per 1 lot, from Quantower's tick cost
            double perPoint = 1;
            try { double tc = sym.GetTickCost(entry); if (tc > 0) perPoint = tc / tick; } catch { }
            Func<Fill, double> fillProfit = f => f.Gross != 0 ? f.Gross : (f.Price - entry) * dir * f.Qty * perPoint;
            double profit = r.Outs.Sum(fillProfit);
            double commission = -r.FeeTotal, net = profit + commission;
            double ticks = (avgExit - entry) * dir / tick;
            double risk = r.Sl > 0 ? Math.Abs(entry - r.Sl) * inQty * perPoint : 0;
            double rr = risk > 0 ? net / risk : 0;

            double balance = 0;
            string currency = "USD", broker = "Quantower";
            try
            {
                balance = r.Acct.Balance;
                if (r.Acct.AccountCurrency != null && !string.IsNullOrEmpty(r.Acct.AccountCurrency.Name)) currency = r.Acct.AccountCurrency.Name;
                if (r.Acct.Connection != null && !string.IsNullOrEmpty(r.Acct.Connection.Name)) broker = r.Acct.Connection.Name;
            }
            catch { }
            double startBal = balance - net;
            double riskPct = risk > 0 && startBal > 0 ? risk / startBal * 100 : 0;
            double pct = startBal > 0 ? net / startBal * 100 : 0;

            DateTime openUtc = r.Ins[0].Utc, closeUtc = r.Outs[r.Outs.Count - 1].Utc;
            double bo = Broker(openUtc) - tf * 60, bc = Broker(closeUtc);
            var inside = bars.Where(b => b[0] >= bo && b[0] <= bc).ToList();
            double mfe = 0, mae = 0;
            if (inside.Count > 0)
            {
                double hi = inside.Max(b => b[2]), lo = inside.Min(b => b[3]);
                mfe = Math.Max(0, r.Buy ? hi - entry : entry - lo);
                mae = Math.Max(0, r.Buy ? entry - lo : hi - entry);
            }

            var sb = new StringBuilder();
            sb.Append("{\"key\":").Append(S(JournalKey.Trim())).Append(",\"ea\":").Append(S(EaCode)).Append(",\"platform\":\"Quantower\"")
              .Append(",\"account\":").Append(S(r.Account)).Append(",\"broker\":").Append(S(broker))
              .Append(",\"currency\":").Append(S(currency)).Append(",\"trade\":{")
              .Append("\"position_id\":").Append(S(id)).Append(",\"symbol\":").Append(S(r.Symbol)).Append(",\"side\":").Append(r.Buy ? "\"BUY\"" : "\"SELL\"")
              .Append(",\"lots\":").Append(N(inQty)).Append(",\"entry\":").Append(N(entry, dg)).Append(",\"exit\":").Append(N(exit, dg))
              .Append(",\"sl\":").Append(N(r.Sl, dg)).Append(",\"tp\":").Append(N(r.Tp, dg)).Append(",\"digits\":").Append(dg)
              .Append(",\"open_time\":").Append(S(Iso(openUtc))).Append(",\"close_time\":").Append(S(Iso(closeUtc)))
              .Append(",\"profit\":").Append(N(profit)).Append(",\"commission\":").Append(N(commission)).Append(",\"swap\":0")
              .Append(",\"net\":").Append(N(net)).Append(",\"pips\":").Append(N(ticks, 1)).Append(",\"r\":").Append(N(rr))
              .Append(",\"risk_money\":").Append(N(risk)).Append(",\"risk_pct\":").Append(N(riskPct)).Append(",\"pct\":").Append(N(pct))
              .Append(",\"balance_after\":").Append(N(balance)).Append(",\"mfe\":").Append(N(mfe, dg)).Append(",\"mae\":").Append(N(mae, dg))
              .Append(",\"magic\":0,\"comment\":\"\",\"tf\":").Append(S(tf >= 1440 ? "D1" : tf >= 60 ? "H" + tf / 60 : "M" + tf))
              .Append(",\"partials\":[");
            for (int i = 0; i < r.Outs.Count; i++)
            {
                Fill f = r.Outs[i];
                if (i > 0) sb.Append(',');
                sb.Append("{\"time\":").Append(S(Iso(f.Utc))).Append(",\"price\":").Append(N(f.Price, dg)).Append(",\"lots\":").Append(N(f.Qty))
                  .Append(",\"profit\":").Append(N(fillProfit(f))).Append('}');
            }
            sb.Append("],\"candles\":[");
            for (int i = 0; i < bars.Count; i++)
            {
                double[] b = bars[i];
                if (i > 0) sb.Append(',');
                sb.Append('[').Append(N(b[0], 0)).Append(',').Append(N(b[1], dg)).Append(',').Append(N(b[2], dg)).Append(',').Append(N(b[3], dg)).Append(',').Append(N(b[4], dg)).Append(']');
            }
            sb.Append("]}}");
            return sb.ToString();
        }

        // ---------------- files ----------------
        private string SentFile() { return Path.Combine(dir, "sent.txt"); }

        private void LoadSent()
        {
            try { if (File.Exists(SentFile())) foreach (string l in File.ReadAllLines(SentFile())) if (l.Trim().Length > 0) sent.Add(l.Trim()); } catch { }
        }

        private void MarkSent(Pending p)
        {
            lock (gate) sent.Add(p.Account + "|" + p.PosId);
            try { File.AppendAllText(SentFile(), p.Account + "|" + p.PosId + Environment.NewLine); } catch { }
            try { if (p.File != null) File.Delete(p.File); } catch { }
        }

        private void LoadPending()
        {
            try
            {
                foreach (string f in Directory.GetFiles(dir, "wait_*.json"))
                {
                    string json = File.ReadAllText(f);
                    string acct = Between(json, "\"account\":\"", "\""), id = Between(json, "\"position_id\":\"", "\"");
                    if (acct.Length == 0 || id.Length == 0) continue;
                    queue.Add(new Pending { Account = acct, PosId = id, Json = json, File = f, Due = DateTime.UtcNow, Final = true });
                }
            }
            catch { }
        }

        private static string Between(string s, string a, string b)
        {
            int i = s.IndexOf(a, StringComparison.Ordinal);
            if (i < 0) return "";
            i += a.Length;
            int j = s.IndexOf(b, i, StringComparison.Ordinal);
            return j < 0 ? "" : s.Substring(i, j - i);
        }

        // ---------------- network (every 10 s) ----------------
        private void Tick()
        {
            if (Interlocked.Exchange(ref busy, 1) == 1) return;
            try
            {
                List<KeyValuePair<string, Tuple<DateTime, Round, int>>> due;
                lock (gate) due = resendAt.Where(k => k.Value.Item1 <= DateTime.UtcNow).ToList();
                foreach (var d in due)
                {
                    lock (gate) resendAt.Remove(d.Key);
                    Enqueue(d.Value.Item2, PosId(d.Value.Item2), d.Value.Item3, true);
                }

                List<Pending> work;
                lock (gate) work = queue.Where(q => q.Due <= DateTime.UtcNow).Take(15).ToList();
                foreach (Pending p in work)
                {
                    if (string.IsNullOrWhiteSpace(JournalKey)) break;
                    if (!Licensed(p.Account)) { p.Due = DateTime.UtcNow.AddMinutes(10); continue; }
                    string msg;
                    int res = Post("/api/journal/trades", p.Json, out msg);
                    if (res == 1)
                    {
                        lock (gate) queue.Remove(p);
                        if (p.Final) MarkSent(p);
                        else try { if (p.File != null) File.Delete(p.File); } catch { }
                        lock (gate)
                        {
                            if (sentDay != DateTime.Today) { sentDay = DateTime.Today; sentToday = 0; }
                            sentToday++;
                        }
                        lastSync = DateTime.Now.ToString("HH:mm", CultureInfo.InvariantCulture) + " sent " + Between(p.Json, "\"symbol\":\"", "\"");
                    }
                    else if (res == 0)
                    {
                        lock (gate) queue.Remove(p);
                        MarkSent(p);
                        lastSync = "rejected: " + msg;
                        Log("Trade " + p.PosId + " rejected: " + msg, StrategyLoggingLevel.Error);
                    }
                    else
                    {
                        p.Due = DateTime.UtcNow.AddMinutes(res == 2 ? 10 : 1);
                        lastSync = msg;
                        if (res == 2) Log(msg, StrategyLoggingLevel.Error);
                        break;
                    }
                }
            }
            catch (Exception ex) { Log(ex.Message, StrategyLoggingLevel.Error); }
            finally { Interlocked.Exchange(ref busy, 0); }
        }

        // licence: same check as the MT5 EA (account name on My EAs, Trade Journal licence active)
        private bool Licensed(string account)
        {
            DateTime next;
            string state;
            lock (gate)
                if (licenceNext.TryGetValue(account, out next) && next > DateTime.UtcNow && licence.TryGetValue(account, out state)) return state == "OK";
            try
            {
                int code;
                string body = Http("GET", Server + "/api/check?ea=" + EaCode + "&account=" + Uri.EscapeDataString(account), null, out code);
                bool ok = body.Contains("\"valid\":true") && body.Contains("\"account\":\"" + account + "\"");
                string reason = ok ? "OK" : Between(body, "\"message\":\"", "\"");
                lock (gate) { licence[account] = reason; licenceNext[account] = DateTime.UtcNow.AddMinutes(ok ? 60 : 5); }
                return ok;
            }
            catch (Exception ex)
            {
                lock (gate) { licence[account] = "site unreachable"; licenceNext[account] = DateTime.UtcNow.AddMinutes(2); }
                Log("Licence check failed: " + ex.Message, StrategyLoggingLevel.Error);
                return false;
            }
        }

        // 1 = stored, 0 = rejected for good, 2 = not allowed yet (key / licence / account), -1 = network
        private static int Post(string path, string json, out string msg)
        {
            try
            {
                int code;
                string body = Http("POST", Server + path, json, out code);
                msg = Between(body, "\"message\":\"", "\"");
                if (code == 200 && body.Contains("\"ok\":true")) return 1;
                if (code == 403) return 2;
                if (code >= 400 && code < 500) return 0;
                msg = "site error " + code;
                return -1;
            }
            catch (Exception ex) { msg = "no internet: " + ex.Message; return -1; }
        }

        private static string Http(string method, string url, string json, out int code)
        {
            var req = (HttpWebRequest)WebRequest.Create(url);
            req.Method = method;
            req.Timeout = 20000;
            req.UserAgent = "5ABI-Journal-QT/" + Version;
            if (json != null)
            {
                byte[] data = Encoding.UTF8.GetBytes(json);
                req.ContentType = "application/json";
                req.ContentLength = data.Length;
                using (Stream s = req.GetRequestStream()) s.Write(data, 0, data.Length);
            }
            HttpWebResponse res;
            try { res = (HttpWebResponse)req.GetResponse(); }
            catch (WebException we)
            {
                if (we.Response == null) throw;
                res = (HttpWebResponse)we.Response;
            }
            using (res)
            using (var r = new StreamReader(res.GetResponseStream(), Encoding.UTF8))
            {
                code = (int)res.StatusCode;
                return r.ReadToEnd();
            }
        }

        private static string Short(string s) { s = s ?? ""; return s.Length > 40 ? s.Substring(0, 40) : s; }
    }
}
