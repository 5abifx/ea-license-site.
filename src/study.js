// Study room (/journal/study): where trades are worked on after they close.
//   To study  - every trade the Journal EA records lands here; add screenshots from other platforms, notes, a grade
//               and the "environment" (where, what happened, day, session, bias)
//   Playbook  - trades with the same environment are grouped into one setup page with all the examples and their results
//   Goals     - the Focus panel goals and fixes, each fix linked to the trade it came from
// PREVIEW: this first version renders sample trades only (public/study.js) so the owner can decide how it works.
module.exports = (app, { page, requireUser }) => {
  app.get('/journal/study', requireUser, (req, res) => {
    if (!req.hasJournal) return res.redirect('/journal');
    const askMentor = req.mentorEligible ? '<button type="button" class="btn small secondary" title="Sends this trade to your mentor">Ask my mentor</button>' : '';
    page(req, res, 'Study room', `
    <link rel="stylesheet" href="/study.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap">
    <div class="row between page-head"><h1>Study room</h1>
      <span class="head-btns"><span class="sr-prev">Preview with sample trades</span></span></div>

    <section class="card sr-hero">
      <div class="sr-hl">
        <div><span class="sr-k">Study room · trades become a playbook</span>
          <p class="sr-q" id="sr-q"></p><div class="sr-qa" id="sr-qa"></div></div>
        <div class="sr-stats"><div><span class="sr-k">To study</span><b>4</b></div><div><span class="sr-k">Setups saved</span><b>9</b></div>
          <div><span class="sr-k">Best setup won</span><b class="pos">67%</b></div><div><span class="sr-k">Study streak</span><b>4 days</b></div></div>
      </div>
      <div class="sr-hr"><canvas id="sr-bust" aria-hidden="true"></canvas><span class="sr-credit">Head scan: Infinite Realities, CC BY 3.0</span></div>
    </section>

    <div class="sr-cq">
    <nav class="ins-tabs sr-tabs" aria-label="Study room">
      <a href="#study" class="on" data-v="study">To study <em class="count">4</em></a><a href="#playbook" data-v="book">My playbook</a><a href="#goals" data-v="goals">Goals and fixes</a></nav>

    <div class="sr-view on" id="v-study">
      <div class="sr-ws">
        <section class="card sr-inbox"><span class="sr-k">Waiting for you</span><div class="sr-list" id="sr-trs"></div></section>

        <section class="card sr-mid">
          <div class="sr-dh"><h2>XAUUSD</h2><span class="tag sr-sell">Sell</span><span class="muted small">Thu 20 Nov · 09:42 NY · held 42 min · recorded by the Journal EA</span>
            <span class="sr-res neg">−$184 <small>−1.0R</small></span></div>
          <canvas class="sr-chart" id="sr-ch"></canvas>
          <div class="sr-sh"><div><h3>Screenshots</h3><p class="muted small">From DeepCharts, NinjaTrader, ATAS, the heatmap or your phone. Paste with Ctrl+V, drop, or tap +.</p></div></div>
          <div class="sr-shots" id="sr-shots"><label class="sr-drop" id="sr-drop"><b>+</b>Add screenshot<small>Paste · drop · tap</small><input type="file" accept="image/*" multiple hidden id="sr-fin"></label></div>
          <div class="sr-notes">
            <label><span class="sr-k">What did I see?</span><textarea>Sellers sat on the value high. Price tapped it 3 times and could not get through.</textarea></label>
            <label><span class="sr-k">What did I do?</span><textarea>Sold the 3rd tap. Did not take anything at 1R. It turned and took my stop.</textarea></label>
            <label><span class="sr-k">Next time I will</span><textarea>Take half at 1R when the next level is close.</textarea></label>
          </div>
          <div class="sr-row"><span class="sr-k">How did I trade it?</span><span class="sr-grade"><button>A+</button><button>A</button><button class="on">B</button><button>C</button><button>F</button></span>
            <span class="sr-grow"></span>${askMentor}<button type="button" class="btn small" id="sr-done">Save and mark studied</button></div>
        </section>

        <section class="card sr-env">
          <h3>The environment</h3><p class="muted small">Tick what the market looked like. The same ticks put trades on the same setup page.</p>
          <div id="sr-envg"></div>
          <div class="sr-fp"><div class="sr-fpt" id="sr-fp"></div><div class="sr-fpm" id="sr-fpm"></div></div>
          <div class="sr-seen" id="sr-seen"></div>
        </section>
      </div>

      <section class="card sr-whatif"><div class="sr-row" style="margin:0"><div><h3>Same trade, other choices</h3><p class="muted small">Replayed on the real candles.</p></div><span class="sr-grow"></span>
        <span class="sr-chips"><button class="on">My trade <b class="neg">−$184</b></button><button>Target 1R <b class="pos">+$184</b></button><button>Wider stop <b class="neg">−$148</b></button><button>Wait 3 candles <b class="neg">−$184</b></button></span></div></section>
    </div>

    <div class="sr-view" id="v-book">
      <div class="sr-row" style="margin:0 0 12px"><p class="muted small" style="margin:0">Every environment you saved, with every time you saw it. When it shows up again, open it here first.</p><span class="sr-grow"></span>
        <span class="sr-chips"><button class="on">All</button><button>Best first</button><button>Needs work</button></span></div>
      <div class="sr-pb" id="sr-pb"></div>
      <section class="card sr-pbd" id="sr-pbd" hidden></section>
    </div>

    <div class="sr-view" id="v-goals">
      <div class="sr-goals">
        <section class="card"><h3>Goals</h3><p class="muted small">The same goals as your Focus panel, checked from your journal.</p>
          <div class="sr-g"><div><b>Only trade setups from my playbook</b><span>8 of 10 this week</span></div><i><u style="width:80%" class="acc"></u></i></div>
          <div class="sr-g"><div><b>Study every trade within 24 hours</b><span>6 of 9</span></div><i><u style="width:66%"></u></i></div>
          <div class="sr-g"><div><b>Add a screenshot to every trade</b><span>7 of 9</span></div><i><u style="width:78%"></u></i></div></section>
        <section class="card"><h3>To fix</h3><p class="muted small">Each fix comes from a trade or a setup you studied. Tick it each day you keep it.</p>
          <div class="sr-fx"><i></i><div>Take half at 1R when the next level is close<small>from <a href="#study">XAUUSD sell · 20 Nov</a> · kept 2 days</small></div></div>
          <div class="sr-fx"><i></i><div>Skip value-low buys when the heatmap shows a wall above<small>from setup <a href="#playbook">Buy at value low</a> · kept 4 days</small></div></div>
          <div class="sr-fx"><i></i><div>No trades in the first 5 minutes after the open<small>kept 6 days</small></div></div></section>
      </div>
    </div>

    </div>
    <div class="sr-vw" id="sr-vw" hidden><div class="sr-vbox">
      <div class="sr-row" style="margin:0 0 10px"><span class="sr-chips" id="sr-tools"><button class="on" data-tl="arrow">Arrow</button><button data-tl="box">Box</button><button data-tl="line">Level line</button><button data-tl="text">Text</button><button id="sr-clr">Clear</button></span>
        <span class="sr-grow"></span><span class="muted small" id="sr-vlab"></span><button type="button" class="btn small" id="sr-vclose">Done</button></div>
      <div class="sr-vcv"><canvas id="sr-vimg"></canvas><canvas id="sr-vdraw"></canvas></div>
      <p class="muted small">Your marks are saved on top. The picture itself stays clean.</p></div></div>
    <script src="/study.js" defer></script>`);
  });
};
