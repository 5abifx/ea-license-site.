//+------------------------------------------------------------------+
//| TradeJournal.mq5 - logs every closed trade to your journal site   |
//|                                                                  |
//| A separate, read-only EA: it never opens, changes or closes      |
//| trades, so it runs safely next to KATANA or any other EA.        |
//| MT5 runs one EA per chart: open a separate chart (any symbol) for |
//| the journal, one per MT5 account. It logs trades from all        |
//| symbols and all EAs on that account.                             |
//+------------------------------------------------------------------+
#property copyright "5ABI.FX"
#property version   "1.30"
#property description "Trade Journal: logs closed trades, partials and candles to your journal,"
#property description "and sends MT5's economic calendar for the Desk's news catalysts."

#define EA_CODE        "JOURNAL"                  // must match the license code in Admin > EAs
#define LICENSE_SERVER "https://5abifx.com"  // your website address, no trailing slash
#define LICENSE_SALT   4471902
#include "LicenseCheck.mqh"
#include "LicenseRelay.mqh"     // also unlocks 5ABI.FX indicators (they cannot reach the site)

input string          JournalKey     = "";          // Journal key (from your dashboard)
input ENUM_TIMEFRAMES ChartTimeframe = PERIOD_M5;   // Candles saved with each trade
input int             BarsBefore     = 40;          // Candles before entry
input int             BarsAfter      = 20;          // Candles after exit
input int             CatchUpDays    = 7;           // On start, also send trades closed in the last N days
input double          PipSize        = 0;           // Pip size (0 = automatic)
input bool            ShowPanel      = true;        // Show the journal panel on the chart
input bool            SendNews       = true;        // Send the MT5 economic calendar (news on your Desk)

#define JOURNAL_DIR    "TradeJournal\\"
#define MAX_CANDLES    400

struct QueueItem
  {
   ulong    position_id;
   datetime due;
  };

QueueItem g_queue[];
string    g_lastSync = "nothing sent yet";
int       g_sentCount = 0;

//--- small helpers ------------------------------------------------------
string Login() { return IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)); }
// "sent2_": v1.10 re-sends recent trades once, so trades logged without their SL get it
string SentFile() { return JOURNAL_DIR + "sent2_" + Login() + ".txt"; }
string LogFile() { return JOURNAL_DIR + "trades_" + Login() + ".csv"; }

string IsoTime(const datetime t)
  {
   string s = TimeToString(t, TIME_DATE | TIME_SECONDS);   // 2026.10.28 14:32:00
   StringReplace(s, ".", "-");
   StringReplace(s, " ", "T");
   return s;
  }

string JsonEscape(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   StringReplace(s, "\r", " ");
   StringReplace(s, "\n", " ");
   StringReplace(s, "\t", " ");
   return s;
  }

string J(const string key, const string value)  { return "\"" + key + "\":\"" + JsonEscape(value) + "\""; }
string JN(const string key, const double v, const int digits) { return "\"" + key + "\":" + DoubleToString(v, digits); }

string TfName(const ENUM_TIMEFRAMES tf)
  {
   string s = EnumToString(tf == PERIOD_CURRENT ? (ENUM_TIMEFRAMES)Period() : tf);   // PERIOD_M5
   StringReplace(s, "PERIOD_", "");
   return s;
  }

double Pip(const string symbol)
  {
   if(PipSize > 0) return PipSize;
   int    digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double point  = SymbolInfoDouble(symbol, SYMBOL_POINT);
   if(StringFind(symbol, "XAU") >= 0) return 0.1;
   return (digits == 3 || digits == 5) ? point * 10.0 : point;
  }

//--- which positions were already sent (one id per line) ----------------
bool WasSent(const ulong id)
  {
   int h = FileOpen(SentFile(), FILE_READ | FILE_TXT | FILE_COMMON | FILE_ANSI);
   if(h == INVALID_HANDLE) return false;
   string want = IntegerToString((long)id);
   bool found = false;
   while(!FileIsEnding(h) && !found)
      found = (FileReadString(h) == want);
   FileClose(h);
   return found;
  }

