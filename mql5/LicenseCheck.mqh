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
#ifndef LICENSE_SALT
   #define LICENSE_SALT 7719283            // change this number per EA
#endif

bool     g_licValid     = false;
datetime g_licNextCheck = 0;
string   g_licMessage   = "";
bool     g_licAlerted   = false;

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
   int http = WebRequest("GET", url, "", 10000, data, result, resHeaders);
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
   int r = LicRequest(msg);
   g_licMessage = msg;
   if(r == 1)
     {
      g_licValid = true;
      g_licAlerted = false;
      LicSaveOk();
      g_licNextCheck = TimeLocal() + LICENSE_RECHECK_MINUTES * 60;
      Print(EA_CODE, " license OK for account ", AccountInfoInteger(ACCOUNT_LOGIN));
     }
   else if(r == 0)
     {
      g_licValid = false;
      LicClearOk();
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
      g_licNextCheck = TimeLocal() + 60;   // retry in a minute
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
   int r = LicCheckNow();
   if(r == 0)
     {
      Comment(EA_CODE, ": account not licensed. Register it on ", LICENSE_SERVER);
      return INIT_FAILED;
     }
   if(r == -1 && !g_licValid)
      Comment(EA_CODE, ": ", g_licMessage);
   return INIT_SUCCEEDED;      // network problems: keep running, LicenseIsValid() blocks trading
  }

void LicenseOnTimer()
  {
   if(MQLInfoInteger(MQL_TESTER)) return;
   if(TimeLocal() < g_licNextCheck) return;
   int r = LicCheckNow();
   if(g_licValid) Comment("");
   else Comment(EA_CODE, ": ", r == 0 ? "account not licensed. Register it on " + LICENSE_SERVER : g_licMessage);
  }

void LicenseOnDeinit()
  {
   EventKillTimer();
   Comment("");
  }

bool LicenseIsValid() { return g_licValid; }
//+------------------------------------------------------------------+
