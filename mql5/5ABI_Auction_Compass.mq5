//+------------------------------------------------------------------+
//|  5ABI FX · Auction Compass (MetaTrader 5)                         |
//|  Sierra-style session profiles, naked POCs, poor highs/lows,     |
//|  business zones, docked weekly profile, auto bias + alerts.      |
//|  Private build: distribute the compiled .ex5 only.               |
//|  Licence: unlocks while the Trade Journal EA runs in the same    |
//|  MT5 (indicators cannot reach the website themselves).          |
//+------------------------------------------------------------------+
#property copyright   "5ABI FX"
#property version     "1.12"
#property description "5ABI FX · Auction Compass"
#property indicator_chart_window
#property indicator_buffers 0
#property indicator_plots   0

enum EStripPos
  {
   STRIP_TOP_CENTER    = 0, // Top center
   STRIP_TOP_LEFT      = 1, // Top left
   STRIP_BOTTOM_LEFT   = 2, // Bottom left
   STRIP_BOTTOM_CENTER = 3  // Bottom center
  };

input group "Profiles"
input ENUM_TIMEFRAMES InpDataTF    = PERIOD_M5;  // Profile data resolution (same on every chart TF)
input int     InpSessions          = 8;          // Sessions to show
input int     InpRows              = 70;         // Profile rows
input double  InpVAPct             = 70.0;       // Value area %
input int     InpWidthPct          = 65;         // Profile width (% of session)
input bool    InpShowDev           = true;       // Show today's developing profile
input bool    InpShowVA            = true;       // Show VAH / VAL lines
input bool    InpShowNaked         = true;       // Show naked POCs
input int     InpNakedMax          = 6;          // Max naked POCs
input bool    InpShowShape         = true;       // Show profile shape letter
input bool    InpShowPoor          = true;       // Show poor highs / lows
input bool    InpShowZones         = true;       // Show business zones
input double  InpZoneTol           = 12.0;       // Zone tolerance (% of prev VA width)
input int     InpTPOMins           = 30;         // TPO period (minutes)
input int     InpAcceptMins        = 30;         // Acceptance time (minutes)

input group "Weekly profile (docked right)"
input bool    InpShowWeek          = true;       // Show weekly profile
input int     InpWeekWidthPx       = 140;        // Weekly width (pixels)
input int     InpWeekMarginPx      = 60;         // Gap from price scale (pixels)
input int     InpWeekTopPx         = 90;         // Keep weekly label below this many pixels from the top
input bool    InpAutoShift         = true;       // Turn on chart shift for the right-side space
input double  InpShiftPct          = 35.0;       // Chart shift size (%)

input group "Plan & strip"
input bool    InpShowTags          = true;       // Show price tags
input bool    InpShowPlan          = true;       // Write plan on tags
input int     InpTagsPx            = 170;        // Tag column width (pixels)
input bool    InpShowStrip         = true;       // Show status strip
input EStripPos InpStripPos        = STRIP_TOP_CENTER; // Strip position
input bool    InpAlerts            = true;       // Alert when bias changes
input bool    InpPush              = false;      // Push notification when bias changes

input group "Style"
input string  InpBrand             = "5ABI.FX";        // Brand name
input color   InpProf              = C'139,139,146';   // Profile
input color   InpPoc               = C'245,165,36';    // POC
input color   InpAccent            = C'255,90,31';     // Accent (5ABI.FX orange)
input color   InpText              = C'236,236,238';   // Text (dark chart)
input color   InpTextLight         = C'20,20,22';      // Text (light chart)
input color   InpBull              = C'38,198,160';    // Bull (teal)
input color   InpBear              = C'240,70,75';     // Bear
input int     InpFontSize          = 9;                // Font size
input string  InpFont              = "Segoe UI";       // Font

#define PFX "5ABI_"

//+------------------------------------------------------------------+
//| Licence: read the signed note left by the Trade Journal EA       |
//| (see LicenseRelay.mqh). RELAY_SALT must match.                   |
//+------------------------------------------------------------------+
#define LIC_CODE       "COMPASS"
#define LIC_SERVER     "5abifx.com"
#define RELAY_SALT     "5abi.fx-relay-6271"
#define LIC_GRACE_H    48          // keeps working this long after the last successful check
long     LIC_OWNER[] = { 5057932970, 937757 };   // always unlocked
bool     g_lic = false;
bool     g_licFresh = false;       // just unlocked: rebuild everything
datetime g_licNext = 0;

double RelaySign(const string code, const long login, const double at)
  {
   string t = code + "|" + IntegerToString(login) + "|" + DoubleToString(at, 0) + "|" + RELAY_SALT;
   ulong h = 1469598103934665603;
   for(int i = 0; i < StringLen(t); i++)
      h = (h ^ (ulong)StringGetCharacter(t, i)) * 1099511628211;
   return (double)(h % 1000000007);
  }

