// Dashboard for people who signed up but have not added a card yet (free trial not started).
// Shows a real share card and "problem fixed" examples on top, then locked sample tiles,
// and a bar that stays at the bottom of the screen with the "add card" button.
const { esc } = require('./views');

const STORIES = [
  { who: 'Gold scalper · prop account', tool: 'KATANA',
    before: 'Lost 3, kept going, hit the daily limit', after: 'Locked after 2 losses, account kept',
    how: 'KATANA blocked new trades after the 2nd loss of the day, so the revenge trades never happened.',
    line: '0,8 25,12 50,10 75,24 99,28 100,20 125,17 150,13 175,9 200,5' },
  { who: 'US30 day trader', tool: 'Insights',
    before: 'Gave back the week every Friday', after: 'Stopped Friday trading, +6R month',
    how: 'Insights showed Fridays after 15:00 were -9R. The Leaks box said: no trades Friday afternoon.',
    line: '0,10 25,14 50,9 75,22 99,26 100,18 125,15 150,11 175,8 200,4' },
  { who: 'Prop challenge, phase 1', tool: 'Prop firm guard',
    before: 'Did not know how close to the limit', after: 'Warned at 80%, stopped in time',
    how: 'The guard showed "Daily loss 4.0 of 5%" in orange, so the last trade of the day was skipped.',
    line: '0,6 25,10 50,16 75,22 99,25 100,22 125,18 150,15 175,12 200,9' },
];

const story = (s) => `<div class="cs-story">
  <div class="cs-who"><span>${esc(s.who)}</span><span class="cs-ex">Example</span></div>
  <div class="cs-ba"><span class="cs-b">${esc(s.before)}</span><i>→</i><span class="cs-a">${esc(s.after)}</span></div>
  <svg class="cs-spark" viewBox="0 0 200 30" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="15" x2="200" y2="15" stroke="rgba(255,255,255,.08)"/><polyline points="${s.line}" fill="none" stroke="#26c6a0" stroke-width="1.8" vector-effect="non-scaling-stroke"/><line x1="100" y1="0" x2="100" y2="30" stroke="#ff5a1f" stroke-dasharray="2 2" vector-effect="non-scaling-stroke"/></svg>
  <p><b>${esc(s.tool)}:</b> ${esc(s.how)}</p>
</div>`;

const CAL = ['', 'p', 'p', 'n', 'p', '', '', 'p', 'n', 'p', 'p', 'p', '', '', 'n', 'p', 'p', 'p', 'n', '', ''];
const lock = (t) => `<span class="cs-lock">🔒 ${t}</span>`;

function cardStepHtml({ trial }) {
  const first = new Date(Date.now() + trial * 86400000)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `
  <section class="cs-top">
    <div class="cs-card">
      <img src="/sample-card.jpg?v=1" width="540" height="960" alt="A real 5ABI.FX share card: XAUUSD sell, +$142.53, protected by KATANA">
      <p class="muted small">A real share card from a 5ABI.FX trade. Every trade you close becomes one.</p>
    </div>
    <div class="cs-fix">
      <span class="lp-kicker">Your ${trial}-day free trial is ready</span>
      <h2>What traders fix in their first ${trial} days</h2>
      <p class="muted">Pick the one that sounds like you.</p>
      <div class="cs-stories">${STORIES.map(story).join('')}</div>
      <a class="btn cs-go" href="/pricing">Fix mine · start free trial</a>
    </div>
  </section>

  <section class="cs-peek">
    <div class="row between"><h2>Your desk, once the trial starts</h2><span class="muted small">Sample data</span></div>
    <div class="cs-tiles">
      <div class="card cs-tile"><div class="cs-tl">Trade Journal ${lock('Sample')}</div>
        <div class="cs-cal cs-blur">${CAL.map((c, i) => `<i class="${c}">${i + 1}</i>`).join('')}</div></div>
      <div class="card cs-tile"><div class="cs-tl">Edge score ${lock('Insights')}</div>
        <svg class="cs-ring cs-blur" viewBox="0 0 60 60" aria-hidden="true"><circle cx="30" cy="30" r="24" fill="none" stroke="#1d1d22" stroke-width="6"/><circle cx="30" cy="30" r="24" fill="none" stroke="#26c6a0" stroke-width="6" stroke-dasharray="108 151" transform="rotate(-90 30 30)" stroke-linecap="round"/><text x="30" y="35" text-anchor="middle" font-size="14" fill="#f2f2f4">72</text></svg></div>
      <div class="card cs-tile"><div class="cs-tl">KATANA ${lock('Risk lock')}</div>
        <div class="cs-kat cs-blur"><div>Daily loss <b>-1.2%</b></div><div class="cs-bar"><i></i></div><div>Trades today <b>2 / 3</b></div><div>Status <b class="pos">ARMED</b></div></div></div>
      <div class="card cs-tile"><div class="cs-tl">Biggest leak ${lock('Insights')}</div>
        <p class="cs-blur">Trades after 2 losses in a row: <b class="neg">-3.4R</b>. Fix: stop after 2.</p></div>
    </div>
  </section>

  <section class="card cs-when">
    <h2>How the free trial works</h2>
    <div class="cs-steps">
      <div><b>Today</b><span>Add a card. Nothing is charged. KATANA, the Trade Journal and Insights switch on straight away.</span></div>
      <div><b>Day ${trial}</b><span>First payment on ${esc(first)}, only if you did not cancel. Cancel anytime from your dashboard.</span></div>
    </div>
  </section>

  <div class="cs-sticky">
    <div class="cs-ticks"><span>$0 today</span><span>${trial} days free</span><span>Cancel anytime</span></div>
    <a class="btn" href="/pricing">Unlock everything · add card</a>
  </div>`;
}

module.exports = { cardStepHtml };
