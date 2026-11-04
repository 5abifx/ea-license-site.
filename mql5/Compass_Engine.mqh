//+------------------------------------------------------------------+
//|  Compass_Engine.mqh · 5ABI FX                                     |
//|  The Auction Compass context engine without any drawing:         |
//|  session profiles, value area, TPO, shapes, naked POCs, poor     |
//|  extremes, IB, business zones, opening variant, acceptance, bias.|
//|  Numbers are computed exactly as in 5ABI_Auction_Compass.mq5.    |
//|                                                                  |
//|  Needs these inputs declared before it is included:              |
//|  InpDataTF, InpSessions, InpRows, InpVAPct, InpTPOMins,          |
//|  InpAcceptMins, InpIBMins, InpNakedMax, InpZoneTol,              |
//|  InpAnchor, InpCashOpen, InpProfileRTH, InpRTHMins               |
//+------------------------------------------------------------------+
#ifndef COMPASS_ENGINE_MQH
#define COMPASS_ENGINE_MQH

//+------------------------------------------------------------------+
//| Profile container                                                |
//+------------------------------------------------------------------+
class CProf
  {
public:
   datetime          t0, tEnd;
   double            lo, hi, step, open0, close0, mx;
   double            vol[];
   int               tpo[];
   int               n, pocI, upI, dnI;
   double            poc, vah, val;
   int               tPocI, tailHi, tailLo;
   string            shape;
   bool              poorHi, poorLo, ok;
                     CProf(void) { ok = false; n = 0; shape = ""; }
  };

struct SZone
  {
   double            lo, hi;
  };

// What today looks like, measured on CLOSED data bars only
struct SDay
  {
   datetime          d0;          // session start (D1 bar open)
   bool              ready;       // context is complete (history synced, 1+ closed bar)
   int               variant;     // 1..4
   int               outDir;      // +1 open above value, -1 below, 0 inside
   double            open;        // first data bar open
   bool              accepted;    // 30-min acceptance reached (sticky for the day)
   double            accMins;     // current acceptance run (minutes)
   bool              gapHeld;     // V3 held outside for 30 min
   bool              pocHit;      // V2: price touched pPOC
   int               disc;        // price discovery: +1 accepted above pVAH, -1 below pVAL (sticky)
   int               bias;        // +1 LONG, -1 SHORT, 0 BALANCE / NEUTRAL
   bool              balance;     // bias 0 because price is inside yesterday's value
   int               score;
   string            why;
   double            ibHi, ibLo;  // initial balance
   bool              ibDone;
   double            px;          // last closed bar close
   datetime          tNow;        // last closed bar end time
  };

CProf    g_h[];          // finished sessions, [0] = yesterday
int      g_hn = 0;
CProf    g_pwk;          // last week
MqlRates g_tr[];         // today's CLOSED data bars
int      g_tn = 0;
double   g_nk[];         // naked POC prices, most recent session first
SZone    g_zones[];
int      g_zn = 0;

int  IMax(int a, int b) { return a > b ? a : b; }
int  IMin(int a, int b) { return a < b ? a : b; }
string Px(double p)     { return DoubleToString(p, _Digits); }

//+------------------------------------------------------------------+
//| Session anchor: broker midnight (as the indicator) or the cash   |
//| open (COMEX 08:20 New York = 15:20 on GMT+2/+3 servers).          |
//+------------------------------------------------------------------+
int CashOffsetSec()
  {
   string p[];
   if(StringSplit(InpCashOpen, ':', p) < 2)
      return 0;
   return (int)StringToInteger(p[0]) * 3600 + (int)StringToInteger(p[1]) * 60;
  }

// Session start times, most recent first: s[0] = the session we are in now
int SessionStarts(datetime &s[], int n)
  {
   ArrayResize(s, 0);
   datetime now = TimeCurrent();
   int off = InpAnchor == ANCHOR_CASH ? CashOffsetSec() : 0;
   for(int i = 0; i < n + 20 && ArraySize(s) < n; i++)
     {
      datetime d = iTime(_Symbol, PERIOD_D1, i);
      if(d == 0)
         break;
      datetime a = (datetime)(d + off);
      if(a > now)
         continue;
      int m = ArraySize(s);
      ArrayResize(s, m + 1);
      s[m] = a;
     }
   return ArraySize(s);
  }

