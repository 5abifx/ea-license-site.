//+------------------------------------------------------------------+
//|  Compass_Signals.mqh · 5ABI FX                                    |
//|  Maps variant + bias + discovery to armed setups                 |
//|  (side, level, passive stop, target, partial).                   |
//+------------------------------------------------------------------+
#ifndef COMPASS_SIGNALS_MQH
#define COMPASS_SIGNALS_MQH

#define SET_N 10  // 0 V1L, 1 V1S, 2 V2L, 3 V2S, 4 V3L, 5 V3S, 6 V4L, 7 V4S, 8 EMA L, 9 EMA S

struct SSetup
  {
   bool              armed;
   int               side;        // +1 long, -1 short
   int               variant;
   double            level;       // entry level (V3: the VA edge, used for invalidation)
   double            passive;     // passive stop
   double            target;
   double            partial;     // EMPTY_VALUE = use R multiple
   bool              probing;     // close-back trigger: price is beyond the level
   double            probeExt;
   datetime          touchT;      // P / b break trigger: level touched on M1
   double            touchExt;
   bool              pull;        // V3: pullback in progress
   double            pullHi, pullLo;
   ulong             order;       // pending limit ticket
  };

SSetup g_set[SET_N];
SDay   g_d;

string SetupName(int i)
  {
   string n[SET_N] = {"V1 long", "V1 short", "V2 long", "V2 short", "V3 long", "V3 short", "V4 long", "V4 short", "EMA long", "EMA short"};
   return i >= 0 && i < SET_N ? n[i] : "?";
  }

string SetupTag(int i)
  {
   string n[SET_N] = {"V1L", "V1S", "V2L", "V2S", "V3L", "V3S", "V4L", "V4S", "EMAL", "EMAS"};
   return i >= 0 && i < SET_N ? n[i] : "?";
  }

void CancelPending(int i)
  {
   if(g_set[i].order > 0 && OrderSelect(g_set[i].order))
      g_trade.OrderDelete(g_set[i].order);
   g_set[i].order = 0;
  }

void ResetSetups()
  {
   for(int i = 0; i < SET_N; i++)
     {
      CancelPending(i);
      g_set[i].armed = false;
      g_set[i].probing = false;
      g_set[i].touchT = 0;
      g_set[i].pull = false;
      g_set[i].order = 0;
     }
  }

void Arm(int i, int side, int variant, double lvl, double passive, double tgt, double part)
  {
   if(!g_set[i].armed)
     {
      g_set[i].armed = true;
      g_set[i].probing = false;
      g_set[i].touchT = 0;
      g_set[i].pull = false;
      g_set[i].order = 0;
      LogLine("ARM", SetupName(i), BiasName(g_d), lvl, "", passive, tgt, 0, 0, "");
     }
   g_set[i].side    = side;
   g_set[i].variant = variant;
   g_set[i].level   = lvl;
   g_set[i].passive = passive;
   g_set[i].target  = tgt;
   g_set[i].partial = part;
  }

void Disarm(int i, string why)
  {
   if(!g_set[i].armed)
      return;
   CancelPending(i);
   g_set[i].armed = false;
   LogLine("DISARM", SetupName(i), BiasName(g_d), g_set[i].level, "", EMPTY_VALUE, EMPTY_VALUE, 0, 0, why);
  }

// V3 targets: nearest naked POC, then (chain) the next one; else last week's levels
bool TrendTargets(int dir, double px, double &tgt, double &part)
  {
   part = EMPTY_VALUE;
   tgt = NearNaked(px, dir, 0);
   if(tgt != EMPTY_VALUE)
     {
      double t2 = InpV3Chain ? NearNaked(px, dir, 1) : EMPTY_VALUE;
      if(t2 != EMPTY_VALUE)
        {
         part = tgt;
         tgt = t2;
        }
      return true;
     }
   if(!g_pwk.ok)
      return false;
   double c[3];
   c[0] = g_pwk.poc; c[1] = g_pwk.vah; c[2] = g_pwk.val;
   for(int k = 0; k < 3; k++)
      if(dir * (c[k] - px) > 0 && (tgt == EMPTY_VALUE || dir * (c[k] - tgt) < 0))
         tgt = c[k];
   return tgt != EMPTY_VALUE;
  }

