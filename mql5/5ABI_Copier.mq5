//+------------------------------------------------------------------+
//| 5ABI_Copier.mq5 - copies trades from one MT5 account to another   |
//|                                                                  |
//| One EA, two jobs (input Role):                                   |
//|   MASTER   - reads the trades on this account and shares them.   |
//|              It never opens, changes or closes a trade.          |
//|   FOLLOWER - copies the Master's trades onto this account, with  |
//|              its own lot size and its own prop firm guards.      |
//|                                                                  |
//| Both MT5 terminals must run on the SAME computer (or VPS). They   |
//| talk through MT5's shared "Common\Files" folder, ~0.1 s.         |
//| One MT5 terminal = one account at a time, so Master and Follower |
//| need two MT5 installs (e.g. FundedNext MT5 + FTMO MT5).          |
//+------------------------------------------------------------------+
#property copyright "5ABI.FX"
#property version   "1.10"
#property description "5ABI.FX Copier: Master shares trades, Follower copies them"
#property description "with its own lot size and daily / max loss guards."

#include <Trade\Trade.mqh>

enum ENUM_ROLE     { ROLE_MASTER = 0,   // Master (send my trades)
                     ROLE_FOLLOWER = 1  // Follower (copy trades here)
                   };
enum ENUM_LOT_MODE { LOT_MATCH = 5,     // Same risk % as Master (recommended)
                     LOT_BALANCE = 0,   // Balance ratio (my balance / Master balance)
                     LOT_RISK = 1,      // Risk % per trade (needs Master SL)
                     LOT_MULTIPLY = 2,  // Master lots x multiplier
                     LOT_SAME = 3,      // Same lots as Master
                     LOT_FIXED = 4      // Fixed lot
                   };

input group "Main"
input ENUM_ROLE     Role            = ROLE_FOLLOWER; // Role
input string        Channel         = "MAIN";        // Channel (same name on Master and Follower)
input long          OnlyAccount     = 0;             // Only run on this account number (0 = any)

input group "Follower: lot size"
input ENUM_LOT_MODE LotMode         = LOT_MATCH;     // Lot mode
input double        LotMultiplier   = 1.0;           // Multiplier (all modes except Fixed; 0.5 = half the risk)
input double        RiskPercent     = 0.5;           // Risk % per trade (Risk mode)
input double        FixedLot        = 0.10;          // Fixed lot (Fixed mode)
input double        MaxLotPerTrade  = 5.0;           // Max lots per copied trade (0 = no cap)
input int           MaxOpenCopies   = 10;            // Max copied trades open at once

input group "Follower: what to copy"
input string        CopySymbols     = "";            // Only these symbols, e.g. XAUUSD,NAS100 (empty = all)
input string        SymbolMap       = "";            // Different names, e.g. US30=US30.cash,XAUUSD=GOLD
input bool          CopySLTP        = true;          // Copy stop loss and take profit (and their moves)
input bool          CopyPartials    = true;          // Copy partial closes
input bool          Reverse         = false;         // Reverse (open the opposite side)
input int           MaxTradeAgeSec  = 30;            // Skip Master trades older than this (seconds)
input int           MaxEntryGapPts  = 0;             // Skip if price moved more than N points (0 = off)
input int           SlippagePoints  = 30;            // Max slippage when opening / closing (points)
input long          MasterAccount   = 0;             // Master account number to accept (0 = first seen)

input group "Follower: prop firm guards"
input double        RulesAccountSize = 100000;       // Account size the firm's rules use (0 = start balance)
input double        StopDailyLossPct = 4.0;          // Stop for the day at this daily loss % (0 = off)
input double        StopMaxLossPct   = 9.0;          // Stop for good at this total loss % (0 = off)
input bool          CloseOnStop      = true;         // Close copied trades when a guard stops copying

input group "Panel"
input bool          ShowPanel       = true;          // Show the panel on the chart
input int           TimerMs         = 100;           // Check every N milliseconds

#define CP_VER       "1.10"
#define CP_MAGIC     55102026
#define CP_DIR       "5ABI_Copier\\"
#define CP_TAG       "5C"
#define CP_STALE_SEC 5
#define PFX          "5ABICP_"

CTrade g_trade;

//--- Master side
string   g_lastSnapshot = "";
datetime g_lastWrite    = 0;
uint     g_startMs      = 0;
bool     g_masterPaused = false;
long     g_seq          = 0;

