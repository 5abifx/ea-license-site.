// Public page /studio: shows what the Share Studio makes, live, on SAMPLE numbers, to sell the journal.
// Visitors can try every look but cannot download: exports need a real journal, so nobody can post made-up results.
const { trialDays } = require('./views');

module.exports = function registerStudioPage(app, { page }) {
  app.get('/studio', (req, res) => {
    const u = req.user, member = !!(u && req.hasJournal);
    const trial = trialDays();
    const cta = member ? ['/journal/studio', 'Open my Share Studio'] : u ? ['/pricing?plan=journal', 'Add the journal'] : ['/signup', trial ? `Start ${trial}-day free trial` : 'Create account'];
    const feat = [
      ['tick', 'Synced from MT5', 'A teal seal sits next to your name when every trade on the card came straight from MT5 through the Journal EA. Proof the numbers were not typed in.'],
      ['medal', 'Milestone certificates', 'Prop target reached, profit milestones, win streaks, green-day streaks and your best month. Worked out from your journal, never typed.'],
      ['eye', 'You choose every line', 'Entry, exit, size, win rate, the price line, your name. Leave off anything you would rather keep private.'],
      ['film', 'Your clip, or ours', 'Use your own photo or clip (it never leaves your phone), shuffle a free stock clip, or pick one of our moving looks.'],
      ['frame', 'Story, Post and Wide', '9:16 for Reels and Stories, 4:5 for the feed, 16:9 for X and Discord, with a split layout for wide.'],
      ['hd', 'Made to stay sharp', 'Videos are built frame by frame as MP4. Pictures save at twice the size, so they survive Instagram and WhatsApp.'],
    ];
    const ico = {
      tick: '<path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z"/><path d="M8.5 12l2.3 2.3 4.7-4.6"/>',
      medal: '<circle cx="12" cy="9" r="6"/><path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7"/>',
      eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
      film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
      frame: '<rect x="8" y="3" width="8" height="14" rx="1.5"/><rect x="2" y="12" width="12" height="9" rx="1.5"/>',
      hd: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9v6M11 9v6M7 12h4M14 9h2a3 3 0 010 6h-2z"/>',
    };
    page(req, res, 'Studio', `
    <link rel="stylesheet" href="/studio.css"><link rel="stylesheet" href="/studio-pub.css">
    <div class="sp">
      <section class="sp-hero">
        <div class="sp-copy">
          <p class="sp-k">5ABI.FX STUDIO</p>
          <h1 class="sp-h">Every trade, <em>ready to post.</em></h1>
          <p class="sp-lead">The journal turns your real MT5 trades into cinematic videos and pictures for Reels, Stories, X and Discord. A trade, a day, a week, a month, or a milestone certificate, in a few taps.</p>
          <div class="sp-cta"><a class="ss-pill or" href="${cta[0]}">${cta[1]}</a><a class="ss-ghost" href="#try">Try the looks ↓</a></div>
          <p class="sp-fine">Every number comes from your journal. Nothing to type, nothing to fake.</p>
        </div>
        <div class="sp-stage">
          <canvas id="hero" aria-label="Moving sample share card"></canvas>
          <div class="sp-tabs" id="heroTabs" role="tablist"></div>
          <p class="sp-sample">Sample numbers</p>
        </div>
      </section>

      <section class="sp-feat">
        ${feat.map(([i, h, p]) => `<article><svg viewBox="0 0 24 24" aria-hidden="true">${ico[i]}</svg><h3>${h}</h3><p>${p}</p></article>`).join('')}
      </section>

      <section class="sp-try" id="try">
        <div class="sp-try-copy">
          <p class="sp-k">TRY IT</p>
          <h2 class="ss-h">Pick a <em>mood</em></h2>
          <p class="ss-sub">CARD</p><div class="ss-chips" data-key="card"></div>
          <p class="ss-sub">LOOK</p><div class="ss-chips" data-key="art"></div>
          <p class="ss-sub">COLOUR</p><div class="ss-chips" data-key="grade"></div>
          <p class="ss-sub">SIZE</p><div class="ss-chips" data-key="size"></div>
          <input type="file" id="own" accept="image/*,video/*" hidden>
          <p class="ss-hint">Your photo or clip stays in this browser. Downloads open in your journal, where your real trades fill the card in.</p>
          <div class="ss-act"><a class="ss-pill or" href="${cta[0]}">${member ? 'Make mine now' : cta[1]}</a></div>
        </div>
        <div class="sp-try-stage"><canvas id="try-cv" aria-label="Share card preview"></canvas><p class="sp-sample">Sample numbers</p></div>
      </section>

      <section class="sp-how">
        <p class="sp-k">HOW IT WORKS</p>
        <ol>
          <li><b>Connect the Journal EA</b><span>One small EA on any MT5 chart sends every closed trade to your journal.</span></li>
          <li><b>Trade as usual</b><span>Days, weeks, months, streaks and milestones are worked out for you.</span></li>
          <li><b>Open Share Studio and post</b><span>Pick the card, the look and the lines to show. Save the video or picture and post it.</span></li>
        </ol>
        <div class="ss-act"><a class="ss-pill or" href="${cta[0]}">${cta[1]}</a>${member ? '' : '<a class="ss-ghost" href="/trade-journal">More about the journal →</a>'}</div>
      </section>
    </div>
    <script src="/cards.js"></script><script src="/cine-card.js"></script><script src="/studio-pub.js"></script>`);
  });
};