void MarkSent(const ulong id)
  {
   int h = FileOpen(SentFile(), FILE_READ | FILE_WRITE | FILE_TXT | FILE_COMMON | FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   FileSeek(h, 0, SEEK_END);
   FileWriteString(h, IntegerToString((long)id) + "\n");
   FileClose(h);
  }

//--- queue ----------------------------------------------------------------
bool InQueue(const ulong id)
  {
   for(int i = 0; i < ArraySize(g_queue); i++)
      if(g_queue[i].position_id == id) return true;
   return false;
  }

void Enqueue(const ulong id, const datetime due)
  {
   if(InQueue(id)) return;
   int n = ArraySize(g_queue);
   ArrayResize(g_queue, n + 1);
   g_queue[n].position_id = id;
   g_queue[n].due = due;
  }

void Dequeue(const int i)
  {
   int n = ArraySize(g_queue);
   for(int k = i; k < n - 1; k++) g_queue[k] = g_queue[k + 1];
   ArrayResize(g_queue, n - 1);
  }

bool IsPositionOpen(const ulong id)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && (ulong)PositionGetInteger(POSITION_IDENTIFIER) == id) return true;
     }
   return false;
  }

//--- remember the first SL/TP of each open position --------------------------
// KATANA and many EAs open at market and add the SL/TP a moment later, so the
// entry deal has none. Saved in terminal global variables (kept for 4 weeks).
string LevelKey(const ulong id, const string what) { return "TJ_" + what + "_" + Login() + "_" + IntegerToString((long)id); }

void RememberLevels()
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      if(PositionGetTicket(i) == 0) continue;
      ulong  id = (ulong)PositionGetInteger(POSITION_IDENTIFIER);
      double sl = PositionGetDouble(POSITION_SL), tp = PositionGetDouble(POSITION_TP);
      if(sl > 0 && !GlobalVariableCheck(LevelKey(id, "SL"))) GlobalVariableSet(LevelKey(id, "SL"), sl);
      if(tp > 0 && !GlobalVariableCheck(LevelKey(id, "TP"))) GlobalVariableSet(LevelKey(id, "TP"), tp);
     }
  }

double SavedLevel(const ulong id, const string what)
  {
   string k = LevelKey(id, what);
   return GlobalVariableCheck(k) ? GlobalVariableGet(k) : 0;
  }

