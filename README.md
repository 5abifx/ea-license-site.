# EA Licensing Website

A small website that keeps your MT5 Expert Advisors licensed:

- **Customers** sign in, download the EAs they own, and register up to 10 MT5 account numbers.
- **The EA** asks the website on start-up (and every hour) whether the current MT5 account is registered. If not, it does not trade.
- **You (admin)** add EAs, approve or create customers, choose which EAs each customer gets, set an optional expiry date, and see when each account last checked in.

It supports any number of EAs. Each EA has a short *license code* (for example `GOLD_SCALPER`) that is written into the EA's source.

## 1. Run it

Needs Node.js 20.12 or newer.

```bash
npm install
cp .env.example .env      # then edit .env: SESSION_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm start                 # http://localhost:3000
```

Sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`. The admin is only created on the very first start; change the password afterwards from the **Password** page.

Everything (database + uploaded EA files) lives in the `data/` folder. **Back that folder up.**

### Settings (.env)

| Setting | Meaning |
| --- | --- |
| `SIGNUP_MODE` | `approval` (default): customers create an account, you click **Approve** in Admin. `closed`: only you create customers. `open`: anyone who signs up gets access immediately. |
| `MAX_ACCOUNTS` | Account limit for new customers (default 10). You can change it per customer in Admin. |
| `SESSION_SECRET` | Long random text. Changing it signs everyone out. |
| `COOKIE_SECURE` | Set to `true` once the site is on https. |
| `SITE_NAME` | Name shown in the header. |
| `TRIAL_DAYS` | Free trial for new sign ups, in days (default 15). Trial users are active straight away with every EA. `0` turns the trial off and `SIGNUP_MODE` decides instead. |
| `TRIAL_ACCOUNTS` | MT5 accounts a trial user can register (default 1). Each MT5 account number can only be used for one trial. |
| `PRICE_TEXT` | Price shown on the site, e.g. `$30/month`. |
| `PAID_DAYS` | Days added when you click **Mark as paid** on a user in Admin (default 30). |
| `PAYMENT_URL` | Optional link for the **Subscribe** button (payment page or Discord invite). |

## 2. Put it online

Any host that runs Node.js and keeps files on disk works:

- **A small VPS** (Hetzner, DigitalOcean, Contabo, ~5 USD/month): install Node, run `npm start` with `pm2` or systemd, put Caddy or Nginx in front for https.
- **Docker**: `docker build -t ea-license . && docker run -d -p 3000:3000 -v ealicense:/data --env-file .env ea-license`
- **Railway / Render / Fly.io**: deploy the repo and attach a persistent volume mounted at `/data` (set `DATA_DIR=/data`). Without a persistent volume your customers and accounts are lost on every deploy.

Use a real domain with https, e.g. `https://license.yourbrand.com`. That address is what goes in the EA.

## 3. Protect your EA

Copy `mql5/LicenseCheck.mqh` next to your EA source and add:

```mql5
#define EA_CODE        "GOLD_SCALPER"                 // same license code as in Admin > EAs
#define LICENSE_SERVER "https://license.yourbrand.com" // your site, no trailing slash
#include "LicenseCheck.mqh"

int  OnInit()                  { int r = LicenseOnInit(); if(r != INIT_SUCCEEDED) return r; /* your code */ return INIT_SUCCEEDED; }
void OnDeinit(const int reason){ LicenseOnDeinit(); }
void OnTimer()                 { LicenseOnTimer(); }
void OnTick()                  { if(!LicenseIsValid()) return; /* your trading code */ }
```

See `mql5/ExampleEA.mq5` for the full example. Compile, then upload the `.ex5` in **Admin → EAs**. Never give customers the `.mq5` source.

What the EA does:

- On start it checks the account. Not registered → it shows an alert and stops.
- It re-checks every 60 minutes, so removing an account, disabling a customer, or an expired license stops the EA within an hour.
- If your server is unreachable, it keeps trading for up to 24 hours after the last successful check (`LICENSE_GRACE_HOURS`), then pauses until the server is back.
- Backtests in the Strategy Tester are allowed (`LICENSE_ALLOW_TESTER`), because MT5 blocks web requests in the tester.
- Change `LICENSE_SALT` to any number of your own in each EA.

Customers must allow your site in MT5: **Tools → Options → Expert Advisors → Allow WebRequest for listed URL** and add your site address. The customer dashboard shows them the exact address.

The EA also receives `latest_version` from the server, so you can show an "update available" message if you like.

## Trade Journal

A separate, read-only EA (`mql5/TradeJournal.mq5`) logs every closed trade to the website. It never opens or closes trades, so customers can run it next to KATANA or any other EA without them affecting each other.

**Set it up once (admin):**

1. Set `LICENSE_SERVER` in `TradeJournal.mq5` to your site, compile it, and keep `LicenseCheck.mqh` next to it.
2. Admin → EAs → add an EA named *Trade Journal* with license code `JOURNAL` and upload the `.ex5`.
3. Give it to the customers who bought the journal (or to everyone, as a bundle with KATANA).

**What the customer does:** downloads it from *My EAs*, attaches it to its own chart (MT5 runs one EA per chart, so a second chart next to KATANA, any symbol) once per MT5 account, and pastes the *Journal key* shown on their **Journal** page into the EA inputs.

**What gets logged per trade:** symbol, side, lots, entry/exit, initial SL/TP, open/close time, net P&L with commission and swap, pips, R multiple, risk %, account %, best/worst price while open, magic number, every partial close, and the candles around the trade (40 before entry, 20 after exit, on the timeframe chosen in the inputs). Trades are re-sent once the candles after the exit exist, and trades closed while MT5 was offline are sent on the next start (`CatchUpDays`). A local copy is written to `MQL5/Files/Common/TradeJournal/`.

**On the website** the Journal page shows win rate, net P&L, profit factor and average R, a list of trades, notes per trade (setup, emotion, mistakes, rating), and two share cards per trade (result + chart) in four designs and three sizes, saved as PNG.

The journal API (`POST /api/journal/trades`) only accepts trades with the customer's journal key, from an account registered on their dashboard, while their `JOURNAL` license is active and not expired.

## Daily use

- **New EA**: Admin → EAs → *Add a new EA* (name, license code, version, file). Tick *Give to all active users* or choose per customer.
- **New version**: open the EA in Admin → EAs, bump the version, upload the new file, Save. Customers download it from their dashboard.
- **New customer** (`approval` mode): they sign up, you click **Approve** after payment. Approving gives them all active EAs; untick any they did not buy in *Manage*.
- **Subscription**: set *Expires* on the customer. After that date their EAs stop.
- **Find who uses an account**: search the account number in Admin.

## License check API

`GET /api/check?ea=GOLD_SCALPER&account=51234567`

```json
{"valid":true,"message":"OK","ea":"GOLD_SCALPER","account":"51234567","server_time":"...","expires":"","latest_version":"1.2"}
```

`valid` is `true` only when the account belongs to an active, unexpired customer who has that EA.

## Tests

```bash
npm test
```
