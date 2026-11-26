# 5ABI Journal for Quantower

A Quantower strategy that sends every closed trade on your Quantower accounts to the 5ABI.FX journal (same licence as the MT5 Trade Journal, code `JOURNAL`). It never places or changes orders.

## Owner: build the file customers download
1. Needs the free .NET 8 SDK (`dotnet --version`).
2. Find `TradingPlatform.BusinessLayer.dll` in your Quantower folder (`Quantower\TradingPlatform\v1.xx.x\bin\`).
3. In this folder: `dotnet build -c Release -p:QuantowerBin="<that bin folder>"`. Red errors? Send them with the line numbers.
4. Make a folder `5ABI Journal`, put `bin\Release\5ABI Journal.dll` inside, zip the folder.
5. Website: Admin > EAs > Trade Journal > **Quantower file** > pick the .zip > Save.

## Customer
1. Journal page > Connect box > download the Quantower journal, unzip.
2. Copy the `5ABI Journal` folder into `Quantower\Settings\Scripts\Strategies\`, restart Quantower.
3. Strategies Manager > add **5ABI Journal**, paste the journal key, Start.
4. Add the account names shown in its panel on My EAs.

Times are sent like MT5 broker time (New York + 7 h). On start it also sends trades from the last 30 days that the broker still has.