// End of finished session k (k >= 1)
datetime SessionEnd(int k, const datetime &s[])
  {
   if(InpAnchor == ANCHOR_CASH && InpProfileRTH)
      return (datetime)MathMin((double)s[k - 1], (double)(s[k] + (long)InpRTHMins * 60));
   return s[k - 1];
  }

datetime CurrentSessionStart()
  {
   datetime s[];
   return SessionStarts(s, 1) > 0 ? s[0] : 0;
  }

//+------------------------------------------------------------------+
//| Profile build                                                    |
//+------------------------------------------------------------------+
int RowOf(CProf &p, double px)
  {
   int k = (int)MathFloor((px - p.lo) / p.step);
   return IMax(0, IMin(p.n - 1, k));
  }

bool BuildFrom(CProf &p, const MqlRates &r[], int c, datetime t0)
  {
   p.ok = false;
   if(c <= 0)
      return false;
   p.t0 = t0;
   p.lo = r[0].low;
   p.hi = r[0].high;
   for(int i = 1; i < c; i++)
     {
      p.lo = fmin(p.lo, r[i].low);
      p.hi = fmax(p.hi, r[i].high);
     }
   if(p.hi - p.lo < _Point)
      p.hi = p.lo + _Point;
   p.n    = IMax(10, InpRows);
   p.step = (p.hi - p.lo) / p.n;
   ArrayResize(p.vol, p.n);
   ArrayInitialize(p.vol, 0.0);
   ArrayResize(p.tpo, p.n);
   ArrayInitialize(p.tpo, 0);
   int last[];
   ArrayResize(last, p.n);
   ArrayInitialize(last, -1);
   long per = (long)IMax(1, InpTPOMins) * 60;

   for(int i = 0; i < c; i++)
     {
      double v = (double)(r[i].real_volume > 0 ? r[i].real_volume : r[i].tick_volume);
      if(v <= 0)
         v = 1.0;
      int a = RowOf(p, r[i].low), b = RowOf(p, r[i].high);
      double sh = v / (b - a + 1);
      int pIdx = (int)(((long)r[i].time - (long)t0) / per);
      for(int k = a; k <= b; k++)
        {
         p.vol[k] += sh;
         if(last[k] != pIdx)
           {
            p.tpo[k]++;
            last[k] = pIdx;
           }
        }
     }
   p.open0  = r[0].open;
   p.close0 = r[c - 1].close;
   p.tEnd   = (datetime)(r[c - 1].time + PeriodSeconds(InpDataTF));

   // POC (ties go to the row nearest the middle)
   p.pocI = 0;
   p.mx = 0;
   double total = 0;
   double mid = (p.n - 1) / 2.0;
   for(int k = 0; k < p.n; k++)
     {
      total += p.vol[k];
      if(p.vol[k] > p.mx || (p.vol[k] == p.mx && MathAbs(k - mid) < MathAbs(p.pocI - mid)))
        {
         p.mx = p.vol[k];
         p.pocI = k;
        }
     }
   if(p.mx <= 0)
      p.mx = 1;

   // Value area: expand from the POC toward the larger neighbour
   double target = total * InpVAPct / 100.0, acc = p.vol[p.pocI];
   int up = p.pocI, dn = p.pocI;
   while(acc < target && (up < p.n - 1 || dn > 0))
     {
      double vu = up < p.n - 1 ? p.vol[up + 1] : -1.0;
      double vd = dn > 0 ? p.vol[dn - 1] : -1.0;
      if(vu >= vd)
        {
         up++;
         acc += p.vol[up];
        }
      else
        {
         dn--;
         acc += p.vol[dn];
        }
     }
   p.upI = up;
   p.dnI = dn;
   p.poc = p.lo + (p.pocI + 0.5) * p.step;
   p.vah = p.lo + (up + 1) * p.step;
   p.val = p.lo + dn * p.step;

   // Shape
   int fb = -1, ft = -1;
   for(int k = 0; k < p.n; k++)
      if(p.tpo[k] >= 2)
        { fb = k; break; }
   for(int k = p.n - 1; k >= 0; k--)
      if(p.tpo[k] >= 2)
        { ft = k; break; }
   int sing = 0, span = 0;
   if(fb >= 0)
      for(int k = fb; k <= ft; k++)
        {
         span++;
         if(p.tpo[k] <= 1)
            sing++;
        }
   double pos = (p.pocI + 0.5) / p.n;
   p.shape  = (span > 0 && (double)sing / span >= 0.20) ? "T" : pos >= 0.62 ? "P" : pos <= 0.38 ? "b" : "D";
   p.poorHi = p.tpo[p.n - 1] >= 2;
   p.poorLo = p.tpo[0] >= 2;

   // TPO POC (ties go to the row nearest the middle)
   p.tPocI = p.pocI;
   int tmx = -1;
   for(int k = 0; k < p.n; k++)
      if(p.tpo[k] > tmx || (p.tpo[k] == tmx && MathAbs(k - mid) < MathAbs(p.tPocI - mid)))
        {
         tmx = p.tpo[k];
         p.tPocI = k;
        }
   // Tails: single-print rows running out to the extreme
   p.tailHi = 0;
   for(int k = p.n - 1; k >= 0 && p.tpo[k] == 1; k--)
      p.tailHi++;
   p.tailLo = 0;
   for(int k = 0; k < p.n && p.tpo[k] == 1; k++)
      p.tailLo++;
   if(p.tailHi >= p.n || p.tailLo >= p.n)
      p.tailHi = p.tailLo = 0;
   p.ok = true;
   return true;
  }