//--- Follower side: last good read of the Master file
struct MasterPos
  {
   ulong    ticket;
   string   symbol;
   int      type;      // 0 buy, 1 sell
   double   volume;
   double   price;
   double   sl;
   double   tp;
   datetime opened;    // Master server time
   double   risk;      // Master money lost if SL is hit (0 = no SL)
   double   val;       // Master money per 1.0 price move per lot
  };
MasterPos g_m[];
int      g_mCount     = 0;
long     g_mLogin     = 0;
datetime g_mGmt       = 0;
datetime g_mNow       = 0;
double   g_mBalance   = 0;
bool     g_mPaused    = false;
bool     g_mConnected = false;
string   g_status     = "Starting";
string   g_lastEvent  = "-";
int      g_copiedToday = 0;
long     g_dayKey      = 0;
double   g_dayStart    = 0;
bool     g_dailyStop   = false;
bool     g_maxStop     = false;
bool     g_userPaused  = false;
double   g_delaySum    = 0;
int      g_delayN      = 0;
datetime g_lastLog     = 0;
string   g_lastRisk    = "-";

//+------------------------------------------------------------------+
//| helpers                                                          |
//+------------------------------------------------------------------+
string FileName()   { return CP_DIR + Channel + ".txt"; }
string Login()      { return IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)); }
string GvPrefix()   { return "5C_" + Channel + "_" + Login() + "_"; }

bool AccountAllowed()
  {
   return OnlyAccount == 0 || AccountInfoInteger(ACCOUNT_LOGIN) == OnlyAccount;
  }

void Log(const string s)
  {
   g_lastEvent = s;
   Print("5ABI Copier: ", s);
  }

string Money(const double v)
  {
   return (v < 0 ? "-$" : "$") + DoubleToString(MathAbs(v), 0);
  }

string Trim(string s)
  {
   StringTrimLeft(s);
   StringTrimRight(s);
   return s;
  }

//+------------------------------------------------------------------+
//| MASTER: write a snapshot of open positions                       |
//+------------------------------------------------------------------+
void MasterTick()
  {
   bool connected = (bool)TerminalInfoInteger(TERMINAL_CONNECTED);
   // give MT5 a few seconds after start to load the positions list
   if(GetTickCount() - g_startMs < 4000)
     {
      g_status = "Loading trades";
      return;
     }

   string body = "";
   int n = 0;
   for(int i = 0; i < PositionsTotal(); i++)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      long type = PositionGetInteger(POSITION_TYPE);
      string psym = PositionGetString(POSITION_SYMBOL);
      double popen = PositionGetDouble(POSITION_PRICE_OPEN), psl = PositionGetDouble(POSITION_SL);
      double pvol = PositionGetDouble(POSITION_VOLUME);
      ENUM_ORDER_TYPE pot = (type == POSITION_TYPE_BUY) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
      double risk = 0, val = 0;
      if(psl > 0 && OrderCalcProfit(pot, psym, pvol, popen, psl, risk)) risk = (risk < 0) ? -risk : 0;
      else risk = 0;
      if(!OrderCalcProfit(ORDER_TYPE_BUY, psym, 1.0, popen, popen + 1.0, val)) val = 0;
      body += StringFormat("P;%I64u;%s;%d;%.2f;%.10g;%.10g;%.10g;%I64d;%.2f;%.6f\n",
                           t,
                           PositionGetString(POSITION_SYMBOL),
                           (int)type,
                           PositionGetDouble(POSITION_VOLUME),
                           PositionGetDouble(POSITION_PRICE_OPEN),
                           PositionGetDouble(POSITION_SL),
                           PositionGetDouble(POSITION_TP),
                           (long)PositionGetInteger(POSITION_TIME),
                           risk, val);
      n++;
     }

   string state = body + (g_masterPaused ? "1" : "0") + (connected ? "1" : "0");
   datetime now = TimeGMT();
   // write when something changed, plus a heartbeat every second
   if(state == g_lastSnapshot && now == g_lastWrite) return;

   g_seq++;
   string head = StringFormat("H;%s;%I64d;%I64d;%I64d;%I64d;%.2f;%.2f;%d;%d;%d\n",
                              CP_VER,
                              AccountInfoInteger(ACCOUNT_LOGIN),
                              g_seq,
                              (long)now,
                              (long)TimeCurrent(),
                              AccountInfoDouble(ACCOUNT_BALANCE),
                              AccountInfoDouble(ACCOUNT_EQUITY),
                              g_masterPaused ? 1 : 0,
                              connected ? 1 : 0,
                              n);
   string all = head + body + "E;" + IntegerToString(n) + "\n";

   int h = FileOpen(FileName(), FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ);
   if(h == INVALID_HANDLE)
     {
      g_status = "Cannot write file";
      return;
     }
   FileWriteString(h, all);
   FileClose(h);

   g_lastSnapshot = state;
   g_lastWrite = now;
   g_mCount = n;
   g_status = !connected ? "Broker offline" : (g_masterPaused ? "Paused" : "Sending");
  }

