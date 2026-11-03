//+------------------------------------------------------------------+
//| LicenseRelay.mqh - licence checks for 5ABI.FX INDICATORS          |
//|                                                                  |
//| MT5 indicators are not allowed to call WebRequest, so they can't |
//| ask the website themselves. An EA that includes this file asks   |
//| the site for each indicator code below and leaves a signed note  |
//| (terminal global variables). The indicator only reads the note.  |
//|                                                                  |
//| Used by TradeJournal.mq5. RELAY_SALT must be the same text as in |
//| the indicators.                                                  |
//+------------------------------------------------------------------+
#ifndef LICENSE_RELAY_MQH
#define LICENSE_RELAY_MQH

#ifndef LICENSE_SERVER
   #error "Define LICENSE_SERVER before including LicenseRelay.mqh"
#endif

#define RELAY_SALT "5abi.fx-relay-6271"
string   RELAY_CODES[] = { "COMPASS" };   // licence codes of the indicators (Admin > EAs)
datetime g_relayNext   = 0;
string   g_relayStatus = "checking...";
bool     g_relayAllOk  = false;

//--- the same signature the indicators compute
double RelaySign(const string code, const long login, const double at)
  {
   string t = code + "|" + IntegerToString(login) + "|" + DoubleToString(at, 0) + "|" + RELAY_SALT;
   ulong h = 1469598103934665603;
   for(int i = 0; i < StringLen(t); i++)
      h = (h ^ (ulong)StringGetCharacter(t, i)) * 1099511628211;
   return (double)(h % 1000000007);
  }

string RelayGv(const string code, const long login, const string what)
  {
   return "5ABI_R_" + code + "_" + IntegerToString(login) + what;
  }

//--- 1 = licensed, 0 = not licensed, -1 = site not reachable
int RelayAsk(const string code, const long login)
  {
   string url = LICENSE_SERVER + "/api/check?ea=" + code + "&account=" + IntegerToString(login);
   char data[], res[];
   string hdr;
   ResetLastError();
   int http = WebRequest("GET", url, "", 10000, data, res, hdr);
   if(http != 200) return -1;
   string body = CharArrayToString(res, 0, WHOLE_ARRAY, CP_UTF8);
   bool valid = StringFind(body, "\"valid\":true") >= 0 &&
                StringFind(body, "\"account\":\"" + IntegerToString(login) + "\"") >= 0;
   return valid ? 1 : 0;
  }

//--- check every indicator code now. Returns false if the site could not be reached.
bool RelayCheckAll()
  {
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   if(login <= 0 || MQLInfoInteger(MQL_TESTER)) return false;
   bool reached = true;
   g_relayAllOk = true;
   string st = "";
   for(int i = 0; i < ArraySize(RELAY_CODES); i++)
     {
      string code = RELAY_CODES[i];
      int r = RelayAsk(code, login);
      if(r == 1)
        {
         double at = (double)TimeGMT();
         GlobalVariableSet(RelayGv(code, login, "_t"), at);
         GlobalVariableSet(RelayGv(code, login, "_s"), RelaySign(code, login, at));
        }
      else if(r == 0)
        {
         GlobalVariableDel(RelayGv(code, login, "_t"));
         GlobalVariableDel(RelayGv(code, login, "_s"));
        }
      else
         reached = false;            // keep the last note: the indicator allows a grace period
      if(r != 1) g_relayAllOk = false;
      st += (st == "" ? "" : ", ") + code + (r == 1 ? " unlocked" : r == 0 ? " not active for this account" : " site not reachable");
     }
   g_relayStatus = st;
   return reached;
  }

//--- call from OnTimer: every hour once unlocked, every 2 minutes while not (so a newly
//--- added account or product unlocks quickly), every minute while the site is unreachable
void RelayOnTimer()
  {
   if(TimeLocal() < g_relayNext) return;
   bool ok = RelayCheckAll();
   g_relayNext = TimeLocal() + (!ok ? 60 : g_relayAllOk ? 3600 : 120);
  }

#endif