bool Build(CProf &p, datetime t0, datetime t1)
  {
   MqlRates r[];
   int c = CopyRates(_Symbol, InpDataTF, t0, (datetime)(t1 - 1), r);
   if(c <= 0)
     {
      p.ok = false;
      return false;
     }
   return BuildFrom(p, r, c, t0);
  }

// Highest / lowest traded since a time
void RangeSince(datetime from, double &hs, double &ls)
  {
   hs = -DBL_MAX;
   ls = DBL_MAX;
   double h[], l[];
   int c1 = CopyHigh(_Symbol, InpDataTF, from, TimeCurrent(), h);
   int c2 = CopyLow(_Symbol, InpDataTF, from, TimeCurrent(), l);
   for(int i = 0; i < c1; i++)
      hs = fmax(hs, h[i]);
   for(int i = 0; i < c2; i++)
      ls = fmin(ls, l[i]);
  }

//+------------------------------------------------------------------+
//| History: sessions 1..N, last week, zones (PREP)                  |
//+------------------------------------------------------------------+
void EngineZones()
  {
   g_zn = 0;
   ArrayResize(g_zones, 0);
   if(g_hn < 2)
      return;
   double tol = InpZoneTol / 100.0 * (g_h[0].vah - g_h[0].val);
   if(tol <= 0)
      return;
   double lp[];
   int ls[];
   ArrayResize(lp, g_hn * 3);
   ArrayResize(ls, g_hn * 3);
   int m = 0;
   for(int i = 0; i < g_hn; i++)
     {
      if(!g_h[i].ok)
         continue;
      lp[m] = g_h[i].vah; ls[m] = i; m++;
      lp[m] = g_h[i].poc; ls[m] = i; m++;
      lp[m] = g_h[i].val; ls[m] = i; m++;
     }
   for(int i = 1; i < m; i++)          // insertion sort by price
     {
      double x = lp[i];
      int xs = ls[i], j = i - 1;
      while(j >= 0 && lp[j] > x)
        {
         lp[j + 1] = lp[j];
         ls[j + 1] = ls[j];
         j--;
        }
      lp[j + 1] = x;
      ls[j + 1] = xs;
     }
   int a = 0;
   while(a < m)
     {
      int b = a;
      while(b + 1 < m && lp[b + 1] - lp[b] <= tol)
         b++;
      bool multi = false;
      for(int k = a; k <= b; k++)
         if(ls[k] != ls[a])
            multi = true;
      if(multi)
        {
         ArrayResize(g_zones, g_zn + 1);
         g_zones[g_zn].lo = lp[a] - tol * 0.25;
         g_zones[g_zn].hi = lp[b] + tol * 0.25;
         g_zn++;
        }
      a = b + 1;
     }
  }

// Returns false while history is still syncing (never trade on a half-built context)
bool EngineBuildHistory()
  {
   int N = IMax(2, InpSessions);
   ArrayResize(g_h, N);
   g_hn = 0;
   datetime ss[];
   int ns = SessionStarts(ss, N + 1);
   for(int k = 1; k <= N && k < ns; k++)
     {
      if(!Build(g_h[g_hn], ss[k], SessionEnd(k, ss)))
         break;
      g_hn++;
     }
   datetime w1 = iTime(_Symbol, PERIOD_W1, 1), w0 = iTime(_Symbol, PERIOD_W1, 0);
   g_pwk.ok = false;
   if(w1 > 0 && w0 > 0)
      Build(g_pwk, w1, w0);
   EngineZones();
   return g_hn >= IMin(2, N);
  }