//--- build the trade from the account history -----------------------------
// Returns false while the position is still open or has no closing deal.
bool BuildTrade(const ulong id, string &json, datetime &closeTime)
  {
   if(IsPositionOpen(id) || !HistorySelectByPosition(id)) return false;

   string symbol = "", comment = "", side = "";
   long   magic = 0;
   double inVol = 0, inValue = 0, outVol = 0, sl = 0, tp = 0;
   double profit = 0, commission = 0, swap = 0, fee = 0, exitPrice = 0;
   datetime openTime = 0;
   closeTime = 0;
   string partials = "";
   int    nOut = 0;
   double outSl = 0, outTp = 0;              // SL/TP recorded on the first closing deal

   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0) continue;
      long dealEntry = HistoryDealGetInteger(d, DEAL_ENTRY);
      long type      = HistoryDealGetInteger(d, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue;
      double vol   = HistoryDealGetDouble(d, DEAL_VOLUME);
      double price = HistoryDealGetDouble(d, DEAL_PRICE);
      datetime t   = (datetime)HistoryDealGetInteger(d, DEAL_TIME);
      profit     += HistoryDealGetDouble(d, DEAL_PROFIT);
      commission += HistoryDealGetDouble(d, DEAL_COMMISSION);
      swap       += HistoryDealGetDouble(d, DEAL_SWAP);
      fee        += HistoryDealGetDouble(d, DEAL_FEE);

      if(dealEntry == DEAL_ENTRY_IN)
        {
         if(symbol == "")
           {
            symbol   = HistoryDealGetString(d, DEAL_SYMBOL);
            side     = (type == DEAL_TYPE_BUY) ? "BUY" : "SELL";
            openTime = t;
            magic    = HistoryDealGetInteger(d, DEAL_MAGIC);
            comment  = HistoryDealGetString(d, DEAL_COMMENT);
            sl       = HistoryDealGetDouble(d, DEAL_SL);
            tp       = HistoryDealGetDouble(d, DEAL_TP);
           }
         inVol += vol;
         inValue += vol * price;
        }
      else if(dealEntry == DEAL_ENTRY_OUT || dealEntry == DEAL_ENTRY_OUT_BY || dealEntry == DEAL_ENTRY_INOUT)
        {
         if(nOut > 0) partials += ",";
         partials += "{" + J("time", IsoTime(t)) + "," + JN("price", price, 8) + "," + JN("lots", vol, 2) + ","
                     + JN("profit", HistoryDealGetDouble(d, DEAL_PROFIT), 2) + "}";
         if(outSl == 0) outSl = HistoryDealGetDouble(d, DEAL_SL);
         if(outTp == 0) outTp = HistoryDealGetDouble(d, DEAL_TP);
         nOut++;
         outVol += vol;
         exitPrice = price;
         closeTime = t;
        }
     }
   if(symbol == "" || nOut == 0 || inVol <= 0) return false;

   // the initial stop and target: from the entry deal, else the first SL/TP seen
   // on the open position, else the orders of this position, else the closing deal
   if(sl == 0) sl = SavedLevel(id, "SL");
   if(tp == 0) tp = SavedLevel(id, "TP");
   for(int i = 0; i < HistoryOrdersTotal() && (sl == 0 || tp == 0); i++)
     {
      ulong o = HistoryOrderGetTicket(i);
      if(o == 0) continue;
      if(sl == 0) sl = HistoryOrderGetDouble(o, ORDER_SL);
      if(tp == 0) tp = HistoryOrderGetDouble(o, ORDER_TP);
     }
   if(sl == 0) sl = outSl;
   if(tp == 0) tp = outTp;

   int    digits = (int)SymbolInfoInteger(symbol, SYMBOL_DIGITS);
   double entry  = inValue / inVol;
   bool   buy    = (side == "BUY");
   double net    = profit + commission + swap + fee;
   double pip    = Pip(symbol);
   double move   = buy ? exitPrice - entry : entry - exitPrice;
   double pips   = pip > 0 ? move / pip : 0;

   // risk in money from the stop distance
   double tickValue = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(symbol, SYMBOL_TRADE_TICK_SIZE);
   double riskMoney = (sl > 0 && tickSize > 0) ? MathAbs(entry - sl) / tickSize * tickValue * inVol : 0;
   double balance   = AccountInfoDouble(ACCOUNT_BALANCE);
   double startBal  = balance - net;             // approximate balance before this trade
   double r         = riskMoney > 0 ? net / riskMoney : 0;
   double riskPct   = (riskMoney > 0 && startBal > 0) ? riskMoney / startBal * 100.0 : 0;
   double pct       = startBal > 0 ? net / startBal * 100.0 : 0;

   // best and worst price while the trade was open (M1)
   double mfe = 0, mae = 0;
   MqlRates m1[];
   if(CopyRates(symbol, PERIOD_M1, openTime, closeTime, m1) > 0)
     {
      double hi = m1[0].high, lo = m1[0].low;
      for(int i = 1; i < ArraySize(m1); i++) { hi = MathMax(hi, m1[i].high); lo = MathMin(lo, m1[i].low); }
      mfe = buy ? hi - entry : entry - lo;
      mae = buy ? entry - lo : hi - entry;
     }

   // candles around the trade for the chart card
   ENUM_TIMEFRAMES tf = ChartTimeframe == PERIOD_CURRENT ? (ENUM_TIMEFRAMES)Period() : ChartTimeframe;
   int    sec  = PeriodSeconds(tf);
   datetime from = openTime - BarsBefore * sec;
   datetime to   = closeTime + BarsAfter * sec;
   if(to > TimeCurrent()) to = TimeCurrent();
   string candles = "";
   MqlRates rates[];
   int got = CopyRates(symbol, tf, from, to, rates);
   int start = MathMax(0, got - MAX_CANDLES);
   for(int i = start; i < got; i++)
     {
      if(i > start) candles += ",";
      candles += "[" + IntegerToString((long)rates[i].time) + "," + DoubleToString(rates[i].open, digits) + ","
                 + DoubleToString(rates[i].high, digits) + "," + DoubleToString(rates[i].low, digits) + ","
                 + DoubleToString(rates[i].close, digits) + "]";
     }

   json = "{" + J("key", JournalKey) + "," + J("ea", EA_CODE) + "," + J("account", Login()) + ","
          + J("broker", AccountInfoString(ACCOUNT_SERVER)) + "," + J("currency", AccountInfoString(ACCOUNT_CURRENCY)) + ","
          + "\"trade\":{"
          + J("position_id", IntegerToString((long)id)) + "," + J("symbol", symbol) + "," + J("side", side) + ","
          + JN("lots", inVol, 2) + "," + JN("entry", entry, digits) + "," + JN("exit", exitPrice, digits) + ","
          + JN("sl", sl, digits) + "," + JN("tp", tp, digits) + "," + JN("digits", digits, 0) + ","
          + J("open_time", IsoTime(openTime)) + "," + J("close_time", IsoTime(closeTime)) + ","
          + JN("profit", profit, 2) + "," + JN("commission", commission + fee, 2) + "," + JN("swap", swap, 2) + ","
          + JN("net", net, 2) + "," + JN("pips", pips, 1) + "," + JN("r", r, 2) + ","
          + JN("risk_money", riskMoney, 2) + "," + JN("risk_pct", riskPct, 2) + "," + JN("pct", pct, 2) + ","
          + JN("balance_after", balance, 2) + "," + JN("mfe", mfe, digits) + "," + JN("mae", mae, digits) + ","
          + JN("magic", (double)magic, 0) + "," + J("comment", comment) + "," + J("tf", TfName(tf)) + ","
          + "\"partials\":[" + partials + "],\"candles\":[" + candles + "]}}";

   return true;
  }

