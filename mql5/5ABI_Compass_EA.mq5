//+------------------------------------------------------------------+
//|  5ABI FX · Compass EA (MetaTrader 5)                              |
//|  Trades the 5ABI auction plan: yesterday's profile + the open    |
//|  pick one of four variants, the 30-minute rule arms a setup at a |
//|  profile level, a trigger fires it with stop and target fixed    |
//|  before entry. Same engine and numbers as the Auction Compass.   |
//|                                                                  |
//|  Files (keep them together in MQL5\Experts):                     |
//|   5ABI_Compass_EA.mq5, Compass_Engine.mqh, Compass_Risk.mqh,     |
//|   Compass_Exec.mqh, Compass_Signals.mqh, Compass_Triggers.mqh,   |
//|   LicenseCheck.mqh                                               |
//|  Private build: distribute the compiled .ex5 only.               |
//+------------------------------------------------------------------+
#property copyright   "5ABI FX"
#property version     "1.01"
#property description "5ABI FX · Compass EA: trades the auction plan"

#define EA_CODE        "BOT"                 // must match the licence code in Admin > EAs
#define LICENSE_SERVER "https://5abifx.com"
#define LICENSE_SALT   5520417
#include "LicenseCheck.mqh"

enum EMode    { RUN_AUTO = 0,       // Auto: place trades
                RUN_SIGNAL = 1 };   // Signal only: alert, no orders
enum ETrigger { TRIG_CLOSE_BACK = 0, // Close back inside (data TF)
                TRIG_PB_BREAK = 1,   // P / b break on M1
                TRIG_LIMIT = 2 };    // Limit at the level (test only)
enum EStop    { STOP_AUTO = 0,       // Auto: passive, else tight if RRR fails
                STOP_PASSIVE = 1,    // Passive: beyond pHi / pLo
                STOP_TIGHT = 2 };    // Tight: beyond the trigger structure
enum EPartAt  { PART_LEVEL = 0,      // At pPOC / first target (else R multiple)
                PART_1R = 1 };       // Always at the R multiple

input group "Mode"
input EMode    InpMode            = RUN_AUTO;       // Mode
input bool     InpPush            = false;           // Push notification on every signal / entry
input long     InpMagic           = 0;               // Magic number (0 = auto, unique per symbol)
input int      InpDeviation       = 30;              // Max slippage (points)

input group "Setups"
input bool     InpUseV1           = true;            // V1 balance: fade VAH / VAL after acceptance
input bool     InpUseV2           = true;            // V2 rotation to pPOC, target the open
input bool     InpUseV3           = true;            // V3 gap held: trend, target naked POCs
input bool     InpUseV4           = true;            // V4 re-entry accepted: through value
input bool     InpV3Chain         = true;            // V3: partial at 1st naked POC, run to the 2nd
input bool     InpV3StopAtEdge    = true;            // V3: stop at the VA edge (safest), else midway

input group "Entry"
input ETrigger InpTrigger         = TRIG_CLOSE_BACK; // Trigger
input EStop    InpStopStyle       = STOP_AUTO;       // Stop style
input double   InpStopBufferPct   = 5.0;             // Stop buffer (% of yesterday's VA width)
input double   InpMinRR           = 2.0;             // Minimum reward : risk
input int      InpMaxAttempts     = 2;               // Max attempts per level per day
input int      InpMaxTradesDay    = 2;               // Max trades per day
input int      InpMaxOpen         = 1;               // Max open positions

input group "Management"
input EPartAt  InpPartialAt       = PART_LEVEL;      // Partial at
input double   InpPartialR        = 1.0;             // R multiple for the partial (when no level)
input double   InpPartialPct      = 50.0;            // Partial size (%)
input bool     InpBreakEven       = true;            // Move stop to break-even after the partial
input int      InpBEOffsetPts     = 10;              // Break-even offset (points, covers costs)
input bool     InpTrail           = false;           // Trail behind data-TF swings after the partial
input int      InpTrailBars       = 3;               // Trail: swing of the last N bars