bool LicCheck()
  {
   if(MQLInfoInteger(MQL_TESTER)) return true;
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   if(login <= 0) return false;
   for(int i = 0; i < ArraySize(LIC_OWNER); i++)
      if(LIC_OWNER[i] == login) return true;
   string base = "5ABI_R_" + LIC_CODE + "_" + IntegerToString(login);
   if(!GlobalVariableCheck(base + "_t") || !GlobalVariableCheck(base + "_s")) return false;
   double at = GlobalVariableGet(base + "_t");
   if(GlobalVariableGet(base + "_s") != RelaySign(LIC_CODE, login, at)) return false;
   double age = (double)TimeGMT() - at;
   return age > -600 && age < LIC_GRACE_H * 3600.0;
  }

void LicLockScreen()
  {
   ObjectsDeleteAll(0, PFX);
   int W = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   int H = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
   // MT5 cuts a label after 63 characters, so every line stays short
   string t[4];
   t[0] = "◆ " + InpBrand + " · Auction Compass is locked";
   t[1] = "Account " + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + " is not unlocked yet";
   t[2] = "Add it on your dashboard at " + LIC_SERVER + " (paid plan)";
   t[3] = "and keep the Trade Journal EA running in this MT5";
   // a card behind the text, so it reads on dark and light charts and over candles
   int fs = InpFontSize + 1, lh = fs * 3, cw = IMin(W - 20, fs * 62), ch = lh * 4 + fs * 2;
   string bg = PFX + "lockbg";
   ObjectCreate(0, bg, OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, bg, OBJPROP_CORNER, CORNER_LEFT_UPPER);
   ObjectSetInteger(0, bg, OBJPROP_XDISTANCE, W / 2 - cw / 2);
   ObjectSetInteger(0, bg, OBJPROP_YDISTANCE, H / 2 - ch / 2);
   ObjectSetInteger(0, bg, OBJPROP_XSIZE, cw);
   ObjectSetInteger(0, bg, OBJPROP_YSIZE, ch);
   ObjectSetInteger(0, bg, OBJPROP_BGCOLOR, Mix(InpAccent, 0.10));
   ObjectSetInteger(0, bg, OBJPROP_BORDER_TYPE, BORDER_FLAT);
   ObjectSetInteger(0, bg, OBJPROP_COLOR, InpAccent);
   ObjectSetInteger(0, bg, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, bg, OBJPROP_HIDDEN, true);
   for(int i = 0; i < 4; i++)
     {
      string nm = PFX + "lock" + IntegerToString(i);
      ObjectCreate(0, nm, OBJ_LABEL, 0, 0, 0);
      ObjectSetInteger(0, nm, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, nm, OBJPROP_ANCHOR, ANCHOR_CENTER);
      ObjectSetInteger(0, nm, OBJPROP_XDISTANCE, W / 2);
      ObjectSetInteger(0, nm, OBJPROP_YDISTANCE, H / 2 + (i * 2 - 3) * lh / 2);
      ObjectSetString(0, nm, OBJPROP_TEXT, t[i]);
      ObjectSetString(0, nm, OBJPROP_FONT, i == 0 ? InpFont + " Semibold" : InpFont);
      ObjectSetInteger(0, nm, OBJPROP_FONTSIZE, i == 0 ? fs + 2 : fs);
      ObjectSetInteger(0, nm, OBJPROP_COLOR, i == 0 ? InpAccent : TC());   // TC(): dark text on light charts
      ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
      ObjectSetInteger(0, nm, OBJPROP_HIDDEN, true);
      ObjectSetInteger(0, nm, OBJPROP_ZORDER, 101);
     }
   ChartRedraw();
  }

// true while unlocked; re-reads the note every 10 seconds
bool LicOk()
  {
   if(TimeLocal() >= g_licNext)
     {
      bool was = g_lic;
      g_lic = LicCheck();
      g_licNext = TimeLocal() + 10;
      if(!g_lic)
         LicLockScreen();
      else if(!was)
        {
         ObjectsDeleteAll(0, PFX + "lock");
         g_licFresh = true;
        }
     }
   return g_lic;
  }

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
   string            shape;
   bool              poorHi, poorLo, ok;
                     CProf(void) { ok = false; n = 0; shape = ""; }
  };

CProf    g_h[];          // finished sessions, [0] = yesterday
int      g_hn = 0;
CProf    g_dev;          // today
CProf    g_wk;           // this week
CProf    g_pwk;          // last week
MqlRates g_tr[];         // today's data bars
int      g_tn = 0;

double   g_nk[];         // naked POC prices
datetime g_day = 0, g_lastData = 0, g_lastEval = 0;
bool     g_needFull = true;
int      g_zn = 0;
uint     g_lastTick = 0;
int      g_alertDir = 0;
bool     g_alertInit = false;

// pixel-layer state
double   g_tgPx[];
string   g_tgTx[];
color    g_tgC[];
string   g_s1 = "", g_s2 = "", g_s3 = "", g_tip2 = "", g_tip3 = "";
color    g_c2 = clrWhite;
string   g_wkTx = "", g_wkTrail = "";

//+------------------------------------------------------------------+
int  IMax(int a, int b) { return a > b ? a : b; }
int  IMin(int a, int b) { return a < b ? a : b; }
string Px(double p)     { return DoubleToString(p, _Digits); }

