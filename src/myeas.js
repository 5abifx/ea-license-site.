// My EAs page (/dashboard): one card per tool with what it does, its key features and the MT5 install steps.
// Tools the member does not have yet still show, locked, with why they need it and where to unlock it.
// Chart themes get their own section with a colour preview. Accounts show whether an EA checked in lately.
const { esc, fmtDate } = require('./views');

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
    unlock: { href: '/mentorship', label: 'Unlock with mentorship', note: 'Students only' },
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

function html({ u, eas, allEas, accounts, full, student, hasJournal, notices, site, refCard, isStudentOnly }) {
  const owned = new Set(eas.map((e) => e.code));
  // owned tools first, then the known tools they do not have yet (locked)
  const cards = [...eas.map((e) => ({ e, locked: false })),
    ...allEas.filter((e) => TOOLS[e.code] && !owned.has(e.code)).map((e) => ({ e, locked: true }))];
  const card = ({ e, locked }) => {
    const T = TOOLS[e.code] || { kind: e.description || 'Expert Advisor', feats: [], steps: [], glow: 'rgba(140,140,150,.35)', icon: 'bot' };
    const cta = locked
      ? `<a class="btn" href="${T.unlock.href}">${esc(T.unlock.label)}</a>${T.unlock.note ? `<span class="muted small">${esc(T.unlock.note)}</span>` : ''}`
      : `${e.file_path ? `<a class="btn" href="/download/${e.id}">Download</a>` : '<span class="muted small">Coming soon</span>'}${T.extra && hasJournal ? `<a class="btn secondary" href="${T.extra.href}">${esc(T.extra.label)}</a>` : ''}`;
    return `<article class="ea-card${locked ? ' locked' : ''}" style="--glow:${T.glow}">
      <div class="ea-top"><span class="ea-ico">${icon(locked ? 'lock' : T.icon)}</span>
        <div><div class="ea-name">${esc(e.name)}</div><div class="ea-kind">${esc(T.kind)} · v${esc(e.version)}</div></div>
        <span class="tag ${locked ? 'lock' : 'ok'}">${locked ? 'Locked' : 'Unlocked'}</span></div>
      ${T.why ? `<p class="ea-why">${locked ? '<b>Why you need it:</b> ' : ''}${esc(T.why)}</p>` : e.description ? `<p class="ea-why">${esc(e.description)}</p>` : ''}
      ${T.feats.length ? `<ul class="ea-feat">${T.feats.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      ${!locked && T.steps.length ? `<details class="ea-how"><summary>How to install</summary><ol>${T.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}
      <div class="ea-foot">${cta}</div>
    </article>`;
  };
  const now = Date.now();
  const seen = (a) => {
    if (!a.last_check_at) return ['off', 'EA not seen yet'];
    const h = (now - Date.parse(String(a.last_check_at).replace(' ', 'T') + 'Z')) / 3600e3;
    if (!Number.isFinite(h)) return ['off', fmtDate(a.last_check_at)];
    const ago = h < 1 ? `${Math.max(1, Math.round(h * 60))} min ago` : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} days ago`;
    return [h <= 24 ? 'on' : 'off', `EA seen ${ago}`];
  };
  const withCompass = student && eas.some(isStudentOnly);

  return `
  <div class="row between page-head"><div><span class="kicker">Your trading tools</span><h1>Welcome${u.name ? ', ' + esc(u.name) : ''}</h1></div>
    <span class="muted small">${eas.length} of ${cards.length} unlocked</span></div>
  ${notices}
  ${cards.length ? `<div class="ea-cards">${cards.map(card).join('')}</div>` : '<section class="card"><p class="muted">No EAs are assigned to your account yet.</p></section>'}

  <section class="card ea-themes">
    <div class="row between"><h2>Chart themes</h2><span class="muted small">KATANA and Compass switch to the same colours by themselves</span></div>
    <div class="th-grid">${THEMES.map((t, i) => `<div class="th">
      <div class="th-pic">${themeSvg(t, 7 + i * 13)}</div>
      <div class="th-row"><b>${t.name}</b><span><a href="/templates/5ABI.FX%20${t.name}.tpl" download>Download</a>${withCompass ? ` · <a href="/templates/5ABI.FX%20${t.name}%20Compass.tpl" download>with Compass</a>` : ''}</span></div></div>`).join('')}</div>
    <p class="muted small">Put the file in <strong>File → Open Data Folder → MQL5 → Profiles → Templates</strong>, then right-click a chart → <strong>Templates</strong>.</p>
  </section>

  <div class="ea-lower">
  <section class="card">
    <div class="row between"><h2>Your MT5 accounts</h2><span class="tag">${accounts.length} / ${u.max_accounts}</span></div>
    <p class="muted small">The EAs only run on the account numbers listed here. Find the number in MT5 under File → Login to Trade Account, or at the top of the Navigator window.</p>
    ${accounts.length ? `<div class="acc-list">${accounts.map((a) => { const [st, txt] = seen(a); return `<div class="acc-row">
      <span class="acc-n"><i class="acc-dot ${st}" aria-hidden="true"></i><strong>${esc(a.account_number)}</strong>${a.label ? `<span class="muted"> · ${esc(a.label)}</span>` : ''}</span>
      <span class="muted small">${txt}</span>
      <form method="post" action="/accounts/${a.id}/delete" onsubmit="return confirm('Remove account ${esc(a.account_number)}? The EA will stop on it.')"><button class="small danger">Remove</button></form></div>`; }).join('')}</div>` : ''}
    ${full ? '<p class="muted small">You have reached the maximum number of accounts. Remove one to add another.</p>' : `
    <form method="post" action="/accounts" class="row acc-add">
      <input name="account_number" placeholder="MT5 account number, e.g. 51234567" inputmode="numeric" pattern="[0-9]{1,20}" required aria-label="MT5 account number">
      <input name="label" placeholder="Note (optional), e.g. IC Markets live" maxlength="60" aria-label="Note">
      <button>Add account</button>
    </form>`}
  </section>

  <section class="card ea-setup">
    <h2>Before the first run</h2>
    <div class="su-grid">
      <div class="su"><span class="kicker">Step 1</span><p>In MT5 go to <strong>Tools → Options → Expert Advisors</strong>, tick <strong>Allow WebRequest for listed URL</strong> and add:</p>
        <div class="su-copy"><code>${esc(site)}</code><button type="button" class="small secondary" data-copy="${esc(site)}">Copy</button></div></div>
      <div class="su"><span class="kicker">Step 2</span><p>Add your MT5 account number under <strong>Your MT5 accounts</strong>.</p></div>
      <div class="su"><span class="kicker">Step 3</span><p>Prop firm says <strong>"AutoTrading disabled by server"</strong>? <a href="/help/ea-blocked">Get a ready-to-send email</a> for their support.</p></div>
    </div>
    ${withCompass ? '<p class="muted small">Indicators like Auction Compass unlock by themselves while the Trade Journal EA runs on any chart in the same MT5.</p>' : ''}
  </section>
  </div>
  ${refCard ? `<div class="ea-lower">${refCard}</div>` : ''}
  <script>document.querySelectorAll('[data-copy]').forEach(function (b) { b.addEventListener('click', function () {
    var t = b.dataset.copy; var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy'; }, 1500); };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () {}); }); });</script>`;
}

module.exports = { html, TOOLS };
