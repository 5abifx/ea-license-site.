// Log trade + review chips: own chips, the live "record" column, and the draft kept on this device.
(() => {
  if (window.__lt) return; window.__lt = 1;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
  const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`; };

  // journal page: "Untitled trade" strip when a draft is waiting
  $$('#lt-draft').forEach((el) => {
    const d = store.get(el.dataset.draft);
    if (!d || !d.at) return;
    const sym = (d.f.find(([k]) => k === 'symbol') || [])[1];
    const side = (d.f.find(([k]) => k === 'side') || [])[1];
    $('b', el).textContent = sym ? `Untitled trade · ${sym} ${side === 'SELL' ? 'Sell' : 'Buy'}` : 'Untitled trade';
    $('.muted', el).textContent = `Draft saved on this device · ${ago(d.at)}`;
    el.hidden = false;
    $('[data-lt-del]', el).onclick = () => { store.del(el.dataset.draft); el.hidden = true; };
  });

  // a chip for a word the trader typed
  const addChip = (box, name, v, bad) => {
    v = v.replace(/[<>]/g, '').trim().slice(0, 30);
    if (!v) return;
    const have = $$(`input[name="${name}"]`, box.closest('form') || document).find((i) => i.value.toLowerCase() === v.toLowerCase());
    if (have) { have.checked = true; have.dispatchEvent(new Event('change', { bubbles: true })); return; }
    const l = document.createElement('label'); l.className = 'lt-chip' + (bad ? ' bad' : '') + ' lt-new';
    const i = document.createElement('input'); i.type = 'checkbox'; i.name = name; i.value = v; i.checked = true;
    const s = document.createElement('span'); s.textContent = v; l.append(i, s); box.append(l);
    i.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const ownBox = (inp) => { const name = inp.name.replace(/_own$/, ''); const blk = inp.closest('.lt-blk'); const boxes = $$(`.lt-chips[data-own="${name}"]`, blk); return { name, box: boxes[0] }; };
  const commit = (inp) => { const { name, box } = ownBox(inp); if (!box) return; inp.value.split(/[,;]+/).forEach((v) => addChip(box, name, v, name === 'mist')); inp.value = ''; };
  $$('.lt-own').forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(inp); } });
    inp.addEventListener('blur', () => commit(inp));
  });
  $$('form').forEach((f) => { if ($('.lt-own', f)) f.addEventListener('submit', () => $$('.lt-own', f).forEach(commit)); });

  // ---------- Log trade page ----------
  const form = $('#lt-form');
  if (!form) return;
  const key = form.dataset.draft;
  const R = (k) => $(`[data-r="${k}"]`, form);
  const val = (n) => { const el = form.elements[n]; return el ? (el.value ?? '') : ''; };
  const checked = (n) => $$(`input[name="${n}"]:checked`, form).map((i) => i.value);
  const setR = (k, v, empty) => { const el = R(k); if (!el) return; const t = v || empty; if (el.textContent !== t) { el.textContent = t; el.classList.toggle('e', !v); el.classList.remove('lt-pop'); void el.offsetWidth; el.classList.add('lt-pop'); } };
  const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

  function record() {
    const none = val('kind') === 'none';
    form.classList.toggle('is-none', none);
    const side = val('side') === 'SELL' ? 'Sell' : 'Buy';
    R('side').textContent = none ? 'No-trade day' : `${val('symbol').toUpperCase() || 'Symbol'} · ${side}${val('lots') ? ` · ${val('lots')} lots` : ''}`;
    const p = num(val('net')), big = R('net');
    big.textContent = none ? '–' : p === null ? '$0' : `${p < 0 ? '−' : '+'}$${Math.abs(p).toFixed(2)}`;
    big.className = 'lt-big ' + (none || p === null ? '' : p < 0 ? 'neg' : p > 0 ? 'pos' : '');
    const en = num(val('entry')), sl = num(val('sl')), tp = num(val('tp'));
    R('rr').textContent = en && sl && tp && en !== sl ? `1 : ${(Math.abs(tp - en) / Math.abs(en - sl)).toFixed(1)}` : '–';
    const acc = $('input[name="account"]:checked', form);
    setR('account', acc ? acc.closest('label').querySelector('span').textContent.trim() : '', 'Manual');
    setR('followed', checked('followed')[0], 'Not answered');
    setR('feel', checked('feel').join(', '), 'Not answered');
    setR('mist', checked('mist').join(', '), 'None');
    const g = checked('grade')[0] || '–', gb = R('grade');
    if (gb.textContent !== g) { gb.textContent = g; gb.classList.remove('lt-pop'); void gb.offsetWidth; gb.classList.add('lt-pop'); }
    const steps = none ? [checked('why').length, checked('feel').length, val('notes')]
      : [val('symbol'), val('entry'), val('exit'), val('net'), checked('followed').length, checked('feel').length, checked('grade').length];
    const done = steps.filter(Boolean).length;
    $('.lt-prog i', form).style.width = `${(done / steps.length) * 100}%`;
    return done;
  }

  // draft: every change is kept on this device until Save
  const fields = () => [...new FormData(form).entries()].filter(([k, v]) => !/_own$/.test(k) && typeof v === 'string');
  const blank = JSON.stringify(fields());
  let t0 = 0;
  const save = () => {
    const f = fields();
    if (JSON.stringify(f) === blank) return;
    store.set(key, { at: Date.now(), f, n: record() });
    const st = $('.lt-st', form); st.classList.add('on');
  };
  form.addEventListener('input', () => { record(); clearTimeout(t0); t0 = setTimeout(save, 400); });
  form.addEventListener('change', () => { record(); clearTimeout(t0); t0 = setTimeout(save, 200); });
  form.addEventListener('submit', () => store.del(key));

  const restore = (d) => {
    $$('input[type=checkbox],input[type=radio]', form).forEach((i) => { i.checked = false; });
    const multi = {};
    d.f.forEach(([k, v]) => {
      const els = $$(`[name="${k}"]`, form);
      if (!els.length) return;
      if (els[0].type === 'checkbox' || els[0].type === 'radio') {
        const hit = els.find((e) => e.value === v);
        if (hit) hit.checked = true;
        else if (els[0].type === 'checkbox') { const box = els[0].closest('.lt-chips'); if (box) addChip(box, k, v, k === 'mist'); }
      } else { multi[k] = (multi[k] || 0); if (els[multi[k]]) els[multi[k]].value = v; multi[k]++; }
    });
    record(); $('.lt-st', form).classList.add('on');
  };

  record();
  const d = store.get(key);
  const dlg = $('#lt-dlg');
  if (d && d.f && dlg) {
    const sym = (d.f.find(([k]) => k === 'symbol') || [])[1];
    const side = (d.f.find(([k]) => k === 'side') || [])[1];
    const none = (d.f.find(([k]) => k === 'kind') || [])[1] === 'none';
    $('[data-d="t"]', dlg).textContent = none ? 'No-trade day' : sym ? `Untitled trade · ${sym} ${side === 'SELL' ? 'Sell' : 'Buy'}` : 'Untitled trade';
    $('[data-d="s"]', dlg).textContent = `${d.n || 0} of 7 answered · ${ago(d.at)}`;
    dlg.hidden = false;
    const close = () => { dlg.classList.add('out'); setTimeout(() => { dlg.hidden = true; }, 220); };
    $('[data-d="go"]', dlg).onclick = () => { restore(d); close(); };
    $('[data-d="new"]', dlg).onclick = () => { store.del(key); close(); };
    $('[data-d="go"]', dlg).focus();
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Escape') { restore(d); close(); } });
  }
})();