// Text colour that reads on the current chart background (dark or light)
color TC()
  {
   int b = (int)ChartGetInteger(0, CHART_COLOR_BACKGROUND);
   double lum = 0.299 * (b & 0xFF) + 0.587 * ((b >> 8) & 0xFF) + 0.114 * ((b >> 16) & 0xFF);
   return lum > 140 ? InpTextLight : InpText;
  }

// Blend a colour with the chart background (MT5 objects have no alpha)
color Mix(color fg, double t)
  {
   int f = (int)fg;
   int b = (int)ChartGetInteger(0, CHART_COLOR_BACKGROUND);
   int r = (int)MathRound((f & 0xFF) * t + (b & 0xFF) * (1.0 - t));
   int g = (int)MathRound(((f >> 8) & 0xFF) * t + ((b >> 8) & 0xFF) * (1.0 - t));
   int u = (int)MathRound(((f >> 16) & 0xFF) * t + ((b >> 16) & 0xFF) * (1.0 - t));
   return (color)(r | (g << 8) | (u << 16));
  }

//+------------------------------------------------------------------+
//| Object helpers (create or update in place)                       |
//+------------------------------------------------------------------+
void Common(string nm, bool back)
  {
   ObjectSetInteger(0, nm, OBJPROP_BACK, back);
   ObjectSetInteger(0, nm, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, nm, OBJPROP_HIDDEN, true);
  }

void Rect(string nm, datetime t1, double p1, datetime t2, double p2, color c)
  {
   if(ObjectFind(0, nm) < 0)
     {
      ObjectCreate(0, nm, OBJ_RECTANGLE, 0, t1, p1, t2, p2);
      Common(nm, true);
      ObjectSetInteger(0, nm, OBJPROP_FILL, true);
     }
   else
     {
      ObjectMove(0, nm, 0, t1, p1);
      ObjectMove(0, nm, 1, t2, p2);
     }
   ObjectSetInteger(0, nm, OBJPROP_COLOR, c);
  }

void Seg(string nm, datetime t1, datetime t2, double p, color c, ENUM_LINE_STYLE st, int w, bool ray)
  {
   if(ObjectFind(0, nm) < 0)
     {
      ObjectCreate(0, nm, OBJ_TREND, 0, t1, p, t2, p);
      Common(nm, true);
      ObjectSetInteger(0, nm, OBJPROP_RAY_LEFT, false);
     }
   else
     {
      ObjectMove(0, nm, 0, t1, p);
      ObjectMove(0, nm, 1, t2, p);
     }
   ObjectSetInteger(0, nm, OBJPROP_COLOR, c);
   ObjectSetInteger(0, nm, OBJPROP_STYLE, st);
   ObjectSetInteger(0, nm, OBJPROP_WIDTH, w);
   ObjectSetInteger(0, nm, OBJPROP_RAY_RIGHT, ray);
  }

void Txt(string nm, datetime t, double p, string s, color c, ENUM_ANCHOR_POINT a)
  {
   if(ObjectFind(0, nm) < 0)
     {
      ObjectCreate(0, nm, OBJ_TEXT, 0, t, p);
      Common(nm, false);
     }
   else
      ObjectMove(0, nm, 0, t, p);
   ObjectSetString(0, nm, OBJPROP_TEXT, s);
   ObjectSetString(0, nm, OBJPROP_FONT, InpFont);
   ObjectSetInteger(0, nm, OBJPROP_FONTSIZE, InpFontSize);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, c);
   ObjectSetInteger(0, nm, OBJPROP_ANCHOR, a);
  }

void PxRect(string nm, int x, int y, int w, int h, color c)
  {
   if(ObjectFind(0, nm) < 0)
     {
      ObjectCreate(0, nm, OBJ_RECTANGLE_LABEL, 0, 0, 0);
      Common(nm, false);
      ObjectSetInteger(0, nm, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, nm, OBJPROP_BORDER_TYPE, BORDER_FLAT);
     }
   ObjectSetInteger(0, nm, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, nm, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, nm, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, nm, OBJPROP_YSIZE, h);
   ObjectSetInteger(0, nm, OBJPROP_BGCOLOR, c);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, c);
  }

void PxText(string nm, int x, int y, string s, color c, ENUM_ANCHOR_POINT a, string font, string tip)
  {
   if(ObjectFind(0, nm) < 0)
     {
      ObjectCreate(0, nm, OBJ_LABEL, 0, 0, 0);
      Common(nm, false);
      ObjectSetInteger(0, nm, OBJPROP_CORNER, CORNER_LEFT_UPPER);
     }
   ObjectSetInteger(0, nm, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, nm, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, nm, OBJPROP_TEXT, s);
   ObjectSetString(0, nm, OBJPROP_FONT, font);
   ObjectSetInteger(0, nm, OBJPROP_FONTSIZE, InpFontSize);
   ObjectSetInteger(0, nm, OBJPROP_COLOR, c);
   ObjectSetInteger(0, nm, OBJPROP_ANCHOR, a);
   ObjectSetString(0, nm, OBJPROP_TOOLTIP, tip == "" ? "\n" : tip);
   ObjectSetInteger(0, nm, OBJPROP_ZORDER, 100);
  }

