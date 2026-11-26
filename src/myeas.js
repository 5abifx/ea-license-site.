// My EAs page (/dashboard): one card per tool with what it does, its key features and the MT5 install steps.
// Tools the member does not have yet still show, locked, with why they need it and where to unlock it.
// Chart themes get their own section with a colour preview. Accounts show whether an EA checked in lately.
const { esc, fmtDate } = require('./views');
const { db } = require('./db');

// what each tool does; codes match Admin > EAs. Tools not listed here show only when the member has them.
const TOOLS = {
  KATANA: {
    kind: 'Risk manager', glow: 'rgba(255,90,31,.55)', icon: 'shield',
    why: 'Sizes every trade to your risk and stops you before a bad day becomes a blown account.',
    feats: ['Lot size from your risk % and stop, in one click', 'Daily loss lock that closes and blocks trading', 'Split take-profits and automatic break-even', 'News lock around high-impact releases'],
    steps: ['In MT5: File → Open Data Folder → MQL5 → Experts. Put the downloaded file there.', 'Restart MT5, or right-click Expert Advisors in the Navigator → Refresh.',
      'Add the website address below in Tools → Options → Expert Advisors (Allow WebRequest).', 'Drag KATANA onto one chart, set your risk %, and switch on Algo Trading.'],
    unlock: { href: '/pricing', label: 'See plans' },
  },
  JOURNAL: {
    kind: 'Trade journal', glow: 'rgba(47,211,180,.45)', icon: 'journal',
    why: 'Sends every closed trade to your journal with its real chart, so the Desk and Insights can find what costs you money.',
    feats: ['Every trade logged with entry, stop, target and candles', 'Trade replay and share cards come from it', 'Feeds the news calendar on your Desk', 'Light: runs on its own chart next to KATANA'],
    steps: ['Copy your journal key from the Journal page.', 'Put the file in MQL5 → Experts and refresh the Navigator.',
      'Drag it onto any one chart (one chart is enough), paste the key, switch on Algo Trading.', 'Close a trade: it shows in your journal within a minute.'],
    unlock: { href: '/pricing', label: 'See plans' }, extra: { href: '/journal', label: 'Open journal' },
  },
  COMPASS: {
    kind: 'Directional bias', glow: 'rgba(120,140,255,.4)', icon: 'compass',
    why: 'Shows where the day is likely to go before you take a trade, on the chart you already use.',
    feats: ['Daily and weekly levels drawn for you', 'The session bias in one glance', 'Marks untouched levels until price reaches them', 'Matches the 5ABI.FX chart themes'],
    steps: ['Put the file in MQL5 → Indicators and refresh the Navigator.', 'Keep the Trade Journal EA running on any chart in the same MT5: it unlocks the indicator.',
      'Drag Auction Compass onto your chart, or load a chart theme "with Auction Compass" below.'],
    unlock: { href: '/faq', label: 'How to get access', note: 'Students only' },
  },
};

