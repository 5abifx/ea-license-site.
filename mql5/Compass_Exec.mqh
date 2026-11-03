//+------------------------------------------------------------------+
//|  Compass_Exec.mqh · 5ABI FX                                       |
//|  Orders, partials, break-even, trail, invalidation exits, and    |
//|  the CSV decision log. The stop never moves against the trade.   |
//+------------------------------------------------------------------+
#ifndef COMPASS_EXEC_MQH
#define COMPASS_EXEC_MQH

#include <Trade\Trade.mqh>

CTrade g_trade;

//--- CSV log: one line per decision -------------------------------------
void LogLine(string event, string setup, string bias, double level, string trig,
             double stop, double target, double rr, double lots, string result)
  {
   string fn = "5ABI_CompassEA\\" + _Symbol + "_log.csv";
   int h = FileOpen(fn, FILE_READ | FILE_WRITE | FILE_CSV | FILE_ANSI | FILE_SHARE_READ, ',');
   if(h == INVALID_HANDLE)
      return;
   if(FileSize(h) == 0)
      FileWrite(h, "time", "event", "setup", "bias", "level", "trigger", "stop", "target", "rrr", "lots", "result / reason");
   FileSeek(h, 0, SEEK_END);
   FileWrite(h, TimeToString(TimeCurrent(), TIME_DATE | TIME_SECONDS), event, setup, bias,
             level == EMPTY_VALUE ? "" : Px(level), trig,
             stop == EMPTY_VALUE ? "" : Px(stop), target == EMPTY_VALUE ? "" : Px(target),
             rr > 0 ? DoubleToString(rr, 2) : "", lots > 0 ? DoubleToString(lots, 2) : "", result);
   FileClose(h);
  }

//--- per-position memory (survives restarts) ----------------------------
string PosKey(ulong id, string k) { return g_gvp + "p" + IntegerToString((long)id) + "_" + k; }
void   PosSet(ulong id, string k, double v) { GlobalVariableSet(PosKey(id, k), v); }
double PosGet(ulong id, string k, double def = EMPTY_VALUE) { string n = PosKey(id, k); return GlobalVariableCheck(n) ? GlobalVariableGet(n) : def; }
void   PosClear(ulong id)
  {
   string ks[] = {"lvl", "part", "pdone", "side", "stop0", "set", "risk", "ent"};
   for(int i = 0; i < ArraySize(ks); i++)
      GlobalVariableDel(PosKey(id, ks[i]));
  }

double RoundPx(double p)
  {
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(ts <= 0)
      return NormalizeDouble(p, _Digits);
   return NormalizeDouble(MathRound(p / ts) * ts, _Digits);
  }

int OpenCount()
  {
   int n = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t > 0 && PositionGetString(POSITION_SYMBOL) == _Symbol && PositionGetInteger(POSITION_MAGIC) == g_magic)
         n++;
     }
   return n;
  }

void CloseAll(string why)
  {
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != g_magic)
         continue;
      if(g_trade.PositionClose(t))
         LogLine("EXIT", "", "", EMPTY_VALUE, "", EMPTY_VALUE, EMPTY_VALUE, 0, 0, why);
     }
   for(int i = OrdersTotal() - 1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t > 0 && OrderGetString(ORDER_SYMBOL) == _Symbol && OrderGetInteger(ORDER_MAGIC) == g_magic)
         g_trade.OrderDelete(t);
     }
  }

// Send a market order (or a limit when limitPx != EMPTY_VALUE). Returns the position id / order ticket.
ulong SendEntry(int side, double lots, double sl, double tp, double limitPx, string cmt, double &fill)
  {
   sl = RoundPx(sl);
   tp = RoundPx(tp);
   bool ok;
   double req = side == 1 ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(limitPx != EMPTY_VALUE)
     {
      limitPx = RoundPx(limitPx);
      req = limitPx;
      ok = side == 1 ? g_trade.BuyLimit(lots, limitPx, _Symbol, sl, tp, ORDER_TIME_GTC, 0, cmt)
                     : g_trade.SellLimit(lots, limitPx, _Symbol, sl, tp, ORDER_TIME_GTC, 0, cmt);
     }
   else
      ok = side == 1 ? g_trade.Buy(lots, _Symbol, 0, sl, tp, cmt) : g_trade.Sell(lots, _Symbol, 0, sl, tp, cmt);
   uint rc = g_trade.ResultRetcode();
   if(!ok || (rc != TRADE_RETCODE_DONE && rc != TRADE_RETCODE_PLACED && rc != TRADE_RETCODE_DONE_PARTIAL))
     {
      Print("5ABI Compass EA: order failed ", rc, " ", g_trade.ResultRetcodeDescription());
      return 0;
     }
   fill = g_trade.ResultPrice() > 0 ? g_trade.ResultPrice() : req;
   if(limitPx == EMPTY_VALUE)
      Print("5ABI Compass EA: requested ", Px(req), " filled ", Px(fill), " slippage ", DoubleToString(MathAbs(fill - req) / _Point, 0), " pts");
   return g_trade.ResultOrder();     // the opening order ticket = POSITION_IDENTIFIER
  }

