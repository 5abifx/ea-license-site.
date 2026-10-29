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
#property version   "1.00"
#property description "Trade Journal: logs closed trades, partials and candles to your journal."

#define EA_CODE        "JOURNAL"                  // must match the license code in Admin > EAs
#define LICENSE_SERVER "https://your-domain.com"  // your website address, no trailing slash
#define LICENSE_SALT   4471902
#include "LicenseCheck.mqh"

input string          JournalKey     = "";          // Journal key (from your dashboard)
input ENUM_TIMEFRAMES ChartTimeframe = PERIOD_M5;   // Candles saved with each trade
input int             BarsBefore     = 40;          // Candles before entry
input int             BarsAfter      = 20;          // Candles after exit
input int             CatchUpDays    = 7;           // On start, also send trades closed in the last N days
input double          PipSize        = 0;           // Pip size (0 = automatic)
input bool            ShowPanel      = true;        // Show the journal panel on the chart

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
string SentFile() { return JOURNAL_DIR + "sent_" + Login() + ".txt"; }
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
         nOut++;
         outVol += vol;
         exitPrice = price;
         closeTime = t;
        }
     }
   if(symbol == "" || nOut == 0 || inVol <= 0) return false;

   // the initial stop and target: from the first entry deal, or the opening order
   if((sl == 0 || tp == 0) && HistoryOrdersTotal() > 0)
     {
      ulong o = HistoryOrderGetTicket(0);
      if(sl == 0) sl = HistoryOrderGetDouble(o, ORDER_SL);
      if(tp == 0) tp = HistoryOrderGetDouble(o, ORDER_TP);
     }

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
int Send(const string json, string &msg)
  {
   char data[], result[];
   string resHeaders;
   int len = StringToCharArray(json, data, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(data, MathMax(0, len - 1));                    // drop the trailing zero
   ResetLastError();
   int http = WebRequest("POST", LICENSE_SERVER + "/api/journal/trades", "Content-Type: application/json\r\n",
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
           "Last sync: ", g_lastSync);
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
   ProcessQueue();
   UpdatePanel();
  }

void OnTick() { }   // nothing to do on ticks: the journal never trades

void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &request, const MqlTradeResult &result)
  {
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