//+------------------------------------------------------------------+
//| FOLLOWER: read the Master file (only accepts a complete file)    |
//+------------------------------------------------------------------+
bool ReadMaster()
  {
   int h = FileOpen(FileName(), FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON | FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE) return false;

   MasterPos tmp[];
   int count = 0, want = -1, endCount = -1;
   long login = 0;
   datetime gmt = 0, mnow = 0;
   double bal = 0;
   bool paused = false, conn = false;

   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      if(line == "") continue;
      string f[];
      int k = StringSplit(line, ';', f);
      if(k < 2) continue;
      if(f[0] == "H" && k >= 11)
        {
         login  = StringToInteger(f[2]);
         gmt    = (datetime)StringToInteger(f[4]);
         mnow   = (datetime)StringToInteger(f[5]);
         bal    = StringToDouble(f[6]);
         paused = f[8] == "1";
         conn   = f[9] == "1";
         want   = (int)StringToInteger(f[10]);
        }
      else if(f[0] == "P" && k >= 9)
        {
         ArrayResize(tmp, count + 1);
         tmp[count].ticket = (ulong)StringToInteger(f[1]);
         tmp[count].symbol = f[2];
         tmp[count].type   = (int)StringToInteger(f[3]);
         tmp[count].volume = StringToDouble(f[4]);
         tmp[count].price  = StringToDouble(f[5]);
         tmp[count].sl     = StringToDouble(f[6]);
         tmp[count].tp     = StringToDouble(f[7]);
         tmp[count].opened = (datetime)StringToInteger(f[8]);
         tmp[count].risk   = (k >= 11) ? StringToDouble(f[9]) : 0;
         tmp[count].val    = (k >= 11) ? StringToDouble(f[10]) : 0;
         count++;
        }
      else if(f[0] == "E")
         endCount = (int)StringToInteger(f[1]);
     }
   FileClose(h);

   // half-written file: ignore it and keep the last good one
   if(want < 0 || endCount != want || count != want || login == 0) return false;

   ArrayResize(g_m, count);
   for(int i = 0; i < count; i++) g_m[i] = tmp[i];
   g_mCount     = count;
   g_mLogin     = login;
   g_mGmt       = gmt;
   g_mNow       = mnow;
   g_mBalance   = bal;
   g_mPaused    = paused;
   g_mConnected = conn;
   return true;
  }

//+------------------------------------------------------------------+
//| symbols                                                          |
//+------------------------------------------------------------------+
bool SymbolWanted(const string masterSym)
  {
   if(Trim(CopySymbols) == "") return true;
   string list[];
   int n = StringSplit(CopySymbols, ',', list);
   for(int i = 0; i < n; i++)
      if(Trim(list[i]) == masterSym) return true;
   return false;
  }

string MapSymbol(const string masterSym)
  {
   // 1) user's map
   if(Trim(SymbolMap) != "")
     {
      string pairs[];
      int n = StringSplit(SymbolMap, ',', pairs);
      for(int i = 0; i < n; i++)
        {
         string kv[];
         if(StringSplit(pairs[i], '=', kv) == 2 && Trim(kv[0]) == masterSym)
            return Trim(kv[1]);
        }
     }
   // 2) same name
   bool custom = false;
   if(SymbolExist(masterSym, custom)) return masterSym;
   // 3) same name with a suffix, e.g. XAUUSD -> XAUUSD.r
   int total = SymbolsTotal(false);
   for(int i = 0; i < total; i++)
     {
      string s = SymbolName(i, false);
      if(StringFind(s, masterSym) == 0) return s;
     }
   return "";
  }