//+------------------------------------------------------------------+
//| Profile engine                                                   |
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

// Highest / lowest traded since a time (to test naked POCs, poor extremes)
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
//| Drawing on the price chart                                       |
//+------------------------------------------------------------------+
void DrawProfile(CProf &p, string tag, bool dev)
  {
   if(!p.ok)
      return;
   double span = (double)(p.tEnd - p.t0);
   span = dev ? fmax(span, 6 * 3600.0) : fmin(span, 86400.0);
   color cIn = Mix(InpProf, 0.42), cOut = Mix(InpProf, 0.22);
   for(int k = 0; k < p.n; k++)
     {
      string nm = PFX + tag + "r" + IntegerToString(k);
      if(p.vol[k] <= 0)
        {
         ObjectDelete(0, nm);
         continue;
        }
      long w = (long)(p.vol[k] / p.mx * span * InpWidthPct / 100.0);
      bool inVA = k >= p.dnI && k <= p.upI;
      Rect(nm, p.t0, p.lo + k * p.step, (datetime)(p.t0 + w), p.lo + (k + 1) * p.step, inVA ? cIn : cOut);
     }
   datetime t2 = (datetime)(p.t0 + (long)(span * InpWidthPct / 100.0));
   Seg(PFX + tag + "poc", p.t0, t2, p.poc, InpPoc, STYLE_SOLID, dev ? 2 : 1, false);
   if(InpShowVA)
     {
      color cv = Mix(TC(), 0.45);
      Seg(PFX + tag + "vah", p.t0, t2, p.vah, cv, STYLE_DOT, 1, false);
      Seg(PFX + tag + "val", p.t0, t2, p.val, cv, STYLE_DOT, 1, false);
     }
   if(InpShowShape)
      Txt(PFX + tag + "shp", p.t0, p.hi, p.shape, Mix(InpAccent, 0.85), ANCHOR_LEFT_LOWER);
  }

struct SLev
  {
   double            px;
   int               s;
   datetime          t;
  };

void DrawZones()
  {
   g_zn = 0;
   if(g_hn < 2)
      return;
   double tol = InpZoneTol / 100.0 * (g_h[0].vah - g_h[0].val);
   if(tol <= 0)
      return;
   SLev lv[];
   ArrayResize(lv, g_hn * 3);
   int m = 0;
   for(int i = 0; i < g_hn; i++)
     {
      if(!g_h[i].ok)
         continue;
      lv[m].px = g_h[i].vah; lv[m].s = i; lv[m].t = g_h[i].t0; m++;
      lv[m].px = g_h[i].poc; lv[m].s = i; lv[m].t = g_h[i].t0; m++;
      lv[m].px = g_h[i].val; lv[m].s = i; lv[m].t = g_h[i].t0; m++;
     }
   for(int i = 1; i < m; i++)          // insertion sort by price
     {
      SLev x = lv[i];
      int j = i - 1;
      while(j >= 0 && lv[j].px > x.px)
        {
         lv[j + 1] = lv[j];
         j--;
        }
      lv[j + 1] = x;
     }
   color cz = Mix(InpProf, 0.14);
   int a = 0;
   while(a < m)
     {
      int b = a;
      while(b + 1 < m && lv[b + 1].px - lv[b].px <= tol)
         b++;
      bool multi = false;
      datetime t = lv[a].t;
      for(int k = a; k <= b; k++)
        {
         if(lv[k].s != lv[a].s)
            multi = true;
         if(lv[k].t < t)
            t = lv[k].t;
        }
      if(multi)
        {
         double pad = tol * 0.25;
         Rect(PFX + "z" + IntegerToString(g_zn), t, lv[b].px + pad, TimeCurrent(), lv[a].px - pad, cz);
         g_zn++;
        }
      a = b + 1;
     }
  }

void DrawNaked()
  {
   ObjectsDeleteAll(0, PFX + "n");
   ArrayResize(g_nk, 0);
   color cn = Mix(InpPoc, 0.65), cp = Mix(InpBear, 0.6);
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
         if(InpShowNaked)
            Seg(PFX + "n" + IntegerToString(i), g_h[i].tEnd, (datetime)(g_h[i].tEnd + 3600), g_h[i].poc, cn, STYLE_DASH, 1, true);
        }
      if(InpShowPoor && i < 3)
        {
         if(g_h[i].poorHi && hs < g_h[i].hi)
           {
            Seg(PFX + "nph" + IntegerToString(i), g_h[i].tEnd, (datetime)(g_h[i].tEnd + 3600), g_h[i].hi, cp, STYLE_DOT, 1, true);
            Txt(PFX + "npht" + IntegerToString(i), g_h[i].tEnd, g_h[i].hi, "poor high", cp, ANCHOR_LEFT_LOWER);
           }
         if(g_h[i].poorLo && ls > g_h[i].lo)
           {
            Seg(PFX + "npl" + IntegerToString(i), g_h[i].tEnd, (datetime)(g_h[i].tEnd + 3600), g_h[i].lo, cp, STYLE_DOT, 1, true);
            Txt(PFX + "nplt" + IntegerToString(i), g_h[i].tEnd, g_h[i].lo, "poor low", cp, ANCHOR_LEFT_UPPER);
           }
        }
     }
  }

