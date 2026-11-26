//+------------------------------------------------------------------+
//| LicenseCheck.mqh - account-number licensing for your MT5 EAs      |
//|                                                                  |
//| How to use (see ExampleEA.mq5):                                  |
//|   #define EA_CODE        "GOLD_SCALPER"     // same code as admin |
//|   #define LICENSE_SERVER "https://your-domain.com"               |
//|   #include "LicenseCheck.mqh"                                     |
//|   OnInit:   return LicenseOnInit();                              |
//|   OnTimer:  LicenseOnTimer();                                    |
//|   OnDeinit: LicenseOnDeinit();                                   |
//|   Before opening any trade: if(!LicenseIsValid()) return;        |
//+------------------------------------------------------------------+
#ifndef EA_CODE
   #error "Define EA_CODE before including LicenseCheck.mqh"
#endif
#ifndef LICENSE_SERVER
   #error "Define LICENSE_SERVER before including LicenseCheck.mqh"
#endif
#ifndef LICENSE_RECHECK_MINUTES
   #define LICENSE_RECHECK_MINUTES 60      // re-check the license every hour
#endif
#ifndef LICENSE_GRACE_HOURS
   #define LICENSE_GRACE_HOURS 24          // keep trading this long if the server is unreachable
#endif
#ifndef LICENSE_ALLOW_TESTER
   #define LICENSE_ALLOW_TESTER true       // allow backtests in the Strategy Tester
#endif
#ifndef LICENSE_TIMEOUT_MS
   #define LICENSE_TIMEOUT_MS 5000         // WebRequest waits at most this long (it pauses the EA while it waits)
#endif
#ifndef LICENSE_SALT
   #define LICENSE_SALT 7719283            // change this number per EA
#endif

bool     g_licValid     = false;
datetime g_licNextCheck = 0;
string   g_licMessage   = "";
bool     g_licAlerted   = false;
int      g_licFails     = 0;               // failed checks in a row (for the retry back-off)
string   g_licComment   = "";              // what we last wrote with Comment()

//--- Comment() redraws the whole chart, so only call it when the text really changes
void LicComment(const string text)
  {
   if(text == g_licComment) return;
   g_licComment = text;
   Comment(text);
  }

//--- read "key":"value" from the server's JSON reply
string LicJsonString(const string body, const string key)
  {
   string pat = "\"" + key + "\":\"";
   int p = StringFind(body, pat);
   if(p < 0) return "";
   p += StringLen(pat);
   int e = StringFind(body, "\"", p);
   if(e < 0) return "";
   return StringSubstr(body, p, e - p);
  }

//--- 1 = licensed, 0 = not licensed, -1 = could not reach server
int LicRequest(string &msg)
  {
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   if(login <= 0) { msg = "Waiting for account login"; return -1; }

   string url = LICENSE_SERVER + "/api/check?ea=" + EA_CODE + "&account=" + IntegerToString(login);
   char data[], result[];
   string resHeaders;
   ResetLastError();
   int http = WebRequest("GET", url, "", LICENSE_TIMEOUT_MS, data, result, resHeaders);
   if(http == -1)
     {
      int err = GetLastError();
      if(err == 4014)
         msg = "Add " + LICENSE_SERVER + " in Tools > Options > Expert Advisors > Allow WebRequest for listed URL";
      else
         msg = "License server unreachable (error " + IntegerToString(err) + ")";
      return -1;
     }
   if(http != 200) { msg = "License server error (HTTP " + IntegerToString(http) + ")"; return -1; }

   string body = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   msg = LicJsonString(body, "message");
   bool valid   = StringFind(body, "\"valid\":true") >= 0;
   bool sameAcc = StringFind(body, "\"account\":\"" + IntegerToString(login) + "\"") >= 0;
   return (valid && sameAcc) ? 1 : 0;
  }

