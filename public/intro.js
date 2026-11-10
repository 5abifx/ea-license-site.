// Student intro: welcome after sign-in (once a day) and the journal result reveal (once a day, on /journal).
// Data comes from /api/intro only when something is due. A tap anywhere skips. Plays on every phone (owner's choice).
(function () {
  const me = document.currentScript;
  if (!me) return;
  const wantW = me.dataset.w === '1', revPref = me.dataset.r || '', style = me.dataset.ws === 'boot' ? 'boot' : 'name';
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
      f.href = 'https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@900&family=Great+Vibes&family=Sora:wght@300;400&family=Instrument+Serif:ital@0;1&display=swap';
      document.head.appendChild(f);
      const c = document.createElement('link'); c.rel = 'stylesheet'; c.href = '/intro.css'; c.dataset.intro = '1'; document.head.appendChild(c);
    }
    const ov = document.createElement('div');
    ov.className = 'intro'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', 'Welcome');
    ov.innerHTML = `<canvas class="in-bg"></canvas><div class="in-scene" id="in-s"></div>
      <div class="in-foot"><span class="in-set" id="in-set"></span><button type="button" class="in-skip" id="in-skip">Skip</button></div>`;
    document.body.appendChild(ov);
    document.documentElement.classList.add('intro-on');
    const $ = (id) => ov.querySelector('#' + id);
    const scene = $('in-s');
    let timers = [], closed = false;
    const later = (ms, f) => timers.push(setTimeout(f, ms));
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    const anim = (el, kf, o) => el && el.animate && el.animate(kf, Object.assign({ fill: 'forwards', easing: 'cubic-bezier(.2,.8,.2,1)' }, o));

    // living background, kept dark (owner's choice) and tinted by mood: faint drifting light, flowing lines like a market tape, rising sparks,
    // and a soft horizontal light streak across the name when it lands
    const cv = ov.querySelector('canvas'), cx = cv.getContext('2d');
    let W = 0, H = 0, DPR = 1, tint = [255, 90, 31], energy = 0, mx = 0.5, my = 0.5, tmx = 0.5, tmy = 0.5, streaks = [], lineY = 0.5;
    const DARK = 0.28;
    const sparks = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.7 + 0.3, v: Math.random() * 0.0009 + 0.0002, a: Math.random() * 6, w: Math.random() * 2 - 1 }));
    const blobs = [[1, 0.22, 0.55, 0.00011, 0.00017, 0, 1], [1.3, 0.12, 0.42, 0.00016, 0.00009, 2, 0.5], [0.6, 0.22, 0.65, 0.00007, 0.00013, 4, 3], [-1, 0.07, 0.5, 0.00013, 0.00008, 1, 5]];
    const size = () => { DPR = Math.min(2, devicePixelRatio || 1); W = cv.width = innerWidth * DPR; H = cv.height = innerHeight * DPR; };
    size(); addEventListener('resize', size);
    ov.addEventListener('pointermove', (e) => { tmx = e.clientX / innerWidth; tmy = e.clientY / innerHeight; });
    const shade = (k) => (k < 0 ? [120, 135, 160] : tint.map((c) => Math.max(0, Math.min(255, Math.round(c * k)))));
    (function loop(t) {
      if (closed) return;
      t = t || 0; mx += (tmx - mx) * 0.04; my += (tmy - my) * 0.04; energy *= 0.985;
      cx.globalCompositeOperation = 'source-over'; cx.fillStyle = '#030405'; cx.fillRect(0, 0, W, H);
      cx.globalCompositeOperation = 'lighter';
      const m = Math.max(W, H);
      blobs.forEach(([k, a, r, sx, sy, px, py]) => {
        const x = W * (0.5 + 0.32 * Math.sin(t * sx + px) + (mx - 0.5) * 0.08), y = H * (0.6 + 0.22 * Math.cos(t * sy + py) + (my - 0.5) * 0.06);
        const g = cx.createRadialGradient(x, y, 0, x, y, m * r);
        g.addColorStop(0, `rgba(${shade(k)},${a * DARK * (1 + energy * 0.8)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = g; cx.fillRect(0, 0, W, H);
      });
      cx.lineWidth = DPR;
      for (let k = 0; k < 7; k++) {
        cx.beginPath();
        const base = H * (0.62 + k * 0.05), amp = H * (0.025 + k * 0.006), sp = t * (0.00025 + k * 0.00004);
        for (let x = 0; x <= W; x += 8 * DPR) { const y = base + Math.sin((x / W) * 6 + sp + k) * amp + Math.sin((x / W) * 13 - sp * 1.6) * amp * 0.35; if (x) cx.lineTo(x, y); else cx.moveTo(x, y); }
        cx.strokeStyle = `rgba(${shade(1 + k * 0.06)},${(0.05 + 0.015 * (6 - k)) * 0.6 + energy * 0.03})`; cx.stroke();
      }
      sparks.forEach((p) => {
        p.y -= p.v * (1 + energy * 3); p.x += Math.sin(t * 0.001 + p.a) * 0.0002 * p.w; p.a += 0.015;
        if (p.y < -0.02) { p.y = 1.02; p.x = Math.random(); }
        cx.fillStyle = `rgba(${shade(1.15)},${0.22 + Math.sin(p.a) * 0.16})`;
        cx.beginPath(); cx.arc(p.x * W + (mx - 0.5) * 30 * DPR * p.r, p.y * H, p.r * DPR * 1.2, 0, 7); cx.fill();
      });
      streaks = streaks.filter((s) => t - s.t < s.d);
      streaks.forEach((s) => {
        const k = (t - s.t) / s.d, e = 1 - Math.pow(1 - k, 3), x = W * (-0.25 + 1.5 * e), y = H * lineY, fade = Math.sin(Math.PI * k);
        cx.save(); cx.translate(x, y); cx.scale(7, 0.55);
        const g = cx.createRadialGradient(0, 0, 0, 0, 0, H * 0.16);
        g.addColorStop(0, `rgba(255,236,214,${0.5 * fade})`); g.addColorStop(0.35, `rgba(255,150,90,${0.18 * fade})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        cx.fillStyle = g; cx.beginPath(); cx.arc(0, 0, H * 0.16, 0, 7); cx.fill(); cx.restore();
        const lg = cx.createLinearGradient(x - W * 0.45, 0, x + W * 0.45, 0);
        lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, `rgba(255,244,230,${0.7 * fade})`); lg.addColorStop(1, 'rgba(255,255,255,0)');
        cx.fillStyle = lg; cx.fillRect(x - W * 0.45, y - DPR * 0.75, W * 0.9, DPR * 1.5);
      });
      requestAnimationFrame(loop);
    })();
    const pulse = () => { energy = 1; };
    const streak = (el, d) => { const r = el.getBoundingClientRect(); lineY = (r.top + r.height * 0.55) / innerHeight; streaks.push({ t: performance.now(), d }); };

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
      const name = D.name, quote = D.quote;
      const chips = `${D.dayN ? `<span class="in-chip">Day <b>${D.dayN}</b> of your journey</span>` : ''}${D.streak ? `<span class="in-chip">Rules streak <b>${D.streak} day${D.streak === 1 ? '' : 's'}</b></span>` : ''}`;
      if (style === 'boot') {
        const lines = [
          '<span class="or">5ABI.FX</span> desk · student session',
          'licence ..................... <span class="ok">active</span>',
          `journal ..................... <span class="ok">${R ? `synced · ${R.n} trade${R.n === 1 ? '' : 's'} last session` : 'synced'}</span>`,
          `rules streak ................ <span class="ok">${D.streak} day${D.streak === 1 ? '' : 's'}</span>`,
          'live class .................. <span class="or">00:00 New York</span>',
          `<div class="bigw">Welcome back,<br><b>${esc(D.name)}</b><span class="caret"></span></div>`];
        scene.innerHTML = `<div class="in-term">${lines.map((h) => `<div class="ln">${h}</div>`).join('')}</div>`;
        [...scene.querySelectorAll('.ln')].forEach((el, i) => later(150 + i * 420, () => el.classList.add('in')));
        later(150 + lines.length * 420 + 2200, done);
        return;
      }
      // 1. from black, a gold hairline draws and the small 5ABI.FX mark rises with it
      scene.innerHTML = `<div class="in-brand"><div class="in-blogo"><img src="/logo.png" alt="5ABI.FX"><span class="in-glint"></span></div><span class="in-bword">5ABI<b>.FX</b></span></div><i class="in-hair"></i>
        <div class="in-wel">
        <img class="in-logo" src="/logo.png" alt="">
        <div class="in-script" role="img" aria-label="Welcome back,"></div>
        <div class="in-name">${[...name].map((c, k) => (c === ' ' ? '<span class="sp"></span>' : `<span style="animation-delay:${(k * 0.07).toFixed(2)}s">${esc(c)}</span>`)).join('')}</div>
        <div class="in-tag">${chips}</div><div class="in-quote">“${esc(quote)}”</div></div><i class="in-pen"></i>`;
      const q = (sel) => scene.querySelector(sel);
      anim(q('.in-hair'), [{ width: '0px', opacity: 1 }, { width: 'min(460px,74vw)', opacity: 1 }], { duration: 800 });
      anim(q('.in-blogo'), [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 150 });
      anim(q('.in-bword'), [{ opacity: 0, letterSpacing: '1em' }, { opacity: 1, letterSpacing: '.62em' }], { duration: 900, delay: 200 });
      later(500, () => anim(q('.in-glint'), [{ backgroundPosition: '200% 0' }, { backgroundPosition: '-110% 0' }], { duration: 800, easing: 'ease-in-out' }));
      later(1250, () => { anim(q('.in-brand'), [{ opacity: 1 }, { opacity: 0 }], { duration: 350 }); anim(q('.in-hair'), [{ opacity: 1 }, { opacity: 0 }], { duration: 400 }); });
      // 2. a point of light handwrites "Welcome back," in gold, then the name rises in Steel
      const fontReady = Promise.race([document.fonts ? document.fonts.load('64px "Great Vibes"') : Promise.resolve(), new Promise((ok) => setTimeout(ok, 1300))]);
      const T = 1400;
      later(T, () => fontReady.then(() => {
        if (closed) return;
        anim(q('.in-logo'), [{ opacity: 0 }, { opacity: 0.9 }], { duration: 600 });
        const box = q('.in-script');
        anim(box, [{ opacity: 0 }, { opacity: 1 }], { duration: 10 });
        handwrite(box, 'Welcome back,', Math.min(innerWidth * 0.085, 64), 1250, q('.in-pen'));
      }));
      const letters = [...scene.querySelectorAll('.in-name span')];
      later(T + 900, () => letters.forEach((x, k) => anim(x, [{ opacity: 0, transform: 'translateY(30%)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 900, delay: k * 55 })));
      const land = T + 1700;
      later(land, () => { pulse(); streak(q('.in-name'), 1300); q('.in-name').classList.add('live'); });
      later(land - 100, () => anim(q('.in-tag'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 600 }));
      later(land + 200, () => anim(q('.in-quote'), [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 800 }));
      later(land + 3300, done);
    }

    // calligraphy written in light: a thin gold outline traces the glyphs while a pen of light sweeps left to right
    // and the gold fill follows behind it through a soft-edged mask
    function handwrite(box, text, fs, dur, pen) {
      const NS = 'http://www.w3.org/2000/svg', id = 'inw' + Date.now();
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML = `<defs><linearGradient id="${id}m" gradientUnits="userSpaceOnUse" y1="0" y2="0"><stop offset="0" stop-color="#fff"/><stop class="a" offset="0" stop-color="#fff"/><stop class="b" offset="0" stop-color="#000"/><stop offset="1" stop-color="#000"/></linearGradient>
        <mask id="${id}k" maskUnits="userSpaceOnUse"><rect fill="url(#${id}m)"/></mask></defs>
        <text class="o" fill="none" stroke="#f3dcb6" stroke-width="${fs / 140}" opacity=".8" style="stroke-dasharray:900;stroke-dashoffset:900" font-family="'Great Vibes',cursive" font-size="${fs}">${esc(text)}</text>
        <text fill="#e9cfa6" mask="url(#${id}k)" font-family="'Great Vibes',cursive" font-size="${fs}">${esc(text)}</text>`;
      box.appendChild(svg);
      // getBBox is the font box, not the ink: swashes reach past it, so pad it and pull the margins back in
      const o = svg.querySelector('.o'), bb = o.getBBox(), px = bb.height * 0.35, py = bb.height * 0.45;
      const x = bb.x - px, y = bb.y - py, w = bb.width + 2 * px, h = bb.height + 2 * py;
      svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`); svg.setAttribute('width', w); svg.setAttribute('height', h);
      svg.style.margin = `${-py * 0.75}px ${-px * 0.8}px`;
      const mg = svg.querySelector('linearGradient'); mg.setAttribute('x1', x); mg.setAttribute('x2', x + w);
      [svg.querySelector('rect'), svg.querySelector('mask')].forEach((el) => Object.entries({ x, y, width: w, height: h }).forEach(([k, v]) => el.setAttribute(k, v)));
      anim(o, [{ strokeDashoffset: 900, opacity: 0.9 }, { strokeDashoffset: 0, opacity: 0.9, offset: 0.85 }, { strokeDashoffset: 0, opacity: 0.25 }], { duration: dur * 1.15, easing: 'cubic-bezier(.5,0,.3,1)' });
      const a = svg.querySelector('.a'), b = svg.querySelector('.b'), t0 = performance.now();
      (function step() {
        if (closed) return;
        const k = Math.min(1, (performance.now() - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, f = 0.06;
        a.setAttribute('offset', Math.max(0, e * (1 + f) - f)); b.setAttribute('offset', Math.min(1, e * (1 + f)));
        const r = svg.getBoundingClientRect(), px2 = (bb.x - x + bb.width * e) / w;
        pen.style.left = r.left + r.width * px2 + 'px';
        pen.style.top = r.top + r.height * (0.55 + Math.sin(e * Math.PI * 9) * 0.17) + 'px';
        pen.style.opacity = k < 0.04 ? k / 0.04 : k > 0.94 ? (1 - k) / 0.06 : 1;
        if (k < 1) requestAnimationFrame(step); else pen.style.opacity = 0;
      })();
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
      if (e.target.closest('a') || e.target.closest('#in-set')) return;
      if (e.target.closest('#in-skip') || !R || scene.querySelector('.in-rev')) return close();
      clear(); reveal();   // tap during the welcome: go straight to the result
    });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    if (showW) welcome(() => (R ? reveal() : close())); else reveal();
  }
})();