//--- local CSV copy, so nothing is lost even without internet -----------
void LogLocally(const string json, const ulong id)
  {
   bool isNew = !FileIsExist(LogFile(), FILE_COMMON);
   int h = FileOpen(LogFile(), FILE_READ | FILE_WRITE | FILE_TXT | FILE_COMMON | FILE_ANSI);
   if(h == INVALID_HANDLE) return;
   FileSeek(h, 0, SEEK_END);
   if(isNew) FileWriteString(h, "position_id;json\n");
   FileWriteString(h, IntegerToString((long)id) + ";" + json + "\n");
   FileClose(h);
  }

//--- send to the website ---------------------------------------------------
// 1 = stored, 0 = rejected (do not retry), -1 = network problem (retry later)
int Send(const string json, string &msg) { return PostJson("/api/journal/trades", json, msg); }

int PostJson(const string path, const string json, string &msg)
  {
   char data[], result[];
   string resHeaders;
   int len = StringToCharArray(json, data, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(data, MathMax(0, len - 1));                    // drop the trailing zero
   ResetLastError();
   int http = WebRequest("POST", LICENSE_SERVER + path, "Content-Type: application/json\r\n",
                         15000, data, result, resHeaders);
   if(http == -1)
     {
      int err = GetLastError();
      msg = err == 4014 ? "allow " + LICENSE_SERVER + " in Tools > Options > Expert Advisors"
                        : "no connection (error " + IntegerToString(err) + ")";
      return -1;
     }
   string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   msg = LicJsonString(body, "message");
   if(http == 200) return 1;
   if(http >= 500) return -1;
   return 0;
  }

void ProcessQueue()
  {
   if(MQLInfoInteger(MQL_TESTER)) return;
   if(!LicenseIsValid()) return;
   if(JournalKey == "") { g_lastSync = "enter your Journal key in the EA inputs"; return; }

   datetime now = TimeCurrent();
   for(int i = ArraySize(g_queue) - 1; i >= 0; i--)
     {
      if(g_queue[i].due > now) continue;
      ulong id = g_queue[i].position_id;
      string json, msg;
      datetime closeTime;
      if(!BuildTrade(id, json, closeTime)) { Dequeue(i); continue; }

      int r = Send(json, msg);
      if(r == 1)
        {
         datetime complete = closeTime + BarsAfter * PeriodSeconds(ChartTimeframe);
         g_sentCount++;
         g_lastSync = TimeToString(TimeLocal(), TIME_MINUTES) + " sent position " + IntegerToString((long)id);
         if(now >= complete)
           {
            MarkSent(id);
            LogLocally(json, id);
            Dequeue(i);
           }
         else
            g_queue[i].due = complete + 30;   // send once more when the candles after the exit exist
        }
      else if(r == 0)
        {
         g_lastSync = "rejected: " + msg;
         MarkSent(id);                        // do not keep retrying a rejected trade
         LogLocally(json, id);
         Dequeue(i);
        }
      else
        {
         g_lastSync = "waiting: " + msg;
         g_queue[i].due = now + 60;
        }
     }
  }

//--- find closed trades that were never sent ------------------------------
void CatchUp()
  {
   if(CatchUpDays <= 0) return;
   datetime now = TimeCurrent();
   if(!HistorySelect(now - CatchUpDays * 86400, now)) return;
   ulong ids[];
   for(int i = 0; i < HistoryDealsTotal(); i++)
     {
      ulong d = HistoryDealGetTicket(i);
      long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
      if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY) continue;
      ulong id = (ulong)HistoryDealGetInteger(d, DEAL_POSITION_ID);
      bool dup = false;
      for(int k = 0; k < ArraySize(ids); k++) if(ids[k] == id) { dup = true; break; }
      if(!dup) { int n = ArraySize(ids); ArrayResize(ids, n + 1); ids[n] = id; }
     }
   for(int k = 0; k < ArraySize(ids); k++)
      if(!IsPositionOpen(ids[k]) && !WasSent(ids[k])) Enqueue(ids[k], now);
  }


