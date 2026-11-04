//+------------------------------------------------------------------+
//|  Compass_EMA.mqh · 5ABI FX                                        |
//|  EMA pullback strategy:                                          |
//|   - Trend: higher-TF EMA fast vs slow (default H1 50 / 200),      |
//|     with the last closed higher-TF candle on the trend side.     |
//|   - Entry: a data-TF (M5) candle closes back in the trend        |
//|     direction after price pulled back to the pullback EMA (21).  |
//|   - Stop: beyond the pullback extreme + ATR buffer.              |
//|   - Target: next Compass level at >= MinRR (naked POC, pVAH,     |
//|     pVAL, pPOC, week levels) or a fixed R multiple.              |
//|   - Filter: skip when a Compass level sits within the first R.   |
//+------------------------------------------------------------------+
#ifndef COMPASS_EMA_MQH
#define COMPASS_EMA_MQH

#define SET_EMA_L 8
#define SET_EMA_S 9

int g_hFast = INVALID_HANDLE, g_hSlow = INVALID_HANDLE, g_hPull = INVALID_HANDLE, g_hAtr = INVALID_HANDLE;
int g_emaTrend = 0;

bool EmaInit()
  {
   g_hFast = iMA(_Symbol, InpEmaTrendTF, InpEmaFast, 0, MODE_EMA, PRICE_CLOSE);
   g_hSlow = iMA(_Symbol, InpEmaTrendTF, InpEmaSlow, 0, MODE_EMA, PRICE_CLOSE);
   g_hPull = iMA(_Symbol, InpDataTF, InpEmaPull, 0, MODE_EMA, PRICE_CLOSE);
   g_hAtr  = iATR(_Symbol, InpDataTF, 14);
   return g_hFast != INVALID_HANDLE && g_hSlow != INVALID_HANDLE && g_hPull != INVALID_HANDLE && g_hAtr != INVALID_HANDLE;
  }

void EmaDeinit()
  {
   if(g_hFast != INVALID_HANDLE) IndicatorRelease(g_hFast);
   if(g_hSlow != INVALID_HANDLE) IndicatorRelease(g_hSlow);
   if(g_hPull != INVALID_HANDLE) IndicatorRelease(g_hPull);
   if(g_hAtr  != INVALID_HANDLE) IndicatorRelease(g_hAtr);
  }

double Buf1(int h, int shift)
  {
   double b[];
   if(CopyBuffer(h, 0, shift, 1, b) != 1)
      return EMPTY_VALUE;
   return b[0];
  }

// +1 up, -1 down, 0 none (on the last CLOSED higher-TF candle)
int EmaTrend()
  {
   double f = Buf1(g_hFast, 1), s = Buf1(g_hSlow, 1);
   double c = iClose(_Symbol, InpEmaTrendTF, 1);
   if(f == EMPTY_VALUE || s == EMPTY_VALUE || c == 0)
      return 0;
   if(f > s && c > f)
      return 1;
   if(f < s && c < f)
      return -1;
   return 0;
  }

// All Compass levels that can act as targets or obstacles
int CompassLevels(double &lv[])
  {
   ArrayResize(lv, 0);
   int n = 0;
   for(int i = 0; i < ArraySize(g_nk); i++)
     { ArrayResize(lv, n + 1); lv[n++] = g_nk[i]; }
   if(g_hn > 0)
     {
      ArrayResize(lv, n + 3);
      lv[n++] = g_h[0].vah; lv[n++] = g_h[0].val; lv[n++] = g_h[0].poc;
     }
   if(g_pwk.ok)
     {
      ArrayResize(lv, n + 3);
      lv[n++] = g_pwk.vah; lv[n++] = g_pwk.val; lv[n++] = g_pwk.poc;
     }
   return n;
  }

// Nearest Compass level beyond entry that pays at least MinRR
double EmaLevelTarget(int side, double entry, double risk)
  {
   double lv[];
   int n = CompassLevels(lv);
   double best = EMPTY_VALUE;
   for(int k = 0; k < n; k++)
     {
      double d = side * (lv[k] - entry);
      if(d >= InpMinRR * risk && (best == EMPTY_VALUE || d < side * (best - entry)))
         best = lv[k];
     }
   return best;
  }