//--- remember the last successful check so short server outages don't stop trading
string LicGvName(const string suffix) { return "LIC_" + EA_CODE + "_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + suffix; }
double LicSum(const double t) { return MathMod(t * 3.0 + (double)AccountInfoInteger(ACCOUNT_LOGIN) + LICENSE_SALT, 999983.0); }

void LicSaveOk()
  {
   double now = (double)TimeLocal();
   GlobalVariableSet(LicGvName("_t"), now);
   GlobalVariableSet(LicGvName("_c"), LicSum(now));
  }

bool LicInGrace()
  {
   if(!GlobalVariableCheck(LicGvName("_t")) || !GlobalVariableCheck(LicGvName("_c"))) return false;
   double t = GlobalVariableGet(LicGvName("_t"));
   if(GlobalVariableGet(LicGvName("_c")) != LicSum(t)) return false;
   double age = (double)TimeLocal() - t;
   return age >= 0 && age < LICENSE_GRACE_HOURS * 3600.0;
  }

void LicClearOk()
  {
   GlobalVariableDel(LicGvName("_t"));
   GlobalVariableDel(LicGvName("_c"));
  }

//--- runs a check now and updates g_licValid. Returns the LicRequest result.
int LicCheckNow()
  {
   string msg;
   if(AccountInfoInteger(ACCOUNT_LOGIN) <= 0)
     {
      // MT5 still connecting to the broker: nothing was sent, look again shortly
      g_licMessage = "Waiting for account login";
      g_licValid = false;
      g_licNextCheck = TimeLocal() + 15;
      return -1;
     }
   int r = LicRequest(msg);
   g_licMessage = msg;
   if(r == 1)
     {
      g_licValid = true;
      g_licAlerted = false;
      LicSaveOk();
      g_licFails = 0;
      // a few random minutes on top, so several EAs in one MT5 don't all ask at the same moment
      g_licNextCheck = TimeLocal() + LICENSE_RECHECK_MINUTES * 60 + MathRand() % 600;
      Print(EA_CODE, " license OK for account ", AccountInfoInteger(ACCOUNT_LOGIN));
     }
   else if(r == 0)
     {
      g_licValid = false;
      LicClearOk();
      g_licFails = 0;
      g_licNextCheck = TimeLocal() + LICENSE_RECHECK_MINUTES * 60;
      if(!g_licAlerted)
        {
         Alert(EA_CODE, ": account ", AccountInfoInteger(ACCOUNT_LOGIN),
               " is not licensed (", msg, "). Register it on ", LICENSE_SERVER);
         g_licAlerted = true;
        }
     }
   else
     {
      g_licValid = LicInGrace();
      // site not reachable: retry after 1, 2, 5, 10, then every 15 minutes (not every minute
      // forever: each try can pause the EA for a few seconds while MT5 waits for the site)
      int waits[5] = { 1, 2, 5, 10, 15 };
      int w = waits[g_licFails < 4 ? g_licFails : 4];
      if(g_licValid && w < 5) w = 5;       // grace period active: no rush
      g_licFails++;
      g_licNextCheck = TimeLocal() + w * 60;
      Print(EA_CODE, " license check failed: ", msg, g_licValid ? " (grace period active)" : "");
     }
   return r;
  }

//--- public API ------------------------------------------------------
int LicenseOnInit()
  {
   if(LICENSE_ALLOW_TESTER && (MQLInfoInteger(MQL_TESTER) || MQLInfoInteger(MQL_OPTIMIZATION)))
     {
      g_licValid = true;
      return INIT_SUCCEEDED;
     }
   EventSetTimer(60);
   MathSrand((uint)(GetTickCount() ^ (uint)AccountInfoInteger(ACCOUNT_LOGIN)));
   int r = LicCheckNow();
   if(r == 0)
     {
      LicComment(EA_CODE + ": account not licensed. Register it on " + LICENSE_SERVER);
      return INIT_FAILED;
     }
   if(r == -1 && !g_licValid)
      LicComment(EA_CODE + ": " + g_licMessage);
   return INIT_SUCCEEDED;      // network problems: keep running, LicenseIsValid() blocks trading
  }

void LicenseOnTimer()
  {
   if(MQLInfoInteger(MQL_TESTER)) return;
   if(TimeLocal() < g_licNextCheck) return;
   int r = LicCheckNow();
   if(g_licValid)
     {
      // only clear our own licence message, never the EA's own panel
      if(StringFind(g_licComment, EA_CODE + ":") == 0) LicComment("");
     }
   else LicComment(EA_CODE + ": " + (r == 0 ? "account not licensed. Register it on " + LICENSE_SERVER : g_licMessage));
  }

void LicenseOnDeinit()
  {
   EventKillTimer();
   g_licComment = "";
   Comment("");
  }

bool LicenseIsValid() { return g_licValid; }
//+------------------------------------------------------------------+
