/* Trade page Review tab: five short steps (Plan, Feel, Mistakes, Grade, Notes) in the Share Studio look.
   Without this script every step shows at once and the form still saves. */
(function () {
  const sec = document.querySelector('.tr-rev');
  if (!sec) return;
  const form = sec.querySelector('#rv-form'), nav = sec.querySelector('#rv-steps'), pb = sec.querySelector('#rv-pb');
  const panels = [...form.querySelectorAll('.rv-p')];
  const keys = panels.map((p) => p.dataset.step);
  const $$ = (s, r = form) => [...r.querySelectorAll(s)];
  const picked = (n) => $$(`input[name="${n}"]:checked`).map((i) => i.value);
  const notes = form.elements.notes, setup = form.elements.setup;
  let cur = 0;
  sec.classList.add('js');

  const answered = {
    plan: () => picked('followed').length > 0,
    feel: () => picked('feel').length > 0,
    mist: () => picked('mist').length > 0 || cur > 2 || picked('grade').length > 0,
    grade: () => picked('grade').length > 0,
    notes: () => !!(notes && notes.value.trim()),
  };
  const GH = { 'A+': 'Textbook: you would take this exact trade again.', A: 'Good trade with small things to tidy up.', B: 'Okay. Some rules bent, nothing broken.',
    C: 'Sloppy. Write below what pulled you off your plan.', F: 'Broke your rules. Worth a note so it does not repeat.' };

  function paint() {
    nav.querySelectorAll('button').forEach((b, i) => { b.classList.toggle('on', i === cur); b.classList.toggle('done', i !== cur && answered[keys[i]]()); });
    const done = keys.filter((k) => answered[k]()).length;
    pb.style.width = `${Math.max(cur / (keys.length - 1), done / keys.length) * 100}%`;
    const g = picked('grade')[0], gb = document.getElementById('rv-gb');
    if (gb && gb.textContent !== (g || '?')) { gb.textContent = g || '?'; gb.classList.toggle('e', !g); gb.classList.remove('pop'); void gb.offsetWidth; gb.classList.add('pop'); }
    const tab = document.querySelector('#ttabs [data-go="review"]'); if (tab) tab.textContent = g ? `Review · ${g}` : 'Review';
    const gh = document.getElementById('rv-ghint'); if (gh) gh.textContent = g ? GH[g] || '' : 'Not the money. A losing trade can be an A+ if you followed your rules.';
    const cl = document.getElementById('rv-clean'); if (cl) cl.textContent = picked('mist').length ? `${picked('mist').length} ticked. Spotting them is how they stop.` : 'Nothing ticked means a clean trade.';
    const sum = document.getElementById('rv-sum');
    if (sum) {
      const row = (k, v, step) => `<li><span>${k}</span><b>${v ? esc(v) : '<em>not answered</em>'}</b><button type="button" class="rv-edit" data-go="${step}">Edit</button></li>`;
      sum.innerHTML = row('Plan', picked('followed')[0], 0) + row('Setup', setup && setup.value.trim(), 0) + row('Feelings', picked('feel').join(', '), 1)
        + row('Mistakes', picked('mist').join(', ') || (cur === 4 ? 'None' : ''), 2) + row('Grade', picked('grade')[0], 3);
    }
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function go(i, focus) {
    cur = Math.max(0, Math.min(keys.length - 1, i));
    panels.forEach((p, j) => { p.hidden = j !== cur; if (j === cur) { p.classList.remove('ss-in'); void p.offsetWidth; p.classList.add('ss-in'); } });
    paint();
    if (focus) { const top = sec.getBoundingClientRect().top + scrollY - 80; if (scrollY > top) scrollTo({ top, behavior: 'smooth' }); }
  }

  nav.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go([...nav.children].indexOf(b), true); });
  form.addEventListener('click', (e) => {
    if (e.target.closest('[data-next]')) go(cur + 1, true);
    else if (e.target.closest('[data-back]')) go(cur - 1, true);
    const ed = e.target.closest('.rv-edit'); if (ed) go(+ed.dataset.go, true);
    const q = e.target.closest('.rv-quick .ss-chip');
    if (q) {
      const box = q.parentElement, v = q.dataset.v;
      if (box.dataset.for === 'setup' && setup) { setup.value = v; box.querySelectorAll('.ss-chip').forEach((c) => c.setAttribute('aria-pressed', c === q)); }
      if (box.dataset.for === 'notes' && notes) { notes.value = (notes.value.trim() ? notes.value.replace(/\s+$/, '') + '\n' : '') + v + ' '; notes.focus(); notes.setSelectionRange(notes.value.length, notes.value.length); }
      paint();
    }
  });
  // picking a grade moves on to the notes by itself, like Share Studio
  form.addEventListener('change', (e) => {
    paint();
    if (e.target.name === 'grade' && cur === 3) setTimeout(() => go(4), 380);
  });
  form.addEventListener('input', paint);

  // "Tick ..." buttons in the recap answer the matching question
  sec.querySelectorAll('.rv-mark').forEach((b) => b.addEventListener('click', () => {
    const name = b.dataset.mark, v = b.dataset.val;
    let inp = $$(`input[name="${name}"]`).find((i) => i.value.toLowerCase() === v.toLowerCase());
    if (inp) { inp.checked = true; inp.dispatchEvent(new Event('change', { bubbles: true })); }
    b.textContent = '✓ Done'; b.disabled = true;
    go(name === 'followed' ? 0 : name === 'feel' ? 1 : 2, true);
  }));

  sec.querySelectorAll('.rv-mark').forEach((b) => {
    if ($$(`input[name="${b.dataset.mark}"]:checked`).some((i) => i.value.toLowerCase() === b.dataset.val.toLowerCase())) { b.textContent = '✓ Done'; b.disabled = true; }
  });
  if (setup && setup.value) sec.querySelectorAll('.rv-quick[data-for="setup"] .ss-chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.v.toLowerCase() === setup.value.toLowerCase()));
  // open on the first question still unanswered (or the summary when all are done)
  const first = ['plan', 'feel', 'grade'].find((k) => !answered[k]());
  go(first ? keys.indexOf(first) : 4, false);
})();
