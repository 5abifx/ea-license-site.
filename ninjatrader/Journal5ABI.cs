// 5ABI.FX Trade Journal for NinjaTrader 8, v1.00
// Sends every closed trade (entry, exit, partial closes, stop, target, candles) to your 5ABI.FX journal,
// the same way the MT5 Trade Journal EA does. It never places, changes or cancels orders.
//
// Install: copy this file to Documents\NinjaTrader 8\bin\Custom\Indicators\, then
// New > NinjaScript Editor > press F5 (or import the exported .zip with Tools > Import > NinjaScript Add-On).
// Use: add the indicator "5ABI Journal" to ONE chart (any instrument), paste your journal key, press OK.
// It reads every connected account: trades on all instruments and all accounts are logged.
// Each account name must be added on My EAs on the website, and needs the Trade Journal licence.
//
// Files: Documents\NinjaTrader 8\5ABI\journal\ (trades waiting to send, and the list already sent)
#region Using declarations
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Net;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Serialization;
using NinjaTrader.Cbi;
using NinjaTrader.Data;
using NinjaTrader.Gui;
using NinjaTrader.Gui.Chart;
using NinjaTrader.NinjaScript;
using NinjaTrader.NinjaScript.DrawingTools;
#endregion

namespace NinjaTrader.NinjaScript.Indicators
{
    public class Journal5ABI : Indicator
    {
        private const string EaCode = "JOURNAL";             // same licence as the MT5 Trade Journal
        private const string Server = "https://5abifx.com";   // website address, no trailing slash
        private const string Version = "1.00";
        private const int MaxCandles = 1500;

        // ---- one fill (execution) ----
        private class Fill
        {
            public DateTime Utc; public double Price; public double Qty; public bool Buy; public double Fee; public string Id;
        }

        // ---- one round trip: flat -> in a position -> flat ----
        private class Round
        {
            public string Account, Symbol, InstrumentName;
            public Instrument Instrument;
            public bool Buy;
            public double Net;                       // signed open quantity
            public List<Fill> Ins = new List<Fill>(), Outs = new List<Fill>();
            public double Sl, Tp;                    // first stop / target seen while open
            public double FeeTotal;
        }

        private class Pending
        {
            public string Account, PosId, Json, File;
            public DateTime Due;                     // next time to (re)send
            public bool Final;                       // last send: mark as sent after it
        }

        private readonly object gate = new object();
        private readonly Dictionary<string, Round> open = new Dictionary<string, Round>();   // account|instrument
        private readonly List<Pending> queue = new List<Pending>();
        private readonly HashSet<string> sent = new HashSet<string>();
        private readonly HashSet<string> seenExec = new HashSet<string>();
        private readonly HashSet<Account> hooked = new HashSet<Account>();
        private readonly Dictionary<string, string> licence = new Dictionary<string, string>();   // account -> "OK" or reason
        private readonly Dictionary<string, DateTime> licenceNext = new Dictionary<string, DateTime>();
        private System.Threading.Timer timer;
        private int busy;
        private string dir, lastSync = "nothing sent yet";
        private int sentToday;
        private DateTime sentDay = DateTime.MinValue;
        private TimeZoneInfo nyTz;

        protected override void OnStateChange()
        {
            if (State == State.SetDefaults)
            {
                Name = "5ABI Journal";
                Description = "5ABI.FX Trade Journal: sends every closed trade on your NinjaTrader accounts to your journal. Never trades.";
                Calculate = Calculate.OnBarClose;
                IsOverlay = true;
                DisplayInDataBox = false;
                DrawOnPricePanel = true;
                PaintPriceMarkers = false;
                IsSuspendedWhileInactive = false;   // keep logging while the chart tab is hidden
                JournalKey = "";
                OnlyAccounts = "";
                BarsBefore = 90;
                BarsAfter = 45;
                ShowPanel = true;
            }
            else if (State == State.DataLoaded)
            {
                try { nyTz = TimeZoneInfo.FindSystemTimeZoneById("Eastern Standard Time"); } catch { nyTz = TimeZoneInfo.Local; }
                try { ServicePointManager.SecurityProtocol |= SecurityProtocolType.Tls12; } catch { }
                dir = Path.Combine(NinjaTrader.Core.Globals.UserDataDir, "5ABI", "journal");
                Directory.CreateDirectory(dir);
                LoadSent();
                LoadPending();
                if (string.IsNullOrWhiteSpace(JournalKey))
                    Log("5ABI Journal: paste your journal key (Journal page on " + Server + ") into the indicator settings.", LogLevel.Alert);
            }
            else if (State == State.Realtime)
            {
                HookAccounts(true);
                timer = new System.Threading.Timer(_ => Tick(), null, 2000, 10000);
            }
            else if (State == State.Terminated)
            {
                if (timer != null) { timer.Dispose(); timer = null; }
                lock (gate)
                {
                    foreach (Account a in hooked) { a.ExecutionUpdate -= OnExecution; a.OrderUpdate -= OnOrder; }
                    hooked.Clear();
                }
            }
        }

