/* Trade page, Share tab: the Share Studio way (one question per step, live preview on the left).
   Makes the result picture, the chart picture, the replay video, a motion video, or (admins) the story overlay
   of this one trade. Uses public/cards.js, motion-card.js, overlay.js and save-file.js.
   A member's own photo or clip stays in the browser; nothing is uploaded. */
(function () {
  const trade = JSON.parse(document.getElementById('trade-data').textContent);
  const $ = (id) => document.getElementById(id);
  const q = $('tq'); if (!q) return;
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isAdmin = !!$('ov');

  // ---------- what the member picked (remembered in this browser) ----------
  const A = {
    card: store.get('ts.card') || 'replay', tpl: store.get('cardStyle') || 'a', mode: store.get('ts.mode') || 'money', rm: store.get('ts.rm') !== '0',
    rstyle: store.get('ts.rstyle') || 'candles', hide: store.get('ts.hide') === '1', scene: store.get('motionScene') || 'ember', size: store.get('motionSize') || 'story', dim: 55,
    ovStyle: window.StoryOverlay ? window.StoryOverlay.suggest(trade) : 'trend', ovShow: 'pct', ovAd: true, ovCandles: true, ovScrim: false, ovBake: false, quote: 0,
  };
  if (!['result', 'chart', 'replay', 'motion', 'overlay'].includes(A.card) || (A.card === 'overlay' && !isAdmin)) A.card = 'replay';
  if (!['ember', 'candles', 'bars'].includes(A.scene)) A.scene = 'ember';
  if (!['candles', 'line', 'terminal', 'minimal'].includes(A.rstyle)) A.rstyle = 'candles';   // "my photo" needs a new pick each visit
  if (!['a', 'b', 'c'].includes(A.tpl)) A.tpl = 'a';
  if (!['story', 'post'].includes(A.size)) A.size = 'story';
  let photo = null, mediaFile = null, step = 0;
  const VIDEO = () => A.card === 'replay' || A.card === 'motion';

  // ---------- the engines ----------
  const c1 = $('c1'), c2 = $('c2'), mv = $('mv'), ov = $('ov');
  const drawPics = () => window.TradeCards.render(c1, c2, trade, { tpl: A.tpl, mode: A.mode, rm: A.rm });
  const mc = window.MotionCard.create(mv, trade, { scene: 'replay', size: A.size, mode: A.mode, rm: A.rm });
  const mopts = () => (A.card === 'replay'
    ? { scene: 'replay', rstyle: A.rstyle === 'photo' ? 'line' : A.rstyle, rphoto: A.rstyle === 'photo', hide: A.hide, size: A.size, mode: A.mode, rm: A.rm, dim: A.dim / 100 }
    : { scene: A.scene, rphoto: false, hide: false, size: A.size, mode: A.mode, rm: A.rm, dim: A.dim / 100 });
  const drawOv = (forSave) => ov && window.StoryOverlay.render(ov, trade, {
    style: A.ovStyle, quote: A.quote, show: A.ovShow, ad: A.ovAd, scrim: A.ovScrim, candles: A.ovCandles,
    photo: photo && (forSave !== true || A.ovBake) ? photo : null,
  });
  let shown = false;   // only animate while the Share tab is open
  function preview() {
    const which = { result: c1, chart: c2, replay: mv, motion: mv, overlay: ov }[A.card];
    [c1, c2, mv, ov].forEach((cv) => { if (cv) cv.hidden = cv !== which; });
    if (VIDEO()) { mc.set(mopts()); if (shown) mc.play(); } else mc.stop();
    if (A.card === 'result' || A.card === 'chart') drawPics();
    if (A.card === 'overlay') drawOv();
  }
  window.addEventListener('trade-pane', (e) => { shown = e.detail === 'share'; if (shown && VIDEO()) mc.play(); else mc.stop(); });

  // ---------- steps ----------
  const PHOTO = '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-6-5-9 7"/>';
  const I = {
    result: '<path d="M4 17l5-5 4 3 7-8"/><circle cx="20" cy="7" r="1.5"/>', chart: '<path d="M7 4v16M7 8H5v6h2M17 6v14M17 9h-2v7h2M12 3v8M12 5h-2v4h2"/>',
    replay: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/>', motion: '<path d="M12 3c2 4 6 6 6 11a6 6 0 01-12 0c0-3 2-4 3-7 1 2 3 3 3 5"/>',
    overlay: '<rect x="4" y="4" width="16" height="16" rx="2" stroke-dasharray="3 3"/><path d="M8 15l3-3 2 2 3-4"/>',
    money: '<path d="M12 3v18M16 7c-1-1.5-2.5-2-4-2-2.5 0-4 1.3-4 3s1.5 2.5 4 3 4 1.5 4 3.3-1.7 3-4 3c-1.8 0-3.3-.6-4.2-2"/>', r: '<path d="M5 19V5h6a4 4 0 010 8H5M11 13l6 6"/>', pct: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    candles: '<path d="M7 4v16M7 8H5v6h2M17 6v14M17 9h-2v7h2"/>', line: '<path d="M3 17l5-6 4 3 8-9"/>', terminal: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>', minimal: '<path d="M4 12h16"/>',
    photo: PHOTO, own: PHOTO, ember: '<path d="M12 3c2 4 6 6 6 11a6 6 0 01-12 0c0-3 2-4 3-7 1 2 3 3 3 5"/>', bars: '<path d="M4 6h16M4 10h11M4 14h14M4 18h8"/>',
    story: '<rect x="7" y="3" width="10" height="18" rx="2"/>', post: '<rect x="5" y="4" width="14" height="16" rx="2"/>',
  };
  const ic = (k) => (I[k] ? `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>` : '');
  const chip = (v, l, s, on, icon) => `<button type="button" class="ss-chip" data-v="${esc(v)}" aria-pressed="${!!on}">${icon || ''}<span>${esc(l)}${s ? `<small>${esc(s)}</small>` : ''}</span></button>`;
  const CARDS = [['replay', 'Replay video', 'Entry to exit, candle by candle'], ['result', 'Result picture', 'Big number, story size'], ['chart', 'Chart picture', 'The real candles of this trade'],
    ['motion', 'Motion video', 'Your result over moving art'], ...(isAdmin ? [['overlay', 'Story overlay', 'Admin test · see-through PNG']] : [])];
  const stepsFor = () => (A.card === 'overlay'
    ? [{ k: 'Card', h: 'What are you <em>sharing</em>?' }, { k: 'Overlay', h: 'Set up the <em>overlay</em>' }, { k: 'Share', h: 'Ready to <em>post</em>' }]
    : [{ k: 'Card', h: 'What are you <em>sharing</em>?' }, { k: 'Look', h: 'Pick the <em>look</em>' }, { k: 'Result', h: 'Show the result <em>in</em>' }, { k: 'Sign', h: 'How should we <em>sign</em> it?' }, { k: 'Share', h: 'Ready to <em>post</em>' }]);

  const sizeChips = () => `<p class="ss-sub">SIZE</p><div class="ss-chips big" data-key="size">${[['story', 'Story', '9:16 Reels, Stories'], ['post', 'Post', '4:5 feed']].map(([v, l, s]) => chip(v, l, s, A.size === v, ic(v))).join('')}</div>`;
  const photoPick = () => `<div class="ss-act" style="margin-top:14px"><button type="button" class="ss-pill" data-own>${mediaFile ? 'Change photo or clip' : 'Choose photo or clip'}</button>
      <label class="ss-dim">Darken <input type="range" id="tdim" min="0" max="90" value="${A.dim}"></label></div><p class="ss-note">Your photo or clip stays on this device. It is only drawn into the video, never uploaded.</p>`;
  function lookBody() {
    if (A.card === 'replay') return `<div class="ss-chips big" data-key="rstyle">${[['candles', 'Candles', 'Real candles form one by one'], ['line', 'Line', 'One glowing price line'], ['terminal', 'Terminal', 'Desk look, trade clock'], ['minimal', 'Minimal', 'Big number, small line'], ['photo', 'My photo behind', 'Your picture, darkened']].map(([v, l, s]) => chip(v, l, s, A.rstyle === v, ic(v))).join('')}</div>
      ${A.rstyle === 'photo' ? photoPick() : ''}
      <p class="ss-sub">PRICES</p><div class="ss-chips" data-key="hide">${chip('0', 'Show prices', '', !A.hide)}${chip('1', 'Hide prices', 'No entry, stop or target numbers', A.hide)}</div>${sizeChips()}`;
    if (A.card === 'motion') return `<div class="ss-chips big" data-key="scene">${[['ember', 'Ember glow', 'Our orange glow'], ['candles', 'Trade candles', 'Behind the number'], ['bars', 'Volume bars', 'Moving bars'], ['own', 'My photo or clip', 'From your device']].map(([v, l, s]) => chip(v, l, s, A.scene === v, ic(v))).join('')}</div>
      ${A.scene === 'own' ? photoPick() : ''}${sizeChips()}`;
    if (A.card === 'result') return `<div class="ss-chips big" data-key="tpl">${Object.entries(window.TradeCards.styles).map(([v, l]) => chip(v, l, { a: 'Big number, price line', b: 'Chart on top', c: 'Ring and ticket' }[v], A.tpl === v)).join('')}</div>`;
    return '<p class="ss-note" style="margin-top:0">The chart picture always shows the real candles with your entry, stop, target and exit. Nothing to pick here.</p>';
  }
  function overlayBody() {
    return `<div class="ss-chips big" data-key="ovStyle">${Object.entries({ scalper: 'Scalper', trend: 'Trend following', counter: 'Counter trend', swing: 'Swing' }).map(([v, l]) => chip(v, l, '', A.ovStyle === v)).join('')}</div>
      <p class="ss-sub">SHOW</p><div class="ss-chips" data-key="ovShow">${[['pct', '%'], ['r', 'R'], ['pips', 'Pips']].map(([v, l]) => chip(v, l, '', A.ovShow === v)).join('')}</div>
      <p class="ss-sub">ON THE OVERLAY</p><div class="ss-chips" data-multi="ov">${[['ovAd', '5ABI.FX line'], ['ovCandles', 'Candles'], ['ovScrim', 'Dark fade'], ['ovBake', 'Include photo in PNG']].map(([k, l]) => chip(k, l, '', A[k])).join('')}</div>
      <div class="ss-act" style="margin-top:18px"><button type="button" class="ss-pill" data-next-quote>Next quote</button><button type="button" class="ss-pill" data-ovphoto>${photo ? 'Change preview photo' : 'Preview on a photo'}</button></div>`;
  }

  function render() {
    const S = stepsFor(); step = Math.min(step, S.length - 1);
    const s = S[step];
    $('tsteps').innerHTML = S.map((x, i) => `<button type="button" class="${i === step ? 'on' : i < step ? 'done' : ''}" data-step="${i}">${x.k.toUpperCase()}</button>`).join('');
    $('tpb').style.width = ((step + 1) / S.length * 100) + '%';
    let body = '', hint = '';
    if (s.k === 'Card') { body = `<div class="ss-chips big" data-key="card">${CARDS.map(([v, l, h]) => chip(v, l, h, A.card === v, ic(v))).join('')}</div>`; hint = 'Losing trades get the same polish. Every card is made on your device.'; }
    if (s.k === 'Look') { body = lookBody(); hint = A.card === 'replay' ? 'The replay picks the candle size that fits how long you held the trade.' : ''; }
    if (s.k === 'Overlay') { body = overlayBody(); hint = 'Quote, the real candles with entry and exit arrows, and the result. No prices, SL or TP.'; }
    if (s.k === 'Result') {
      body = `<div class="ss-chips big" data-key="mode">${[['money', 'Money'], ['pct', 'Percent'], ['r', 'R multiple']].map(([v, l]) => chip(v, l, '', A.mode === v, ic(v))).join('')}</div>
      <p class="ss-sub">KATANA LINE</p><div class="ss-chips" data-key="rm">${chip('1', 'Risk · Protected by KATANA', '', A.rm)}${chip('0', 'Leave it off', '', !A.rm)}</div>`;
      hint = 'Pick what sounds best for this one.';
    }
    if (s.k === 'Sign') {
      body = `<input class="ss-t" id="thandle" maxlength="40" value="${esc(trade.handle)}" placeholder="Your name or @handle" aria-label="Your handle on the cards">
      <div class="ss-act" style="margin-top:14px"><button type="button" class="ss-pill" data-save-handle>Save handle</button><span class="ss-note" id="hst" style="margin:0"></span></div>`;
      hint = 'It goes on every card you make, here and in Share Studio.';
    }
    if (s.k === 'Share') {
      const pic = !VIDEO();
      body = `<div class="ss-act" style="margin-top:0">${pic ? `<button type="button" class="ss-pill or" data-make-pic>${A.card === 'overlay' ? 'Make overlay PNG' : 'Make picture'}</button>` : `<button type="button" class="ss-pill or" data-make-vid${mc.canRecord() ? '' : ' disabled'}>Make video</button>`}</div><p class="ss-note" id="tst" role="status"></p>`;
      hint = pic ? 'Picture for Stories, X and Discord.' : `A ${A.card === 'replay' ? 10 : 7}-second video for Reels, Stories and TikTok. Keep this page open while it records.`;
      if (!pic && !mc.canRecord()) hint = window.SaveFile.noRecord();
    }
    q.innerHTML = `<p class="ss-k">STEP ${step + 1} OF ${S.length} · ${s.k.toUpperCase()}</p><h2 class="ss-h">${s.h}</h2>${body}<p class="ss-hint">${esc(hint)}</p>
      <div class="ss-act">${step ? '<button type="button" class="ss-ghost" data-nav="-1">← Back</button>' : ''}${step < S.length - 1 ? '<button type="button" class="ss-pill" data-nav="1">Continue →</button>' : ''}</div>`;
    const extra = $('taff');   // "show this trade on my public page" box, under the last step
    if (extra) { extra.hidden = s.k !== 'Share'; if (s.k === 'Share') q.appendChild(extra); }
    q.classList.remove('ss-in'); void q.offsetWidth; q.classList.add('ss-in');
    const d = $('tdim'); if (d) d.oninput = () => { A.dim = Number(d.value); mc.set({ dim: A.dim / 100 }); };
  }

  const pickFile = $('tfile'), ovFile = $('tovfile');
  pickFile.addEventListener('change', (e) => {
    mediaFile = e.target.files[0] || null;
    mc.setBackground(mediaFile).then(() => { preview(); render(); }).catch((err) => { const n = q.querySelector('.ss-hint'); if (n) n.textContent = err.message; });
  });
  if (ovFile) ovFile.addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) { photo = null; drawOv(); return; }
    const img = new Image(); img.onload = () => { photo = img; drawOv(); render(); }; img.src = URL.createObjectURL(f);
  });

  const name = (ext) => `5ABIFX-${String(trade.symbol || 'trade').replace(/[^\w-]+/g, '-')}-${A.card}.${ext}`;
  const deliver = (blob, ext) => {
    const st = $('tst'); if (!st) return;
    if (!blob || !blob.size) { st.textContent = 'It came out empty. Keep this page open while it records and try again.'; return; }
    window.SaveFile.offer({ status: st, blob, name: name(ext), kind: ext === 'png' ? 'picture' : 'video', btn: 'ss-pill or', alt: 'ss-pill' });
  };

  $('tsteps').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) { step = +b.dataset.step; render(); } });
  q.addEventListener('click', (e) => {
    const n = e.target.closest('[data-nav]'); if (n) { step = Math.max(0, step + Number(n.dataset.nav)); render(); return; }
    if (e.target.closest('[data-own]')) { pickFile.click(); return; }
    if (e.target.closest('[data-ovphoto]')) { ovFile.click(); return; }
    if (e.target.closest('[data-next-quote]')) { A.quote++; drawOv(); return; }
    if (e.target.closest('[data-save-handle]')) {
      const v = ($('thandle').value || '').trim().slice(0, 40); trade.handle = v; preview();
      fetch('/journal/handle', { method: 'POST', credentials: 'same-origin', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ card_handle: v, back: String(trade.id || '') }) })
        .then(() => { $('hst').textContent = 'Saved.'; }).catch(() => { $('hst').textContent = 'Could not save. Check your connection and try again.'; });
      return;
    }
    if (e.target.closest('[data-make-pic]')) {
      window.SaveFile.clear($('tst'));
      const cv = A.card === 'overlay' ? ov : A.card === 'chart' ? c2 : c1;
      if (A.card === 'overlay') drawOv(true);
      cv.toBlob((b) => { deliver(b, 'png'); if (A.card === 'overlay') drawOv(); }, 'image/png');
      return;
    }
    const mk = e.target.closest('[data-make-vid]');
    if (mk) {
      const st = $('tst'); mk.disabled = true; window.SaveFile.clear(st);
      mc.record((p) => { st.textContent = 'Making your video… ' + Math.round(p * 100) + '% (keep this page open)'; })
        .then((x) => { mk.disabled = false; mk.textContent = 'Make again'; deliver(x.blob, x.ext); })
        .catch((err) => { mk.disabled = false; st.textContent = err.message; });
      return;
    }
    const b = e.target.closest('.ss-chip'); if (!b) return;
    const box = b.parentElement, v = b.dataset.v;
    if (box.dataset.multi === 'ov') { A[v] = !A[v]; b.setAttribute('aria-pressed', A[v]); drawOv(); return; }
    const key = box.dataset.key;
    box.querySelectorAll('.ss-chip').forEach((x) => x.setAttribute('aria-pressed', x === b));
    if (key && key.startsWith('ov')) { A[key] = v; if (key === 'ovStyle') A.quote = 0; drawOv(); return; }
    if (key === 'card') { A.card = v; store.set('ts.card', v); }
    if (key === 'tpl') { A.tpl = v; store.set('cardStyle', v); }
    if (key === 'mode') { A.mode = v; store.set('ts.mode', v); }
    if (key === 'rm') { A.rm = v === '1'; store.set('ts.rm', v); }
    if (key === 'hide') { A.hide = v === '1'; store.set('ts.hide', v); }
    if (key === 'size') { A.size = v; store.set('motionSize', v); }
    if (key === 'rstyle') { A.rstyle = v; if (v !== 'photo') store.set('ts.rstyle', v); else if (!mediaFile) pickFile.click(); }
    if (key === 'scene') { A.scene = v; if (v !== 'own') store.set('motionScene', v); else if (!mediaFile) pickFile.click(); }
    preview();
    if (['card', 'rstyle', 'scene'].includes(key)) render();
  });

  preview(); render();
  if (document.fonts) {
    Promise.all([
      document.fonts.load('200 100px Sora'), document.fonts.load('300 100px Sora'), document.fonts.load('400 40px Sora'),
      document.fonts.load('400 30px "JetBrains Mono"'), document.fonts.load('500 30px "JetBrains Mono"'), document.fonts.load('400 30px Manrope'),
      ...(isAdmin ? [document.fonts.load('400 100px "DM Serif Display"'), document.fonts.load('italic 400 100px "DM Serif Display"'),
        document.fonts.load('600 30px Montserrat'), document.fonts.load('500 30px Montserrat')] : []),
    ]).catch(() => {}).finally(() => preview());
  }
  if (window.TradeCards.kit.onLogo) window.TradeCards.kit.onLogo(() => preview());
})();