input group "Risk"
input double   InpRiskPct         = 0.1;             // Risk per trade (% of equity)
input double   InpCommissionPerLot= 0.0;             // Round-turn commission per 1.00 lot
input double   InpMaxLots         = 0;               // Max lots (0 = broker max)
input int      InpMaxSpreadPts    = 0;               // Block entries above this spread (points, 0 = off)

input group "Prop firm guard"
input double   InpAccountSize     = 0;               // Account size (0 = balance when first attached)
input double   InpDailyLossPct    = 5.0;             // Daily loss limit (% of start-of-day balance)
input double   InpMaxDDPct        = 10.0;            // Max drawdown (% of account size)
input double   InpDailyLossBuffer = 80.0;            // Stop at this % of each limit
input bool     InpCloseAtLimit    = true;            // Close open trades when a limit is reached

input group "Time and news"
input int      InpStartHour       = 1;               // No entries before (server hour)
input int      InpEndHour         = 21;              // No entries from (server hour)
input int      InpFridayEndHour   = 18;              // Friday: no entries from (0 = off)
input bool     InpNewsFilter      = true;            // Pause for high-impact news (MT5 calendar)
input int      InpNewsBefore      = 15;              // Minutes before
input int      InpNewsAfter       = 15;              // Minutes after
input bool     InpNewsFlat        = true;            // Close open trades before the news

input group "Engine (same as the Compass indicator)"
input ENUM_TIMEFRAMES InpDataTF   = PERIOD_M5;       // Profile data resolution
input int      InpSessions        = 8;               // Sessions of history
input int      InpRows            = 70;              // Profile rows
input double   InpVAPct           = 70.0;            // Value area %
input int      InpTPOMins         = 30;              // TPO period (minutes)
input int      InpAcceptMins      = 30;              // Acceptance time (minutes)
input int      InpIBMins          = 60;              // Initial balance (minutes)
input int      InpNakedMax        = 6;               // Max naked POCs
input double   InpZoneTol         = 12.0;            // Zone tolerance (% of prev VA width)

input group "Panel"
input bool     InpPanel           = true;            // Show the status panel

#include "Compass_Engine.mqh"
#include "Compass_Risk.mqh"
#include "Compass_Exec.mqh"
#include "Compass_Signals.mqh"
#include "Compass_Triggers.mqh"

datetime g_prepDay = 0;
datetime g_lastBar = 0;
string   g_state = "PREP";

//+------------------------------------------------------------------+
long AutoMagic()
  {
   if(InpMagic > 0)
      return InpMagic;
   long h = 0;
   for(int i = 0; i < StringLen(_Symbol); i++)
      h = (h * 31 + StringGetCharacter(_Symbol, i)) % 100000;
   return 52000000 + h;
  }

string StateName()
  {
   if(g_halt || g_dayDone)
      return "DONE";
   if(!g_d.ready)
      return g_prepDay == 0 ? "PREP" : "CLASSIFY";
   if(OpenCount() > 0)
      return "IN_TRADE";
   for(int i = 0; i < SET_N; i++)
      if(g_set[i].armed)
         return "ARMED";
   return "WAIT_ACCEPT";
  }