//--- news for the Desk: MT5's built-in economic calendar ----------------------
// Sends releases (actual / forecast / previous) and, for past ones, how far gold moved in the 15 minutes after.
// Times go out in UTC. Runs every 30 minutes; the first run on an account also sends ~13 months of high-impact history.
datetime g_calNext = 0;
string   g_calStatus = "not sent yet";

string CalNum(const long v, const double div)
  {
   if(v == LONG_MIN) return "null";
   return DoubleToString((double)v / 1000000.0 / div, 4);
  }

string CalGoldSymbol()
  {
   static string found = "-";
   if(found != "-") return found;
   found = "";
   for(int i = 0; i < SymbolsTotal(false); i++)
     {
      string s = SymbolName(i, false);
      if(StringFind(s, "XAUUSD") == 0 || (found == "" && StringFind(s, "XAU") >= 0 && StringFind(s, "USD") >= 0)) found = s;
      if(found == "XAUUSD") break;
     }
   if(found != "") SymbolSelect(found, true);
   return found;
  }

// gold's range and direction in the 15 one-minute bars after a release (server time)
void CalGoldMove(const datetime t, string &move, string &dir)
  {
   move = "null"; dir = "0";
   string g = CalGoldSymbol();
   if(g == "") return;
   MqlRates r[];
   int n = CopyRates(g, PERIOD_M1, t, t + 15 * 60 - 1, r);
   if(n < 5) return;
   double hi = r[0].high, lo = r[0].low;
   for(int i = 1; i < n; i++) { hi = MathMax(hi, r[i].high); lo = MathMin(lo, r[i].low); }
   move = DoubleToString(hi - lo, 2);
   double d = r[n - 1].close - r[0].open;
   dir = d > 0 ? "1" : d < 0 ? "-1" : "0";
  }