// A Compass level inside the first InpEmaClearR of the move = likely rejection there
bool EmaLevelInTheWay(int side, double entry, double risk, double &at)
  {
   double lv[];
   int n = CompassLevels(lv);
   for(int k = 0; k < n; k++)
     {
      double d = side * (lv[k] - entry);
      if(d > 0 && d < InpEmaClearR * risk)
        { at = lv[k]; return true; }
     }
   return false;
  }

// Run on every closed data-TF bar
void EmaCheck()
  {
   if(InpStrategy == STRAT_COMPASS)
     {
      Disarm(SET_EMA_L, "EMA strategy off");
      Disarm(SET_EMA_S, "EMA strategy off");
      return;
     }
   g_emaTrend = EmaTrend();
   int look = IMax(2, InpEmaLookback);
   MqlRates r[];
   double e[];
   int n = CopyRates(_Symbol, InpDataTF, 1, look + 1, r);        // oldest first, last = latest closed
   if(n < look + 1 || CopyBuffer(g_hPull, 0, 1, n, e) != n)
      return;
   double atr = Buf1(g_hAtr, 1);
   if(atr == EMPTY_VALUE || atr <= 0)
      return;

   for(int sd = 0; sd < 2; sd++)
     {
      int side = sd == 0 ? 1 : -1;
      int i = sd == 0 ? SET_EMA_L : SET_EMA_S;
      if(g_emaTrend != side)
        {
         Disarm(i, "no EMA trend");
         continue;
        }
      Arm(i, side, 5, EMPTY_VALUE, EMPTY_VALUE, EMPTY_VALUE, EMPTY_VALUE);

      MqlRates last = r[n - 1];
      // trigger candle: closes back on the trend side of the pullback EMA, in the trend direction
      bool closeOk = side == 1 ? (last.close > e[n - 1] && last.close > last.open)
                               : (last.close < e[n - 1] && last.close < last.open);
      // the pullback: this candle or the one before reached the EMA
      bool touchNow  = side == 1 ? last.low <= e[n - 1] : last.high >= e[n - 1];
      bool touchPrev = side == 1 ? r[n - 2].low <= e[n - 2] : r[n - 2].high >= e[n - 2];
      if(!closeOk || !(touchNow || touchPrev))
         continue;
      // pullback extreme over the lookback, while price was at / beyond the EMA
      double ext = side == 1 ? last.low : last.high;
      for(int k = n - 1; k >= n - look && k >= 0; k--)
         ext = side == 1 ? fmin(ext, r[k].low) : fmax(ext, r[k].high);

      double entry = side == 1 ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double stop = ext - side * InpEmaStopAtr * atr;
      double risk = side * (entry - stop);
      if(risk < InpEmaMinStopAtr * atr)
        {
         stop = entry - side * InpEmaMinStopAtr * atr;
         risk = InpEmaMinStopAtr * atr;
        }
      if(risk <= 0)
         continue;

      double tgt = EMPTY_VALUE;
      if(InpEmaTarget == EMA_TGT_LEVEL)
         tgt = EmaLevelTarget(side, entry, risk);
      if(tgt == EMPTY_VALUE)
         tgt = entry + side * InpEmaRR * risk;

      double at;
      if(InpEmaLevelFilter && EmaLevelInTheWay(side, entry, risk, at))
        {
         LogLine("SKIP", SetupName(i), "EMA " + (side == 1 ? "up" : "down"), EMPTY_VALUE, "EMA pullback",
                 stop, tgt, 0, 0, "Compass level in the way at " + Px(at));
         continue;
        }
      g_set[i].passive = stop;
      g_set[i].target  = tgt;
      g_set[i].partial = EMPTY_VALUE;
      Fire(i, stop, "EMA pullback");
     }
  }

#endif
//+------------------------------------------------------------------+