void Panel()
  {
   if(!InpPanel || MQLInfoInteger(MQL_OPTIMIZATION))
      return;
   string s = "5ABI Compass EA · " + (InpMode == RUN_AUTO ? "AUTO" : "SIGNAL ONLY") + " · " + StateName() + "\n";
   if(g_hn > 0)
      s += "pVAH " + Px(g_h[0].vah) + "  pPOC " + Px(g_h[0].poc) + "  pVAL " + Px(g_h[0].val) + "\n";
   if(g_d.ready)
     {
      string acc = g_d.variant == 2 ? (g_d.pocHit ? "pPOC hit" : "to pPOC") : g_d.accepted ? "accepted" :
                   g_d.gapHeld ? "gap held" : DoubleToString(g_d.accMins, 0) + "/" + IntegerToString(InpAcceptMins) + "m";
      s += "V" + IntegerToString(g_d.variant) + " · " + acc + " · bias " + BiasName(g_d) + " (" + IntegerToString(g_d.score) + ")" +
           (g_d.disc != 0 ? " · discovery" : "") + "\n";
      string arm = "";
      for(int i = 0; i < SET_N; i++)
         if(g_set[i].armed)
            arm += (arm == "" ? "" : ", ") + SetupTag(i) + " @" + Px(g_set[i].level);
      s += "Armed: " + (arm == "" ? "none" : arm) + "\n";
      s += "Trades " + DoubleToString(DayGet(g_d.d0, "trades"), 0) + "/" + IntegerToString(InpMaxTradesDay) +
           " · day loss " + DoubleToString(fmax(0, DayLossPctNow(g_d.d0)), 2) + "% / " + DoubleToString(InpDailyLossPct, 1) + "%\n";
     }
   if(g_halt)
      s += "STOPPED: " + g_haltWhy + "\n";
   else if(g_dayDone)
      s += "Done today: " + g_doneWhy + "\n";
   s += "Licence: " + (LicenseIsValid() ? "OK" : "not active");
   Comment(s);
  }

void NewDay(datetime d0)
  {
   ResetSetups();
   g_d.d0 = 0;
   g_d.ready = false;
   g_buf = (g_h[0].vah - g_h[0].val) * InpStopBufferPct / 100.0;
   g_dayDone = DayGet(d0, "done") > 0;
   g_doneWhy = g_dayDone ? "restored from earlier today" : "";
   DayStartBalance(d0);
   PrintFormat("5ABI Compass EA %s: pVAH %s pPOC %s pVAL %s pHi %s pLo %s shape %s · week POC %s · %d naked POCs · %d zones",
               _Symbol, Px(g_h[0].vah), Px(g_h[0].poc), Px(g_h[0].val), Px(g_h[0].hi), Px(g_h[0].lo), g_h[0].shape,
               g_pwk.ok ? Px(g_pwk.poc) : "-", ArraySize(g_nk), g_zn);
   LogLine("PREP", "", "", g_h[0].poc, "", EMPTY_VALUE, EMPTY_VALUE, 0, 0,
           "pVAH " + Px(g_h[0].vah) + " pVAL " + Px(g_h[0].val) + " shape " + g_h[0].shape);
  }

void EndDay(string why)
  {
   if(g_dayDone)
      return;
   g_dayDone = true;
   g_doneWhy = why;
   DaySet(g_d.d0 > 0 ? g_d.d0 : g_prepDay, "done", 1);
   for(int i = 0; i < SET_N; i++)
      Disarm(i, why);
   LogLine("DONE", "", "", EMPTY_VALUE, "", EMPTY_VALUE, EMPTY_VALUE, 0, 0, why);
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   g_magic = AutoMagic();
   g_gvp = "5ABI_EA_" + IntegerToString(g_magic) + "_";
   g_trade.SetExpertMagicNumber(g_magic);
   g_trade.SetDeviationInPoints(InpDeviation);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   if(InpRiskPct * 17 > InpMaxDDPct * 0.5)
      PrintFormat("5ABI Compass EA: warning, 17 losses in a row at %.2f%% = %.1f%%, more than half of the %.1f%% max drawdown",
                  InpRiskPct, InpRiskPct * 17, InpMaxDDPct);
   int r = LicenseOnInit();
   EventSetTimer(60);               // licence re-checks
   return r;
  }

void OnDeinit(const int reason)
  {
   LicenseOnDeinit();
   EventKillTimer();
   Comment("");
  }

void OnTimer()
  {
   LicenseOnTimer();
   Panel();
  }

