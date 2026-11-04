//+------------------------------------------------------------------+
//|  Compass_Triggers.mqh · 5ABI FX                                   |
//|  Location first, then a trigger:                                 |
//|   - Limit at the level (test option, off by default)             |
//|   - Close back inside on the data TF (default)                   |
//|   - P / b break on M1                                            |
//|  V3 trend trades enter on a pullback break.                      |
//|  Fire() runs every guard, sizes the trade and sends it.          |
//+------------------------------------------------------------------+
#ifndef COMPASS_TRIGGERS_MQH
#define COMPASS_TRIGGERS_MQH

bool  g_dayDone = false;
string g_doneWhy = "";

// Common guards for every new entry. Returns "" when clear.
string EntryBlock(int i)
  {
   string why = "";
   if(g_halt)
      return "halted: " + g_haltWhy;
   if(g_dayDone)
      return "day done: " + g_doneWhy;
   if(!LicenseIsValid())
      return "licence not active";
   if(DayGet(g_d.d0, "att" + IntegerToString(i)) >= InpMaxAttempts)
      return "max attempts at this level";
   if(DayGet(g_d.d0, "trades") >= InpMaxTradesDay)
      return "max trades today";
   if(OpenCount() >= InpMaxOpen)
      return "max open positions";
   if(!InHours(TimeCurrent(), why))
      return why;
   if(g_set[i].variant <= 4 && InpAnchor == ANCHOR_CASH && InpTradeWindowMins > 0 && TimeCurrent() >= g_d.d0 + (long)InpTradeWindowMins * 60)
      return "after the cash-session trade window";
   if(InpNewsFilter && NewsState(TimeCurrent()) != 0)
      return "news window";
   if(!SpreadOk(why))
      return why;
   if(!BiasAllows(i))
      return "bias " + BiasName(g_d) + " disagrees";
   if(g_set[i].variant == 3 && InZone(g_d.px))
      return "inside a business zone (balance)";
   return "";
  }

void CountAttempt(int i)
  {
   string k = "att" + IntegerToString(i);
   DaySet(g_d.d0, k, DayGet(g_d.d0, k) + 1);
   DaySet(g_d.d0, "trades", DayGet(g_d.d0, "trades") + 1);
  }

// Pick the stop (passive / tight / auto) that meets MinRR. Returns false if none does.
bool PickStop(int i, double entry, double tight, double &stop, double &rr, string &style)
  {
   int side = g_set[i].side;
   double tgt = g_set[i].target;
   double stopsLvl = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   double cand[2];
   string nm[2];
   int n = 0;
   if(InpStopStyle == STOP_PASSIVE || InpStopStyle == STOP_AUTO)
     { cand[n] = g_set[i].passive; nm[n] = "passive"; n++; }
   if((InpStopStyle == STOP_TIGHT || InpStopStyle == STOP_AUTO) && tight != EMPTY_VALUE)
     { cand[n] = tight; nm[n] = "tight"; n++; }
   if(InpStopStyle == STOP_TIGHT && tight == EMPTY_VALUE)
     { cand[n] = g_set[i].passive; nm[n] = "passive"; n++; }
   rr = 0;
   for(int k = 0; k < n; k++)
     {
      double risk = side * (entry - cand[k]);
      double rew  = side * (tgt - entry);
      if(risk <= stopsLvl || rew <= stopsLvl)
         continue;
      double r = rew / risk;
      if(r > rr)
         rr = r;
      if(r >= InpMinRR)
        {
         stop = cand[k];
         rr = r;
         style = nm[k];
         return true;
        }
     }
   return false;
  }

void SaveMeta(ulong id, int i, double stop, double risk, double entry)
  {
   PosSet(id, "lvl", g_set[i].level);
   PosSet(id, "part", g_set[i].partial);
   PosSet(id, "pdone", 0);
   PosSet(id, "side", g_set[i].side);
   PosSet(id, "stop0", stop);
   PosSet(id, "set", i);
   PosSet(id, "risk", risk);
   PosSet(id, "ent", entry);
  }

