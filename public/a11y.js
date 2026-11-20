// Accessibility settings: colour-safe profit/loss colours, bigger text, stronger contrast, optional glass cursor.
// Loaded in <head> on every page so the choice applies before the page paints. Saved in this browser (works before
// sign-up too) and, when signed in, on the account (window.__A11Y from the server) so it follows to other devices.
(function () {
  var KEY = 'a11y';
  var root = document.documentElement;
  var s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
  if (window.__A11Y && typeof window.__A11Y === 'object' && Object.keys(window.__A11Y).length) s = window.__A11Y;   // the account wins

  function apply() {
    if (s.cb && s.cb !== 'off') root.setAttribute('data-cb', s.cb); else root.removeAttribute('data-cb');
    ['big', 'hc', 'cur'].forEach(function (k) { if (s[k]) root.setAttribute('data-' + k, ''); else root.removeAttribute('data-' + k); });
    cursor();
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private window */ }
    if (window.__A11Y) {
      window.__A11Y = s;
      fetch('/api/a11y', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(s) }).catch(function () {});
    }
  }

  // ---- optional dark liquid-glass cursor (PC only) ----
  var gc = null, fine = window.matchMedia && matchMedia('(pointer: fine)').matches;
  var CLICK = 'a, button, [role="button"], label[for], select, summary';
  function move(e) {
    gc.style.transform = 'translate(' + (e.clientX - 5) + 'px,' + (e.clientY - 3) + 'px)';
    var t = e.target, typing = t.closest && t.closest('input, textarea, [contenteditable]');
    gc.classList.toggle('hide', !!typing);
    gc.classList.toggle('hot', !!(t.closest && t.closest(CLICK)));
  }
  function down() { gc.classList.add('down'); } function up() { gc.classList.remove('down'); }
  function leave() { gc.classList.add('hide'); }
  function cursor() {
    var want = !!(s.cur && fine);
    if (want && !gc) {
      if (!document.body) { document.addEventListener('DOMContentLoaded', cursor); return; }
      gc = document.createElement('div'); gc.className = 'gc hide'; gc.setAttribute('aria-hidden', 'true');
      gc.innerHTML = '<svg viewBox="0 0 32 32"><defs><filter id="gcds" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>'
        + '<path d="M5 3 L5 21.5 L9.8 17 L13.2 24.6 L16.4 23.2 L13 15.8 L19.4 15.8 Z" transform="translate(1 2.2)" fill="#000" opacity=".5" filter="url(#gcds)"/></svg>'
        + '<div class="glass"></div>'
        + '<svg viewBox="0 0 32 32"><defs><linearGradient id="gcrg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity=".9"/></linearGradient>'
        + '<linearGradient id="gchl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>'
        + '<path d="M5 3 L5 21.5 L9.8 17 L13.2 24.6 L16.4 23.2 L13 15.8 L19.4 15.8 Z" fill="none" stroke="url(#gcrg)" stroke-width="1.2" stroke-linejoin="round"/>'
        + '<path d="M6.3 5.6 L6.3 15 L11.5 9.8 Z" fill="url(#gchl)" opacity=".55"/><path d="M6.2 6 L6.2 18.6" stroke="#fff" stroke-width=".9" stroke-linecap="round" opacity=".9"/>'
        + '<path d="M14.2 22.6 L12.4 18.7" stroke="#fff" stroke-width=".8" stroke-linecap="round" opacity=".45"/></svg>';
      document.body.appendChild(gc);
      addEventListener('pointermove', move, { passive: true }); addEventListener('pointerdown', down); addEventListener('pointerup', up);
      document.addEventListener('pointerleave', leave);
    } else if (!want && gc) {
      removeEventListener('pointermove', move); removeEventListener('pointerdown', down); removeEventListener('pointerup', up);
      document.removeEventListener('pointerleave', leave);
      gc.remove(); gc = null;
    }
  }

  // ---- the settings panel ----
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="4.5" r="1.8" fill="currentColor" stroke="none"/><path d="M5 8.5l7 1.5 7-1.5M12 10v4.5M12 14.5l-3.2 6M12 14.5l3.2 6"/></svg>';
  var CB = [
    ['off', 'Standard', 'Teal profit, red loss', ['#26c6a0', '#f0464b']],
    ['rg', 'Red-green safe', 'Blue profit, amber loss', ['#4ea8ff', '#ffb000']],
    ['by', 'Blue-yellow safe', 'Green profit, pink loss', ['#3ddc84', '#ff4d7d']],
    ['mono', 'No colour', 'White profit, grey loss', ['#f4f4f5', '#8e8e96']]
  ];
  var TOG = [
    ['big', 'Bigger text', 'Members pages one size larger'],
    ['hc', 'Stronger contrast', 'Brighter grey text and lines'],
    ['cur', 'Glass cursor', 'Dark liquid-glass mouse pointer (computer only)']
  ];
  function open() {
    if (document.querySelector('.a11y-veil')) return;
    var v = document.createElement('div'); v.className = 'a11y-veil';
    v.innerHTML = '<div class="a11y-box" role="dialog" aria-modal="true" aria-labelledby="a11y-h"><h2 id="a11y-h">Accessibility</h2>'
      + '<p>Change how the site looks for you. Saved for next time.</p>'
      + '<div class="a11y-sec"><h3>Profit and loss colours</h3><div class="a11y-opts">'
      + CB.map(function (c) { return '<button type="button" class="a11y-opt" data-cb="' + c[0] + '" aria-pressed="' + ((s.cb || 'off') === c[0]) + '"><span class="a11y-sw"><i style="background:' + c[3][0] + '"></i><i style="background:' + c[3][1] + '"></i></span><span>' + c[1] + '<small>' + c[2] + '</small></span></button>'; }).join('')
      + '</div></div><div class="a11y-sec">'
      + TOG.map(function (t) { return '<div class="a11y-row"><span>' + t[1] + '<small>' + t[2] + '</small></span><button type="button" class="a11y-tg" role="switch" data-k="' + t[0] + '" aria-checked="' + !!s[t[0]] + '" aria-label="' + t[1] + '"></button></div>'; }).join('')
      + '</div><button type="button" class="a11y-done">Done</button></div>';
    document.body.appendChild(v);
    var prev = document.activeElement;
    function close() { v.remove(); document.removeEventListener('keydown', esc); if (prev && prev.focus) prev.focus(); }
    function esc(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', esc);
    v.addEventListener('click', function (e) {
      if (e.target === v || e.target.closest('.a11y-done')) { close(); return; }
      var o = e.target.closest('[data-cb]');
      if (o) { s.cb = o.dataset.cb; v.querySelectorAll('[data-cb]').forEach(function (b) { b.setAttribute('aria-pressed', b === o); }); apply(); save(); return; }
      var t = e.target.closest('.a11y-tg');
      if (t) { s[t.dataset.k] = !s[t.dataset.k]; t.setAttribute('aria-checked', !!s[t.dataset.k]); apply(); save(); }
    });
    v.querySelector('.a11y-opt[aria-pressed="true"]').focus();
  }
  window.openA11y = open;

  function btn(cls) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'a11y-btn' + (cls ? ' ' + cls : '');
    b.setAttribute('aria-label', 'Accessibility'); b.title = 'Accessibility'; b.innerHTML = ICON; return b;
  }
  function mount() {
    // members top bar (PC and phone), next to the What's new star
    document.querySelectorAll('.tb-side .wn-top, .tb-m .wn-top').forEach(function (star) { star.parentNode.insertBefore(btn(), star); });
    // public pages: in the header, next to the menu
    var bar = document.querySelector('header .wrap.bar');
    if (bar && !document.querySelector('.tb')) bar.insertBefore(btn(), bar.querySelector('.menu-btn') || bar.querySelector('nav'));
    // sign-up and sign-in: a labelled chip above the form so it is easy to find
    var form = document.querySelector('.auth-form .card');
    if (form) {
      var chip = document.createElement('button'); chip.type = 'button'; chip.className = 'a11y-inline';
      chip.innerHTML = '<span class="a11y-btn">' + ICON + '</span>Accessibility: colours, text size';
      form.insertBefore(chip, form.firstChild);
    }
    document.addEventListener('click', function (e) { if (e.target.closest('.a11y-btn, .a11y-inline, [data-a11y-open]')) { e.preventDefault(); open(); } });
  }

  apply();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