bool FullRedraw()
  {
   ObjectsDeleteAll(0, PFX + "h");
   ObjectsDeleteAll(0, PFX + "z");
   int N = IMax(2, InpSessions);
   ArrayResize(g_h, N);
   g_hn = 0;
   for(int k = 1; k <= N; k++)
     {
      datetime a = iTime(_Symbol, PERIOD_D1, k), b = iTime(_Symbol, PERIOD_D1, k - 1);
      if(a == 0 || b == 0 || !Build(g_h[g_hn], a, b))
         break;
      g_hn++;
     }
   datetime w1 = iTime(_Symbol, PERIOD_W1, 1), w0 = iTime(_Symbol, PERIOD_W1, 0);
   if(w1 > 0 && w0 > 0)
      Build(g_pwk, w1, w0);
   if(InpShowZones)
      DrawZones();
   for(int i = 0; i < g_hn; i++)
      DrawProfile(g_h[i], "h" + IntegerToString(i) + "_", false);
   return g_hn >= IMin(2, N);
  }

//+------------------------------------------------------------------+
//| Plan, bias and strip                                             |
//+------------------------------------------------------------------+
double NearNaked(double px, int dir)
  {
   double best = EMPTY_VALUE;
   for(int i = 0; i < ArraySize(g_nk); i++)
     {
      double q = g_nk[i];
      if(dir == 1 && q > px && (best == EMPTY_VALUE || q < best))
         best = q;
      if(dir == -1 && q < px && (best == EMPTY_VALUE || q > best))
         best = q;
     }
   return best;
  }

// Minutes that price has been closing on one side, counted back from bar `last`
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
   return st == 0 ? 0.0 : (double)(tNow - st) / 60.0;
  }

int Bias(int last, datetime tNow, double px, string &why)
  {
   double pVAH = g_h[0].vah, pVAL = g_h[0].val, pPOC = g_h[0].poc;
   int score = 0;
   why = "";
   string acc = IntegerToString(InpAcceptMins);
   bool inside = px <= pVAH && px >= pVAL;
   if(px > pVAH)
     {
      double m = RunMins(1, pVAH, last, tNow);
      score += m >= InpAcceptMins ? 2 : 1;
      why += "• Above yesterday's value" + (m >= InpAcceptMins ? ", accepted " + acc + " min" : " (not accepted yet)") + "\n";
     }
   else if(px < pVAL)
     {
      double m = RunMins(-1, pVAL, last, tNow);
      score -= m >= InpAcceptMins ? 2 : 1;
      why += "• Below yesterday's value" + (m >= InpAcceptMins ? ", accepted " + acc + " min" : " (not accepted yet)") + "\n";
     }
   else
      why += "• Inside yesterday's value: balance, fade the edges\n";
   if(g_pwk.ok)
     {
      if(px > g_pwk.vah)
        { score += 1; why += "• Above last week's value\n"; }
      else if(px < g_pwk.val)
        { score -= 1; why += "• Below last week's value\n"; }
     }
   if(g_hn > 1)
     {
      if(pPOC > g_h[1].poc)
        { score += 1; why += "• Value migrating higher\n"; }
      else if(pPOC < g_h[1].poc)
        { score -= 1; why += "• Value migrating lower\n"; }
     }
   return inside ? 0 : score >= 2 ? 1 : score <= -2 ? -1 : 0;
  }

string VPlan(int v, bool acc, bool held, int dir)
  {
   string a = IntegerToString(InpAcceptMins);
   switch(v)
     {
      case 1: return acc ? "Value accepted: fade VAH / VAL, trade to the other side" : "Wait " + a + " min inside value, then fade the edges";
      case 2: return "Expect a move to pPOC, then a setup back to the open";
      case 3: return held ? "Gap held: trend day " + (dir == 1 ? "up" : "down") + ", target naked POCs" : "Watch " + a + " min: hold outside = trend, back inside = V4";
      case 4: return "Back inside and accepted: trade through value";
     }
   return "Needs one completed session";
  }

void AddTag(double px, string tx, color c)
  {
   int n = ArraySize(g_tgPx);
   ArrayResize(g_tgPx, n + 1);
   ArrayResize(g_tgTx, n + 1);
   ArrayResize(g_tgC, n + 1);
   g_tgPx[n] = px;
   g_tgTx[n] = tx;
   g_tgC[n]  = c;
  }

void PlanTag(double px, string tx, color c, double tol)
  {
   if(px == EMPTY_VALUE)
      return;
   for(int j = 0; j < ArraySize(g_tgPx); j++)
      if(MathAbs(g_tgPx[j] - px) <= tol)
        {
         g_tgTx[j] += "   " + tx;
         g_tgC[j] = c;
         return;
        }
   AddTag(px, tx + " " + Px(px), c);
  }

