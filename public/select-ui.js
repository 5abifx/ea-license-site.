/* Members' dropdowns in the site's own glass style instead of the browser's grey Windows / Mac list.
   Every <select> in the members area gets a button + list; the real <select> stays (hidden) and still sends the
   value and the 'change' event, so forms and scripts keep working. Options filled in later are picked up too. */
(function () {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const open = new Set();
  function closeAll(except) { open.forEach((l) => { if (l !== except) { l.hidden = true; l.parentNode.classList.remove('on'); open.delete(l); } }); }
  function enhance(s) {
    if (s.dataset.ui || s.multiple || s.closest('[data-native-select]')) return;
    s.dataset.ui = '1';
    const w = document.createElement('span'); w.className = 'sx' + [...s.classList].map((c) => ' sx--' + c).join('');
    s.parentNode.insertBefore(w, s); w.appendChild(s);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'sx-b'; b.setAttribute('aria-haspopup', 'listbox');
    if (s.getAttribute('aria-label')) b.setAttribute('aria-label', s.getAttribute('aria-label'));
    const l = document.createElement('div'); l.className = 'sx-l'; l.setAttribute('role', 'listbox'); l.hidden = true;
    w.appendChild(b); w.appendChild(l); s.classList.add('sx-native'); s.tabIndex = -1; s.setAttribute('aria-hidden', 'true');
    const label = () => { const o = s.options[s.selectedIndex]; b.innerHTML = `<span>${esc(o ? o.text : '')}</span><i aria-hidden="true"></i>`; b.disabled = s.disabled; };
    const fill = () => { l.innerHTML = [...s.options].map((o, i) => `<button type="button" role="option" data-i="${i}" aria-selected="${i === s.selectedIndex}"${o.disabled ? ' disabled' : ''}>${esc(o.text)}</button>`).join(''); label(); };
    fill();
    new MutationObserver(fill).observe(s, { childList: true, subtree: true, characterData: true, attributes: true });
    s.addEventListener('change', label);
    b.addEventListener('click', (e) => {
      e.stopPropagation(); closeAll(l); label();
      if (l.hidden) {
        fill(); l.hidden = false; w.classList.add('on'); open.add(l);
        // open upwards when there is no room below
        const r = b.getBoundingClientRect(); w.classList.toggle('up', innerHeight - r.bottom < Math.min(300, l.scrollHeight + 12) && r.top > innerHeight - r.bottom);
        const c = l.querySelector('[aria-selected="true"]') || l.firstElementChild; if (c) { c.scrollIntoView({ block: 'nearest' }); c.focus({ preventScroll: true }); }
      } else closeAll();
    });
    l.addEventListener('click', (e) => {
      e.stopPropagation();
      const o = e.target.closest('[data-i]'); if (!o || o.disabled) return;
      const i = +o.dataset.i, changed = i !== s.selectedIndex;
      s.selectedIndex = i; closeAll(); label(); b.focus();
      if (changed) { s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    l.addEventListener('keydown', (e) => {
      const items = [...l.querySelectorAll('[data-i]:not([disabled])')], k = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = items[Math.max(0, Math.min(items.length - 1, k + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) n.focus(); }
      else if (e.key === 'Escape' || e.key === 'Tab') { closeAll(); b.focus(); }
    });
  }
  function scan(root) { (root.querySelectorAll ? root.querySelectorAll('.app-body select') : []).forEach(enhance); }
  document.addEventListener('click', () => closeAll());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  function start() {
    scan(document);
    new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType !== 1) return; if (n.tagName === 'SELECT' && n.closest('.app-body')) enhance(n); else scan(n); }))).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