// Naked POCs: refresh on every closed bar (they disappear once traded)
void EngineNaked()
  {
   ArrayResize(g_nk, 0);
   for(int i = 0; i < g_hn; i++)
     {
      if(!g_h[i].ok)
         continue;
      double hs, ls;
      RangeSince(g_h[i].tEnd, hs, ls);
      if(ArraySize(g_nk) < InpNakedMax && !(ls <= g_h[i].poc && hs >= g_h[i].poc))
        {
         int sz = ArraySize(g_nk);
         ArrayResize(g_nk, sz + 1);
         g_nk[sz] = g_h[i].poc;
        }
     }
  }

// Nearest naked POC beyond px in direction dir (skip = how many to skip, 0 = nearest)
double NearNaked(double px, int dir, int skip = 0)
  {
   double used[];
   double best = EMPTY_VALUE;
   for(int s = 0; s <= skip; s++)
     {
      best = EMPTY_VALUE;
      for(int i = 0; i < ArraySize(g_nk); i++)
        {
         double q = g_nk[i];
         bool taken = false;
         for(int u = 0; u < ArraySize(used); u++)
            if(used[u] == q)
               taken = true;
         if(taken)
            continue;
         if(dir == 1 && q > px && (best == EMPTY_VALUE || q < best))
            best = q;
         if(dir == -1 && q < px && (best == EMPTY_VALUE || q > best))
            best = q;
        }
      if(best == EMPTY_VALUE)
         return EMPTY_VALUE;
      int n = ArraySize(used);
      ArrayResize(used, n + 1);
      used[n] = best;
     }
   return best;
  }

bool InZone(double px)
  {
   for(int i = 0; i < g_zn; i++)
      if(px >= g_zones[i].lo && px <= g_zones[i].hi)
         return true;
   return false;
  }

//+------------------------------------------------------------------+
//| Today: variant, acceptance, bias                                 |
//+------------------------------------------------------------------+
// Minutes closes have held on one side of lvl, counted back from bar `last`
double RunMins(int mode, double lvl, int last, datetime tNow)
  {
   datetime st = 0;
   for(int i = last; i >= 0; i--)
     {
      double c = g_tr[i].close;
      bool ok = mode == 1 ? c > lvl : c < lvl;
      if(!ok)
         break;
      st = g_tr[i].time;
     }
   return st == 0 ? 0.0 : (double)((long)tNow - (long)st) / 60.0;
  }

int EngineBias(int last, datetime tNow, double px, string &why, int &score, bool &inside)
  {
   double pVAH = g_h[0].vah, pVAL = g_h[0].val, pPOC = g_h[0].poc;
   score = 0;
   why = "";
   inside = px <= pVAH && px >= pVAL;
   if(px > pVAH)
     {
      double m = RunMins(1, pVAH, last, tNow);
      score += m >= InpAcceptMins ? 2 : 1;
      why += "above pVAH" + (m >= InpAcceptMins ? " accepted" : "") + "; ";
     }
   else if(px < pVAL)
     {
      double m = RunMins(-1, pVAL, last, tNow);
      score -= m >= InpAcceptMins ? 2 : 1;
      why += "below pVAL" + (m >= InpAcceptMins ? " accepted" : "") + "; ";
     }
   else
      why += "inside value; ";
   if(g_pwk.ok)
     {
      if(px > g_pwk.vah)
        { score += 1; why += "above week value; "; }
      else if(px < g_pwk.val)
        { score -= 1; why += "below week value; "; }
     }
   if(g_hn > 1)
     {
      if(pPOC > g_h[1].poc)
        { score += 1; why += "value migrating up"; }
      else if(pPOC < g_h[1].poc)
        { score -= 1; why += "value migrating down"; }
     }
   return inside ? 0 : score >= 2 ? 1 : score <= -2 ? -1 : 0;
  }