void LiveUpdate()
  {
   datetime d0 = iTime(_Symbol, PERIOD_D1, 0);
   if(d0 == 0)
      return;
   g_tn = CopyRates(_Symbol, InpDataTF, d0, (datetime)(TimeCurrent() + PeriodSeconds(InpDataTF)), g_tr);
   if(g_tn <= 0)
      return;
   if(BuildFrom(g_dev, g_tr, g_tn, d0) && InpShowDev)
      DrawProfile(g_dev, "d_", true);

   // this week's profile + trail of this week's daily shapes
   datetime w0 = iTime(_Symbol, PERIOD_W1, 0);
   g_wkTx = "";
   g_wkTrail = "";
   if(w0 > 0 && Build(g_wk, w0, (datetime)(TimeCurrent() + PeriodSeconds(InpDataTF))))
     {
      g_wkTx = "WEEK " + g_wk.shape;
      for(int i = g_hn - 1; i >= 0; i--)
         if(g_h[i].ok && g_h[i].t0 >= w0)
            g_wkTrail += g_h[i].shape + " → ";
      g_wkTrail += "·";
     }

   for(int z = 0; z < g_zn; z++)
      ObjectSetInteger(0, PFX + "z" + IntegerToString(z), OBJPROP_TIME, 1, TimeCurrent());

   ArrayResize(g_tgPx, 0);
   ArrayResize(g_tgTx, 0);
   ArrayResize(g_tgC, 0);
   if(g_hn < 1)
     {
      g_s1 = "◆ " + InpBrand;
      g_s2 = "BIAS —";
      g_s3 = "needs one completed session";
      g_tip2 = g_tip3 = "";
      g_c2 = TC();
      return;
     }

   double pVAH = g_h[0].vah, pVAL = g_h[0].val, pPOC = g_h[0].poc, pHi = g_h[0].hi, pLo = g_h[0].lo;
   double px = g_tr[g_tn - 1].close;
   datetime now = TimeCurrent();
   long ps = PeriodSeconds(InpDataTF);

   // Opening variant + acceptance
   double o = g_tr[0].open;
   int variant = (o >= pVAL && o <= pVAH) ? 1 : (o >= pLo && o <= pHi) ? 2 : 3;
   int outDir  = o > pVAH ? 1 : o < pVAL ? -1 : 0;
   bool accepted = false;
   double accMins = 0;
   if(variant == 1 || variant == 3)
     {
      double zLo = variant == 1 ? pVAL : pLo, zHi = variant == 1 ? pVAH : pHi;
      datetime st = 0;
      for(int i = 0; i < g_tn; i++)
        {
         double c = g_tr[i].close;
         if(c >= zLo && c <= zHi)
           {
            if(st == 0)
               st = g_tr[i].time;
            datetime te = i == g_tn - 1 ? now : (datetime)(g_tr[i].time + ps);
            accMins = (double)(te - st) / 60.0;
            if(accMins >= InpAcceptMins)
               accepted = true;
           }
         else
           {
            st = 0;
            accMins = 0;
           }
        }
      if(variant == 3 && accepted)
         variant = 4;
     }
   bool pocHit = false;
   for(int i = 0; i < g_tn; i++)
      if(g_tr[i].high >= pPOC && g_tr[i].low <= pPOC)
        { pocHit = true; break; }
   double elapsed = (double)(now - g_tr[0].time) / 60.0;
   bool gapHeld = variant == 3 && elapsed >= InpAcceptMins;

   // Bias (live) + alert (on closed data bars)
   string why;
   int bDir = Bias(g_tn - 1, now, px, why);
   if(g_tn >= 2 && g_tr[g_tn - 1].time != g_lastEval)
     {
      g_lastEval = g_tr[g_tn - 1].time;
      string w2;
      int cDir = Bias(g_tn - 2, g_tr[g_tn - 1].time, g_tr[g_tn - 2].close, w2);
      if(g_alertInit && cDir != g_alertDir)
        {
         string msg = "5ABI Compass · " + _Symbol + " · bias changed to " + (cDir == 1 ? "LONG" : cDir == -1 ? "SHORT" : "BALANCE / NEUTRAL");
         if(InpAlerts)
            Alert(msg);
         if(InpPush)
            SendNotification(msg);
        }
      g_alertDir = cDir;
      g_alertInit = true;
     }
   double tgt = EMPTY_VALUE;
   if(bDir != 0)
     {
      tgt = NearNaked(px, bDir);
      if(tgt == EMPTY_VALUE && g_pwk.ok && (bDir == 1 ? g_pwk.poc > px : g_pwk.poc < px))
         tgt = g_pwk.poc;
     }
   string tg = tgt == EMPTY_VALUE ? "" : " → " + Px(tgt);
   g_s2 = bDir == 1 ? "BIAS ▲ LONG > " + Px(pVAH) + tg :
          bDir == -1 ? "BIAS ▼ SHORT < " + Px(pVAL) + tg :
          (px <= pVAH && px >= pVAL) ? "BIAS ↔ BALANCE " + Px(pVAL) + "–" + Px(pVAH) : "BIAS ↔ NEUTRAL";
   g_tip2 = why + (bDir == 1 ? "Flips if price closes back below pVAH " + Px(pVAH) :
                   bDir == -1 ? "Flips if price closes back above pVAL " + Px(pVAL) :
                   "Waits for price to leave value and hold " + IntegerToString(InpAcceptMins) + " min");
   g_c2 = bDir == 1 ? InpBull : bDir == -1 ? InpBear : TC();

   // Context line
   string accTx = variant == 2 ? (pocHit ? "pPOC ✓" : "→ pPOC") : variant == 4 ? "ACCEPTED ✓" : gapHeld ? "GAP HELD ✓" :
                  IntegerToString((int)MathFloor(accMins)) + "/" + IntegerToString(InpAcceptMins) + "m";
   string mig = "";
   if(g_hn > 1)
     {
      double ppVAH = g_h[1].vah, ppVAL = g_h[1].val, ppPOC = g_h[1].poc;
      mig = pVAL > ppVAH ? "VALUE ▲▲" : pVAH < ppVAL ? "VALUE ▼▼" : pPOC > ppPOC ? "VALUE ▲" : pPOC < ppPOC ? "VALUE ▼" : "VALUE ↔";
     }
   string wk = (!g_pwk.ok || !InpShowWeek) ? "" : px > g_pwk.vah ? "WEEK ▲" : px < g_pwk.val ? "WEEK ▼" : "WEEK ↔";
   g_s1 = "◆ " + InpBrand;
   g_s3 = "V" + IntegerToString(variant) + " · " + accTx + (mig == "" ? "" : " · " + mig) + (wk == "" ? "" : " · " + wk);
   g_tip3 = VPlan(variant, accepted, gapHeld, outDir);

   // Tags + plan
   if(InpShowTags)
     {
      color cl = Mix(TC(), 0.65);
      AddTag(pVAH, "pVAH " + Px(pVAH), cl);
      AddTag(pPOC, "pPOC " + Px(pPOC), InpPoc);
      AddTag(pVAL, "pVAL " + Px(pVAL), cl);
      for(int i = 0; i < ArraySize(g_nk); i++)
         if(g_nk[i] != pPOC)
            AddTag(g_nk[i], "nPOC " + Px(g_nk[i]), Mix(InpPoc, 0.7));
      if(InpShowPlan)
        {
         double lE = EMPTY_VALUE, lT = EMPTY_VALUE, sE = EMPTY_VALUE, sT = EMPTY_VALUE;
         switch(variant)
           {
            case 1: lE = pVAL; lT = pVAH; sE = pVAH; sT = pVAL; break;
            case 2:
               if(outDir == 1) { lE = pPOC; lT = o; }
               else            { sE = pPOC; sT = o; }
               break;
            case 3:
               if(outDir == 1) { lE = px; lT = NearNaked(px, 1); }
               else            { sE = px; sT = NearNaked(px, -1); }
               break;
            case 4:
               if(outDir == 1) { sE = pVAH; sT = pVAL; }
               else            { lE = pVAL; lT = pVAH; }
               break;
           }
         double tol = (pVAH - pVAL) * 0.03;
         if(lE != EMPTY_VALUE)
           {
            PlanTag(lE, "▲ LONG", InpBull, tol);
            PlanTag(lT, "▲ TP", InpBull, tol);
           }
         if(sE != EMPTY_VALUE)
           {
            PlanTag(sE, "▼ SHORT", InpBear, tol);
            PlanTag(sT, "▼ TP", InpBear, tol);
           }
        }
     }
  }