//--- management on ticks --------------------------------------------------
void ManagePositions(bool newBar)
  {
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double stopsLvl = (double)SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL) * _Point;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0 || PositionGetString(POSITION_SYMBOL) != _Symbol || PositionGetInteger(POSITION_MAGIC) != g_magic)
         continue;
      ulong id   = (ulong)PositionGetInteger(POSITION_IDENTIFIER);
      int side   = PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY ? 1 : -1;
      double op  = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl  = PositionGetDouble(POSITION_SL);
      double tp  = PositionGetDouble(POSITION_TP);
      double vol = PositionGetDouble(POSITION_VOLUME);
      double px  = side == 1 ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double stop0 = PosGet(id, "stop0", sl);
      double R = MathAbs(op - stop0);

      // Partial at pPOC / first target (or 1R), then go risk-free
      if(PosGet(id, "pdone", 0) == 0 && R > 0)
        {
         double part = PosGet(id, "part");
         if(part == EMPTY_VALUE || InpPartialAt == PART_1R)
            part = op + side * R * InpPartialR;
         if(side * (px - part) >= 0)
           {
            double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
            double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
            double cv = MathFloor(vol * InpPartialPct / 100.0 / step + 1e-9) * step;
            if(InpPartialPct > 0 && cv >= vmin && vol - cv >= vmin)
              {
               if(g_trade.PositionClosePartial(t, NormalizeDouble(cv, 2)))
                  LogLine("PARTIAL", "", "", part, "", EMPTY_VALUE, EMPTY_VALUE, 0, cv, "closed " + DoubleToString(InpPartialPct, 0) + "%");
              }
            PosSet(id, "pdone", 1);
            if(InpBreakEven)
              {
               double be = RoundPx(op + side * InpBEOffsetPts * _Point);
               bool better = sl == 0 || side * (be - sl) > 0;
               bool legal  = side * (px - be) > stopsLvl;
               if(better && legal && PositionSelectByTicket(t))
                  g_trade.PositionModify(t, be, tp);
              }
           }
        }

      // Optional trail behind M5 swings, only after the partial
      if(newBar && InpTrail && PosGet(id, "pdone", 0) == 1 && g_tn >= 3)
        {
         double sw = side == 1 ? DBL_MAX : -DBL_MAX;
         for(int k = g_tn - 1; k >= g_tn - InpTrailBars && k >= 0; k--)
            sw = side == 1 ? fmin(sw, g_tr[k].low) : fmax(sw, g_tr[k].high);
         double nsl = RoundPx(sw - side * g_buf);
         if(PositionSelectByTicket(t))
           {
            sl = PositionGetDouble(POSITION_SL);
            if((sl == 0 || side * (nsl - sl) > ts / 2) && side * (px - nsl) > stopsLvl)
               g_trade.PositionModify(t, nsl, tp);
           }
        }

      // Invalidation: closes held 30 min beyond the trade's level on the losing side
      double lvl = PosGet(id, "lvl");
      if(newBar && lvl != EMPTY_VALUE && g_tn > 0)
        {
         double m = RunMins(side == 1 ? -1 : 1, lvl, g_tn - 1, (datetime)(g_tr[g_tn - 1].time + PeriodSeconds(InpDataTF)));
         datetime opened = (datetime)PositionGetInteger(POSITION_TIME);
         if(m >= InpAcceptMins && g_tr[g_tn - 1].time >= opened)
           {
            if(g_trade.PositionClose(t))
               LogLine("EXIT", "", "", lvl, "", EMPTY_VALUE, EMPTY_VALUE, 0, vol, "invalidated: accepted beyond " + Px(lvl));
           }
        }
     }
  }

#endif
//+------------------------------------------------------------------+