// Called on every closed data bar, after EngineDay()
void UpdateArming()
  {
   double pVAH = g_h[0].vah, pVAL = g_h[0].val, pPOC = g_h[0].poc, pHi = g_h[0].hi, pLo = g_h[0].lo;
   if(InpStrategy == STRAT_EMA)
     {
      for(int k = 0; k < 8; k++)
         Disarm(k, "Compass strategy off");
      return;
     }
   double b = g_buf;
   int v = g_d.variant;
   bool disc = g_d.disc != 0;

   // V1 balance: value accepted, trade edge to edge
   if(v == 1 && g_d.accepted && !disc && InpUseV1)
     {
      Arm(0,  1, 1, pVAL, pLo - b, pVAH, pPOC);
      Arm(1, -1, 1, pVAH, pHi + b, pVAL, pPOC);
     }
   else
     {
      Disarm(0, v == 1 && disc ? "price discovery" : "not V1 / not accepted");
      Disarm(1, v == 1 && disc ? "price discovery" : "not V1 / not accepted");
     }

   // V2: rotation to pPOC, then back toward the open
   if(v == 2 && g_d.pocHit && g_d.outDir == 1 && InpUseV2)
      Arm(2, 1, 2, pPOC, pPOC - b, g_d.open, EMPTY_VALUE);
   else
      Disarm(2, "V2 long not active");
   if(v == 2 && g_d.pocHit && g_d.outDir == -1 && InpUseV2)
      Arm(3, -1, 2, pPOC, pPOC + b, g_d.open, EMPTY_VALUE);
   else
      Disarm(3, "V2 short not active");

   // V3: gap held 30 min, trend day in the gap direction
   double tgt, part;
   if(v == 3 && g_d.gapHeld && g_d.outDir == 1 && InpUseV3 && TrendTargets(1, g_d.px, tgt, part))
      Arm(4, 1, 3, pVAH, InpV3StopAtEdge ? pVAH - b : (pVAH + pHi) / 2.0 - b, tgt, part);
   else
      Disarm(4, "V3 long not active");
   if(v == 3 && g_d.gapHeld && g_d.outDir == -1 && InpUseV3 && TrendTargets(-1, g_d.px, tgt, part))
      Arm(5, -1, 3, pVAL, InpV3StopAtEdge ? pVAL + b : (pVAL + pLo) / 2.0 + b, tgt, part);
   else
      Disarm(5, "V3 short not active");

   // V4: gap failed, back in range and accepted, trade through value
   if(v == 4 && g_d.outDir == -1 && !disc && InpUseV4)
      Arm(6, 1, 4, pVAL, (pVAL + pLo) / 2.0 - b, pVAH, pPOC);
   else
      Disarm(6, v == 4 && disc ? "price discovery" : "V4 long not active");
   if(v == 4 && g_d.outDir == 1 && !disc && InpUseV4)
      Arm(7, -1, 4, pVAH, (pVAH + pHi) / 2.0 + b, pVAL, pPOC);
   else
      Disarm(7, v == 4 && disc ? "price discovery" : "V4 short not active");
  }

// Bias filter: V3 trend trades must agree with the bias. Balance trades
// (V1, V2, V4) are blocked only when the bias points the other way.
bool BiasAllows(int i)
  {
   int side = g_set[i].side;
   if(g_set[i].variant == 5)
      return !InpEmaUseBias || g_d.bias == 0 || g_d.bias == side;
   if(g_set[i].variant == 3)
      return g_d.bias == side;
   return g_d.bias == 0 || g_d.bias == side;
  }

#endif
//+------------------------------------------------------------------+
