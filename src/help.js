// "Blocked by your broker?" help: a ready-to-send email asking a prop firm / broker to enable EA trading.
// The email names the EA (KATANA) but never the vendor, so it reads as the trader's own request.
const { esc } = require('./views');

module.exports = function help(app, { db, page }) {
  app.get('/help/ea-blocked', (req, res) => {
    const accounts = req.user
      ? db.prepare('SELECT account_number, label FROM accounts WHERE user_id = ? ORDER BY created_at').all(req.user.id)
      : [];
    const pick = String(req.query.account || (accounts[0] && accounts[0].account_number) || '').replace(/\D/g, '').slice(0, 20);
    const name = req.user ? req.user.name || '' : '';
    const acctField = accounts.length
      ? `<select id="eb-acct">${accounts.map((a) => `<option value="${esc(a.account_number)}"${a.account_number === pick ? ' selected' : ''}>${esc(a.account_number)}${a.label ? ` · ${esc(a.label)}` : ''}</option>`).join('')}</select>`
      : `<input id="eb-acct" inputmode="numeric" placeholder="e.g. 14337344" value="${esc(pick)}">`;
    page(req, res, 'EA blocked by your broker', `
    <div class="prose eb">
      <h1>EA blocked by your broker?</h1>
      <p class="lead left">If MT5 shows <strong>"AutoTrading disabled by server"</strong>, your prop firm or broker has switched off EA trading on that account. Only their support team can switch it on. Most firms do it within a day when you ask.</p>

      <div class="card eb-check">
        <h2>First, rule out the quick fix</h2>
        <p>If the message says <strong>"disabled by client"</strong> instead, it is your own MT5: press the <strong>Algo Trading</strong> button in the top toolbar so it turns green, and make sure <em>Allow Algo Trading</em> is ticked in the EA's settings. No email needed.</p>
      </div>

      <div class="card">
        <h2>Fill in your details</h2>
        <div class="eb-fields">
          <label>MT5 account number${acctField}</label>
          <label>Server <input id="eb-server" placeholder="e.g. FundedNext-Server 2"></label>
          <label>Your name <input id="eb-name" value="${esc(name)}" placeholder="Your full name"></label>
        </div>
      </div>

      <div class="card">
        <div class="eb-head"><h2>Email to support</h2><button type="button" class="small" data-copy="eb-email">Copy email</button></div>
        <p class="muted">Paste it into an email or the support ticket form. Copy the subject line first if they ask for one.</p>
        <div class="eb-subj"><span class="muted">Subject</span> <b id="eb-subject"></b> <button type="button" class="small secondary" data-copy="eb-subject">Copy</button></div>
        <pre id="eb-email" class="eb-text"></pre>
      </div>

      <div class="card">
        <div class="eb-head"><h2>Short version for live chat</h2><button type="button" class="small" data-copy="eb-chat">Copy</button></div>
        <pre id="eb-chat" class="eb-text"></pre>
      </div>

      <div class="card">
        <h2>If they ask for more</h2>
        <ul>
          <li>Some firms ask for the EA's name or the file before they approve it. Answer honestly: it is <strong>KATANA</strong>, a risk-management EA, and you can send them the .ex5 file.</li>
          <li>Check your firm's rules on EAs first. Some allow risk-management and trade-management EAs but not EAs that trade on their own.</li>
          <li>Once they confirm, restart MT5 and attach the EA again.</li>
        </ul>
      </div>
    </div>
    <script src="/help.js"></script>`);
  });
};