//+------------------------------------------------------------------+
//| lots                                                             |
//+------------------------------------------------------------------+
double NormalizeLots(const string sym, double lots)
  {
   double step = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   double mn   = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double mx   = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   if(step <= 0) step = 0.01;
   if(MaxLotPerTrade > 0 && lots > MaxLotPerTrade) lots = MaxLotPerTrade;
   lots = MathFloor(lots / step + 1e-9) * step;
   if(lots < mn) return 0;
   if(lots > mx) lots = mx;
   return NormalizeDouble(lots, 2);
  }

// money lost on this account if 1 lot hits the stop
double LossPerLot(const string sym, const int type, const double entry, const double sl)
  {
   if(sl <= 0) return 0;
   double profit = 0;
   ENUM_ORDER_TYPE ot = (type == 0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(!OrderCalcProfit(ot, sym, 1.0, entry, sl, profit)) return 0;
   return MathAbs(profit);
  }

// lots that give the same $ size as the Master, scaled by balance.
// Corrects for brokers whose contract size differs (e.g. gold 100 oz vs 10 oz).
double BalanceLots(const MasterPos &m, const string sym, const double entry)
  {
   if(g_mBalance <= 0) return 0;
   double lots = m.volume * AccountInfoDouble(ACCOUNT_BALANCE) / g_mBalance;
   double mine = 0;
   if(m.val > 0 && OrderCalcProfit(ORDER_TYPE_BUY, sym, 1.0, entry, entry + 1.0, mine) && mine > 0)
      lots *= m.val / mine;
   return lots;
  }

double CalcLots(const MasterPos &m, const string sym, const int type, const double entry)
  {
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double lots = 0;
   switch(LotMode)
     {
      case LOT_SAME:     lots = m.volume; break;
      case LOT_MULTIPLY: lots = m.volume * LotMultiplier; break;
      case LOT_FIXED:    lots = FixedLot; break;
      case LOT_RISK:
        {
         double lpl = LossPerLot(sym, type, entry, m.sl);
         lots = (lpl > 0) ? bal * RiskPercent / 100.0 / lpl
                          : BalanceLots(m, sym, entry) * LotMultiplier;   // no SL on Master
         break;
        }
      case LOT_MATCH:
        {
         // same % of balance at risk as the Master trade, measured to the same SL price
         double lpl = Reverse ? 0 : LossPerLot(sym, type, entry, m.sl);
         if(m.risk > 0 && g_mBalance > 0 && lpl > 0)
            lots = bal * (m.risk / g_mBalance) / lpl * LotMultiplier;
         else
            lots = BalanceLots(m, sym, entry) * LotMultiplier;           // no SL yet
         break;
        }
      default:
         lots = BalanceLots(m, sym, entry) * LotMultiplier;
     }
   return NormalizeLots(sym, lots);
  }


//+------------------------------------------------------------------+
//| copy tags: comment "5C|<master ticket>|<master lots>|<my lots>"  |
//+------------------------------------------------------------------+
bool ParseTag(const string comment, ulong &mt, double &mvol, double &fvol)
  {
   string p[];
   if(StringSplit(comment, '|', p) < 4 || p[0] != CP_TAG) return false;
   mt   = (ulong)StringToInteger(p[1]);
   mvol = StringToDouble(p[2]);
   fvol = StringToDouble(p[3]);
   return mt > 0;
  }

// a Master trade we already handled (copied, skipped or closed here) is never reopened
string DoneName(const ulong mt) { return GvPrefix() + IntegerToString((long)mt); }
bool   IsDone(const ulong mt)   { return GlobalVariableCheck(DoneName(mt)); }
void   MarkDone(const ulong mt) { GlobalVariableSet(DoneName(mt), (double)TimeCurrent()); }

void CleanOldDone()
  {
   string pre = GvPrefix();
   for(int i = GlobalVariablesTotal() - 1; i >= 0; i--)
     {
      string n = GlobalVariableName(i);
      if(StringFind(n, pre) != 0) continue;
      if(TimeCurrent() - GlobalVariableTime(n) > 14 * 86400) GlobalVariableDel(n);
     }
  }

int FindMaster(const ulong mt)
  {
   for(int i = 0; i < g_mCount; i++)
      if(g_m[i].ticket == mt) return i;
   return -1;
  }

//+------------------------------------------------------------------+
//| prop firm guards                                                 |
//+------------------------------------------------------------------+
double RulesBase()
  {
   if(RulesAccountSize > 0) return RulesAccountSize;
   string n = "5C_BASE_" + Login();
   if(!GlobalVariableCheck(n)) GlobalVariableSet(n, AccountInfoDouble(ACCOUNT_BALANCE));
   return GlobalVariableGet(n);
  }

void UpdateDay()
  {
   long key = (long)(TimeCurrent() / 86400);
   string nk = "5C_DK_" + Login(), ns = "5C_DS_" + Login();
   if(GlobalVariableCheck(nk) && (long)GlobalVariableGet(nk) == key && GlobalVariableCheck(ns))
     {
      g_dayKey = key;
      g_dayStart = GlobalVariableGet(ns);
      return;
     }
   g_dayKey = key;
   g_dayStart = MathMax(AccountInfoDouble(ACCOUNT_BALANCE), AccountInfoDouble(ACCOUNT_EQUITY));
   GlobalVariableSet(nk, (double)key);
   GlobalVariableSet(ns, g_dayStart);
   g_dailyStop = false;
   g_copiedToday = 0;
  }

double DailyFloor() { return StopDailyLossPct > 0 ? g_dayStart - RulesBase() * StopDailyLossPct / 100.0 : -DBL_MAX; }
double MaxFloor()   { return StopMaxLossPct   > 0 ? RulesBase() * (1.0 - StopMaxLossPct / 100.0)   : -DBL_MAX; }
double GuardFloor() { return MathMax(DailyFloor(), MaxFloor()); }

void CloseAllCopies(const string why)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || PositionGetInteger(POSITION_MAGIC) != CP_MAGIC) continue;
      ulong mt; double mv, fv;
      if(!ParseTag(PositionGetString(POSITION_COMMENT), mt, mv, fv)) continue;
      if(g_trade.PositionClose(t)) MarkDone(mt);
     }
   Log("Closed copies: " + why);
  }

