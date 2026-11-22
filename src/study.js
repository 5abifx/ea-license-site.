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
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Architects+Daughter&family=Caveat:wght@500;700&family=Kalam:wght@400;700&family=Permanent+Marker&family=Patrick+Hand&display=swap">
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
            <div class="sr-strip"><span class="sr-k">Same setup before</span><div id="sr-past"></div><button type="button" class="btn small secondary" data-go="compare">Compare side by side</button></div>
          </section>

          <section class="sr-view" id="v-compare"><div class="sr-cmp" id="sr-cmp"></div></section>

          <section class="sr-view" id="v-book">
            <div class="sr-bk-top">
              <div class="card sr-curve"><div class="sr-sh"><span class="sr-k">Each setup over time, in R</span><span class="sr-chips" id="sr-flt"><button class="on">All</button><button>Wins</button><button>Losses</button></span></div><canvas id="sr-curves"></canvas><div class="sr-leg" id="sr-leg"></div></div>
              <div class="card sr-pairs"><span class="sr-k">Setup pairs</span><p class="muted small">Trades where two things lined up, best first.</p><div id="sr-pairs"></div></div>
            </div>
            <div class="sr-cards" id="sr-cards"></div>
          </section>
        </main>

        <aside class="sr-insp" id="sr-insp">
          <div class="sr-sec sr-trade"><div class="sr-sh"><b id="sr-tname">XAUUSD sell</b><span class="sr-res neg" id="sr-tres">−1.0R</span></div>
            <div class="sr-kv"><div><span>Entry</span><b>4012.4</b></div><div><span>Stop</span><b>4018.6</b></div><div><span>Target</span><b>4000.0</b></div><div><span>Result</span><b class="neg">−$184</b></div></div>
            <p class="muted small" id="sr-twhen">Thu 20 Nov · 09:42 New York · held 42 min · from the Journal EA</p></div>
          <div class="sr-sec"><span class="sr-k">The environment</span><div id="sr-env"></div><div class="sr-match" id="sr-match"></div></div>
          <div class="sr-sec"><span class="sr-k">My notes</span>
            <label>What I saw<textarea>Sellers sat on the value high. Three taps, no break.</textarea></label>
            <label>What I did<textarea>Sold the 3rd tap. Took nothing at 1R. It turned and took my stop.</textarea></label>
            <label>Next time<textarea id="sr-next">Take half at 1R when the next level is close.</textarea></label></div>
          <div class="sr-sec"><span class="sr-k">How I traded it</span><div class="sr-grade" id="sr-grade"><button>A+</button><button>A</button><button class="on">B</button><button>C</button><button>F</button></div>
            <button type="button" class="btn small secondary sr-fix" id="sr-fix">Make "Next time" a fix in my Focus panel</button>
            ${req.mentorEligible ? '<button type="button" class="btn small secondary sr-fix">Ask my mentor about this trade</button>' : ''}</div>
          <div class="sr-save"><button type="button" class="btn" id="sr-done">Save to “Absorption at value high”</button></div>
        </aside>
      </div>
    </div>
    <script src="/study.js" defer></script>`);
  });
};