void OnTick()
  {
   datetime d0 = iTime(_Symbol, PERIOD_D1, 0);
   if(d0 == 0)
      return;

   // PREP: once per day, retried until the history is synced
   if(d0 != g_prepDay)
     {
      if(!EngineBuildHistory())
        {
         g_state = "PREP";
         Panel();
         return;
        }
      g_prepDay = d0;
      EngineNaked();
      NewDay(d0);
     }

   // Hard guards on every tick
   string why = "";
   if(!g_halt && MaxDDHit(why))
     {
      g_halt = true;
      g_haltWhy = why;
      if(InpCloseAtLimit)
         CloseAll("max drawdown guard");
      for(int i = 0; i < SET_N; i++)
         Disarm(i, why);
      Alert("5ABI Compass EA stopped: " + why);
     }
   if(!g_dayDone && DailyLossHit(d0, why))
     {
      if(InpCloseAtLimit)
         CloseAll("daily loss guard");
      EndDay(why);
     }
   NewsLoad();
   if(InpNewsFilter && InpNewsFlat && NewsState(TimeCurrent()) == 2 && OpenCount() > 0)
      CloseAll("flat before news");

   // Signals on closed data bars only
   datetime b0 = iTime(_Symbol, InpDataTF, 0);
   bool newBar = b0 != 0 && b0 != g_lastBar;
   if(newBar)
     {
      g_lastBar = b0;
      EngineNaked();
      if(EngineDay(g_d))
        {
         if(!g_dayDone && !g_halt)
           {
            UpdateArming();
            RunTriggers();
           }
         if(!g_dayDone && DayGet(g_d.d0, "trades") >= InpMaxTradesDay && OpenCount() == 0 && InpTrigger != TRIG_LIMIT)
            EndDay("max trades today");
        }
     }
   if(InpTrigger == TRIG_PB_BREAK && g_d.ready && !g_dayDone && !g_halt)
     {
      datetime m1 = iTime(_Symbol, PERIOD_M1, 0);
      if(m1 != 0 && m1 != g_lastM1)
        {
         g_lastM1 = m1;
         PBCheckM1();
        }
     }

   ManagePositions(newBar);
   if(newBar)
      Panel();
  }

// Log every exit with its result
void OnTradeTransaction(const MqlTradeTransaction &trans, const MqlTradeRequest &req, const MqlTradeResult &res)
  {
   if(trans.type != TRADE_TRANSACTION_DEAL_ADD || !HistoryDealSelect(trans.deal))
      return;
   if(HistoryDealGetInteger(trans.deal, DEAL_MAGIC) != g_magic || HistoryDealGetString(trans.deal, DEAL_SYMBOL) != _Symbol)
      return;
   long entry = HistoryDealGetInteger(trans.deal, DEAL_ENTRY);
   if(entry != DEAL_ENTRY_OUT && entry != DEAL_ENTRY_OUT_BY)
      return;
   ulong id = (ulong)HistoryDealGetInteger(trans.deal, DEAL_POSITION_ID);
   double pl = HistoryDealGetDouble(trans.deal, DEAL_PROFIT) + HistoryDealGetDouble(trans.deal, DEAL_SWAP) +
               HistoryDealGetDouble(trans.deal, DEAL_COMMISSION);
   double risk = PosGet(id, "risk", 0);
   int set = (int)PosGet(id, "set", -1);
   string r = risk > 0 ? " (" + DoubleToString(pl / risk, 2) + "R)" : "";
   LogLine("CLOSE", set >= 0 ? SetupName(set) : "", "", EMPTY_VALUE, "", EMPTY_VALUE, EMPTY_VALUE, 0,
           HistoryDealGetDouble(trans.deal, DEAL_VOLUME), "P/L " + DoubleToString(pl, 2) + r);
   if(!PositionSelectByTicket(id))
      PosClear(id);
  }
//+------------------------------------------------------------------+