void CheckGuards()
  {
   UpdateDay();
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   if(!g_maxStop && StopMaxLossPct > 0 && eq <= MaxFloor())
     {
      g_maxStop = true;
      Log("Max loss guard hit. Copying stopped.");
      if(CloseOnStop) CloseAllCopies("max loss guard");
     }
   if(!g_dailyStop && StopDailyLossPct > 0 && eq <= DailyFloor())
     {
      g_dailyStop = true;
      Log("Daily loss guard hit. Stopped until tomorrow.");
      if(CloseOnStop) CloseAllCopies("daily loss guard");
     }
  }

//+------------------------------------------------------------------+
//| FOLLOWER main loop                                               |
//+------------------------------------------------------------------+
void FollowerTick()
  {
   CheckGuards();

   if(!ReadMaster())
     {
      if(g_mGmt == 0) g_status = "Waiting for Master";
      return;
     }

   // lock onto one Master account so switching logins on the Master can't mix trades
   string lockName = "5C_ML_" + Channel + "_" + Login();
   long expect = MasterAccount;
   if(expect == 0)
     {
      if(!GlobalVariableCheck(lockName)) GlobalVariableSet(lockName, (double)g_mLogin);
      expect = (long)GlobalVariableGet(lockName);
     }
   if(g_mLogin != expect)
     {
      g_status = "Wrong Master account";
      return;
     }
   if(TimeGMT() - g_mGmt > CP_STALE_SEC || !g_mConnected)
     {
      g_status = "Master offline";
      return;   // hold everything as it is; never close on old data
     }

   bool canOpen = !g_userPaused && !g_mPaused && !g_dailyStop && !g_maxStop;
   g_status = g_maxStop ? "Stopped: max loss" :
              g_dailyStop ? "Stopped for today" :
              g_userPaused ? "Paused" :
              g_mPaused ? "Master paused" : "Copying";

   // 1) manage copies that are already open
   int openCopies = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || PositionGetInteger(POSITION_MAGIC) != CP_MAGIC) continue;
      ulong mt; double mvol, fvol;
      if(!ParseTag(PositionGetString(POSITION_COMMENT), mt, mvol, fvol)) continue;
      openCopies++;
      if(!IsDone(mt)) MarkDone(mt);

      int k = FindMaster(mt);
      string sym = PositionGetString(POSITION_SYMBOL);
      if(k < 0)
        {
         // Master closed it -> close here
         if(g_trade.PositionClose(t)) { Log("Closed copy of #" + IntegerToString((long)mt)); openCopies--; }
         continue;
        }

      // partial close on the Master
      double cur = PositionGetDouble(POSITION_VOLUME);
      if(CopyPartials && mvol > 0 && g_m[k].volume < mvol - 1e-8)
        {
         double step = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
         if(step <= 0) step = 0.01;
         double want = MathFloor(fvol * g_m[k].volume / mvol / step + 0.5) * step;
         double cut = NormalizeDouble(cur - want, 2);
         if(want < SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN))
           {
            if(g_trade.PositionClose(t)) Log("Closed copy (partial to zero) #" + IntegerToString((long)mt));
            continue;
           }
         if(cut >= step - 1e-8)
           {
            if(g_trade.PositionClosePartial(t, cut))
               Log("Partial " + DoubleToString(cut, 2) + " lots " + sym);
            continue;
           }
        }

      // stop loss / take profit moves
      if(CopySLTP && !Reverse)
        {
         double pt = SymbolInfoDouble(sym, SYMBOL_POINT);
         int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
         double sl = NormalizeDouble(g_m[k].sl, dg), tp = NormalizeDouble(g_m[k].tp, dg);
         if(MathAbs(PositionGetDouble(POSITION_SL) - sl) > pt / 2 ||
            MathAbs(PositionGetDouble(POSITION_TP) - tp) > pt / 2)
           {
            static datetime lastTry = 0;
            if(TimeCurrent() != lastTry)
              {
               lastTry = TimeCurrent();
               if(g_trade.PositionModify(t, sl, tp))
                  Log("SL/TP moved " + sym);
              }
           }
        }
     }

   // 2) open new Master trades
   for(int i = 0; i < g_mCount; i++)
     {
      MasterPos m = g_m[i];
      if(IsDone(m.ticket)) continue;
      if(!SymbolWanted(m.symbol)) { MarkDone(m.ticket); continue; }
      if(g_mNow - m.opened > MaxTradeAgeSec)
        {
         MarkDone(m.ticket);
         Log("Skipped old trade #" + IntegerToString((long)m.ticket));
         continue;
        }
      if(!canOpen) continue;   // still young: copy it if we resume in time
      if(openCopies >= MaxOpenCopies) { g_status = "Max copies open"; continue; }

      string sym = MapSymbol(m.symbol);
      if(sym == "")
        {
         MarkDone(m.ticket);
         Log("No symbol for " + m.symbol + " (use Symbol map)");
         continue;
        }
      SymbolSelect(sym, true);

      int type = Reverse ? 1 - m.type : m.type;
      double entry = (type == 0) ? SymbolInfoDouble(sym, SYMBOL_ASK) : SymbolInfoDouble(sym, SYMBOL_BID);
      if(entry <= 0) continue;   // no price yet

      double pt = SymbolInfoDouble(sym, SYMBOL_POINT);
      if(MaxEntryGapPts > 0 && pt > 0 && MathAbs(entry - m.price) / pt > MaxEntryGapPts)
        {
         MarkDone(m.ticket);
         Log("Skipped: price moved too far " + sym);
         continue;
        }

      int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      double sl = 0, tp = 0;
      if(CopySLTP)
        {
         if(Reverse) { sl = m.tp; tp = m.sl; }
         else        { sl = m.sl; tp = m.tp; }
         sl = NormalizeDouble(sl, dg);
         tp = NormalizeDouble(tp, dg);
        }

      double lots = CalcLots(m, sym, type, entry);
      if(lots <= 0)
        {
         MarkDone(m.ticket);
         Log("Lot size too small for " + sym);
         continue;
        }

      // never open a trade whose stop loss would break the guard
      if(sl > 0)
        {
         double risk = LossPerLot(sym, type, entry, sl) * lots;
         if(AccountInfoDouble(ACCOUNT_EQUITY) - risk < GuardFloor())
           {
            MarkDone(m.ticket);
            Log("Skipped: SL would break loss limit");
            continue;
           }
        }

      string tag = StringFormat("%s|%I64u|%.2f|%.2f", CP_TAG, m.ticket, m.volume, lots);
      g_trade.SetTypeFillingBySymbol(sym);
      bool ok = (type == 0) ? g_trade.Buy(lots, sym, 0, sl, tp, tag)
                            : g_trade.Sell(lots, sym, 0, sl, tp, tag);
      if(!ok && (sl > 0 || tp > 0) && g_trade.ResultRetcode() == TRADE_RETCODE_INVALID_STOPS)
         ok = (type == 0) ? g_trade.Buy(lots, sym, 0, 0, 0, tag)
                          : g_trade.Sell(lots, sym, 0, 0, 0, tag);   // SL/TP added on next check
      if(ok)
        {
         MarkDone(m.ticket);
         openCopies++;
         g_copiedToday++;
         double myRisk = (sl > 0) ? LossPerLot(sym, type, entry, sl) * lots / AccountInfoDouble(ACCOUNT_BALANCE) * 100.0 : 0;
         double mRisk  = (m.risk > 0 && g_mBalance > 0) ? m.risk / g_mBalance * 100.0 : 0;
         g_lastRisk = (sl > 0 ? DoubleToString(myRisk, 2) + "%" : "no SL") +
                      " (M " + (mRisk > 0 ? DoubleToString(mRisk, 2) + "%" : "no SL") + ")";
         double delay = (double)(TimeGMT() - g_mGmt) + (double)(g_mNow - m.opened);
         g_delaySum += MathMax(0.0, delay);
         g_delayN++;
         Log(StringFormat("Copied %s %s %.2f", type == 0 ? "BUY" : "SELL", sym, lots));
        }
      else
        {
         // try again on the next check while the trade is young; then the age rule skips it
         if(TimeCurrent() != g_lastLog)
           {
            g_lastLog = TimeCurrent();
            Log("Open failed " + sym + ": " + g_trade.ResultRetcodeDescription());
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| panel (all labels short: MT5 cuts labels at 63 chars)            |
//+------------------------------------------------------------------+
#define P_X 12
#define P_Y 24
#define P_W 250
#define P_ROWS 11

color CText  = C'242,242,244';
color CMuted = C'138,138,148';
color COr    = C'255,90,31';
color CGood  = C'38,198,160';
color CBad   = C'240,70,75';
color CWarn  = C'245,165,36';

void Label(const string id, const int x, const int y, const string txt, const color c, const int size = 9, const string font = "Consolas")
  {
   string n = PFX + id;
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
     }
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, n, OBJPROP_TEXT, txt);
   ObjectSetString(0, n, OBJPROP_FONT, font);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, size);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
  }

