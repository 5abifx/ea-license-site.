/* My gallery: recent cards saved in Share Studio (a small picture of each; server: src/gallery.js).
   CardGallery.mount(afterEl) draws the "My gallery" strip under Share Studio; CardGallery.add(blob, meta) saves one. */
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const KIND = { video: 'Video', gif: 'GIF', photo: 'Photo' };
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
  let box = null, cards = [];
  const list = () => fetch('/journal/studio/gallery.json', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => (cards = j.cards || []));
  function draw() {
    if (!box) return;
    box.querySelector('.cg-n').textContent = cards.length ? cards.length + (cards.length === 1 ? ' card' : ' cards') : '';
    box.querySelector('.cg-grid').innerHTML = cards.length
      ? cards.map((c, i) => `<button type="button" class="cg-t${c.w > c.h ? ' wide' : ''}" data-i="${i}"><img src="${esc(c.src)}" alt="" loading="lazy"><span class="cg-k">${KIND[c.kind] || ''}</span><span class="cg-l">${esc(c.label || 'Card')}<small>${esc(when(c.at))}</small></span></button>`).join('')
      : '<p class="cg-empty">Cards you save (video, GIF or photo) show up here, newest first.</p>';
  }
  function open(i) {
    const c = cards[i]; if (!c) return;
    const lb = document.createElement('div'); lb.className = 'cg-lb'; lb.setAttribute('role', 'dialog'); lb.setAttribute('aria-label', 'Saved card');
    lb.innerHTML = `<div class="cg-lb-in"><img src="${esc(c.src)}" alt="Saved card"><div class="cg-lb-m"><b>${esc(c.label || 'Card')}</b><small>${KIND[c.kind] || ''} · ${esc(when(c.at))}</small>
      <p>This is a picture of the card. The ${c.kind === 'photo' ? 'full-size photo' : c.kind === 'gif' ? 'GIF' : 'video'} itself is where you saved it (Photos or Downloads).</p>
      <div class="cg-lb-b"><button type="button" class="cg-del">Remove</button><button type="button" class="cg-x">Close</button></div></div></div>`;
    const close = () => { lb.remove(); document.removeEventListener('keydown', key); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target.closest('.cg-x')) close(); });
    lb.querySelector('.cg-del').onclick = () => fetch(`/journal/studio/gallery/${c.id}/delete`, { method: 'POST', credentials: 'same-origin' }).then(list).then(() => { draw(); close(); window.dispatchEvent(new Event('gallery:change')); });
    document.addEventListener('keydown', key); document.body.appendChild(lb); lb.querySelector('.cg-x').focus();
  }
  function mount(after) {
    box = document.createElement('section'); box.className = 'cg'; box.id = 'gallery';
    box.innerHTML = '<div class="cg-h"><b>My gallery</b><span class="cg-n"></span></div><div class="cg-grid"></div>';
    after.parentNode.insertBefore(box, after.nextSibling);
    box.addEventListener('click', (e) => { const t = e.target.closest('.cg-t'); if (t) open(+t.dataset.i); });
    list().then(draw).then(() => { if (location.hash === '#gallery') box.scrollIntoView({ block: 'start' }); }).catch(() => {});
  }
  function add(blob, meta) {
    if (!blob) return Promise.resolve();
    const q = new URLSearchParams({ label: meta.label || '', kind: meta.kind || 'photo', w: meta.w || '', h: meta.h || '' });
    return fetch('/journal/studio/gallery?' + q, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'image/jpeg' }, body: blob })
      .then(list).then(() => { draw(); window.dispatchEvent(new Event('gallery:change')); }).catch(() => {});
  }
  window.CardGallery = { mount, add, list };
})();
