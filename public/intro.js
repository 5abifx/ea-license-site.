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
      <div class="in-foot"><span class="in-set" id="in-set"></span><span class="in-btns"><button type="button" class="in-skip" id="in-cz">Customize</button><button type="button" class="in-skip" id="in-skip">Skip</button></span></div>
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

    // Customize: the student's own welcome (style, font, colour, name, quote), previewed live
    const FONTS = [['steel', 'Steel'], ['wide', 'Bold wide'], ['tech', 'Tech'], ['luxe', 'Luxury'], ['brush', 'Brush'], ['goth', 'Gothic'], ['serif', 'Classic']];
    const COLORS = [['chrome', 'Chrome'], ['gold', 'Gold'], ['ember', 'Ember'], ['teal', 'Teal'], ['ice', 'Ice']];
    function openPanel() {
      customizing = true; clear();
      const P = $('in-panel');
      const seg = (k, opts, cls = '') => `<div class="in-seg ${cls}" data-k="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${L[k] === v}"${cls ? ` title="${l}"` : ''}>${cls ? `<i class="sw c-${v}"></i>` : ''}<span>${l}</span></button>`).join('')}</div>`;
      P.innerHTML = `<div class="in-ph"><b>Customize your welcome</b><button type="button" class="in-link" id="in-x">Close</button></div>
        <label class="in-f"><span>Style</span>${seg('style', [['name', 'Your name'], ['boot', 'Desk boot']])}</label>
        <label class="in-f"><span>Font</span>${seg('font', FONTS)}</label>
        <label class="in-f"><span>Colour</span>${seg('color', COLORS, 'sws')}</label>
        <div class="in-two"><label class="in-f"><span>Name to show</span><input id="in-nm" maxlength="14" placeholder="${esc(D.name)}" value="${esc(L.myName)}"></label>
        <label class="in-f"><span>Your quote</span><input id="in-qt" maxlength="90" placeholder="${esc(D.quote)}" value="${esc(L.myQuote)}"></label></div>
        <div class="in-pa"><span class="in-msg" id="in-msg"></span><button type="button" class="in-save" id="in-sv">Save my welcome</button></div>`;
      P.hidden = false; ov.classList.add('cz');
      const replay = () => { clear(); welcome(null); };
      P.onclick = (e) => {
        e.stopPropagation();
        const b = e.target.closest('.in-seg button');
        if (b) { const sg = b.parentElement; L[sg.dataset.k] = b.dataset.v; sg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', x === b)); if (sg.dataset.k !== 'style' && L.style === 'boot' && sg.dataset.k === 'font') { L.style = 'name'; P.querySelectorAll('[data-k="style"] button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.v === 'name')); } replay(); }
        if (e.target.id === 'in-x') { customizing = false; P.hidden = true; ov.classList.remove('cz'); replay(); later(4000, () => (R ? reveal() : close())); }
        if (e.target.id === 'in-sv') {
          fetch('/api/intro/pref', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ look: { style: L.style, font: L.font, color: L.color, name: L.myName, quote: L.myQuote } }) })
            .then((r) => { $('in-msg').textContent = r.ok ? 'Saved. This is your welcome from now on.' : 'Could not save, try again.'; });
        }
      };
      let tm;
      P.oninput = (e) => {
        if (e.target.id === 'in-nm') L.myName = e.target.value.trim();
        if (e.target.id === 'in-qt') L.myQuote = e.target.value.trim();
        clearTimeout(tm); tm = setTimeout(replay, 450);
      };
      replay();
    }
    addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    if (showW) welcome(() => (R ? reveal() : close())); else reveal();
  }
})();