        protected override void OnBarUpdate() { }

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
            if (string.IsNullOrWhiteSpace(OnlyAccounts)) return true;
            return OnlyAccounts.Split(',', ';').Select(x => x.Trim()).Any(x => x.Length > 0 && (string.Equals(x, a.Name, StringComparison.OrdinalIgnoreCase) || string.Equals(x, Clean(a.Name), StringComparison.OrdinalIgnoreCase)));
        }

        // new connections add accounts: hook them on every timer; replay today's executions once per account
        private void HookAccounts(bool first)
        {
            var fresh = new List<Account>();
            lock (Account.All)
                foreach (Account a in Account.All)
                {
                    if (a == null || !Wanted(a)) continue;
                    lock (gate) { if (hooked.Contains(a)) continue; hooked.Add(a); }
                    a.ExecutionUpdate += OnExecution;
                    a.OrderUpdate += OnOrder;
                    fresh.Add(a);
                }
            foreach (Account a in fresh) CatchUp(a);
        }

        // executions NinjaTrader still holds (this session): rebuild trades that closed while the chart was off
        private void CatchUp(Account a)
        {
            List<Execution> list;
            try { lock (a.Executions) list = a.Executions.Where(e => e != null && !e.IsSod).OrderBy(e => e.Time).ToList(); }
            catch (Exception ex) { Print("5ABI Journal: catch-up " + a.Name + ": " + ex.Message); return; }
            foreach (Execution e in list) Feed(a, e, true);
        }

        private void OnExecution(object sender, ExecutionEventArgs e)
        {
            try { if (e != null && e.Execution != null && !e.Execution.IsSod) Feed(e.Execution.Account, e.Execution, false); }
            catch (Exception ex) { Print("5ABI Journal: " + ex.Message); }
        }

        // the first working stop / limit on the other side while a position is open = initial stop / target
        private void OnOrder(object sender, OrderEventArgs e)
        {
            try
            {
                Order o = e.Order;
                if (o == null || (e.OrderState != OrderState.Working && e.OrderState != OrderState.Accepted)) return;
                lock (gate)
                {
                    Round r;
                    if (!open.TryGetValue(Key(o.Account, o.Instrument), out r)) return;
                    bool sells = o.OrderAction == OrderAction.Sell || o.OrderAction == OrderAction.SellShort;
                    if (sells != r.Buy) return;
                    if ((o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit) && r.Sl == 0) r.Sl = o.StopPrice;
                    else if (o.OrderType == OrderType.Limit && r.Tp == 0) r.Tp = o.LimitPrice;
                }
            }
            catch (Exception ex) { Print("5ABI Journal: " + ex.Message); }
        }

        private static string Key(Account a, Instrument i) { return (a == null ? "" : a.Name) + "|" + (i == null ? "" : i.FullName); }