void Button(const string id, const int x, const int y, const int w, const string txt, const color bg, const color fg)
  {
   string n = PFX + id;
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
      ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 8);
      ObjectSetString(0, n, OBJPROP_FONT, "Segoe UI Semibold");
     }
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, 20);
   ObjectSetString(0, n, OBJPROP_TEXT, txt);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_COLOR, fg);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
  }

void Row(const int i, const string left, const string right, const color rc)
  {
   int y = P_Y + 34 + i * 16;
   Label("l" + IntegerToString(i), P_X + 12, y, left, CMuted);
   Label("r" + IntegerToString(i), P_X + 128, y, right, rc);
  }

void DrawPanel()
  {
   if(!ShowPanel) return;
   string bg = PFX + "bg";
   int h = 34 + P_ROWS * 16 + 34;
   if(ObjectFind(0, bg) < 0)
     {
      ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
      ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, bg, OBJPROP_HIDDEN, true);
     }
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, P_X);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, P_Y);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, P_W);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, C'12,12,15');
   ObjectSetInteger(0, bg, OBJPROP_COLOR, C'38,38,42');

   bool master = (Role == ROLE_MASTER);
   Label("title", P_X + 12, P_Y + 8, "5ABI Copier", CText, 11, "Segoe UI Semibold");
   Label("role", P_X + 160, P_Y + 10, master ? "MASTER" : "FOLLOWER", master ? COr : CGood, 8, "Segoe UI Semibold");

   color sc = (g_status == "Sending" || g_status == "Copying") ? CGood :
              (StringFind(g_status, "Stopped") == 0 || g_status == "Wrong Master account" ||
               g_status == "Master offline" || g_status == "Broker offline") ? CBad : CWarn;
   if(!AccountAllowed()) { g_status = "Wrong account"; sc = CBad; }

   int r = 0;
   Row(r++, "Status", g_status, sc);
   Row(r++, "Channel", Channel, CText);
   if(master)
     {
      Row(r++, "Account", Login(), CText);
      Row(r++, "Open trades", IntegerToString(g_mCount), CText);
      Row(r++, "Balance", Money(AccountInfoDouble(ACCOUNT_BALANCE)), CText);
      Row(r++, "Last send", g_lastWrite > 0 ? IntegerToString((long)(TimeGMT() - g_lastWrite)) + " s ago" : "-", CText);
      Row(r++, "Read only", "never trades", CMuted);
      for(; r < P_ROWS - 1; ) Row(r++, " ", " ", CMuted);
     }
   else
     {
      string modes[] = {"Balance ratio", "Risk %", "Multiplier", "Same lots", "Fixed lot", "Match Master %"};
      string lm = modes[(int)LotMode];
      if(LotMode == LOT_BALANCE && g_mBalance > 0)
         lm += " " + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE) / g_mBalance * LotMultiplier, 2) + "x";
      Row(r++, "Master", g_mLogin > 0 ? IntegerToString(g_mLogin) : "-", CText);
      Row(r++, "Lot mode", lm, CText);
      Row(r++, "Copied today", IntegerToString(g_copiedToday), CText);
      Row(r++, "Last risk", g_lastRisk, CText);
      Row(r++, "Avg delay", g_delayN > 0 ? (g_delaySum / g_delayN < 1 ? "under 1 s" : DoubleToString(g_delaySum / g_delayN, 1) + " s") : "-", CText);
      double eq = AccountInfoDouble(ACCOUNT_EQUITY);
      double dl = (StopDailyLossPct > 0) ? eq - DailyFloor() : 0;
      double ml = (StopMaxLossPct > 0) ? eq - MaxFloor() : 0;
      Row(r++, "Daily room", StopDailyLossPct > 0 ? Money(dl) : "off", dl < RulesBase() * 0.01 ? CWarn : CGood);
      Row(r++, "Total room", StopMaxLossPct > 0 ? Money(ml) : "off", ml < RulesBase() * 0.02 ? CWarn : CGood);
      for(; r < P_ROWS - 1; ) Row(r++, " ", " ", CMuted);
     }
   string ev = g_lastEvent;
   if(StringLen(ev) > 40) ev = StringSubstr(ev, 0, 40);
   Label("ev", P_X + 12, P_Y + 34 + (P_ROWS - 1) * 16, ev == "" ? " " : ev, CWarn, 8);

   int by = P_Y + h - 26;
   if(master)
      Button("pause", P_X + 12, by, P_W - 24, g_masterPaused ? "Resume sending" : "Pause new copies",
             C'28,28,33', CText);
   else
     {
      Button("pause", P_X + 12, by, 108, g_userPaused ? "Resume" : "Pause", C'28,28,33', CText);
      Button("close", P_X + 128, by, P_W - 140, "Close copies", C'52,20,22', CBad);
     }
   ChartRedraw();
  }

