//+------------------------------------------------------------------+
//| 5ABI_Licence.mq5 - unlocks 5ABI.FX indicators on this account     |
//|                                                                  |
//| MT5 indicators can't contact a website, so this tiny EA checks   |
//| your licence on the 5ABI.FX site and the indicators read the     |
//| result. It never trades. You only need it if the Trade Journal   |
//| EA is not running in this MT5 (the Journal EA does the same).    |
//| Attach it to any one chart and leave it there.                   |
//+------------------------------------------------------------------+
#property copyright   "5ABI.FX"
#property version     "1.00"
#property description "Unlocks 5ABI.FX indicators (Auction Compass) on this account. Never trades."

#define LICENSE_SERVER "https://5abifx.com"   // no trailing slash
#include "LicenseRelay.mqh"

int OnInit()
  {
   EventSetTimer(60);
   Show();
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
  }

void OnTimer()
  {
   RelayOnTimer();
   Show();
  }

void OnTick() {}

void Show()
  {
   if(g_relayNext == 0) RelayOnTimer();
   string s = g_relayStatus;
   if(StringFind(s, "not checked") >= 0)
      s += "\nAllow " + LICENSE_SERVER + " in Tools > Options > Expert Advisors > Allow WebRequest";
   else if(StringFind(s, "not active") >= 0)
      s += "\nAdd account " + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN)) + " on " + LICENSE_SERVER;
   Comment("5ABI.FX LICENCE\n", s);
  }
