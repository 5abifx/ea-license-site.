/* Owner's Share Studio: one panel instead of the steps.
   Trade / Daily / Weekly / Monthly tabs, live card, Replay, then Background / Adjust / Format / Text tabs,
   clip tiles (free Pixabay / Pexels clips by topic, never stored), own upload, Share + Video / GIF / Photo.
   Called from public/studio.js with its state (only when the page says owner). */
window.StudioOwner = function (S) {
  const { D, cc, A, OPTS, DEF, load, store, show, noTick, md, byDay } = S;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ico = (p) => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const I = {
    replay: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>', upload: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
    video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 5v14M17 5v14M3 9h4M3 15h4M17 9h4M17 15h4"/>', gif: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 10h-2v4h2v-2M11 10v4M14 14v-4h3M14 12h2"/>',
    photo: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 21h16"/>',
  };

  // ---------- no trade days: weekdays in the last 30 days without a trade ----------
  const today = new Date(); const ntd = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate() - i)), k = d.toISOString().slice(0, 10), wd = d.getUTCDay();
    if (wd === 0 || wd === 6 || byDay.has(k)) continue;
    ntd.push({ k, l: `No trade day · ${md(k, { weekday: 'short' })}` });
  }
  const TABS = [['trade', 'Trade'], ['day', 'Daily'], ['week', 'Weekly'], ['month', 'Monthly']];
  const pickList = (c) => (c === 'day' ? OPTS.day.map((o) => ({ k: 'd:' + o.k, l: o.l + (o.k === DEF.day ? '  ★' : '') })).concat(ntd.map((o) => ({ k: 'n:' + o.k, l: o.l }))) : OPTS[c].map((o) => ({ k: o.k, l: o.l + (o.k === DEF[c] ? '  ★' : '') })));
  let tab = OPTS.trade.length ? 'trade' : 'day';

  // ---------- backgrounds ----------
  const TOPICS = [['racing', 'Racing'], ['dark', 'Dark city'], ['war', 'War'], ['beast', 'Beasts'], ['fight', 'Fight'], ['supercars', 'Supercars'], ['money', 'Money'], ['watches', 'Watches'], ['fire', 'Fire & storm']];
  const BUILT = [['smoke', 'Smoke'], ['ember', 'Ember'], ['floor', 'Trading floor']];
  const thumbs = {}; let bg = store.get('so.bg') || (D.stock ? 'racing' : 'smoke'), clip = null, more = false, sub = 'bg';

  // ---------- layout ----------
  const wrap = document.querySelector('.ss-wrap');
  ['steps'].forEach((id) => { const e = $(id); if (e) e.hidden = true; });
  const bar = document.querySelector('.ss-bar'); if (bar) bar.hidden = true;
  const title = document.querySelector('.ss-title'); if (title) title.textContent = 'Share';
  wrap.classList.add('so');
  const pv = $('pv'), q = $('q');
  const stage = document.createElement('div'); stage.className = 'so-stage';
  stage.innerHTML = `<div class="so-head"><div class="so-seg" id="soTabs" role="tablist"></div><button type="button" class="so-btn" id="soReplay">${ico(I.replay)}Replay</button></div>
    <select class="so-pick" id="soPick" aria-label="Which one"></select>`;
  wrap.insertBefore(stage, pv); stage.appendChild(pv);
  q.className = 'so-panel';
  q.innerHTML = `<div class="so-tabs" id="soSub" role="tablist">${[['bg', 'Background'], ['adj', 'Adjust'], ['fmt', 'Format'], ['txt', 'Text']].map(([k, l]) => `<button type="button" data-sub="${k}">${l}</button>`).join('')}</div>
    <div id="soBody"></div>
    <button type="button" class="so-share" id="soShare">${ico(I.share)}Share</button>
    <div class="so-out"><button type="button" class="so-btn" id="soVid">${ico(I.video)}Video</button><button type="button" class="so-btn" id="soGif">${ico(I.gif)}GIF</button><button type="button" class="so-btn" id="soPng">${ico(I.photo)}Photo</button></div>
    <p class="ss-note" id="st" role="status"></p>`;

  function paintTabs() {
    $('soTabs').innerHTML = TABS.filter(([k]) => OPTS[k].length || k === 'day').map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${tab === k}">${l}</button>`).join('');
    const list = pickList(tab), cur = tab === 'day' ? (A.card === 'notrade' ? 'n:' + A.pick.notrade : 'd:' + A.pick.day) : A.pick[tab];
    $('soPick').innerHTML = list.map((o) => `<option value="${esc(o.k)}"${o.k === cur ? ' selected' : ''}>${esc(o.l)}</option>`).join('');
  }
  function choose(v) {
    if (tab === 'day' && v.startsWith('n:')) { A.card = 'notrade'; A.pick.notrade = v.slice(2); }
    else if (tab === 'day') { A.card = 'day'; A.pick.day = v.slice(2); }
    else { A.card = tab; A.pick[tab] = v; }
    load(); paintBody();
  }
  $('soTabs').onclick = (e) => { const b = e.target.closest('[data-tab]'); if (!b) return; tab = b.dataset.tab; const l = pickList(tab); paintTabs(); if (l.length) choose(tab === 'day' ? 'd:' + (DEF.day || (OPTS.day[0] || {}).k) : (DEF[tab] || l[0].k)); };
  $('soPick').onchange = (e) => choose(e.target.value);
  $('soReplay').onclick = () => cc.play();
  $('soSub').onclick = (e) => { const b = e.target.closest('[data-sub]'); if (b) { sub = b.dataset.sub; paintBody(); } };

  // ---------- tab bodies ----------
  const chip = (key, v, l, on, extra) => `<button type="button" class="ss-chip" data-key="${key}" data-v="${esc(v)}" aria-pressed="${!!on}">${extra || ''}<span>${esc(l)}</span></button>`;
  const tile = (v, l, on) => `<button type="button" class="so-tile" data-bg="${esc(v)}" aria-pressed="${!!on}"${thumbs[v] ? ` style="background-image:url('${esc(thumbs[v])}')"` : ''}><span>${esc(l)}</span></button>`;
  function paintBody() {
    document.querySelectorAll('#soSub [data-sub]').forEach((b) => b.setAttribute('aria-selected', b.dataset.sub === sub));
    const o = cc.get(); let h = '';
    if (sub === 'bg') {
      const all = (D.stock ? TOPICS : []).concat(BUILT), first = all.slice(0, 8), rest = all.slice(8);
      h = `<div class="so-grid">${first.map(([v, l]) => tile(v, l, bg === v)).join('')}${more ? rest.map(([v, l]) => tile(v, l, bg === v)).join('') : ''}</div>
        ${rest.length ? `<button type="button" class="so-more" id="soMore">${more ? 'Less' : `More (${rest.length})`} <span>${more ? '▴' : '▾'}</span></button>` : ''}
        <div class="so-row"><button type="button" class="so-btn wide" id="soUp">${ico(I.upload)}Upload image, GIF or video</button><button type="button" class="so-btn" id="soRm">Remove</button></div>
        <p class="ss-note" id="credit"></p>`;
    }
    if (sub === 'adj') {
      h = `<p class="ss-sub">DARKEN</p><input type="range" id="soDim" min="0" max="0.9" step="0.05" value="${o.dim}" class="so-range" aria-label="Darken">
        <p class="ss-sub">COLOUR</p><div class="ss-chips">${Object.entries(window.CineCard.grades).map(([v, l]) => chip('grade', v, l, o.grade === v, `<i class="ss-sw" style="background:${{ natural: 'linear-gradient(135deg,#6a8,#c84)', bw: 'linear-gradient(135deg,#fff,#222)', ember: '#ff6a2a', blood: '#c3141d', teal: '#13a88a', gold: '#d9a441' }[v] || '#888'}"></i>`)).join('')}</div>
        <p class="ss-sub">NUMBER</p><div class="ss-chips">${chip('color', '', 'White', !o.color)}${chip('color', '1', 'Green and silver', !!o.color)}</div>`;
    }
    if (sub === 'fmt') {
      h = `<p class="ss-sub">SIZE</p><div class="ss-chips">${[['story', 'Story 9:16'], ['post', 'Post 4:5'], ['wide', 'Wide 16:9']].map(([v, l]) => chip('size', v, l, o.size === v)).join('')}</div>
        ${o.size === 'wide' ? `<p class="ss-sub">LAYOUT</p><div class="ss-chips">${chip('layout', 'center', 'Centred', o.layout !== 'split')}${chip('layout', 'split', 'Number left, chart right', o.layout === 'split')}</div>` : ''}
        <p class="ss-sub">SHOW THE RESULT IN</p><div class="ss-chips">${[['money', 'Money'], ['pips', 'Pips'], ['r', 'R'], ['pct', '%']].map(([v, l]) => chip('unit', v, l, o.unit === v)).join('')}</div>
        <p class="ss-sub">VIDEO LENGTH</p><div class="ss-chips">${[[8, '8 s'], [12, '12 s'], [15, '15 s']].map(([v, l]) => chip('len', v, l, Number(o.len) === v)).join('')}</div>`;
    }
    if (sub === 'txt') {
      const nt = A.card === 'notrade';
      h = `<p class="ss-sub">${nt ? 'NOTE IN THE ORANGE TAG' : 'QUOTE'}</p><input class="ss-t" id="soQuote" maxlength="70" value="${esc(A.quote)}" placeholder="${nt ? 'e.g. EU chopping around today' : 'e.g. Discipline is the edge'}">
        <p class="ss-sub">NAME NEXT TO KATANA</p><input class="ss-t" id="soTag" maxlength="24" value="${esc(A.tag)}" placeholder="Your name or @handle">
        <div class="so-row"><button type="button" class="so-btn" id="soAv">${cc.hasAvatar() ? 'Remove my photo' : '+ My photo next to the name'}</button></div><input type="file" id="soAvF" accept="image/*" hidden>
        ${nt ? '' : `<p class="ss-sub">ON THE CARD</p><div class="ss-chips">${Object.entries(window.CineCard.fields[o.kind]).map(([k, l]) => chip('show', k, l, !!o.show[k])).join('')}</div>`}`;
    }
    $('soBody').innerHTML = h;
    wireBody(); showCredit();
  }
  function wireBody() {
    const m = $('soMore'); if (m) m.onclick = () => { more = !more; paintBody(); };
    const up = $('soUp'); if (up) up.onclick = () => $('own').click();
    const rm = $('soRm'); if (rm) rm.onclick = () => { cc.clearMedia(); clip = null; setBg('smoke'); };
    const dim = $('soDim'); if (dim) dim.oninput = () => cc.set({ dim: Number(dim.value) });
    const qt = $('soQuote'); if (qt) qt.oninput = () => { A.quote = qt.value; store.set('ss.quote', A.quote); cc.set({ quote: A.quote, show: { quote: true } }); };
    const tg = $('soTag'); if (tg) tg.oninput = () => { A.tag = tg.value; store.set('ss.tag', A.tag); cc.set({ tag: A.tag }); };
    const av = $('soAv'), avf = $('soAvF');
    if (av) av.onclick = () => { if (cc.hasAvatar()) cc.setAvatar(null).then(paintBody); else avf.click(); };
    if (avf) avf.onchange = () => { const f = avf.files[0]; if (f) cc.setAvatar(f).then(paintBody); };
  }
  q.addEventListener('click', (e) => {
    const t = e.target.closest('.so-tile'); if (t) { setBg(t.dataset.bg, t.getAttribute('aria-pressed') === 'true'); return; }
    const b = e.target.closest('.ss-chip'); if (!b || !b.dataset.key) return;
    const k = b.dataset.key, v = b.dataset.v;
    if (k === 'show') { const on = b.getAttribute('aria-pressed') !== 'true'; const kind = cc.get().kind; show[kind] = Object.assign({}, cc.get().show, { [v]: on }); store.set('ss.show', JSON.stringify(show)); cc.set({ show: { [v]: on } }); }
    else if (k === 'color') cc.set({ color: !!v });
    else if (k === 'len') { cc.set({ len: Number(v) }); store.set('ss.len', v); A.len = Number(v); }
    else { cc.set({ [k]: v }); A[k] = v; store.set('ss.' + k, v); if (k === 'size') { A.size = v; wrap.classList.toggle('is-wide', v === 'wide'); } }
    cc.play(); paintBody();
  });

  // ---------- backgrounds: topic tiles shuffle a clip; built-in looks; own upload ----------
  function setBg(v, again) {
    bg = v; store.set('so.bg', v);
    if (BUILT.some(([k]) => k === v)) { cc.clearMedia(); clip = null; cc.set({ art: v }); cc.play(); paintBody(); return; }
    if (v === 'own') { paintBody(); return; }
    paintBody(); const cr = $('credit'); if (cr) cr.textContent = again ? 'Shuffling…' : 'Finding a clip…';
    fetch('/journal/studio/clips?topic=' + encodeURIComponent(v) + (cc.get().size === 'wide' ? '&wide=1' : ''), { credentials: 'same-origin' })
      .then((r) => r.json()).then((j) => {
        const l = (j.clips || []).filter((x) => !clip || x.url !== clip.url);
        if (!l.length) throw new Error('No clips came back for this one. Tap it again.');
        clip = l[Math.floor(Math.random() * l.length)];
        if (clip.thumb) thumbs[v] = clip.thumb;
        return cc.setBackgroundUrl(clip.url, '/journal/studio/clip?u=' + encodeURIComponent(clip.url));
      })
      .then(() => { cc.set({ art: 'own' }); cc.play(); paintBody(); })
      .catch((e) => { const c2 = $('credit'); if (c2) c2.textContent = e.message || 'Could not load a clip. Try again.'; });
  }
  function showCredit() {
    const c2 = $('credit'); if (!c2) return;
    if (clip && bg !== 'own' && !BUILT.some(([k]) => k === bg)) c2.innerHTML = `Clip by ${esc(clip.by || 'a creator')} on <a href="${esc(clip.page)}" target="_blank" rel="noopener">${esc(clip.src || 'Pixabay')}</a> · tap the tile again to shuffle`;
    else if (bg === 'own') c2.textContent = 'Your own file. It stays on this device.';
    else c2.textContent = '';
  }
  $('own').onchange = (e) => { const f = e.target.files[0]; if (!f) return; cc.setBackground(f).then(() => { bg = 'own'; clip = null; cc.set({ art: 'own' }); cc.play(); paintBody(); }); };
  // a picture on every topic tile: one quick search per topic (cached on the server for an hour)
  if (D.stock) TOPICS.forEach(([v]) => fetch('/journal/studio/clips?topic=' + v, { credentials: 'same-origin' }).then((r) => r.json()).then((j) => { const t = (j.clips || []).find((x) => x.thumb); if (t) { thumbs[v] = t.thumb; const el = q.querySelector(`.so-tile[data-bg="${v}"]`); if (el) el.style.backgroundImage = `url('${t.thumb}')`; } }).catch(() => {}));

  let last = null;
  // ---------- export ----------
  // Anything changed after a video was made (size, background, text, which trade...) makes that video old: drop it and
  // its Save button, so Share / Save never hand over the previous version (a 4:5 video got cropped in a Story).
  const stale = () => { const st = $('st'); if (!last || !st) return; last = null; if (window.SaveFile) window.SaveFile.clear(st); st.textContent = 'Changed. Tap Video, GIF or Photo to make the new version.'; };
  ['set', 'data', 'setBackground', 'setBackgroundUrl', 'setAvatar', 'clearMedia'].forEach((k) => { const f = cc[k]; if (f) cc[k] = function () { stale(); return f.apply(cc, arguments); }; });
  const name = (ext) => `5abifx-${A.card}-${(A.pick[A.card] || '').replace(/[^\w-]+/g, '-')}.${ext}`;
  function deliver(x) {
    const st = $('st'); last = x;
    if (!x || !x.blob || !x.blob.size) { st.textContent = 'It came out empty. Keep this page open while it is made and try again.'; return; }
    toGallery(x.ext);
    if (window.SaveFile) { window.SaveFile.offer({ status: st, blob: x.blob, name: name(x.ext), kind: x.ext === 'png' ? 'picture' : 'video', btn: 'ss-pill or', alt: 'ss-pill' }); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(x.blob); a.download = name(x.ext); document.body.appendChild(a); a.click(); a.remove();
  }
  // every saved card also lands in "My gallery" (a small picture only)
  function toGallery(ext) {
    if (!cc.thumb || !window.CardGallery) return;
    const o = $('soPick') && $('soPick').selectedOptions[0], label = ((o && o.text) || '').replace(/\s*★\s*$/, '').trim();
    cc.thumb().then((t) => window.CardGallery.add(t.blob, { label, kind: ext === 'png' ? 'photo' : ext === 'gif' ? 'gif' : 'video', w: t.w, h: t.h })).catch(() => {});
  }
  const busy = (on) => ['soVid', 'soGif', 'soPng', 'soShare'].forEach((id) => { $(id).disabled = on; });
  const prog = (w) => (p) => { $('st').textContent = `Making your ${w}… ${Math.round(p * 100)}% (keep this page open)`; };
  const make = {
    video: () => cc.record(prog('video')),
    gif: () => cc.gif(prog('GIF')),
    png: () => cc.still(true).then((b) => ({ blob: b, ext: 'png' })),
  };
  function run(kind) {
    busy(true); if (window.SaveFile) window.SaveFile.clear($('st'));
    return make[kind]().then((x) => { busy(false); deliver(x); return x; }).catch((e) => { busy(false); $('st').textContent = e.message || 'Something went wrong. Try again.'; });
  }
  $('soVid').onclick = () => run('video');
  $('soGif').onclick = () => run('gif');
  $('soPng').onclick = () => run('png');
  // Share: the phone's share sheet (Instagram, WhatsApp...) with the video; falls back to saving
  $('soShare').onclick = () => {
    const go = (x) => {
      if (!x || !x.blob) return;
      const f = new File([x.blob], name(x.ext), { type: x.blob.type });
      if (navigator.canShare && navigator.canShare({ files: [f] })) navigator.share({ files: [f] }).catch(() => {});
      else $('st').textContent = 'This browser cannot share files directly. Use the Save button above, then post it from your gallery.';
    };
    if (last && last.ext !== 'png') go(last); else run('video').then(go);
  };

  wrap.classList.toggle('is-wide', cc.get().size === 'wide');
  if (window.CardGallery) window.CardGallery.mount(wrap);
  if (D.stock && !BUILT.some(([k]) => k === bg)) setBg(bg); else { if (BUILT.some(([k]) => k === bg)) cc.set({ art: bg }); }
  paintTabs(); choose(tab === 'day' ? 'd:' + DEF.day : DEF[tab] || (OPTS[tab][0] || {}).k);
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => cc.play());
};
