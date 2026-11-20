// Appearance page (/appearance): tiles, sliders and colour dots that drive public/look.js live, then save to the account.
(function () {
  'use strict';
  const LK = window.LOOK; if (!LK) return;
  const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
  let S = LK.state;

  /* save: debounced POST, the page never reloads */
  let tSave;
  function save() {
    clearTimeout(tSave); $('#apSaved').textContent = 'Saving…';
    tSave = setTimeout(() => {
      const body = new URLSearchParams({ look: JSON.stringify(S) });
      fetch('/appearance', { method: 'POST', body, credentials: 'same-origin', headers: { 'content-type': 'application/x-www-form-urlencoded' } })
        .then((r) => { if (!r.ok) throw 0; $('#apSaved').textContent = 'Saved to your account.'; })
        .catch(() => { $('#apSaved').textContent = 'Could not save. Check your connection and try again.'; });
    }, 400);
  }
  function set(patch, noSave) { Object.assign(S, patch); LK.apply(S); sync(); if (!noSave) save(); }

  /* tiles */
  function tile(p, host, photo) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'ap-tile'; b.dataset.bg = p.id;
    b.innerHTML = `<span class="th">${photo ? `<img alt="" loading="lazy" src="${p.src}">` : '<canvas width="200" height="125"></canvas>'}<span class="tag">${p.tag}</span></span><span class="nm">${p.name}</span>`;
    host.appendChild(b); b.onclick = () => set({ bg: p.id });
    if (!photo) {
      const cv = b.querySelector('canvas'), cx = cv.getContext('2d'); const still = () => p.draw(cx, 200, 125, 3); still(); let raf, st;
      b.onmouseenter = () => { if (p.still) return; st = performance.now(); const f = (n) => { p.draw(cx, 200, 125, 3 + (n - st) / 1000); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); };
      b.onmouseleave = () => { cancelAnimationFrame(raf); still(); };
    }
  }
  LK.PHOTO.forEach((p) => tile(p, p.grp === 'car' ? $('#apCars') : $('#apScenes'), true));
  LK.LIVE.forEach((p) => tile(p, $('#apLive'), false));
  $('[data-bg="none"]').onclick = () => set({ bg: 'none' });

  const gth = $('#apGradTh').getContext('2d');
  const drawGradTh = () => { const g = gth.createLinearGradient(0, 0, 160, 100); g.addColorStop(0, S.g1); g.addColorStop(1, S.g2); gth.fillStyle = g; gth.fillRect(0, 0, 160, 100); };
  const PAIRS = [['#ff5a1f', '#1a1033'], ['#26c6a0', '#06121a'], ['#d4a64a', '#0d0b08'], ['#e9ecf2', '#8d95a6'], ['#3b5bdb', '#0b0b14'], ['#f0464b', '#120607']];
  $('#apGrad').onclick = () => {
    let i = PAIRS.findIndex((p) => p[0] === S.g1 && p[1] === S.g2);
    i = S.bg === 'grad' ? (i + 1) % PAIRS.length : Math.max(0, i);
    set({ bg: 'grad', g1: PAIRS[i][0], g2: PAIRS[i][1] }); drawGradTh();
  };
  $('#apColour').value = S.colour;
  $('#apColour').oninput = (e) => { $('#apColourTh').style.background = e.target.value; set({ bg: 'colour', colour: e.target.value }); };
  $('#apUpload').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 60 * 1024 * 1024) { $('#apSaved').textContent = 'That file is over 60 MB. Pick a smaller one.'; return; }
    if (!(await LK.useFile(f))) { $('#apSaved').textContent = 'That file could not be opened. Try a JPG, PNG or MP4.'; return; }
    await LK.saveUpload(f); showUploadThumb(f); set({ bg: 'upload' });
  };
  function showUploadThumb(f) { if (f && /^image\//.test(f.type)) $('#apUpTh').style.background = `center/cover url(${URL.createObjectURL(f)})`; }
  LK.readUpload().then(showUploadThumb);

  /* accent dots */
  function dots(list, host, metal) {
    list.forEach(([id, name, h]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ap-dot' + (metal ? ' metal' : ''); b.dataset.acc = id; b.title = name;
      b.setAttribute('aria-label', name + (metal ? ' metallic' : ' matte'));
      b.style.background = metal ? LK.metalFill(h) : h; b.style.setProperty('--ck', LK.CR(LK.hex2(h), [255, 255, 255]) > 2.2 ? '#fff' : '#0b0b0e');
      b.onclick = () => set({ accent: id }); host.appendChild(b);
    });
  }
  dots(LK.METAL, $('#apMetal'), true); dots(LK.MATTE, $('#apMatte'), false);
  const pk = document.createElement('label'); pk.className = 'ap-dot pick'; pk.title = 'Any colour';
  pk.innerHTML = '<input type="color" id="apAccPick" value="#ff5a1f" aria-label="Pick any accent colour">'; $('#apMatte').appendChild(pk);
  $('#apAccPick').oninput = (e) => set({ accent: 'c-' + e.target.value });

  /* panel tint, motion, sliders */
  $$('#apPanel button').forEach((b) => { b.onclick = () => set({ panel: b.dataset.v }); });
  $('#apMotion').onclick = () => set({ motion: !S.motion });
  [['apDepth', 'depth'], ['apDim', 'dim'], ['apBlur', 'blur']].forEach(([id, k]) => { const el = $('#' + id); el.value = S[k]; el.oninput = () => set({ [k]: +el.value }); });

  function sync() {
    $$('.ap-tile[data-bg]').forEach((b) => b.classList.toggle('on', b.dataset.bg === S.bg));
    $$('#apPanel button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.v === S.panel));
    $$('.ap-dot[data-acc]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.acc === S.accent));
    $('#apMotion').setAttribute('aria-checked', S.motion);
    [['apDepth', 'depth'], ['apDim', 'dim'], ['apBlur', 'blur']].forEach(([id, k]) => { const el = $('#' + id); $('#' + id + 'O').textContent = S[k]; el.style.setProperty('--v', (S[k] - el.min) / (el.max - el.min) * 100 + '%'); });
    if (S.bg === 'colour') $('#apColourTh').style.background = S.colour;
    if (S.bg === 'none') { $('#apScore').textContent = '-'; $('#apOk').textContent = 'AAA'; $('#apReadTxt').textContent = 'Classic look: white text on near-black panels.'; }
  }
  document.addEventListener('look:measured', (e) => {
    const m = e.detail;
    $('#apScore').textContent = m.contrast.toFixed(1) + ':1';
    $('#apOk').textContent = m.muted >= 7 ? 'AAA' : 'AA';
    $('#apReadTxt').textContent = `Main text ${m.contrast.toFixed(1)}:1, small grey text ${m.muted.toFixed(1)}:1. Titles on the background use ${m.headDark ? 'dark' : 'light'} text.`;
    $('#apAdj').textContent = m.shifted
      ? 'Your accent is a little faint on these panels, so numbers and icons use a brighter shade of it. Buttons keep the exact colour.'
      : 'The site measures your background and picks text colour, panel tint and accent shade so nothing gets lost.';
  });

  /* preview line */
  (function () { let s = 11; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; let v = 0; const pts = []; for (let i = 0; i < 40; i++) { v += (r() - 0.36) * 10; pts.push(v); }
    const mn = Math.min(...pts), mx = Math.max(...pts); const P = pts.map((p, i) => [i / 39 * 390 + 5, 100 - (p - mn) / (mx - mn) * 90]);
    const d = 'M' + P.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join(' L');
    $('.ap-spark .l').setAttribute('d', d); $('.ap-spark .a').setAttribute('d', d + ' L395 110 L5 110 Z'); const e = P[P.length - 1]; $('.ap-spark .e').setAttribute('cx', e[0]); $('.ap-spark .e').setAttribute('cy', e[1]); })();

  drawGradTh(); sync();
})();