        private void Feed(Account a, Execution x, bool replay)
        {
            if (a == null || x.Instrument == null || x.Quantity <= 0) return;
            string key = Key(a, x.Instrument);
            string fid = x.ExecutionId ?? (x.Time.Ticks + "|" + x.Price);
            bool buy = x.MarketPosition == MarketPosition.Long;
            double qty = x.Quantity;
            DateTime utc = ToUtc(x.Time);
            double fee = Math.Abs(x.Commission);
            Round done = null, next = null;
            lock (gate)
            {
                Round r;
                open.TryGetValue(key, out r);
                if (!seenExec.Add(a.Name + "|" + fid)) return;   // the same execution twice (catch-up + live)
                if (r == null)
                {
                    // flat: an exit with nothing open is half of a trade from before NinjaTrader started (skip it)
                    if (x.IsExit && !x.IsEntry) return;
                    r = NewRound(a, x.Instrument, buy);
                    open[key] = r;
                }
                double signed = buy ? qty : -qty;
                if ((r.Net >= 0) == buy || r.Net == 0)
                {
                    r.Ins.Add(new Fill { Utc = utc, Price = x.Price, Qty = qty, Buy = buy, Fee = fee, Id = fid });
                    r.Net += signed;
                    r.FeeTotal += fee;
                    if (r.Sl == 0 || r.Tp == 0) ScanOrders(a, x.Instrument, r);
                }
                else
                {
                    double close = Math.Min(qty, Math.Abs(r.Net));
                    double part = close / qty;
                    r.Outs.Add(new Fill { Utc = utc, Price = x.Price, Qty = close, Buy = buy, Fee = fee * part, Id = fid });
                    r.FeeTotal += fee * part;
                    r.Net += buy ? close : -close;
                    if (Math.Abs(r.Net) < 1e-9)
                    {
                        open.Remove(key);
                        done = r;
                        double rest = qty - close;
                        if (rest > 1e-9)   // reversal: the rest opens a new trade the other way
                        {
                            next = NewRound(a, x.Instrument, buy);
                            next.Ins.Add(new Fill { Utc = utc, Price = x.Price, Qty = rest, Buy = buy, Fee = fee * (1 - part), Id = fid + "r" });
                            next.Net = buy ? rest : -rest;
                            next.FeeTotal = fee * (1 - part);
                            open[key] = next;
                        }
                    }
                }
            }
            if (done != null) Closed(done, replay);
        }

        private Round NewRound(Account a, Instrument i, bool buy)
        {
            return new Round { Account = Clean(a.Name), Symbol = i.MasterInstrument.Name, InstrumentName = i.FullName, Instrument = i, Buy = buy };
        }

        private void ScanOrders(Account a, Instrument i, Round r)
        {
            try
            {
                lock (a.Orders)
                    foreach (Order o in a.Orders)
                    {
                        if (o.Instrument != i || (o.OrderState != OrderState.Working && o.OrderState != OrderState.Accepted)) continue;
                        bool sells = o.OrderAction == OrderAction.Sell || o.OrderAction == OrderAction.SellShort;
                        if (sells != r.Buy) continue;
                        if ((o.OrderType == OrderType.StopMarket || o.OrderType == OrderType.StopLimit) && r.Sl == 0) r.Sl = o.StopPrice;
                        else if (o.OrderType == OrderType.Limit && r.Tp == 0) r.Tp = o.LimitPrice;
                    }
            }
            catch { }
        }

