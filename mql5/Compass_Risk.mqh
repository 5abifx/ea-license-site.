//+------------------------------------------------------------------+
//|  Compass_Risk.mqh · 5ABI FX                                       |
//|  Lot size, prop firm guards (daily loss, max drawdown), news     |
//|  window, trading hours, spread. Every guard is a hard block.      |
//+------------------------------------------------------------------+
#ifndef COMPASS_RISK_MQH
#define COMPASS_RISK_MQH

string   g_gvp = "";            // global variable prefix "5ABI_EA_<magic>_"
long     g_magic = 0;
bool     g_halt = false;        // max drawdown reached: no more trading at all
double   g_buf = 0;             // stop buffer in price (InpStopBufferPct of yesterday's VA width)
string   g_haltWhy = "";

//--- persistent day state ---------------------------------------------
string DayKey(datetime d0, string k) { return g_gvp + IntegerToString((long)d0 / 86400) + "_" + k; }
double DayGet(datetime d0, string k, double def = 0) { string n = DayKey(d0, k); return GlobalVariableCheck(n) ? GlobalVariableGet(n) : def; }
void   DaySet(datetime d0, string k, double v) { GlobalVariableSet(DayKey(d0, k), v); }

double DayStartBalance(datetime d0)
  {
   string n = DayKey(d0, "bal");
   if(!GlobalVariableCheck(n))
      GlobalVariableSet(n, AccountInfoDouble(ACCOUNT_BALANCE));
   return GlobalVariableGet(n);
  }

double AccountBase()
  {
   if(InpAccountSize > 0)
      return InpAccountSize;
   string n = g_gvp + "base";
   if(!GlobalVariableCheck(n))
      GlobalVariableSet(n, AccountInfoDouble(ACCOUNT_BALANCE));
   return GlobalVariableGet(n);
  }

//--- lot size from risk -------------------------------------------------
// riskMoney / (loss per lot at the stop + commission per lot), rounded DOWN.
// Returns 0 when even the minimum lot would risk more than allowed.
double LotsFor(double entry, double stop, double &riskMoney)
  {
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   riskMoney = eq * InpRiskPct / 100.0;
   double ts = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tv <= 0)
      tv = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   if(ts <= 0 || tv <= 0)
      return 0;
   double dist = MathAbs(entry - stop) + (double)SymbolInfoInteger(_Symbol, SYMBOL_SPREAD) * _Point;
   double perLot = dist / ts * tv + InpCommissionPerLot;
   if(perLot <= 0)
      return 0;
   double lots = riskMoney / perLot;
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double vmin = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step > 0)
      lots = MathFloor(lots / step + 1e-9) * step;
   if(lots < vmin)
      return 0;                    // never round UP past the risk
   lots = fmin(lots, vmax);
   if(InpMaxLots > 0)
      lots = fmin(lots, InpMaxLots);
   riskMoney = lots * perLot;
   return NormalizeDouble(lots, 2);
  }

//--- prop firm guards ----------------------------------------------------
// Daily loss counts open P/L. Returns true when the day must stop.
bool DailyLossHit(datetime d0, string &why)
  {
   if(InpDailyLossPct <= 0)
      return false;
   double start = DayStartBalance(d0);
   double limit = start * InpDailyLossPct / 100.0;
   double loss  = start - AccountInfoDouble(ACCOUNT_EQUITY);
   if(loss >= limit * InpDailyLossBuffer / 100.0)
     {
      why = "daily loss " + DoubleToString(loss, 2) + " reached " + DoubleToString(InpDailyLossBuffer, 0) + "% of limit";
      return true;
     }
   return false;
  }

bool MaxDDHit(string &why)
  {
   if(InpMaxDDPct <= 0)
      return false;
   double base = AccountBase();
   double limit = base * InpMaxDDPct / 100.0;
   double dd = base - AccountInfoDouble(ACCOUNT_EQUITY);
   if(dd >= limit * InpDailyLossBuffer / 100.0)
     {
      why = "drawdown " + DoubleToString(dd, 2) + " near max " + DoubleToString(limit, 2);
      return true;
     }
   return false;
  }

double DayLossPctNow(datetime d0)
  {
   double start = DayStartBalance(d0);
   return start > 0 ? (start - AccountInfoDouble(ACCOUNT_EQUITY)) / start * 100.0 : 0;
  }

//--- trading hours -------------------------------------------------------
bool InHours(datetime t, string &why)
  {
   MqlDateTime s;
   TimeToStruct(t, s);
   int hm = s.hour * 60 + s.min;
   int a = InpStartHour * 60, b = InpEndHour * 60;
   bool ok = a <= b ? (hm >= a && hm < b) : (hm >= a || hm < b);
   if(!ok)
     {
      why = "outside trading hours";
      return false;
     }
   if(s.day_of_week == 5 && InpFridayEndHour > 0 && s.hour >= InpFridayEndHour)
     {
      why = "Friday cut-off";
      return false;
     }
   return true;
  }

//--- news window (MT5 economic calendar, high impact) --------------------
datetime g_newsT[];
datetime g_newsLoaded = 0;

void NewsLoad()
  {
   if(MQLInfoInteger(MQL_TESTER) || !InpNewsFilter)
      return;
   if(TimeCurrent() - g_newsLoaded < 900 && g_newsLoaded != 0)
      return;
   g_newsLoaded = TimeCurrent();
   ArrayResize(g_newsT, 0);
   string cur[2];
   cur[0] = SymbolInfoString(_Symbol, SYMBOL_CURRENCY_BASE);
   cur[1] = SymbolInfoString(_Symbol, SYMBOL_CURRENCY_PROFIT);
   for(int c = 0; c < 2; c++)
     {
      if(cur[c] == "" || (c == 1 && cur[1] == cur[0]))
         continue;
      MqlCalendarValue v[];
      if(CalendarValueHistory(v, TimeCurrent() - 86400, TimeCurrent() + 86400, NULL, cur[c]) <= 0)
         continue;
      for(int i = 0; i < ArraySize(v); i++)
        {
         MqlCalendarEvent e;
         if(!CalendarEventById(v[i].event_id, e) || e.importance != CALENDAR_IMPORTANCE_HIGH)
            continue;
         int n = ArraySize(g_newsT);
         ArrayResize(g_newsT, n + 1);
         g_newsT[n] = v[i].time;
        }
     }
  }

// 0 = clear, 1 = inside the no-entry window, 2 = right before the news (go flat)
int NewsState(datetime now)
  {
   for(int i = 0; i < ArraySize(g_newsT); i++)
     {
      long dt = (long)g_newsT[i] - (long)now;
      if(dt >= 0 && dt <= (long)InpNewsBefore * 60)
         return 2;
      if(dt < 0 && -dt <= (long)InpNewsAfter * 60)
         return 1;
     }
   return 0;
  }

bool SpreadOk(string &why)
  {
   if(InpMaxSpreadPts <= 0)
      return true;
   long sp = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   if(sp > InpMaxSpreadPts)
     {
      why = "spread " + IntegerToString(sp) + " pts";
      return false;
     }
   return true;
  }

#endif
//+------------------------------------------------------------------+