const ICONS = {
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  journal: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 4v4M9 13h.01M15 13h.01"/>',
};
const icon = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ICONS.bot}</svg>`;

// chart theme preview: a few candles in the theme's own colours (from the .tpl files)
const THEMES = [
  { name: 'Ember', bg: '#0a0a0b', grid: '#1c1c1f', up: '#26c6a0', dn: '#f0464f', hollow: false },
  { name: 'Paper', bg: '#f5f3ef', grid: '#e6e2da', up: '#1b1b1d', dn: '#1b1b1d', hollow: true },
  { name: 'Cobalt', bg: '#000000', grid: '#10141c', up: '#3d8bff', dn: '#f0464f', hollow: false },
];
function themeSvg(t, seed) {
  let s = seed, p = 50; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const cs = Array.from({ length: 28 }, (_, i) => { const o = p; p += (i > 12 ? (seed % 2 ? 1.1 : -0.9) : 0) + (rnd() - 0.5) * 4; return [o, Math.max(o, p) + rnd() * 2, Math.min(o, p) - rnd() * 2, p]; });
  const hi = Math.max(...cs.map((c) => c[1])), lo = Math.min(...cs.map((c) => c[2])), y = (v) => (6 + (1 - (v - lo) / (hi - lo || 1)) * 72).toFixed(1), bw = 300 / cs.length;
  let out = `<svg viewBox="0 0 300 84" preserveAspectRatio="none" aria-hidden="true"><rect width="300" height="84" fill="${t.bg}"/>`;
  [21, 42, 63].forEach((g) => { out += `<line x1="0" x2="300" y1="${g}" y2="${g}" stroke="${t.grid}"/>`; });
  cs.forEach(([o, h, l, c], i) => { const x = i * bw + bw / 2, up = c >= o, col = up ? t.up : t.dn;
    out += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${y(h)}" y2="${y(l)}" stroke="${col}"/><rect x="${(x - bw * 0.3).toFixed(1)}" width="${(bw * 0.6).toFixed(1)}" y="${Math.min(y(o), y(c))}" height="${Math.max(1, Math.abs(y(o) - y(c))).toFixed(1)}" fill="${up && t.hollow ? t.bg : col}" stroke="${col}"/>`; });
  return out + '</svg>';
}