// returns events sent, or -1 on a network problem
int CalSend(const datetime from, const datetime to, const int minImportance, const datetime movesFrom)
  {
   MqlCalendarValue v[];
   int n = CalendarValueHistory(v, from, to);
   if(n <= 0) return 0;
   long gmtShift = (long)(TimeTradeServer() - TimeGMT());
   gmtShift = (long)MathRound(gmtShift / 900.0) * 900;           // whole quarter hours
   datetime now = TimeTradeServer();
   string batch = "";
   int inBatch = 0, sent = 0;
   for(int i = 0; i < n; i++)
     {
      MqlCalendarEvent e;
      if(!CalendarEventById(v[i].event_id, e)) continue;
      int imp = e.importance == CALENDAR_IMPORTANCE_HIGH ? 3 : e.importance == CALENDAR_IMPORTANCE_MODERATE ? 2 : 1;
      if(imp < minImportance) continue;
      MqlCalendarCountry c;
      if(!CalendarCountryById(e.country_id, c)) continue;
      string cur = c.currency;
      if(StringFind("USD EUR GBP JPY CAD AUD NZD CHF CNY", cur) < 0 || StringLen(cur) != 3) continue;
      double div = 1;
      string unit = "";
      if(e.unit == CALENDAR_UNIT_PERCENT) unit = "%";
      else
        {
         if(e.multiplier == CALENDAR_MULTIPLIER_THOUSANDS) { unit = "K"; }
         else if(e.multiplier == CALENDAR_MULTIPLIER_MILLIONS) { unit = "M"; }
         else if(e.multiplier == CALENDAR_MULTIPLIER_BILLIONS) { unit = "B"; }
         else if(e.multiplier == CALENDAR_MULTIPLIER_TRILLIONS) { unit = "T"; }
        }
      string move = "null", dir = "0";
      if(imp == 3 && v[i].actual_value != LONG_MIN && v[i].time >= movesFrom && v[i].time + 15 * 60 <= now)
         CalGoldMove(v[i].time, move, dir);
      long prev = v[i].revised_prev_value != LONG_MIN ? v[i].revised_prev_value : v[i].prev_value;
      string row = "[\"" + IntegerToString((long)e.id) + "\"," + IntegerToString((long)v[i].time - gmtShift) + ",\"" + cur + "\",\""
                   + JsonEscape(e.name) + "\"," + IntegerToString(imp) + "," + CalNum(v[i].actual_value, div) + ","
                   + CalNum(v[i].forecast_value, div) + "," + CalNum(prev, div) + ",\"" + unit + "\"," + move + "," + dir + "]";
      batch += (inBatch ? "," : "") + row;
      inBatch++;
      if(inBatch >= 400 || i == n - 1)
        {
         string msg;
         string json = "{" + J("key", JournalKey) + "," + J("account", Login()) + ",\"events\":[" + batch + "]}";
         int r = PostJson("/api/journal/calendar", json, msg);
         if(r == -1) { g_calStatus = "waiting: " + msg; return -1; }
         if(r == 0) { g_calStatus = "rejected: " + msg; return sent; }
         sent += inBatch;
         batch = ""; inBatch = 0;
        }
     }
   if(inBatch > 0)
     {
      string msg;
      string json = "{" + J("key", JournalKey) + "," + J("account", Login()) + ",\"events\":[" + batch + "]}";
      int r = PostJson("/api/journal/calendar", json, msg);
      if(r == -1) { g_calStatus = "waiting: " + msg; return -1; }
      if(r == 1) sent += inBatch;
     }
   return sent;
  }