// A trigger fired for setup i. tight = stop beyond the trigger structure (or EMPTY_VALUE).
void Fire(int i, double tight, string trig)
  {
   int side = g_set[i].side;
   string bias = BiasName(g_d) + " (" + IntegerToString(g_d.score) + ")";
   string block = EntryBlock(i);
   if(block != "")
     {
      LogLine("SKIP", SetupName(i), bias, g_set[i].level, trig, EMPTY_VALUE, g_set[i].target, 0, 0, block);
      return;
     }
   double entry = side == 1 ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double stop = EMPTY_VALUE, rr = 0;
   string style = "";
   if(!PickStop(i, entry, tight, stop, rr, style))
     {
      LogLine("SKIP", SetupName(i), bias, g_set[i].level, trig, EMPTY_VALUE, g_set[i].target, rr, 0,
              "RRR " + DoubleToString(rr, 2) + " < " + DoubleToString(InpMinRR, 1));
      return;
     }
   double riskMoney = 0;
   double lots = LotsFor(entry, stop, riskMoney);
   if(lots <= 0)
     {
      LogLine("SKIP", SetupName(i), bias, g_set[i].level, trig, stop, g_set[i].target, rr, 0, "lot below broker minimum at this risk");
      return;
     }
   string msg = "5ABI " + _Symbol + " " + SetupName(i) + " @" + Px(entry) + " SL " + Px(stop) + " TP " + Px(g_set[i].target);
   if(InpMode == RUN_SIGNAL)
     {
      CountAttempt(i);
      Alert(msg);
      if(InpPush)
         SendNotification(msg);
      LogLine("SIGNAL", SetupName(i), bias, g_set[i].level, trig + "/" + style, stop, g_set[i].target, rr, lots, "alert only");
      return;
     }
   double fill = 0;
   ulong id = SendEntry(side, lots, stop, g_set[i].target, EMPTY_VALUE, "5ABI " + SetupTag(i), fill);
   if(id == 0)
     {
      LogLine("SKIP", SetupName(i), bias, g_set[i].level, trig, stop, g_set[i].target, rr, lots, "order rejected " + IntegerToString(g_trade.ResultRetcode()));
      return;
     }
   CountAttempt(i);
   SaveMeta(id, i, stop, riskMoney, fill);
   if(InpPush)
      SendNotification(msg);
   LogLine("ENTRY", SetupName(i), bias, g_set[i].level, trig + "/" + style, stop, g_set[i].target, rr, lots,
           "filled " + Px(fill) + " risk " + DoubleToString(riskMoney, 2));
  }

//--- limit at the level (test option) --------------------------------------
void LimitUpdate(int i)
  {
   if(g_set[i].order > 0 && !OrderSelect(g_set[i].order))
      g_set[i].order = 0;                // filled or cancelled
   if(!g_set[i].armed || g_set[i].variant == 3)
      return;
   string block = EntryBlock(i);
   if(block != "")
     {
      if(g_set[i].order > 0)
        {
         CancelPending(i);
         LogLine("CANCEL", SetupName(i), BiasName(g_d), g_set[i].level, "limit", EMPTY_VALUE, EMPTY_VALUE, 0, 0, block);
        }
      return;
     }
   if(g_set[i].order > 0)
      return;
   int side = g_set[i].side;
   double lvl = g_set[i].level;
   double px = side == 1 ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(side * (px - lvl) <= 0)
      return;                            // price already through the level
   double stop, rr;
   string style;
   if(!PickStop(i, lvl, EMPTY_VALUE, stop, rr, style))
      return;
   double riskMoney;
   double lots = LotsFor(lvl, stop, riskMoney);
   if(lots <= 0)
      return;
   if(InpMode == RUN_SIGNAL)
      return;                            // limits only make sense when trading
   double fill;
   ulong tk = SendEntry(side, lots, stop, g_set[i].target, lvl, "5ABI " + SetupTag(i), fill);
   if(tk == 0)
      return;
   g_set[i].order = tk;
   CountAttempt(i);
   SaveMeta(tk, i, stop, riskMoney, lvl);
   LogLine("LIMIT", SetupName(i), BiasName(g_d), lvl, "limit", stop, g_set[i].target, rr, lots, "placed");
  }

//--- close back inside (data TF) -------------------------------------------
void CloseBackCheck(int i, const MqlRates &bar)
  {
   int side = g_set[i].side;
   double L = g_set[i].level;
   bool beyond = side == 1 ? bar.low < L : bar.high > L;
   if(beyond)
     {
      double ext = side == 1 ? bar.low : bar.high;
      if(!g_set[i].probing)
        {
         g_set[i].probing = true;
         g_set[i].probeExt = ext;
        }
      else
         g_set[i].probeExt = side == 1 ? fmin(g_set[i].probeExt, ext) : fmax(g_set[i].probeExt, ext);
     }
   if(g_set[i].probing && side * (bar.close - L) > 0)
     {
      g_set[i].probing = false;
      Fire(i, g_set[i].probeExt - side * g_buf, "close back inside");
     }
  }