//+------------------------------------------------------------------+
//| Pixel layer: weekly profile, tags, strip                          |
//+------------------------------------------------------------------+
int YOf(double price)
  {
   int x = 0, y = 0;
   datetime t = iTime(_Symbol, _Period, 0);
   ChartTimePriceToXY(0, 0, t, price, x, y);
   return y;
  }

void DrawPixels()
  {
   int W = (int)ChartGetInteger(0, CHART_WIDTH_IN_PIXELS);
   int H = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
   int lh = IMax(12, InpFontSize * 2);
   int xR = W - InpWeekMarginPx;
   int xL = xR;

   // Weekly profile docked on the right edge, growing left
   if(InpShowWeek && g_wk.ok)
     {
      xL = xR - InpWeekWidthPx;
      color cIn = Mix(InpProf, 0.42), cOut = Mix(InpProf, 0.22);
      for(int k = 0; k < g_wk.n; k++)
        {
         string nm = PFX + "pxW" + IntegerToString(k);
         int y1 = YOf(g_wk.lo + (k + 1) * g_wk.step), y2 = YOf(g_wk.lo + k * g_wk.step);
         if(g_wk.vol[k] <= 0 || y2 < 0 || y1 > H)
           {
            ObjectDelete(0, nm);
            continue;
           }
         int w = IMax(1, (int)MathRound(g_wk.vol[k] / g_wk.mx * InpWeekWidthPx));
         PxRect(nm, xR - w, y1, w, IMax(1, y2 - y1), (k >= g_wk.dnI && k <= g_wk.upI) ? cIn : cOut);
        }
      PxRect(PFX + "pxWpoc", xL, YOf(g_wk.poc), InpWeekWidthPx, 1, InpPoc);
      if(InpShowVA)
        {
         color cv = Mix(TC(), 0.4);
         PxRect(PFX + "pxWvah", xL, YOf(g_wk.vah), InpWeekWidthPx, 1, cv);
         PxRect(PFX + "pxWval", xL, YOf(g_wk.val), InpWeekWidthPx, 1, cv);
        }
      // label sits right above the weekly profile, left-aligned with it, never in the top corner
      int yT = IMin(H - 4, IMax(InpWeekTopPx + lh, YOf(g_wk.hi) - 4));
      PxText(PFX + "pxWl1", xL, yT - lh, g_wkTx, InpAccent, ANCHOR_LEFT_LOWER, InpFont + " Semibold", "This week's profile shape");
      PxText(PFX + "pxWl2", xL, yT, g_wkTrail, Mix(TC(), 0.8), ANCHOR_LEFT_LOWER, InpFont, "How the week developed, day by day");
     }
   else
      ObjectsDeleteAll(0, PFX + "pxW");

   // Price tags in a column just left of the weekly
   ObjectsDeleteAll(0, PFX + "pxT");
   int n = ArraySize(g_tgPx);
   if(n > 0)
     {
      int ys[], ord[];
      ArrayResize(ys, n);
      ArrayResize(ord, n);
      for(int i = 0; i < n; i++)
        {
         ys[i] = YOf(g_tgPx[i]);
         ord[i] = i;
        }
      for(int i = 1; i < n; i++)          // sort by y
        {
         int x = ord[i], j = i - 1;
         while(j >= 0 && ys[ord[j]] > ys[x])
           {
            ord[j + 1] = ord[j];
            j--;
           }
         ord[j + 1] = x;
        }
      int prev = -100000;
      int xT = xL - 12 - InpTagsPx;
      for(int i = 0; i < n; i++)
        {
         int k = ord[i];
         int y = IMax(ys[k], prev + lh);
         prev = y;
         if(y < 0 || y > H)
            continue;
         PxText(PFX + "pxT" + IntegerToString(i), xT, y, g_tgTx[k], g_tgC[k], ANCHOR_LEFT, InpFont, "");
        }
     }

   // Status strip, three stacked lines, no background
   if(InpShowStrip)
     {
      bool center = InpStripPos == STRIP_TOP_CENTER || InpStripPos == STRIP_BOTTOM_CENTER;
      bool top    = InpStripPos == STRIP_TOP_CENTER || InpStripPos == STRIP_TOP_LEFT;
      int x = center ? W / 2 : 10;
      ENUM_ANCHOR_POINT a = center ? (top ? ANCHOR_UPPER : ANCHOR_LOWER) : (top ? ANCHOR_LEFT_UPPER : ANCHOR_LEFT_LOWER);
      int y0 = top ? (center ? 6 : 24) : H - 8 - 2 * lh;
      PxText(PFX + "pxS1", x, y0, g_s1, InpAccent, a, InpFont + " Semibold", "");
      PxText(PFX + "pxS2", x, y0 + lh, g_s2, g_c2, a, InpFont + " Semibold", g_tip2);
      PxText(PFX + "pxS3", x, y0 + 2 * lh, g_s3, Mix(TC(), 0.8), a, InpFont, g_tip3);
     }
   else
      ObjectsDeleteAll(0, PFX + "pxS");
  }