//+------------------------------------------------------------------+
//| events                                                           |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(Trim(Channel) == "")
     {
      Alert("5ABI Copier: Channel cannot be empty");
      return INIT_PARAMETERS_INCORRECT;
     }
   g_trade.SetExpertMagicNumber(CP_MAGIC);
   g_trade.SetDeviationInPoints(SlippagePoints);
   g_trade.SetAsyncMode(false);
   g_startMs = GetTickCount();
   if(Role == ROLE_FOLLOWER)
     {
      UpdateDay();
      CleanOldDone();
     }
   EventSetMillisecondTimer(MathMax(50, TimerMs));
   g_status = "Starting";
   DrawPanel();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   ObjectsDeleteAll(0, PFX);
   ChartRedraw();
  }

void OnTimer()
  {
   static uint lastDraw = 0;
   if(AccountAllowed() && AccountInfoInteger(ACCOUNT_LOGIN) > 0)
     {
      if(Role == ROLE_MASTER) MasterTick();
      else                    FollowerTick();
     }
   if(GetTickCount() - lastDraw >= 500)
     {
      lastDraw = GetTickCount();
      DrawPanel();
     }
  }

void OnTick() { }

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id != CHARTEVENT_OBJECT_CLICK) return;
   if(sparam == PFX + "pause")
     {
      if(Role == ROLE_MASTER)
        {
         g_masterPaused = !g_masterPaused;
         Log(g_masterPaused ? "Paused: Followers open no new copies" : "Resumed");
        }
      else
        {
         g_userPaused = !g_userPaused;
         Log(g_userPaused ? "Paused" : "Resumed");
        }
     }
   else if(sparam == PFX + "close" && Role == ROLE_FOLLOWER)
     {
      g_userPaused = true;
      CloseAllCopies("you pressed Close copies");
     }
   DrawPanel();
  }
//+------------------------------------------------------------------+