        // ---------------- a trade closed: candles, then queue ----------------
        private string PosId(Round r)
        {
            long t = (long)(r.Ins[0].Utc - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc)).TotalSeconds;
            string s = "NT" + t + Clean(r.Symbol);
            return s.Length > 40 ? s.Substring(0, 40) : s;
        }

        private void Closed(Round r, bool replay)
        {
            string id = PosId(r);
            lock (gate) { if (sent.Contains(r.Account + "|" + id) || queue.Any(q => q.Account == r.Account && q.PosId == id)) return; }
            DateTime openUtc = r.Ins[0].Utc, closeUtc = r.Outs[r.Outs.Count - 1].Utc;
            // 1-minute candles if they fit, else bigger ones (long trades)
            int[] steps = { 1, 5, 15, 60, 240, 1440 };
            int tf = steps[steps.Length - 1];
            foreach (int m in steps)
                if ((closeUtc - openUtc).TotalMinutes / m + BarsBefore + BarsAfter <= MaxCandles) { tf = m; break; }
            DateTime from = openUtc.AddMinutes(-BarsBefore * tf), to = closeUtc.AddMinutes(BarsAfter * tf);
            if (to > DateTime.UtcNow) to = DateTime.UtcNow;
            DateTime afterDone = closeUtc.AddMinutes(BarsAfter * tf);
            bool complete = afterDone <= DateTime.UtcNow;
            GetBars(r.Instrument, tf, from, to, (bars, oneMin) =>
            {
                string json = BuildJson(r, id, tf, bars);
                var p = new Pending { Account = r.Account, PosId = id, Json = json, Due = DateTime.UtcNow, Final = complete };
                p.File = Path.Combine(dir, "wait_" + Clean(r.Account) + "_" + id + ".json");
                try { File.WriteAllText(p.File, (complete ? "1" : "0") + "\n" + json); } catch { }
                lock (gate) queue.Add(p);
                if (!complete)
                    lock (gate) { p.Due = DateTime.UtcNow; resendAt[r.Account + "|" + id] = new Tuple<DateTime, Round, int>(afterDone.AddSeconds(30), r, tf); }
            });
        }

        private readonly Dictionary<string, Tuple<DateTime, Round, int>> resendAt = new Dictionary<string, Tuple<DateTime, Round, int>>();

        // candles from NinjaTrader's history (BarsRequest), times in UTC
        private void GetBars(Instrument inst, int minutes, DateTime fromUtc, DateTime toUtc, Action<List<double[]>, bool> done)
        {
            var list = new List<double[]>();
            try
            {
                TimeZoneInfo ntTz = NinjaTrader.Core.Globals.GeneralOptions.TimeZoneInfo;
                DateTime from = TimeZoneInfo.ConvertTimeFromUtc(fromUtc, ntTz), to = TimeZoneInfo.ConvertTimeFromUtc(toUtc, ntTz);
                var req = new BarsRequest(inst, from, to)
                {
                    BarsPeriod = minutes >= 1440 ? new BarsPeriod { BarsPeriodType = BarsPeriodType.Day, Value = 1 }
                                                 : new BarsPeriod { BarsPeriodType = BarsPeriodType.Minute, Value = minutes },
                    TradingHours = inst.MasterInstrument.TradingHours
                };
                req.Request(new Action<BarsRequest, ErrorCode, string>((b, err, msg) =>
                {
                    try
                    {
                        if (err == ErrorCode.NoError && b.Bars != null)
                            for (int i = 0; i < b.Bars.Count; i++)
                            {
                                // NinjaTrader stamps a bar at its close: use its open time like MT5
                                DateTime t = TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(b.Bars.GetTime(i), DateTimeKind.Unspecified), ntTz).AddMinutes(-Math.Min(minutes, 1440));
                                list.Add(new[] { Broker(t), b.Bars.GetOpen(i), b.Bars.GetHigh(i), b.Bars.GetLow(i), b.Bars.GetClose(i) });
                            }
                        else Print("5ABI Journal: candles " + inst.FullName + ": " + msg);
                    }
                    catch (Exception ex) { Print("5ABI Journal: candles " + ex.Message); }
                    finally
                    {
                        try { b.Dispose(); } catch { }
                        if (list.Count > MaxCandles) list = list.Skip(list.Count - MaxCandles).ToList();
                        done(list, minutes == 1);
                    }
                }));
            }
            catch (Exception ex)
            {
                Print("5ABI Journal: candles " + ex.Message);
                done(list, false);
            }
        }

        // ---------------- times ----------------
        private DateTime ToUtc(DateTime ntTime)
        {
            try { return TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(ntTime, DateTimeKind.Unspecified), NinjaTrader.Core.Globals.GeneralOptions.TimeZoneInfo); }
            catch { return ntTime.ToUniversalTime(); }
        }

        // the journal works in "broker time" like most MT5 brokers: New York time + 7 hours
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
            Instrument inst = r.Instrument;
            double pv = inst.MasterInstrument.PointValue, tick = inst.MasterInstrument.TickSize;
            int dg = Digits(tick);
            double inQty = r.Ins.Sum(f => f.Qty), outQty = r.Outs.Sum(f => f.Qty);
            double entry = r.Ins.Sum(f => f.Price * f.Qty) / inQty;
            double exit = r.Outs[r.Outs.Count - 1].Price;
            double dir = r.Buy ? 1 : -1;
            double profit = r.Outs.Sum(f => (f.Price - entry) * dir * f.Qty * pv);
            double commission = -r.FeeTotal;
            double net = profit + commission;
            double avgExit = r.Outs.Sum(f => f.Price * f.Qty) / outQty;
            double ticks = tick > 0 ? (avgExit - entry) * dir / tick : 0;
            double risk = r.Sl > 0 ? Math.Abs(entry - r.Sl) * inQty * pv : 0;
            double rr = risk > 0 ? net / risk : 0;

            double balance = 0;
            string currency = "USD";
            Account acct = null;
            lock (Account.All) acct = Account.All.FirstOrDefault(a => Clean(a.Name) == r.Account);
            if (acct != null)
            {
                try { currency = CurrencyCode(acct.Denomination); balance = acct.Get(AccountItem.CashValue, acct.Denomination); } catch { }
            }
            double startBal = balance - net;
            double riskPct = risk > 0 && startBal > 0 ? risk / startBal * 100 : 0;
            double pct = startBal > 0 ? net / startBal * 100 : 0;

            // best and worst price while open, from the candles inside the trade
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
            sb.Append("{\"key\":").Append(S(JournalKey.Trim())).Append(",\"ea\":").Append(S(EaCode)).Append(",\"platform\":\"NinjaTrader\"")
              .Append(",\"account\":").Append(S(r.Account)).Append(",\"broker\":").Append(S(acct != null && acct.Connection != null ? acct.Connection.Options.Name : "NinjaTrader"))
              .Append(",\"currency\":").Append(S(currency)).Append(",\"trade\":{")
              .Append("\"position_id\":").Append(S(id)).Append(",\"symbol\":").Append(S(r.Symbol)).Append(",\"side\":").Append(r.Buy ? "\"BUY\"" : "\"SELL\"")
              .Append(",\"lots\":").Append(N(inQty)).Append(",\"entry\":").Append(N(entry, dg)).Append(",\"exit\":").Append(N(exit, dg))
              .Append(",\"sl\":").Append(N(r.Sl, dg)).Append(",\"tp\":").Append(N(r.Tp, dg)).Append(",\"digits\":").Append(dg)
              .Append(",\"open_time\":").Append(S(Iso(openUtc))).Append(",\"close_time\":").Append(S(Iso(closeUtc)))
              .Append(",\"profit\":").Append(N(profit)).Append(",\"commission\":").Append(N(commission)).Append(",\"swap\":0")
              .Append(",\"net\":").Append(N(net)).Append(",\"pips\":").Append(N(ticks, 1)).Append(",\"r\":").Append(N(rr))
              .Append(",\"risk_money\":").Append(N(risk)).Append(",\"risk_pct\":").Append(N(riskPct)).Append(",\"pct\":").Append(N(pct))
              .Append(",\"balance_after\":").Append(N(balance)).Append(",\"mfe\":").Append(N(mfe, dg)).Append(",\"mae\":").Append(N(mae, dg))
              .Append(",\"magic\":0,\"comment\":").Append(S(r.InstrumentName)).Append(",\"tf\":").Append(S(tf >= 1440 ? "D1" : tf >= 60 ? "H" + tf / 60 : "M" + tf))
              .Append(",\"partials\":[");
            for (int i = 0; i < r.Outs.Count; i++)
            {
                Fill f = r.Outs[i];
                if (i > 0) sb.Append(',');
                sb.Append("{\"time\":").Append(S(Iso(f.Utc))).Append(",\"price\":").Append(N(f.Price, dg)).Append(",\"lots\":").Append(N(f.Qty))
                  .Append(",\"profit\":").Append(N((f.Price - entry) * dir * f.Qty * pv)).Append('}');
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

        private static string CurrencyCode(Currency c)
        {
            switch (c.ToString())
            {
                case "Euro": return "EUR";
                case "BritishPound": return "GBP";
                case "CanadianDollar": return "CAD";
                case "AustralianDollar": return "AUD";
                case "JapaneseYen": return "JPY";
                case "SwissFranc": return "CHF";
                default: return "USD";
            }
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
                    string[] parts = File.ReadAllText(f).Split(new[] { '\n' }, 2);
                    if (parts.Length < 2) continue;
                    string json = parts[1];
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

        // ---------------- network (every 10 s, off the chart thread) ----------------
        private void Tick()
        {
            if (Interlocked.Exchange(ref busy, 1) == 1) return;
            try
            {
                HookAccounts(false);
                // trades closed recently: send again once the candles after the exit exist
                List<KeyValuePair<string, Tuple<DateTime, Round, int>>> due;
                lock (gate) due = resendAt.Where(k => k.Value.Item1 <= DateTime.UtcNow).ToList();
                foreach (var d in due)
                {
                    lock (gate) resendAt.Remove(d.Key);
                    lock (gate) sent.Remove(d.Key);
                    Round r = d.Value.Item2;
                    int tf = d.Value.Item3;
                    string id = PosId(r);
                    DateTime from = r.Ins[0].Utc.AddMinutes(-BarsBefore * tf), to = r.Outs[r.Outs.Count - 1].Utc.AddMinutes(BarsAfter * tf);
                    GetBars(r.Instrument, tf, from, to, (bars, _) =>
                    {
                        var p = new Pending { Account = r.Account, PosId = id, Json = BuildJson(r, id, tf, bars), Due = DateTime.UtcNow, Final = true };
                        p.File = Path.Combine(dir, "wait_" + Clean(r.Account) + "_" + id + ".json");
                        try { File.WriteAllText(p.File, "1\n" + p.Json); } catch { }
                        lock (gate) { queue.RemoveAll(q => q.Account == p.Account && q.PosId == p.PosId); queue.Add(p); }
                    });
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
                        else
                        {
                            try { if (p.File != null) File.Delete(p.File); } catch { }
                        }
                        if (sentDay != DateTime.Today) { sentDay = DateTime.Today; sentToday = 0; }
                        sentToday++;
                        lastSync = DateTime.Now.ToString("HH:mm", CultureInfo.InvariantCulture) + " sent " + Between(p.Json, "\"symbol\":\"", "\"");
                    }
                    else if (res == 0)
                    {
                        lock (gate) queue.Remove(p);
                        MarkSent(p);
                        lastSync = "rejected: " + msg;
                        Print("5ABI Journal: trade " + p.PosId + " rejected: " + msg);
                    }
                    else
                    {
                        p.Due = DateTime.UtcNow.AddMinutes(res == 2 ? 10 : 1);
                        lastSync = msg;
                        if (res == 2) Print("5ABI Journal: " + msg);
                        break;
                    }
                }
                Panel();
            }
            catch (Exception ex) { Print("5ABI Journal: " + ex.Message); }
            finally { Interlocked.Exchange(ref busy, 0); }
        }

        // licence: same check as the MT5 EA (account name must be on My EAs, Trade Journal licence active)
        private bool Licensed(string account)
        {
            DateTime next;
            string state;
            lock (gate)
            {
                if (licenceNext.TryGetValue(account, out next) && next > DateTime.UtcNow && licence.TryGetValue(account, out state)) return state == "OK";
            }
            bool ok = false;
            string reason;
            try
            {
                int code;
                string body = Http("GET", Server + "/api/check?ea=" + EaCode + "&account=" + Uri.EscapeDataString(account), null, out code);
                bool valid = body.Contains("\"valid\":true") && body.Contains("\"account\":\"" + account + "\"");
                reason = valid ? "OK" : Between(body, "\"message\":\"", "\"");
                ok = valid;
                lock (gate) { licence[account] = reason; licenceNext[account] = DateTime.UtcNow.AddMinutes(ok ? 60 : 5); }
            }
            catch (Exception ex)
            {
                lock (gate) { licence[account] = "site unreachable"; licenceNext[account] = DateTime.UtcNow.AddMinutes(2); }
                Print("5ABI Journal: licence check failed: " + ex.Message);
            }
            return ok;
        }

        // 1 = stored, 0 = rejected for good, 2 = not allowed yet (key / licence / account), -1 = network
        private int Post(string path, string json, out string msg)
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
            req.UserAgent = "5ABI-Journal-NT/" + Version;
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

        // ---------------- panel (short lines) ----------------
        private void Panel()
        {
            if (!ShowPanel) return;
            var sb = new StringBuilder("5ABI.FX JOURNAL v" + Version + "\n");
            if (string.IsNullOrWhiteSpace(JournalKey)) sb.Append("Paste your journal key\n");
            lock (gate)
            {
                foreach (var kv in licence)
                    sb.Append(kv.Key).Append(": ").Append(kv.Value == "OK" ? "OK" : kv.Value.Contains("not registered") ? "add it on My EAs" : Short(kv.Value)).Append('\n');
                sb.Append("Sent today: ").Append(sentDay == DateTime.Today ? sentToday : 0).Append('\n');
                sb.Append("Waiting: ").Append(queue.Count).Append('\n');
            }
            sb.Append("Last: ").Append(Short(lastSync));
            string text = sb.ToString();
            try
            {
                TriggerCustomEvent(o =>
                {
                    Draw.TextFixed(this, "j5abi", text, TextPosition.TopLeft);
                    ForceRefresh();
                }, null);
            }
            catch { }
        }

        private static string Short(string s) { s = s ?? ""; return s.Length > 40 ? s.Substring(0, 40) : s; }

        #region Properties
        [Display(Name = "Journal key", Description = "From the Journal page on 5abifx.com (Connect box).", Order = 1, GroupName = "1. Journal")]
        public string JournalKey { get; set; }

        [Display(Name = "Only these accounts", Description = "Blank = every connected account. Or names separated by commas, e.g. Sim101, APEX-12345-01.", Order = 2, GroupName = "1. Journal")]
        public string OnlyAccounts { get; set; }

        [Range(10, 500), Display(Name = "Candles before entry", Order = 3, GroupName = "1. Journal")]
        public int BarsBefore { get; set; }

        [Range(5, 300), Display(Name = "Candles after exit", Order = 4, GroupName = "1. Journal")]
        public int BarsAfter { get; set; }

        [Display(Name = "Show panel", Order = 5, GroupName = "1. Journal")]
        public bool ShowPanel { get; set; }
        #endregion
    }
}