//--- V3 pullback break (data TF) -------------------------------------------
void PullbackCheck(int i)
  {
   if(g_tn < 2)
      return;
   int side = g_set[i].side;
   MqlRates b = g_tr[g_tn - 1], p = g_tr[g_tn - 2];
   bool against = side * (b.close - p.close) < 0;
   if(against)
     {
      if(!g_set[i].pull)
        {
         g_set[i].pull = true;
         g_set[i].pullHi = b.high;
         g_set[i].pullLo = b.low;
        }
      else
        {
         // the line to break is the latest pullback bar's extreme (lower highs for longs)
         if(side == 1) { g_set[i].pullHi = b.high; g_set[i].pullLo = fmin(g_set[i].pullLo, b.low); }
         else          { g_set[i].pullLo = b.low;  g_set[i].pullHi = fmax(g_set[i].pullHi, b.high); }
        }
      return;
     }
   if(!g_set[i].pull)
      return;
   bool brk = side == 1 ? b.close > g_set[i].pullHi : b.close < g_set[i].pullLo;
   if(brk)
     {
      g_set[i].pull = false;
      double tight = side == 1 ? g_set[i].pullLo - g_buf : g_set[i].pullHi + g_buf;
      Fire(i, tight, "pullback break");
     }
  }

//--- P / b break on M1 -----------------------------------------------------
datetime g_lastM1 = 0;

void PBCheckM1()
  {
   MqlRates m[];
   int n = CopyRates(_Symbol, PERIOD_M1, 1, 60, m);   // oldest first, last = latest closed M1
   if(n < 5)
      return;
   MqlRates last = m[n - 1];
   for(int i = 0; i < SET_N; i++)
     {
      if(!g_set[i].armed || g_set[i].variant == 3 || g_set[i].variant == 5)
         continue;
      int side = g_set[i].side;
      double L = g_set[i].level;
      bool touch = side == 1 ? last.low <= L : last.high >= L;
      if(touch)
        {
         double ext = side == 1 ? last.low : last.high;
         if(g_set[i].touchT == 0)
           {
            g_set[i].touchT = last.time;
            g_set[i].touchExt = ext;
           }
         else
            g_set[i].touchExt = side == 1 ? fmin(g_set[i].touchExt, ext) : fmax(g_set[i].touchExt, ext);
        }
      if(g_set[i].touchT == 0)
         continue;
      if(!touch && (long)last.time - (long)g_set[i].touchT > (long)InpAcceptMins * 60)
        {
         g_set[i].touchT = 0;                 // stale touch
         continue;
        }
      // structure line: extreme of the M1 bars since the touch, excluding the last one
      double line = side == 1 ? -DBL_MAX : DBL_MAX;
      int cnt = 0;
      for(int k = n - 2; k >= 0 && m[k].time >= g_set[i].touchT; k--)
        {
         line = side == 1 ? fmax(line, m[k].high) : fmin(line, m[k].low);
         cnt++;
        }
      if(cnt < 3)
         continue;
      // P shape: higher lows into the break (long); b shape: lower highs (short)
      bool shape = side == 1 ? (m[n - 2].low >= m[n - 3].low) : (m[n - 2].high <= m[n - 3].high);
      bool brk = side == 1 ? (last.close > line && last.close > L) : (last.close < line && last.close < L);
      if(shape && brk)
        {
         double tight = g_set[i].touchExt - side * g_buf;
         g_set[i].touchT = 0;
         Fire(i, tight, side == 1 ? "P break M1" : "b break M1");
        }
     }
  }

// Run on each closed data bar
void RunTriggers()
  {
   if(g_tn < 1)
      return;
   MqlRates bar = g_tr[g_tn - 1];
   for(int i = 0; i < SET_N; i++)
     {
      if(!g_set[i].armed || g_set[i].variant == 5)
         continue;               // EMA setups run in EmaCheck()
      if(g_set[i].variant == 3)
        {
         PullbackCheck(i);      // trend trades always wait for a pullback break
         continue;
        }
      if(InpTrigger == TRIG_LIMIT)
         LimitUpdate(i);
      else if(InpTrigger == TRIG_CLOSE_BACK)
         CloseBackCheck(i, bar);
     }
  }

#endif
//+------------------------------------------------------------------+
