// Study room (/journal/study): a full-screen PC workbench where closed trades are studied and turned into setups.
//   Left   - Inbox (trades the Journal EA recorded, waiting to be studied) and the setup library (playbook)
//   Middle - the board: the trade's MT5 chart plus screenshots from other platforms (DeepCharts, NinjaTrader, ATAS,
//            heatmap), each one marked up with Chart Ink (hand-drawn arrows, boxes, lines, handwriting)
//   Right  - the trade, its environment tags (same tags = same setup), notes, grade, a fix for the Focus panel
//   Compare - this trade next to past trades of the same setup;  Playbook - every setup's curve, numbers and pairs
// PC only (phones get a short note). PREVIEW: sample trades and pictures (public/study.js); nothing is saved yet.
module.exports = (app, { page, requireUser }) => {
  app.get('/journal/study', requireUser, (req, res) => {
    if (!req.hasJournal) return res.redirect('/journal');
    const tool = (t, k, title, path) => `<button type="button" class="ci-tool" data-tool="${t}" title="${title} (${k})" aria-label="${title}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg><kbd>${k}</kbd></button>`;
    page(req, res, 'Study room', `
    <link rel="stylesheet" href="/study.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Instrument+Serif:ital@0;1&family=Architects+Daughter&family=Caveat:wght@500;700&family=Kalam:wght@400;700&family=Permanent+Marker&family=Patrick+Hand&display=swap">
    <script>document.documentElement.classList.add('sr-full')</script>

    <div class="sr-phone card"><h2>Study room works on a PC</h2><p class="muted">It is a big workbench: your chart, your screenshots and your setups side by side. Open 5abifx.com on your computer to use it.</p></div>

    <div class="sr-app" id="sr-app">
      <header class="sr-top">
        <div class="sr-title"><span class="sr-k">Study room</span><h1 id="sr-setname">Absorption at value high</h1></div>
        <div class="sr-nums" id="sr-nums"></div>
        <nav class="sr-modes" aria-label="Study room views"><button class="on" data-m="study">Study</button><button data-m="compare">Compare</button><button data-m="book">Playbook</button></nav>
        <span class="sr-prev" title="Sample trades and pictures. Nothing is saved yet.">Preview</span>
      </header>

      <div class="sr-body">
        <aside class="sr-lib">
          <div class="sr-sec"><div class="sr-sh"><span class="sr-k">To study</span><em class="count">4</em></div><div id="sr-inbox"></div></div>
          <div class="sr-sec"><div class="sr-sh"><span class="sr-k">My setups</span><button type="button" class="sr-add" title="New setup">+</button></div><div id="sr-sets"></div></div>
          <p class="sr-quote" id="sr-q"></p>
        </aside>

        <main class="sr-main">
          <section class="sr-view on" id="v-study">
            <div class="sr-tabs" id="sr-tabs"></div>
            <div class="sr-board">
              <nav class="ci-rail" aria-label="Pen tools">
                ${tool('select', 'V', 'Select and move', 'M5 3l14 8-6 2-3 6z')}
                ${tool('text', 'T', 'Handwriting', 'M5 6c3-1.5 9-1.5 14 0M12 5.5c-.3 5 0 9 .3 13.5M9 19h6')}
                ${tool('arrow', 'A', 'Arrow', 'M4 19C8 13 12 9 19 5M13 5.5l6-.5-1 6')}
                ${tool('ellipse', 'O', 'Circle', 'M15 5.5C10 3.5 3.5 6 4 12s8 8 13 5.5 3-10-4-11.5')}
                ${tool('rect', 'R', 'Box', 'M3 6.5l18-.8M20 5l.6 13.5M21.5 18 3.5 18.6M4 19.5 3.6 5')}
                ${tool('line', 'L', 'Level line', 'M3 13c6-.6 12-.4 18 .3')}
                ${tool('pen', 'P', 'Pen', 'M3 17c3-6 5 2 8-3s4-7 6-4 2 6 4 4')}
                <i class="ci-sep"></i>
                <div class="ci-sws" id="ci-sws"></div>
                <button type="button" class="ci-tool" id="ci-undo" title="Undo (Ctrl+Z)" aria-label="Undo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3"/></svg></button>
              </nav>
              <div class="ci-wrap">
                <div class="ci-bar" id="ci-bar"></div>
                <div class="ci-stage" id="ci-stage"><canvas id="ci-cv" width="1600" height="900"></canvas><textarea class="ci-type" id="ci-type" hidden spellcheck="false"></textarea><div class="ci-hint" id="ci-hint" hidden>Paste (Ctrl+V) or drop a screenshot here</div></div>
              </div>
            </div>
            <div class="sr-strip"><span class="sr-k">Same setup before</span><div id="sr-past"></div><button type="button" class="ci-act" data-go="compare">Compare side by side</button></div>
          </section>

          <section class="sr-view" id="v-compare"><div class="sr-cmp" id="sr-cmp"></div></section>

          <section class="sr-view" id="v-book">
            <div class="sr-bk-top">
              <div class="sr-curve"><div class="sr-sh"><span class="sr-k">Each setup over time, in R</span><span class="sr-chips" id="sr-flt"><button class="on">All</button><button>Wins</button><button>Losses</button></span></div><canvas id="sr-curves"></canvas><div class="sr-leg" id="sr-leg"></div></div>
              <div class="sr-pairs"><span class="sr-k">Setup pairs</span><p class="muted small">Trades where two things lined up, best first.</p><div id="sr-pairs"></div></div>
            </div>
            <div class="sr-tbl"><div class="sr-tr sr-th"><span>Setup</span><span>Curve</span><span>Per trade</span><span>Profit factor</span><span>Won</span><span>Trades</span><span>Last traded</span></div><div id="sr-cards"></div></div>
          </section>
        </main>

        <aside class="sr-insp" id="sr-insp">
          <div class="sr-tcard">
            <div class="sr-trow"><b>XAUUSD</b><span class="sr-side">Sell</span><span class="sr-when">Thu 20 Nov · 09:42</span></div>
            <div class="sr-big"><span class="neg">−1.0R</span><small>−$184</small></div>
            <div class="sr-ladder" aria-label="Target 4000.0, entry 4012.4, stop 4018.6"><i class="tp"></i><i class="sl"></i><u></u></div>
            <div class="sr-lv"><span>Target<b>4000.0</b></span><span>Entry<b>4012.4</b></span><span>Stop<b>4018.6</b></span></div>
            <p class="sr-meta">Held 42 min · New York session · recorded by the Journal EA</p>
          </div>
          <div class="sr-itabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-p="env">Environment</button><button type="button" role="tab" data-p="notes">Notes</button><button type="button" role="tab" data-p="review">Review</button></div>
          <section class="sr-pane on" id="p-env">
            <div class="sr-step" id="sr-step"></div>
            <div class="sr-rec" id="sr-rec"></div>
          </section>
          <section class="sr-pane" id="p-notes">
            <div class="sr-k sr-pk">Write it like you'd tell a friend. Short is fine.</div>
            <div class="sr-paper">
              <label>What I saw<textarea rows="3">Sellers sat on the value high. Three taps, no break.</textarea></label>
              <label>What I did<textarea rows="3">Sold the 3rd tap. Took nothing at 1R. It turned and took my stop.</textarea></label>
              <label>Next time<textarea rows="3" id="sr-next">Take half at 1R when the next level is close.</textarea></label>
            </div></section>
          <section class="sr-pane" id="p-review">
            <h3 class="sr-qh">How did you <em>trade</em> it?</h3>
            <div class="sr-chips2" id="sr-grade">${[['A+', 'Perfect, by the plan'], ['A', 'Good, small slip'], ['B', 'Right idea, poor exit'], ['C', 'Forced it'], ['F', 'Broke my rules']].map(([g, h], i) => `<button type="button" class="sr-chip${i === 2 ? ' on' : ''}" data-h="${h}"><b>${g}</b></button>`).join('')}</div>
            <p class="sr-hint" id="sr-gh">Right idea, poor exit</p>
            <label class="sr-tog"><input type="checkbox" id="sr-fix" checked><i></i><span>Add “Next time” to my Focus panel</span></label>
            ${req.mentorEligible ? '<button type="button" class="sr-link">Ask my mentor about this trade →</button>' : ''}</section>
          <div class="sr-save"><button type="button" class="sr-share" id="sr-done"><span>Save to “Absorption at value high”</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></div>
        </aside>
      </div>
    </div>
    <script src="/study.js" defer></script>`);
  });
};
