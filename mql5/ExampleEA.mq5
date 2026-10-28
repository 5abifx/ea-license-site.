//+------------------------------------------------------------------+
//| ExampleEA.mq5 - shows where the license calls go in your EA       |
//+------------------------------------------------------------------+
#property copyright "Your Company"
#property version   "1.00"

#define EA_CODE        "GOLD_SCALPER"            // must match the EA's license code in the admin area
#define LICENSE_SERVER "https://your-domain.com" // your website address, no trailing slash
#include "LicenseCheck.mqh"

int OnInit()
  {
   int lic = LicenseOnInit();
   if(lic != INIT_SUCCEEDED) return lic;

   // ... your normal OnInit code ...
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   LicenseOnDeinit();
  }

void OnTimer()
  {
   LicenseOnTimer();
   // ... your own timer code, if any ...
  }

void OnTick()
  {
   if(!LicenseIsValid()) return;   // no trading without a valid license

   // ... your trading logic ...
  }
//+------------------------------------------------------------------+
