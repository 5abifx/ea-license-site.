# 5ABI Journal for NinjaTrader 8

Sends every closed trade on your NinjaTrader accounts to the 5ABI.FX journal (same licence as the MT5 Trade Journal, code `JOURNAL`). It never places or changes orders.

## Owner: make the file customers download
1. Copy `Journal5ABI.cs` to `Documents\NinjaTrader 8\bin\Custom\Indicators\`.
2. New > NinjaScript Editor > press **F5**. Red errors? Send a screenshot with the line numbers.
3. Tools > Export > NinjaScript Add-On > add indicator **Journal5ABI**, tick **Export as compiled assembly** > Export. You get a .zip.
4. Website: Admin > EAs > Trade Journal > **NinjaTrader 8 file** > pick the .zip > Save.

## Customer
1. Journal page > Connect box > download the NinjaTrader journal.
2. NinjaTrader: Tools > Import > NinjaScript Add-On > pick the .zip.
3. Any chart > right-click > Indicators > add **5ABI Journal**, paste the journal key, OK. One chart is enough.
4. Add the account names shown on the panel (e.g. `Sim101`) on My EAs.

Times are sent like MT5 broker time (New York + 7 h). Older trades: NinjaTrader only gives the executions it still holds (usually today's), so the journal starts from install day.