void CalendarOnTimer()
  {
   if(!SendNews || MQLInfoInteger(MQL_TESTER)) return;
   if(!LicenseIsValid() || JournalKey == "") return;
   datetime now = TimeTradeServer();
   if(now < g_calNext) return;
   g_calNext = now + 30 * 60;
   int sent = CalSend(now - 3 * 86400, now + 7 * 86400, 2, now - 3 * 86400);
   if(sent < 0) { g_calNext = now + 5 * 60; return; }
   string gv = "TJ_NEWS_HIST_" + Login();
   if(!GlobalVariableCheck(gv))
     {
      int h = CalSend(now - 400 * 86400, now - 3 * 86400, 3, now - 120 * 86400);
      if(h >= 0) GlobalVariableSet(gv, (double)TimeLocal());
     }
   g_calStatus = TimeToString(TimeLocal(), TIME_MINUTES) + " sent " + IntegerToString(sent) + " releases";
  }

//--- on-chart panel --------------------------------------------------------
void UpdatePanel()
  {
   if(!ShowPanel) return;
   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   datetime dayStart = StructToTime(dt);
   int trades = 0;
   double pnl = 0;
   if(HistorySelect(dayStart, TimeCurrent()))
      for(int i = 0; i < HistoryDealsTotal(); i++)
        {
         ulong d = HistoryDealGetTicket(i);
         long entry = HistoryDealGetInteger(d, DEAL_ENTRY);
         if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT) continue;
         trades++;
         pnl += HistoryDealGetDouble(d, DEAL_PROFIT) + HistoryDealGetDouble(d, DEAL_COMMISSION)
                + HistoryDealGetDouble(d, DEAL_SWAP) + HistoryDealGetDouble(d, DEAL_FEE);
        }
   Comment("5ABI.FX TRADE JOURNAL\n",
           "License: ", LicenseIsValid() ? "OK" : "not active", "\n",
           "Today: ", trades, " closes, ", DoubleToString(pnl, 2), " ", AccountInfoString(ACCOUNT_CURRENCY), "\n",
           "Waiting to send: ", ArraySize(g_queue), "\n",
           "Last sync: ", g_lastSync, "\n",
           "Indicators: ", g_relayStatus, "\n",
           "News: ", SendNews ? g_calStatus : "off");
  }

//--- events ----------------------------------------------------------------
int OnInit()
  {
   int lic = LicenseOnInit();
   if(lic != INIT_SUCCEEDED) return lic;
   if(MQLInfoInteger(MQL_TESTER)) return INIT_SUCCEEDED;
   if(JournalKey == "")
      Alert("Trade Journal: paste your Journal key (from your dashboard on ", LICENSE_SERVER, ") into the EA inputs.");
   EventSetTimer(10);
   g_calNext = TimeTradeServer() + 20;      // news a little after start, trades first
   RememberLevels();
   CatchUp();
   ProcessQueue();
   UpdatePanel();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   LicenseOnDeinit();
  }

void OnTimer()
  {
   LicenseOnTimer();
   RelayOnTimer();
   RememberLevels();
   ProcessQueue();
   CalendarOnTimer();
   UpdatePanel();
  }

void OnTick() { }   // nothing to do on ticks: the journal never trades

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
   if(trans.type == TRADE_TRANSACTION_POSITION || trans.type == TRADE_TRANSACTION_DEAL_ADD) RememberLevels();
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD) return;
   if(!HistoryDealSelect(trans.deal)) return;
   long entry = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY && entry != DEAL_ENTRY_INOUT) return;
   ulong id = (ulong)HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID);
   if(IsPositionOpen(id)) return;           // a partial close: logged with the final close
   Enqueue(id, TimeCurrent());
   ProcessQueue();
   UpdatePanel();
  }
//+------------------------------------------------------------------+