// Loads today's closed bars and fills d. Call on every new closed data bar.
bool EngineDay(SDay &d)
  {
   d.ready = false;
   datetime d0 = CurrentSessionStart();
   if(d0 == 0 || g_hn < 1)
      return false;
   if(d.d0 != d0)
     {
      d.d0 = d0;
      d.accepted = false;
      d.disc = 0;
      d.variant = 0;
     }
   MqlRates r[];
   int c = CopyRates(_Symbol, InpDataTF, d0, TimeCurrent(), r);
   if(c <= 0)
      return false;
   datetime cur = iTime(_Symbol, InpDataTF, 0);
   if(r[c - 1].time >= cur)        // drop the forming bar
      c--;
   if(c <= 0)
      return false;
   ArrayResize(g_tr, c);
   for(int i = 0; i < c; i++)
      g_tr[i] = r[i];
   g_tn = c;

   long ps = PeriodSeconds(InpDataTF);
   double pVAH = g_h[0].vah, pVAL = g_h[0].val, pPOC = g_h[0].poc, pHi = g_h[0].hi, pLo = g_h[0].lo;
   d.tNow = (datetime)(g_tr[c - 1].time + ps);
   d.px   = g_tr[c - 1].close;
   d.open = g_tr[0].open;
   double o = d.open;
   int v = (o >= pVAL && o <= pVAH) ? 1 : (o >= pLo && o <= pHi) ? 2 : 3;
   d.outDir = o > pVAH ? 1 : o < pVAL ? -1 : 0;

   // Acceptance: consecutive closes inside [pVAL,pVAH] (V1) or [pLo,pHi] (V3)
   bool acc = false;
   int accIdx = -1;
   d.accMins = 0;
   if(v == 1 || v == 3)
     {
      double zLo = v == 1 ? pVAL : pLo, zHi = v == 1 ? pVAH : pHi;
      datetime st = 0;
      for(int i = 0; i < c; i++)
        {
         double cl = g_tr[i].close;
         if(cl >= zLo && cl <= zHi)
           {
            if(st == 0)
               st = g_tr[i].time;
            d.accMins = (double)((long)g_tr[i].time + ps - (long)st) / 60.0;
            if(d.accMins >= InpAcceptMins && !acc)
              {
               acc = true;
               accIdx = i;
              }
           }
         else
           {
            st = 0;
            d.accMins = 0;
           }
        }
     }
   d.accepted = acc;
   if(v == 3 && acc)
      v = 4;
   d.variant = v;
   double elapsed = (double)((long)d.tNow - (long)g_tr[0].time) / 60.0;
   d.gapHeld = v == 3 && elapsed >= InpAcceptMins;
   d.pocHit = false;
   for(int i = 0; i < c; i++)
      if(g_tr[i].high >= pPOC && g_tr[i].low <= pPOC)
        { d.pocHit = true; break; }

   // Price discovery (V1 / V4 only): after value was accepted, 30 min of closes
   // beyond a VA edge. Scans the whole day (first one wins), so a restart
   // mid-day gives the same answer.
   d.disc = 0;
   datetime sUp = 0, sDn = 0;
   for(int i = accIdx + 1; accIdx >= 0 && i < c && d.disc == 0; i++)
     {
      double cl = g_tr[i].close;
      datetime te = (datetime)(g_tr[i].time + ps);
      if(cl > pVAH)
        { if(sUp == 0) sUp = g_tr[i].time; }
      else
         sUp = 0;
      if(cl < pVAL)
        { if(sDn == 0) sDn = g_tr[i].time; }
      else
         sDn = 0;
      if(sUp != 0 && (double)((long)te - (long)sUp) / 60.0 >= InpAcceptMins)
         d.disc = 1;
      else if(sDn != 0 && (double)((long)te - (long)sDn) / 60.0 >= InpAcceptMins)
         d.disc = -1;
     }

   // Initial balance
   datetime ibEnd = (datetime)(d0 + (long)InpIBMins * 60);
   d.ibHi = -DBL_MAX;
   d.ibLo = DBL_MAX;
   for(int i = 0; i < c && g_tr[i].time < ibEnd; i++)
     {
      d.ibHi = fmax(d.ibHi, g_tr[i].high);
      d.ibLo = fmin(d.ibLo, g_tr[i].low);
     }
   d.ibDone = d.tNow >= ibEnd;

   d.bias = EngineBias(c - 1, d.tNow, d.px, d.why, d.score, d.balance);
   d.ready = true;
   return true;
  }

string BiasName(const SDay &d)
  {
   return d.bias == 1 ? "LONG" : d.bias == -1 ? "SHORT" : d.balance ? "BALANCE" : "NEUTRAL";
  }

#endif
//+------------------------------------------------------------------+