//+------------------------------------------------------------------+
void Refresh()
  {
   if(!LicOk())
      return;
   if(g_licFresh)
     {
      g_licFresh = false;
      g_needFull = true;
     }
   datetime d0 = iTime(_Symbol, PERIOD_D1, 0);
   if(d0 == 0)
      return;
   if(d0 != g_day || g_needFull)
     {
      g_needFull = !FullRedraw();
      g_day = d0;
      g_lastData = 0;
      ObjectsDeleteAll(0, PFX + "d_");
     }
   datetime b0 = iTime(_Symbol, InpDataTF, 0);
   if(b0 != g_lastData)
     {
      g_lastData = b0;
      DrawNaked();
     }
   LiveUpdate();
   DrawPixels();
   ChartRedraw();
  }

int OnInit()
  {
   IndicatorSetString(INDICATOR_SHORTNAME, "5ABI Auction Compass");
   if(InpAutoShift)
     {
      ChartSetInteger(0, CHART_SHIFT, true);
      ChartSetDouble(0, CHART_SHIFT_SIZE, fmax(10.0, fmin(50.0, InpShiftPct)));
     }
   EventSetTimer(2);
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
   Refresh();
  }

void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   if(id == CHARTEVENT_CHART_CHANGE)
     {
      if(!g_lic)
        {
         g_licNext = 0;
         LicOk();
         return;
        }
      DrawPixels();
      ChartRedraw();
     }
  }

int OnCalculate(const int rates_total, const int prev_calculated, const datetime &time[],
                const double &open[], const double &high[], const double &low[], const double &close[],
                const long &tick_volume[], const long &volume[], const int &spread[])
  {
   uint t = GetTickCount();
   if(prev_calculated == 0 || t - g_lastTick > 750)
     {
      g_lastTick = t;
      Refresh();
     }
   return rates_total;
  }
//+------------------------------------------------------------------+