// setup steps for a new member: each one ticks itself from what the site can see
// (an account added, an EA checking in, a first journal trade); "allow the website" can also be ticked by hand.
function setupSteps({ eas, accounts, hasJournal, trades, site }) {
  const ea = eas.find((e) => e.code === 'KATANA') || eas.find((e) => e.code !== 'JOURNAL') || eas[0];
  const jr = eas.find((e) => e.code === 'JOURNAL');
  const seenAny = accounts.some((a) => a.last_check_at);
  const T = (ea && TOOLS[ea.code]) || { steps: [] };
  const dl = (e, label) => (e && e.file_path ? `<a class="mx-pill" href="/download/${e.id}">${esc(label)} <span aria-hidden="true">↓</span></a>` : '<span class="muted small">Download coming soon</span>');
  const steps = [
    { key: 'acc', label: 'Add your MT5 account', short: 'Account', done: accounts.length > 0,
      sub: accounts.length ? `${esc(accounts[0].account_number)} added` : 'The EAs only run on accounts listed here',
      body: `<h2>Add your MT5 account number</h2>
        <p>The EAs only run on account numbers listed here. Find yours in MT5 under <b>File → Login to Trade Account</b>, or at the top of the Navigator window.</p>
        <form method="post" action="/accounts" class="mx-inp">
          <input name="account_number" placeholder="MT5 number, e.g. 51234567, or NinjaTrader / Quantower account name" pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,39}" required aria-label="Account number or name">
          <input name="label" placeholder="Note (optional), e.g. IC Markets live" maxlength="60" aria-label="Note">
          <button class="mx-pill">Add account <span aria-hidden="true">→</span></button></form>` },
    { key: 'allow', label: 'Allow this website in MT5', short: 'Allow site', done: seenAny, manual: true, sub: 'One setting, once',
      body: `<h2>Allow this website in MT5</h2>
        <p>Your EAs check your licence with this website. MT5 blocks that until you add the address once.</p>
        <div class="mx-path"><span>Tools</span><span>Options</span><span>Expert Advisors</span><span>Allow WebRequest for listed URL</span></div>
        <div class="mx-copy mx-g"><code>${esc(site)}</code><button type="button" class="mx-pill sm" data-copy="${esc(site)}">Copy</button></div>
        <div class="mx-act"><button type="button" class="mx-pill" data-did="allow">I did this <span aria-hidden="true">→</span></button></div>
        <p class="mx-tip">Prop firm says "AutoTrading disabled by server"? <a href="/help/ea-blocked">Get a ready-to-send email</a> for their support.</p>` },
    ...(ea ? [{ key: 'ea', label: `Download and attach ${ea.name}`, short: ea.code === 'KATANA' ? 'KATANA' : 'EA', done: seenAny, sub: 'Ticks when it checks in',
      body: `<h2>Download and attach ${esc(ea.name)}</h2>
        ${T.steps.length ? `<ol class="mx-ol">${T.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : '<p>Put the file in MQL5 → Experts, refresh the Navigator and drag it onto a chart.</p>'}
        <div class="mx-act">${dl(ea, `Download ${ea.name}`)}</div>
        <p class="mx-tip">This step ticks by itself a minute after the EA checks in from your account.</p>` }] : []),
    ...(hasJournal && jr && jr !== ea ? [{ key: 'jr', label: 'Connect the Trade Journal', short: 'Journal', done: trades > 0, sub: 'Ticks on your first trade',
      body: `<h2>Connect the Trade Journal</h2>
        <ol class="mx-ol"><li>Copy your journal key from the Journal page.</li><li>Put the file in MQL5 → Experts and refresh the Navigator.</li>
          <li>Drag it onto one extra chart (any symbol), paste the key and switch on Algo Trading.</li><li>Close a trade: it shows in your journal within a minute.</li></ol>
        <div class="mx-act">${dl(jr, 'Download Trade Journal')}<a class="mx-ghost" href="/journal">Get my journal key →</a></div>` }] : []),
  ];
  steps.push({ key: 'app', label: 'Get the app', short: 'App', opt: true, done: false, sub: 'Optional, phone or PC',
    body: `<h2>Put 5ABI.FX on your home screen</h2>
      <p>Open your journal and Desk in one tap, full screen, on your phone or PC. Nothing to download from a store.</p>
      <div class="mx-act"><a class="mx-pill" href="/?install=1">Show me how <span aria-hidden="true">→</span></a></div>` });
  return steps;
}

function html({ u, eas, allEas, accounts, full, student, hasJournal, notices, site, refCard, isStudentOnly }) {
  const owned = new Set(eas.map((e) => e.code));
  // owned tools first, then the known tools they do not have yet (locked)
  const cards = [...eas.map((e) => ({ e, locked: false })),
    ...allEas.filter((e) => TOOLS[e.code] && !owned.has(e.code)).map((e) => ({ e, locked: true }))];
  const card = ({ e, locked }) => {
    const T = TOOLS[e.code] || { kind: e.description || 'Expert Advisor', feats: [], steps: [], glow: 'rgba(140,140,150,.35)', icon: 'bot' };
    const cta = locked
      ? `<a class="mx-ghost hi" href="${T.unlock.href}">${esc(T.unlock.label)} →</a>`
      : `${e.file_path ? `<a class="mx-pill" href="/download/${e.id}">Download <span aria-hidden="true">↓</span></a>` : '<span class="muted small">Coming soon</span>'}${T.extra && hasJournal ? `<a class="mx-ghost" href="${T.extra.href}">${esc(T.extra.label)}</a>` : ''}`;
    return `<article class="ea-card mx-g mx-tool${locked ? ' locked' : ''}" style="--glow:${T.glow}">
      <div class="ea-top"><span class="ea-ico">${icon(locked ? 'lock' : T.icon)}</span>
        <div><div class="ea-name">${esc(e.name)}</div><div class="ea-kind">${esc(T.kind)}</div></div>
        <span class="tag ${locked ? 'lock' : 'ok'}">${locked ? (T.unlock.note ? esc(T.unlock.note) : 'Locked') : 'Unlocked'}</span></div>
      ${T.why ? `<p class="ea-why">${esc(T.why)}</p>` : e.description ? `<p class="ea-why">${esc(e.description)}</p>` : ''}
      ${T.feats.length ? `<ul class="ea-feat">${T.feats.slice(0, 3).map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      ${!locked && T.steps.length ? `<details class="ea-how"><summary>How to install</summary><ol>${T.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}
      <div class="ea-foot">${cta}${locked ? '' : `<span class="mx-ver">v${esc(e.version)}</span>`}</div>
    </article>`;
  };
  const now = Date.now();
  const ago = (t) => {
    const h = (now - Date.parse(String(t).replace(' ', 'T') + 'Z')) / 3600e3;
    if (!Number.isFinite(h)) return [99, fmtDate(t)];
    return [h, h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`];
  };
  const seen = (a) => {
    if (!a.last_check_at) return ['off', 'EA not seen yet'];
    const [h, txt] = ago(a.last_check_at);
    return [h <= 24 ? 'on' : 'off', `EA seen ${txt}`];
  };
  const withCompass = student && eas.some(isStudentOnly);
  const trades = hasJournal ? (db.prepare('SELECT COUNT(*) n FROM journal_trades WHERE user_id = ?').get(u.id) || {}).n || 0 : 0;
  const steps = setupSteps({ eas, accounts, hasJournal, trades, site });
  const need = steps.filter((s) => !s.opt);
  const doneN = need.filter((s) => s.done).length;
  const allDone = doneN === need.length;
  const first = String(u.name || '').trim().split(/\s+/)[0];
  const hi = first ? `, ${esc(first.slice(0, 20))}` : '';
  const last = accounts.filter((a) => a.last_check_at).sort((a, b) => String(b.last_check_at).localeCompare(String(a.last_check_at)))[0];
  const R = 58, C = +(2 * Math.PI * R).toFixed(1);

  return `<link rel="stylesheet" href="/myeas.css?v=1">
  <div class="mx-amb" aria-hidden="true"><i></i><i></i><i></i></div>
  <section class="mx-hero">
    <div>
      <div class="mx-chips"><span class="mx-chip mx-g"><b>${eas.length}</b> of ${cards.length} tools unlocked</span><span class="mx-chip mx-g"><b>${accounts.length}</b> of ${u.max_accounts} MT5 accounts</span></div>
      <h1>${allDone ? `Welcome back${hi}. <em>${owned.has('KATANA') ? 'KATANA' : 'Your EA'}</em> is on guard.` : `Welcome${hi}. Let's get you <em>protected</em>.`}</h1>
      <p class="mx-lede">${allDone ? 'Your tools are running. Downloads, accounts and chart themes are all here.' : `${need.length} short steps and your EAs are guarding your MT5 account. It takes about five minutes.`}</p>
    </div>
    ${allDone ? '' : `<div class="mx-ring" role="img" aria-label="${doneN} of ${need.length} steps done">
      <svg viewBox="0 0 132 132"><defs><linearGradient id="mxg"><stop offset="0" stop-color="#ff5a1f"/><stop offset="1" stop-color="#ffb07a"/></linearGradient></defs>
        <circle cx="66" cy="66" r="${R}" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="6"/>
        <circle cx="66" cy="66" r="${R}" fill="none" stroke="url(#mxg)" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${(C * (1 - doneN / need.length)).toFixed(1)}"/></svg>
      <div><b>${doneN}/${need.length}</b><span>steps done</span></div></div>`}
  </section>
  ${notices}
  ${allDone ? `<section class="mx-done mx-g"><span class="mx-live"></span><span><b>All set.</b> <span class="muted">${last ? `EA seen ${ago(last.last_check_at)[1]} on ${esc(last.account_number)}` : ''}${hasJournal && trades ? ` · Journal has ${trades} trade${trades === 1 ? '' : 's'}` : ''}</span></span><button type="button" class="mx-ghost" data-open-setup>Setup steps</button></section>` : ''}
  <section class="mx-setup mx-g" data-setup${allDone ? ' hidden' : ''} aria-label="Setup steps">
    <div class="mx-steps" role="tablist">${steps.map((s, i) => `<button type="button" role="tab" class="mx-st${s.done ? ' done' : ''}${s.opt ? ' opt' : ''}" data-step="${s.key}"${s.manual ? ' data-manual' : ''}>
      <i>${s.done ? '✓' : s.opt ? '+' : i + 1}</i><div><span class="l">${esc(s.label)}</span><span class="s">${esc(s.short)}</span><small>${s.sub}</small></div></button>`).join('')}</div>
    ${steps.map((s, i) => `<div class="mx-focus" data-panel="${s.key}" hidden><span class="mx-k">${s.opt ? 'Optional' : `Step ${i + 1} of ${need.length}`}${s.done ? ' · Done' : ''}</span>${s.body}</div>`).join('')}
  </section>

  <div class="mx-sec"><h2>Your tools</h2><span>${eas.length} of ${cards.length} unlocked</span></div>
  ${cards.length ? `<div class="ea-cards mx-tools">${cards.map(card).join('')}</div>` : '<section class="card mx-g"><p class="muted">No EAs are assigned to your account yet.</p></section>'}

  <div class="mx-lower">
  <section class="card mx-g mx-box" id="accounts">
    <div class="row between"><h2>Your MT5 accounts</h2><span class="muted small">${accounts.length} of ${u.max_accounts}</span></div>
    ${accounts.length ? `<div class="acc-list">${accounts.map((a) => { const [st, txt] = seen(a); return `<div class="acc-row">
      <span class="acc-n"><i class="acc-dot ${st}" aria-hidden="true"></i><strong>${esc(a.account_number)}</strong>${a.label ? `<span class="muted"> · ${esc(a.label)}</span>` : ''}</span>
      <span class="muted small">${txt}</span>
      <form method="post" action="/accounts/${a.id}/delete" onsubmit="return confirm('Remove account ${esc(a.account_number)}? The EA will stop on it.')"><button class="small danger">Remove</button></form></div>`; }).join('')}</div>` : '<p class="muted small">No accounts yet. The EAs only run on account numbers listed here.</p>'}
    ${full ? '<p class="muted small">You have reached the maximum number of accounts. Remove one to add another.</p>' : `
    <form method="post" action="/accounts" class="mx-inp acc-add">
      <input name="account_number" placeholder="MT5 number or NinjaTrader / Quantower name" pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,39}" required aria-label="Account number or name">
      <input name="label" placeholder="Note (optional)" maxlength="60" aria-label="Note">
      <button class="mx-pill sm">Add account</button>
    </form>`}
    <p class="muted small">MT5: the number under File → Login to Trade Account. NinjaTrader / Quantower: the account name exactly as the 5ABI Journal panel shows it (e.g. Sim101).</p>
  </section>

  <section class="card mx-g mx-box ea-themes">
    <div class="row between"><h2>Chart themes</h2><span class="muted small">KATANA and Compass match them</span></div>
    <div class="th-grid">${THEMES.map((t, i) => `<div class="th">
      <div class="th-pic">${themeSvg(t, 7 + i * 13)}</div>
      <div class="th-row"><b>${t.name}</b><span><a href="/templates/5ABI.FX%20${t.name}.tpl" download>Download</a>${withCompass ? ` · <a href="/templates/5ABI.FX%20${t.name}%20Compass.tpl" download>with Compass</a>` : ''}</span></div></div>`).join('')}</div>
    <p class="muted small">Put the file in <strong>MQL5 → Profiles → Templates</strong>, then right-click a chart → <strong>Templates</strong>.</p>
    ${withCompass ? '<p class="muted small">Auction Compass unlocks by itself while the Trade Journal EA runs on any chart in the same MT5.</p>' : ''}
  </section>
  </div>

  <div class="mx-help">
    <a class="mx-g" href="/faq"><b>Help and FAQ</b><span>Install, accounts, billing</span></a>
    <a class="mx-g" href="/help/ea-blocked"><b>EA blocked by my prop firm</b><span>Ready-to-send email for their support</span></a>
    <a class="mx-g" href="/pricing"><b>Plans</b><span>Unlock more tools</span></a>
  </div>
  ${refCard ? `<div class="mx-lower">${refCard}</div>` : ''}
  <script src="/myeas.js?v=1"></script>`;
}

module.exports = { html, TOOLS };
