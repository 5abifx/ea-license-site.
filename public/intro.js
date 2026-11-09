// Student intro: welcome after sign-in (once a day) and the journal result reveal (once a day, on /journal).
// Data comes from /api/intro only when something is due. A tap anywhere skips. Plays on every phone (owner's choice).
(function () {
  const me = document.currentScript;
  if (!me) return;
  const wantW = me.dataset.w === '1', revPref = me.dataset.r || '';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const set = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  const dueW = wantW && get('intro:w') !== today;
  const dueR = !!revPref && revPref !== 'never';
  if (!dueW && !dueR) return;

  fetch('/api/intro' + (dueR ? '?reveal=1' : ''), { credentials: 'same-origin' }).then((r) => r.json()).then((D) => {
    if (!D || !D.ok) return;
    const R = D.reveal && get('intro:r') !== D.reveal.key + ':' + today ? D.reveal : null;
    if (!dueW && !R) return;
    start(D, dueW, R);
  }).catch(() => {});

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function start(D, showW, R) {
    if (!document.querySelector('link[data-intro]')) {
      const f = document.createElement('link'); f.rel = 'stylesheet'; f.dataset.intro = '1';
      f.href = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@900&family=Instrument+Serif:ital@0;1&family=Unbounded:wght@800&family=Michroma&family=Bodoni+Moda:ital,opsz,wght@1,6..96,800&family=Kaushan+Script&family=UnifrakturMaguntia&display=swap';
      document.head.appendChild(f);
      const c = document.createElement('link'); c.rel = 'stylesheet'; c.href = '/intro.css'; c.dataset.intro = '1'; document.head.appendChild(c);
    }
    const ov = document.createElement('div');
    ov.className = 'intro'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Welcome');
    ov.innerHTML = `<canvas class="in-bg"></canvas><div class="in-scene" id="in-s"></div>
      <div class="in-foot"><span class="in-set" id="in-set"></span><span class="in-btns"><button type="button" class="in-pill" id="in-cz"><svg viewBox="0 0 20 20"><path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6zM15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/></svg>Customize</button><button type="button" class="in-skip" id="in-skip">Skip</button></span></div>
      <div class="in-panel" id="in-panel" hidden></div>`;
    document.body.appendChild(ov);
    document.documentElement.classList.add('intro-on');
    const $ = (id) => ov.querySelector('#' + id);
    const scene = $('in-s');
    const L = Object.assign({ style: 'name', font: 'steel', color: 'chrome', myName: '', myQuote: '' }, D.look || {});
    let customizing = false;
    let timers = [], closed = false;
    const later = (ms, f) => timers.push(setTimeout(f, ms));
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    const anim = (el, kf, o) => el && el.animate && el.animate(kf, Object.assign({ fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)' }, o));

    // background embers, tinted by mood
    const cv = ov.querySelector('canvas'), cx = cv.getContext('2d');
    let W = 0, H = 0, tint = [255, 90, 31];
    const parts = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.8 + 0.4, v: Math.random() * 0.0006 + 0.0002, a: Math.random() * 6 }));
    const size = () => { const d = Math.min(2, devicePixelRatio || 1); W = cv.width = innerWidth * d; H = cv.height = innerHeight * d; };
    size(); addEventListener('resize', size);
    (function loop() {
      if (closed) return;
      cx.clearRect(0, 0, W, H);
      const g = cx.createRadialGradient(W / 2, H * 0.55, 0, W / 2, H * 0.55, Math.max(W, H) * 0.6);
      g.addColorStop(0, `rgba(${tint},.12)`); g.addColorStop(1, 'rgba(0,0,0,0)');
      cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      parts.forEach((p) => {
        p.y -= p.v; if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); } p.a += 0.01;
        cx.fillStyle = `rgba(${tint},${0.25 + Math.sin(p.a) * 0.2})`; cx.beginPath(); cx.arc(p.x * W, p.y * H, p.r * Math.max(1, W / 900), 0, 7); cx.fill();
      });
      requestAnimationFrame(loop);
    })();

    function close() {
      if (closed) return; closed = true; clear();
      if (showW) set('intro:w', today);
      if (R) set('intro:r', R.key + ':' + today);
      ov.classList.add('out'); document.documentElement.classList.remove('intro-on');
      setTimeout(() => ov.remove(), 500);
    }
    const money = (v) => {
      const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return (v < 0 ? '−' : '+') + (!D.cur || D.cur === 'USD' ? '$' + s : s + ' ' + D.cur);
    };

    // footer settings: welcome on/off on the welcome, "show my result" on the reveal
    const pref = (body) => fetch('/api/intro/pref', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    function footWelcome() {
      $('in-set').innerHTML = '<button type="button" class="in-link" data-off="1">Don\'t show the welcome again</button>';
    }
    function footReveal() {
      $('in-set').innerHTML = `<span>Show my result:</span> ${[['always', 'Always'], ['green', 'Green days only'], ['never', 'Never']]
        .map(([v, l]) => `<button type="button" class="in-link" data-rv="${v}" aria-pressed="${D.pref === v}">${l}</button>`).join('')}`;
    }
    $('in-set').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      e.stopPropagation();
      if (b.dataset.off) { pref({ welcome: 0 }); b.textContent = 'Welcome turned off'; b.disabled = true; }
      if (b.dataset.rv) { pref({ reveal: b.dataset.rv }); D.pref = b.dataset.rv; $('in-set').querySelectorAll('[data-rv]').forEach((x) => x.setAttribute('aria-pressed', x === b)); }
    });

    function welcome(done) {
      tint = [255, 90, 31]; footWelcome();
      const name = L.myName || D.name, quote = L.myQuote || D.quote;
      const chips = `${D.dayN ? `<span class="in-chip">Day <b>${D.dayN}</b> of your journey</span>` : ''}${D.streak ? `<span class="in-chip">Rules streak <b>${D.streak} day${D.streak === 1 ? '' : 's'}</b></span>` : ''}`;
      if (L.style === 'boot') {
        const lines = [
          '<span class="or">5ABI.FX</span> desk · student session',
          'licence ..................... <span class="ok">active</span>',
          `journal ..................... <span class="ok">${R ? `synced · ${R.n} trade${R.n === 1 ? '' : 's'} last session` : 'synced'}</span>`,
          `rules streak ................ <span class="ok">${D.streak} day${D.streak === 1 ? '' : 's'}</span>`,
          'live class .................. <span class="or">00:00 New York</span>',
          `<div class="bigw">Welcome back,<br><b>${esc(name)}</b><span class="caret"></span></div>`];
        scene.innerHTML = `<div class="in-term">${lines.map((h) => `<div class="ln">${h}</div>`).join('')}</div>`;
        [...scene.querySelectorAll('.ln')].forEach((el, i) => later(150 + i * 420, () => el.classList.add('in')));
        if (done) later(150 + lines.length * 420 + 2200, done);
        return;
      }
      scene.innerHTML = `<div class="in-wel">
        <img class="in-logo" src="/logo.png" alt="">
        <div class="in-kick">WELCOME BACK, TRADER</div><div class="in-rule"></div>
        <div class="in-name f-${L.font} c-${L.color}">${[...name].map((c) => (c === ' ' ? '<span class="sp"></span>' : `<span>${esc(c)}</span>`)).join('')}</div>
        <div class="in-tag">${chips}</div><div class="in-quote">“${esc(quote)}”</div></div>`;
      anim(scene.querySelector('.in-logo'), [{ opacity: 0, transform: 'translateY(10px) scale(.85)' }, { opacity: 1, transform: 'none' }], { duration: 900 });
      anim(scene.querySelector('.in-kick'), [{ opacity: 0, letterSpacing: '.9em' }, { opacity: 1, letterSpacing: '.42em' }], { duration: 1100 });
      later(500, () => anim(scene.querySelector('.in-rule'), [{ width: '0px' }, { width: 'min(420px,70vw)' }], { duration: 1200 }));
      const letters = [...scene.querySelectorAll('.in-name span')];
      letters.forEach((s, i) => later(800 + i * 90, () => anim(s, [{ opacity: 0, transform: 'translateY(40%) rotate(4deg)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 900 })));
      const end = 800 + letters.length * 90 + 700;
      later(end, () => anim(scene.querySelector('.in-tag'), [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 700 }));
      later(end + 500, () => anim(scene.querySelector('.in-quote'), [{ opacity: 0 }, { opacity: 1 }], { duration: 900 }));
      if (done) later(end + 3000, done);
    }

    function reveal() {
      footReveal();
      const r = R, ck = r.checks;
      const score = `<div class="in-score fade" aria-label="Plan score ${r.score} of 5">${[ck.stop, ck.revenge, ck.count, ck.hours, ck.size].map((v) => `<i class="${v ? 'ok' : ''}"></i>`).join('')}</div>`;
      const st = (k, v, c = '') => `<div class="in-st"><span>${k}</span><b class="${c}">${esc(v)}</b></div>`;
      let h = '';
      if (r.mood === 'green') {
        tint = [47, 211, 180];
        h = `<div class="in-k fade">${esc(r.label)}</div>
          <div class="in-big win" id="in-cnt">${money(0)}</div>
          <div class="in-small fade">${r.u !== null ? `${r.u >= 0 ? '+' : '−'}${Math.abs(r.u).toFixed(1)}R · ` : ''}${r.n} trade${r.n === 1 ? '' : 's'} · ${r.wins} win${r.wins === 1 ? '' : 's'} · plan score ${r.score} of 5</div>
          <div class="in-stats fade">${st('Best trade', `${r.best.sym} ${r.best.v || money(r.best.net)}`)}${st('This week', r.week, r.week.startsWith('+') ? 'pos' : '')}${D.streak ? st('Rules streak', `${D.streak} day${D.streak === 1 ? '' : 's'}`) : ''}</div>
          <div class="in-serif fade">“${esc(r.quote)}”</div>
          <a class="in-cta fade" href="/journal/${r.best.id}">Make a share card</a>`;
      } else if (r.mood === 'red') {
        tint = [180, 186, 196];
        h = `<div class="in-k fade">${esc(r.label)}</div>
          <div class="in-mid fade">You kept your rules.</div>${score}
          <div class="in-small fade">Plan score ${r.score} of 5 · no revenge trade · no red-hour trade</div>
          <div class="in-mini fade">Result <b>${money(r.net)}${r.u !== null ? ` · ${r.u >= 0 ? '+' : '−'}${Math.abs(r.u).toFixed(1)}R` : ''}</b></div>
          <div class="in-serif fade big">${esc(r.quote)}</div>
          <div class="in-stats fade">${r.after ? st('After your red days', r.after + ' next day', r.after.startsWith('+') ? 'pos' : '') : ''}${st('This month', r.month, r.month.startsWith('+') ? 'pos' : '')}</div>`;
      } else {
        tint = [242, 180, 65];
        h = `<div class="in-breath fade">BREATHE</div>
          <div class="in-k fade">${esc(r.label)}</div>
          <div class="in-mid fade">${ck.size ? 'Tough day. It stayed small.' : 'Tough day.'}</div>
          <div class="in-mini fade">Result <b>${money(r.net)}${r.u !== null ? ` · −${Math.abs(r.u).toFixed(1)}R` : ''}</b> · plan score ${r.score} of 5</div>
          <div class="in-stats fade">${st('One rule slipped', r.slip)}${st("Tomorrow's fix", r.fix)}</div>
          <a class="in-cta o fade" href="/journal/desk">See today's rules</a>
          <div class="in-serif fade">“${esc(r.quote)}”</div>`;
      }
      scene.innerHTML = `<div class="in-rev">${h}</div>`;
      [...scene.querySelectorAll('.fade')].forEach((el, i) => later(250 + i * (r.mood === 'green' ? 260 : 420), () => el.classList.add('in')));
      if (r.mood === 'green') {
        const c = $('in-cnt'), t0 = performance.now() + 400, dur = 1600;
        (function cnt(now) {
          if (closed) return;
          const p = Math.min(1, Math.max(0, (now - t0) / dur)), e = 1 - Math.pow(1 - p, 3);
          c.textContent = money(r.net * e); if (p < 1) requestAnimationFrame(cnt);
        })(performance.now());
      }
      later(14000, close);
    }

    ov.addEventListener('click', (e) => {
      if (e.target.closest('a') || e.target.closest('#in-set') || e.target.closest('#in-panel') || customizing) return;
      if (e.target.closest('#in-cz')) return openPanel();
      if (e.target.closest('#in-skip') || !R || scene.querySelector('.in-rev')) return close();
      clear(); reveal();   // tap during the welcome: go straight to the result
    });
    $('in-skip').addEventListener('click', (e) => { e.stopPropagation(); close(); });

    // Customize studio: the student's own welcome (style, font, colour, name, quote), previewed live behind the panel
    const FONTS = [['steel', 'Steel'], ['wide', 'Bold wide'], ['tech', 'Tech'], ['luxe', 'Luxury'], ['brush', 'Brush'], ['goth', 'Gothic'], ['serif', 'Classic']];
    const COLORS = [['chrome', 'Chrome'], ['gold', 'Gold'], ['ember', 'Ember'], ['teal', 'Teal'], ['ice', 'Ice']];
    const IDEAS = ['Calm mind, sharp entries.', 'Protect the account first.', 'One good trade beats ten rushed ones.', 'Discipline is my edge.'];
    const DEF = { style: (D.look && D.look.style === 'boot' && !D.look.myName) ? 'boot' : 'name', font: 'steel', color: 'chrome', myName: '', myQuote: '' };
    const ICON = {
      style: '<svg viewBox="0 0 20 20"><rect x="3" y="4" width="14" height="12" rx="2.5"/><path d="M6 8h8M6 11h5"/></svg>',
      font: '<svg viewBox="0 0 20 20"><path d="M4 16 9.5 4h1L16 16M6.5 12h7"/></svg>',
      color: '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5"/><path d="M10 3.5v13"/></svg>',
      words: '<svg viewBox="0 0 20 20"><path d="M4 6h12M4 10h12M4 14h7"/></svg>',
    };
    let tab = 'style';
    function openPanel() {
      customizing = true; clear();
      const P = $('in-panel');
      const shortName = () => (L.myName || D.name).slice(0, 10);
      const check = '<em class="in-ok" aria-hidden="true"><svg viewBox="0 0 12 12"><path d="M2.5 6.2 5 8.6l4.6-5"/></svg></em>';
      const body = {
        style: () => `<div class="in-cards">
            <button type="button" class="in-card" data-k="style" data-v="name" aria-pressed="${L.style === 'name'}">${check}
              <span class="in-thumb t-name"><span class="tl"></span><b class="c-${L.color}"><span>${esc(shortName().slice(0, 1).toUpperCase())}</span></b><span class="tl s"></span></span>
              <span class="in-cl"><b>Your name</b><small>Big letters, your font and colour</small></span></button>
            <button type="button" class="in-card" data-k="style" data-v="boot" aria-pressed="${L.style === 'boot'}">${check}
              <span class="in-thumb t-boot"><i><u>✓</u>licence</i><i><u>✓</u>journal</i><i><u>✓</u>streak</i><i class="w">Welcome back_</i></span>
              <span class="in-cl"><b>Desk boot</b><small>Your desk checks in, then greets you</small></span></button></div>`,
        font: () => `<div class="in-fonts">${FONTS.map(([v, l]) => `<button type="button" class="in-tile" data-k="font" data-v="${v}" aria-pressed="${L.font === v}">${check}
            <span class="in-name f-${v} c-${L.color} in-sample">${[...shortName()].map((c) => (c === ' ' ? '<span class="sp"></span>' : `<span>${esc(c)}</span>`)).join('')}</span><small>${l}</small></button>`).join('')}</div>`,
        color: () => `<div class="in-colors">${COLORS.map(([v, l]) => `<button type="button" class="in-orb" data-k="color" data-v="${v}" aria-pressed="${L.color === v}" aria-label="${l}"><i class="orb o-${v}"></i><small>${l}</small></button>`).join('')}</div>
            <div class="in-strip"><span class="in-name f-${L.font} c-${L.color} in-sample">${[...shortName()].map((c) => (c === ' ' ? '<span class="sp"></span>' : `<span>${esc(c)}</span>`)).join('')}</span></div>`,
        words: () => `<label class="in-f"><span>Name to show <em id="in-nmc">${L.myName.length}/14</em></span>
              <input id="in-nm" maxlength="14" autocomplete="off" placeholder="${esc(D.name)}" value="${esc(L.myName)}"></label>
            <label class="in-f"><span>Your quote <em id="in-qtc">${L.myQuote.length}/90</em></span>
              <textarea id="in-qt" maxlength="90" rows="2" placeholder="${esc(D.quote)}">${esc(L.myQuote)}</textarea></label>
            <div class="in-ideas"><span>Ideas</span>${IDEAS.map((q) => `<button type="button" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`,
      };
      const draw = () => {
        P.innerHTML = `<span class="in-grab" aria-hidden="true"></span>
          <div class="in-ph"><div><span class="in-eb">Make it yours</span><h3>Your welcome</h3></div>
            <button type="button" class="in-x" id="in-x" aria-label="Close"><svg viewBox="0 0 20 20"><path d="m5 5 10 10M15 5 5 15"/></svg></button></div>
          <div class="in-tabs" role="tablist">${[['style', 'Style'], ['font', 'Font'], ['color', 'Colour'], ['words', 'Words']].map(([v, l]) =>
            `<button type="button" role="tab" data-tab="${v}" aria-selected="${tab === v}">${ICON[v]}<span>${l}</span></button>`).join('')}<i class="in-ind" style="--i:${['style', 'font', 'color', 'words'].indexOf(tab)}"></i></div>
          <div class="in-body" role="tabpanel">${body[tab]()}</div>
          <div class="in-pa"><button type="button" class="in-reset" id="in-rs">Reset</button><button type="button" class="in-save" id="in-sv"><span>Save my welcome</span></button></div>`;
      };
      draw();
      P.hidden = false; ov.classList.add('cz');
      const replay = () => { clear(); welcome(null); };
      P.onclick = (e) => {
        e.stopPropagation();
        const t = e.target.closest('[data-tab]');
        if (t) { tab = t.dataset.tab; draw(); return; }
        const b = e.target.closest('[data-k]');
        if (b) { L[b.dataset.k] = b.dataset.v; if (b.dataset.k === 'font' || b.dataset.k === 'color') L.style = 'name'; draw(); replay(); return; }
        const q = e.target.closest('[data-q]');
        if (q) { L.myQuote = q.dataset.q; draw(); replay(); return; }
        if (e.target.closest('#in-x')) { customizing = false; P.hidden = true; ov.classList.remove('cz'); replay(); later(4000, () => (R ? reveal() : close())); return; }
        if (e.target.closest('#in-rs')) { Object.assign(L, DEF); draw(); replay(); return; }
        const sv = e.target.closest('#in-sv');
        if (sv) {
          sv.classList.add('busy');
          fetch('/api/intro/pref', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ look: { style: L.style, font: L.font, color: L.color, name: L.myName, quote: L.myQuote } }) })
            .then((r) => {
              sv.classList.remove('busy'); sv.classList.add(r.ok ? 'done' : 'err');
              sv.querySelector('span').textContent = r.ok ? 'Saved' : 'Try again';
              setTimeout(() => { sv.classList.remove('done', 'err'); sv.querySelector('span').textContent = 'Save my welcome'; }, 2200);
            });
        }
      };
      let tm;
      P.oninput = (e) => {
        if (e.target.id === 'in-nm') { L.myName = e.target.value.trim(); $('in-nmc').textContent = `${e.target.value.length}/14`; }
        if (e.target.id === 'in-qt') { L.myQuote = e.target.value.trim(); $('in-qtc').textContent = `${e.target.value.length}/90`; }
        clearTimeout(tm); tm = setTimeout(replay, 450);
      };
      replay();
    }
    addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    if (showW) welcome(() => (R ? reveal() : close())); else reveal();
  }
})();
