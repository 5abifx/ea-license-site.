// Trade page Review tab, in the Share Studio look: a trade recap on the left (numbers the journal already knows,
// plus what they say) and the review as five short steps on the right. Same form fields as before (LT.parse).
const LT = require('./logtrade');
const { esc } = require('./views');

const fin = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));
const pct = (v) => `${Math.round(v * 100)}%`;
const sR = (r) => `${r >= 0 ? '+' : '−'}${Math.abs(r).toFixed(2)}R`;
const ms = (s) => Date.parse(String(s || '').replace(' ', 'T') + 'Z');

// best and worst move in price, from the EA (mfe/mae) or else from the saved candles
function moves(t) {
  if (fin(t.mfe) && fin(t.mae)) return { best: Number(t.mfe), worst: Number(t.mae) };
  let c = [];
  try { c = JSON.parse(t.candles || '[]'); } catch (e) { c = []; }
  const a = ms(t.open_time) / 1000, b = ms(t.close_time) / 1000;
  if (!c.length || !fin(t.entry) || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  const k = c.filter((x) => x[0] >= a - 59 && x[0] <= b);
  if (!k.length) return null;
  const hi = Math.max(...k.map((x) => x[2])), lo = Math.min(...k.map((x) => x[3]));
  const buy = t.side === 'BUY';
  return { best: Math.max(0, buy ? hi - t.entry : t.entry - lo), worst: Math.max(0, buy ? t.entry - lo : hi - t.entry) };
}

// facts + what they say. hist = this trader's other closed trades on the same symbol
function recap(t, { hist = [], session = '', planCheck = null } = {}) {
  const dir = t.side === 'BUY' ? 1 : -1;
  const risk = fin(t.entry) && fin(t.sl) && t.sl !== t.entry && (t.sl - t.entry) * dir < 0 ? Math.abs(t.entry - t.sl) : null;
  const rr = risk && fin(t.tp) && (t.tp - t.entry) * dir > 0 ? Math.abs(t.tp - t.entry) / risk : null;
  const mins = Math.round((ms(t.close_time) - ms(t.open_time)) / 60000);
  const held = Number.isFinite(mins) ? (mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`) : '-';
  const mv = moves(t);
  const got = fin(t.exit) && fin(t.entry) ? (t.exit - t.entry) * dir : null;
  const kept = mv && mv.best > 0 && got !== null && got > 0 ? Math.min(1, got / mv.best) : null;
  const heat = mv && risk ? Math.min(1.5, mv.worst / risk) : null;
  const bestR = mv && risk ? mv.best / risk : null;
  const reach = mv && fin(t.tp) && (t.tp - t.entry) * dir > 0 ? Math.min(1, mv.best / Math.abs(t.tp - t.entry)) : null;   // how far toward the target

  // what the numbers say (max 3), each can tick a matching answer
  const say = [];
  if (kept !== null && kept < 0.5 && bestR !== null && bestR >= 1) say.push({ tone: 'warn', text: `Price ran ${bestR.toFixed(1)}R your way but you kept ${pct(kept)} of it.`, mark: ['mist', 'Closed too early'] });
  else if (kept !== null && kept >= 0.8) say.push({ tone: 'good', text: `You kept ${pct(kept)} of the best move. Clean exit.`, mark: ['feel', 'Patient'] });
  if (t.net < 0 && bestR !== null && bestR >= 1) say.push({ tone: 'warn', text: `It was +${bestR.toFixed(1)}R in profit before it turned into a loss.`, mark: null });
  if (heat !== null && heat >= 0.8 && t.net > 0) say.push({ tone: 'warn', text: `Price used ${pct(Math.min(heat, 1))} of your stop before it worked. Was the entry early?`, mark: ['mist', 'Entered early'] });
  else if (heat !== null && heat <= 0.25 && t.net > 0) say.push({ tone: 'good', text: `Price barely went against you (${pct(heat)} of the stop). Sharp entry.`, mark: ['feel', 'Selective'] });
  if (t.net < 0 && fin(t.r) && t.r >= -1.1 && t.r <= -0.9) say.push({ tone: 'good', text: 'The loss stayed the size you planned (−1R). Taking the stop is a skill.', mark: ['feel', 'Followed rules'] });
  else if (t.net < 0 && fin(t.r) && t.r < -1.1) say.push({ tone: 'warn', text: `You lost ${Math.abs(t.r).toFixed(1)}R, more than the risk you planned.`, mark: ['mist', 'Moved my stop'] });
  else if (t.net < 0 && fin(t.r) && t.r > -0.9) say.push({ tone: 'good', text: `You cut it early at ${sR(t.r)}, before the full stop.`, mark: null });
  if (t.net < 0 && reach !== null && reach < 0.15) say.push({ tone: 'warn', text: 'Price never really moved your way. Was the entry against the trend?', mark: ['mist', 'Chased price'] });
  if (rr !== null && rr < 1) say.push({ tone: 'warn', text: `Your target was smaller than your risk (1 : ${rr.toFixed(1)}).`, mark: null });
  if (t.sl_edited) say.push({ tone: 'warn', text: 'The stop was changed during the trade.', mark: ['mist', 'Moved my stop'] });
  if (!fin(t.sl)) say.push({ tone: 'warn', text: 'No real stop-loss was recorded for this trade.', mark: ['mist', 'No stop'] });
  if (planCheck) say.unshift({ tone: planCheck.followed === planCheck.total ? 'good' : 'warn', text: `Your plan check: ${planCheck.followed} of ${planCheck.total} kept.`, mark: ['followed', planCheck.followed === planCheck.total ? 'Yes' : planCheck.followed === 0 ? 'No' : 'Partly'] });

  const rs = hist.filter((h) => fin(h.r));
  const wins = hist.filter((h) => h.net > 0).length;
  const rec = hist.length ? { n: hist.length, win: wins / hist.length, avgR: rs.length ? rs.reduce((s, h) => s + h.r, 0) / rs.length : null,
    grades: hist.map((h) => LT.gradeOf(h)).filter(Boolean).slice(0, 6) } : null;
  return { rr, held, session, kept, heat, bestR, reach, win: t.net > 0, say: say.slice(0, 3), rec };
}

const PROMPTS = ['I took it because…', 'I saw…', 'What went well:', 'What I would change:', 'Next time I will…'];
const STEPS = [['plan', 'Plan'], ['feel', 'Feel'], ['mist', 'Mistakes'], ['grade', 'Grade'], ['notes', 'Notes']];

function html(t, { money, R, setups = [] }) {
  const P = LT.fields(t, { parts: true });
  const g = LT.gradeOf(t);
  const meter = (v, label, cls) => `<div class="rv-m"><div class="rv-mh"><span>${label}</span><b>${v === null ? '–' : pct(Math.min(v, 1))}</b></div><div class="rv-bar ${cls}"><i style="width:${v === null ? 0 : Math.round(Math.min(v, 1) * 100)}%"></i></div></div>`;
  const fact = (k, v, c = '') => `<div><dt>${k}</dt><dd${c ? ` class="${c}"` : ''}>${v}</dd></div>`;
  const recapHtml = `<aside class="rv-recap">
    <div class="rv-top"><div><p class="ss-k">TRADE RECAP</p><p class="rv-sym">${esc(t.symbol)} <span class="${t.side === 'BUY' ? 'pos' : 'neg'}">${t.side === 'BUY' ? 'Buy' : 'Sell'}</span></p></div>
      <span class="rv-gb${g ? '' : ' e'}" id="rv-gb" title="Your grade">${esc(g || '?')}</span></div>
    <p class="rv-big ${t.net > 0 ? 'pos' : t.net < 0 ? 'neg' : ''}">${money(t.net, t.currency)}${fin(t.r) ? `<small>${sR(t.r)}</small>` : ''}</p>
    <dl class="rv-facts">${fact('Held', R.held)}${fact('Session', esc(R.session || '-'))}${fact('Planned', R.rr === null ? '-' : `1 : ${R.rr.toFixed(1)}`)}${fact('Best it went', R.bestR === null ? '-' : `+${R.bestR.toFixed(1)}R`, 'pos')}</dl>
    ${R.win && (R.kept !== null || R.heat !== null) ? `<div class="rv-ms">${meter(R.kept, 'Kept of the best move', 'k')}${meter(R.heat, 'Stop used before it worked', 'h')}</div>` : ''}
    ${!R.win && (R.reach !== null || R.heat !== null) ? `<div class="rv-ms">${meter(R.reach, 'How far it got toward your target', 'k')}${meter(R.heat, 'Stop used', 'h')}</div>` : ''}
    ${R.say.length ? `<p class="ss-k rv-sk">WHAT THE NUMBERS SAY</p><ul class="rv-say">${R.say.map((s) => `<li class="${s.tone}"><i></i><span>${esc(s.text)}${s.mark ? ` <button type="button" class="rv-mark" data-mark="${esc(s.mark[0])}" data-val="${esc(s.mark[1])}">${s.mark[0] === 'followed' ? `Answer ${esc(s.mark[1])}` : `Tick “${esc(s.mark[1])}”`}</button>` : ''}</span></li>`).join('')}</ul>` : ''}
    ${R.rec ? `<p class="ss-k rv-sk">YOUR ${esc(t.symbol)} RECORD</p><div class="rv-rec"><div><b>${R.rec.n}</b><small>trades</small></div><div><b>${pct(R.rec.win)}</b><small>won</small></div><div><b class="${R.rec.avgR > 0 ? 'pos' : R.rec.avgR < 0 ? 'neg' : ''}">${R.rec.avgR === null ? '–' : sR(R.rec.avgR)}</b><small>average</small></div></div>
      ${R.rec.grades.length ? `<p class="rv-last">Last grades ${R.rec.grades.map((x) => `<span>${esc(x)}</span>`).join('')}</p>` : ''}` : `<p class="rv-last muted">Your first ${esc(t.symbol)} trade in the journal.</p>`}
  </aside>`;

  const panel = (i, key, k, h, body, extra = '') => `<div class="rv-p" data-step="${key}"><p class="ss-k">STEP ${i + 1} OF 5 · ${k}</p><h3 class="ss-h">${h}</h3>${body}${extra}
    <div class="ss-act">${i < 4 ? `<button type="button" class="ss-pill" data-next>Continue</button>` : '<button class="ss-pill or" id="rv-save">Save review</button>'}${i ? '<button type="button" class="ss-ghost" data-back>← Back</button>' : ''}${i < 4 ? '<button class="ss-ghost rv-now">Save now</button>' : ''}</div></div>`;
  const setupChips = setups.length ? `<div class="rv-quick" data-for="setup">${setups.map((s) => `<button type="button" class="ss-chip" data-v="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '';
  const steps = [
    panel(0, 'plan', 'PLAN', 'Did you <em>follow your plan</em>?', `${P.plan}<p class="ss-sub">SETUP <span>optional</span></p>${P.setup}${setupChips}`),
    panel(1, 'feel', 'FEELINGS', 'How did you <em>feel</em> in this trade?', P.feel, '<p class="ss-hint">Pick all that fit. Honest answers make your Insights smarter.</p>'),
    panel(2, 'mist', 'MISTAKES', 'Any <em>mistakes</em>?', P.mist, '<p class="ss-hint" id="rv-clean">Nothing ticked means a clean trade.</p>'),
    panel(3, 'grade', 'GRADE', 'Grade <em>how you traded</em>', P.grade, '<p class="ss-hint" id="rv-ghint">Not the money. A losing trade can be an A+ if you followed your rules.</p>'),
    panel(4, 'notes', 'NOTES', 'What will you <em>do next time</em>?', `<div class="rv-quick" data-for="notes">${PROMPTS.map((p) => `<button type="button" class="ss-chip" data-v="${esc(p)}">${esc(p)}</button>`).join('')}</div>${P.notes}`,
      '<p class="ss-sub">YOUR REVIEW</p><ul class="rv-sum" id="rv-sum"></ul>'),
  ].join('');

  return `<section class="ss tr-rev lt-review" id="review" data-tab="review">
    <nav class="ss-steps" id="rv-steps" aria-label="Review steps">${STEPS.map(([k, l]) => `<button type="button" data-s="${k}">${l.toUpperCase()}</button>`).join('')}</nav><div class="ss-bar"><i id="rv-pb"></i></div>
    <div class="ss-wrap">${recapHtml}
      <form method="post" action="/journal/${t.id}" class="lt-form lt-inline rv-form" id="rv-form">${steps}</form>
    </div>
    <script src="/logtrade.js" defer></script><script src="/review-steps.js" defer></script>
  </section>`;
}

module.exports = { html, recap, moves };
