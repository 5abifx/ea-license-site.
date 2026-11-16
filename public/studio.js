/* Share Studio: one question per step (like the sign-up set-up), card preview on the left.
   Builds trade / day / session / week / month / quarter cards from the member's own trades.
   Their own photo or clip stays in the browser; nothing is uploaded. */
(function () {
  const el = document.getElementById('studio-data'); const pv = document.getElementById('pv');
  if (!el || !pv || !window.CineCard) return;
  const D = JSON.parse(el.textContent);
  window.CineCardCur = { EUR: '€', GBP: '£', JPY: '¥', AUD: 'A$', CAD: 'C$', NZD: 'N$', CHF: 'Fr ', INR: '₹' }[D.cur] || '$';
  const $ = (id) => document.getElementById(id);
  const fin = (v) => typeof v === 'number' && isFinite(v);
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

  // ---------- dates ----------
  const T = D.trades.slice().sort((a, b) => (a.c < b.c ? -1 : 1));   // oldest first
  const day = (t) => t.c.slice(0, 10);
  const dt = (k) => new Date(k + 'T00:00:00Z');
  const mon = (k) => { const d = dt(k); return new Date(d - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10); };
  const md = (k, o) => dt(k).toLocaleString('en-US', Object.assign({ month: 'short', day: 'numeric', timeZone: 'UTC' }, o || {}));
  const monthName = (ym) => dt(ym + '-01').toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const quarterOf = (k) => `${k.slice(0, 4)}-Q${Math.floor((Number(k.slice(5, 7)) - 1) / 3) + 1}`;
  const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

  // ---------- sums ----------
  const sumK = (l, k) => { const v = l.filter((t) => fin(t[k])); return v.length ? v.reduce((s, t) => s + t[k], 0) : null; };
  const agg = (l) => ({ money: sumK(l, 'net') || 0, pips: sumK(l, 'pips'), r: sumK(l, 'r'), pct: sumK(l, 'pct') });
  const it = (label, l) => Object.assign({ label }, agg(l));
  const money = (v) => window.CineCard.fmt(v, 'money', true);
  const winTxt = (l) => (l.length ? Math.round(l.filter((t) => t.net > 0).length / l.length * 100) + '%' : '');
  const groupBy = (l, f) => { const m = new Map(); l.forEach((t) => { const k = f(t); if (!m.has(k)) m.set(k, []); m.get(k).push(t); }); return m; };

  function period(kindTxt, title, items, list, bestLabel) {
    const best = items.length ? items.reduce((a, b) => (b.money > a.money ? b : a)) : null;
    const traded = items.filter((x) => x.n !== 0);
    return {
      kind: 'period', kindTxt, title, items, total: agg(list), trades: String(list.length), winRate: winTxt(list),
      green: items.length > 1 ? `${traded.filter((x) => x.money > 0).length} of ${traded.length}` : '',
      best: best && best.money > 0 ? money(best.money) + (bestLabel === 'Best trade' && best.sym ? ' ' + best.sym : '') : '', bestLabel,
      handle: '',
    };
  }

  // ---------- what can be shared ----------
  const byDay = groupBy(T, day), byWeek = groupBy(T, (t) => mon(day(t))), byMonth = groupBy(T, (t) => t.c.slice(0, 7)), byQ = groupBy(T, (t) => quarterOf(day(t)));
  const last = T[T.length - 1], lastDay = last ? day(last) : '';
  const since = (n) => new Date(dt(lastDay) - n * 864e5).toISOString().slice(0, 10);
  const signed = (v) => window.CineCard.fmt(v, 'money', true);
  const pickBest = (opts, from) => { const l = opts.filter((o) => !from || o.k >= from); return (l.length ? l : opts).reduce((a, b) => (b.net > a.net ? b : a), (l.length ? l : opts)[0]); };

  const build = {
    trade(id) {
      const t = T.find((x) => String(x.id) === String(id));
      const held = t.o ? Math.max(0, (Date.parse(t.c.replace(' ', 'T') + 'Z') - Date.parse(t.o.replace(' ', 'T') + 'Z')) / 60000) : null;
      const hTxt = held === null ? '' : held >= 1440 ? `${Math.floor(held / 1440)}d ${Math.round(held % 1440 / 60)}h` : held >= 60 ? `${Math.floor(held / 60)}h ${Math.round(held % 60)}m` : `${Math.round(held)}m`;
      const px = (v) => (fin(v) ? String(v) : '');
      return {
        kind: 'trade', symbol: t.s, side: t.side === 'SELL' ? 'Sell' : 'Buy', dateTxt: md(day(t)), money: t.net, pips: t.pips, r: t.r, pct: t.pct,
        entry: px(t.entry), exit: px(t.exit), sizeTxt: fin(t.lots) ? `${t.lots} lots` : '', heldTxt: hTxt, riskTxt: fin(t.risk) ? `${t.risk.toFixed(2)}%` : '', closes: [], _id: t.id,
      };
    },
    day(k) {
      const l = byDay.get(k) || [];
      return period('DAILY', md(k, { weekday: 'short' }), l.map((t) => Object.assign(it(t.c.slice(11, 16), [t]), { sym: t.s })), l, 'Best trade');
    },
    week(k) {
      const l = byWeek.get(k) || [], g = groupBy(l, (t) => (dt(day(t)).getUTCDay() + 6) % 7);
      const days = [0, 1, 2, 3, 4].concat([5, 6].filter((d) => g.has(d)));
      const end = new Date(dt(k).getTime() + (days[days.length - 1]) * 864e5).toISOString().slice(0, 10);
      const title = k.slice(5, 7) === end.slice(5, 7) ? `${md(k)} – ${Number(end.slice(8))}` : `${md(k)} – ${md(end)}`;
      return period('WEEKLY', title, days.map((d) => Object.assign(it(DOW[d], g.get(d) || []), { n: (g.get(d) || []).length })), l, 'Best day');
    },
    month(k) {
      const l = byMonth.get(k) || [], g = groupBy(l, (t) => mon(day(t)));
      return period('MONTHLY', monthName(k), [...g.keys()].sort().map((w, i) => it('WK ' + (i + 1), g.get(w))), l, 'Best week');
    },
    quarter(k) {
      const l = byQ.get(k) || [], g = groupBy(l, (t) => t.c.slice(0, 7));
      return period('QUARTERLY', k.replace(/(\d{4})-(Q\d)/, '$2 $1'), [...g.keys()].sort().map((m) => it(dt(m + '-01').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase(), g.get(m))), l, 'Best month');
    },
    session(k) {
      const [m, s] = k.split('|'), l = (byMonth.get(m) || []).filter((t) => t.sess === s), g = groupBy(l, day);
      return period(s.toUpperCase() + ' SESSION', monthName(m), [...g.keys()].sort().map((d) => it(String(Number(d.slice(8))), g.get(d))), l, 'Best day');
    },
  };
  // options for each kind, newest first: [key, label, net]
  const recent = T.slice(-80).reverse();
  const OPTS = {
    trade: recent.map((t) => ({ k: String(t.id), at: day(t), net: t.net, l: `${t.s} ${t.side === 'SELL' ? 'sell' : 'buy'} · ${md(day(t))} · ${signed(t.net)}` })),
    day: [...byDay.keys()].reverse().slice(0, 60).map((k) => ({ k, at: k, net: agg(byDay.get(k)).money, l: `${md(k, { weekday: 'short' })} · ${signed(agg(byDay.get(k)).money)}` })),
    session: [...byMonth.keys()].reverse().slice(0, 6).flatMap((m) => [...groupBy(byMonth.get(m), (t) => t.sess).entries()].map(([s, l]) => ({ k: m + '|' + s, at: m, net: agg(l).money, l: `${s} · ${monthName(m)} · ${signed(agg(l).money)}` }))),
    week: [...byWeek.keys()].reverse().slice(0, 26).map((k) => ({ k, at: k, net: agg(byWeek.get(k)).money, l: `Week of ${md(k)} · ${signed(agg(byWeek.get(k)).money)}` })),
    month: [...byMonth.keys()].reverse().slice(0, 12).map((k) => ({ k, at: k, net: agg(byMonth.get(k)).money, l: `${monthName(k)} · ${signed(agg(byMonth.get(k)).money)}` })),
    quarter: [...byQ.keys()].reverse().slice(0, 4).map((k) => ({ k, at: k, net: agg(byQ.get(k)).money, l: `${k.replace(/(\d{4})-(Q\d)/, '$2 $1')} · ${signed(agg(byQ.get(k)).money)}` })),
  };
  // the default pick: best of the recent past (trades and days: 30 days, weeks: 90), else the latest
  const DEF = {
    trade: OPTS.trade.length ? pickBest(OPTS.trade, since(30)).k : '', day: OPTS.day.length ? pickBest(OPTS.day, since(30)).k : '',
    session: OPTS.session.length ? pickBest(OPTS.session.filter((o) => o.at === OPTS.session[0].at)).k : '',
    week: OPTS.week.length ? pickBest(OPTS.week, since(90)).k : '', month: OPTS.month[0] ? OPTS.month[0].k : '', quarter: OPTS.quarter[0] ? OPTS.quarter[0].k : '',
  };
  const NAMES = { trade: ['A trade', 'Best one picked for you'], day: ['A day', ''], session: ['A session', 'London, New York, Asia'], week: ['A week', 'Day by day'], month: ['A month', 'Week by week'], quarter: ['A quarter', 'Month by month'] };

  // ---------- state ----------
  const A = { card: 'week', pick: {}, unit: store.get('ss.unit') || 'money', art: store.get('ss.art') || 'smoke', grade: store.get('ss.grade') || 'bw', size: store.get('ss.size') || 'story', tag: store.get('ss.tag') ?? D.handle ?? '' };
  Object.keys(DEF).forEach((k) => { A.pick[k] = DEF[k]; });
  if (!DEF.week) A.card = 'trade';
  let show = {}; try { show = JSON.parse(store.get('ss.show') || '{}'); } catch { show = {}; }
  const kindOf = (c) => (c === 'trade' ? 'trade' : 'period');
  const dataFor = (c) => build[c](A.pick[c]);

  const cc = window.CineCard.create(pv, dataFor(A.card), { kind: kindOf(A.card), unit: A.unit, art: A.art === 'own' ? 'smoke' : A.art, grade: A.grade, size: A.size, tag: A.tag, show: show[kindOf(A.card)] });
  const lineCache = {};
  function load() {
    const d = dataFor(A.card);
    cc.data(d, kindOf(A.card)); cc.set({ show: show[kindOf(A.card)] || {} }); cc.play();
    if (A.card === 'trade') {   // the real price line of this trade, from its saved candles
      const id = d._id, put = (x) => { if (A.card === 'trade' && A.pick.trade === String(id)) { cc.data(Object.assign(d, x), 'trade'); cc.play(); } };
      if (lineCache[id]) put(lineCache[id]);
      else fetch('/journal/studio/line/' + id, { credentials: 'same-origin' }).then((r) => r.json()).then((x) => { lineCache[id] = x; put(x); }).catch(() => {});
    }
  }

  // ---------- steps ----------
  const I = {
    trade: '<path d="M4 17l5-5 4 3 7-8"/><circle cx="20" cy="7" r="1.5"/>', day: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
    session: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', week: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    month: '<path d="M5 20V10M10 20V4M15 20v-8M20 20v-5"/>', quarter: '<path d="M12 3v9h9A9 9 0 1112 3z"/>',
    money: '<path d="M12 3v18M16 7c-1-1.5-2.5-2-4-2-2.5 0-4 1.3-4 3s1.5 2.5 4 3 4 1.5 4 3.3-1.7 3-4 3c-1.8 0-3.3-.6-4.2-2"/>', pips: '<path d="M4 18h16M6 14l4-4 3 3 5-6"/>', r: '<path d="M5 19V5h6a4 4 0 010 8H5M11 13l6 6"/>', pct: '<path d="M19 5L5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/>',
    smoke: '<path d="M4 15c3-2 5 2 8 0s5-2 8 0M4 10c3-2 5 2 8 0s5-2 8 0"/>', ember: '<path d="M12 3c2 4 6 6 6 11a6 6 0 01-12 0c0-3 2-4 3-7 1 2 3 3 3 5"/>', floor: '<path d="M3 20h18M12 9L4 20M12 9l8 11M12 9v11"/>', own: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-6-5-9 7"/>',
    story: '<rect x="7" y="3" width="10" height="18" rx="2"/>', post: '<rect x="5" y="4" width="14" height="16" rx="2"/>', wide: '<rect x="2" y="6" width="20" height="12" rx="2"/>',
  };
  const ic = (k) => (I[k] ? `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k]}</svg>` : '');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const chip = (v, l, s, on, icon) => `<button type="button" class="ss-chip" data-v="${esc(v)}" aria-pressed="${!!on}">${icon || ''}<span>${esc(l)}${s ? `<small>${esc(s)}</small>` : ''}</span></button>`;
  const unitTxt = (u) => { const d = dataFor(A.card), v = A.card === 'trade' ? d[u] : d.total[u]; return fin(v) ? window.CineCard.fmt(v, u) : 'Not saved for these trades'; };
  const STEPS = [
    { k: 'Card', h: 'What are you <em>sharing</em>?', hint: 'Your best one is picked for you. A losing week gets the same polish.' },
    { k: 'Result', h: 'Show the result <em>in</em>', hint: 'Pick what sounds best for this one.' },
    { k: 'On the card', h: 'What do you want people to <em>see</em>?', hint: 'Only what you are proud of. Anything you leave off stays private.' },
    { k: 'Look', h: 'Pick the <em>mood</em>', hint: 'Your own photo or clip stays on your device. It is never uploaded.' },
    { k: 'Sign', h: 'How should we <em>sign</em> it?', hint: 'Your name or handle goes next to KATANA at the bottom. 5ABIFX sits small in the top corner.' },
    { k: 'Share', h: 'Ready to <em>post</em>', hint: 'Video for Reels, Stories and TikTok. Picture for X and Discord.' },
  ];
  let step = 0, video = null;
  const q = $('q');

  function render() {
    const s = STEPS[step], o = cc.get();
    $('steps').innerHTML = STEPS.map((x, i) => `<button type="button" class="${i === step ? 'on' : i < step ? 'done' : ''}" data-step="${i}">${x.k.toUpperCase()}</button>`).join('');
    $('pb').style.width = ((step + 1) / STEPS.length * 100) + '%';
    let body = '';
    if (s.k === 'Card') {
      body = `<div class="ss-chips big" data-key="card">${Object.keys(NAMES).filter((k) => OPTS[k].length).map((k) => chip(k, NAMES[k][0], NAMES[k][1], A.card === k, ic(k))).join('')}</div>
        <p class="ss-sub">WHICH ONE</p><select class="ss-pick" id="pick" aria-label="Which one">${OPTS[A.card].map((x) => `<option value="${esc(x.k)}"${x.k === A.pick[A.card] ? ' selected' : ''}>${esc(x.l)}${x.k === DEF[A.card] ? '  ★' : ''}</option>`).join('')}</select>`;
    }
    if (s.k === 'Result') body = `<div class="ss-chips big" data-key="unit">${[['money', 'Money'], ['pips', 'Pips'], ['r', 'R multiple'], ['pct', 'Percent']].map(([v, l]) => chip(v, l, unitTxt(v), A.unit === v, ic(v))).join('')}</div>`;
    if (s.k === 'On the card') body = `<div class="ss-chips" data-multi>${Object.entries(window.CineCard.fields[o.kind]).map(([k, l]) => chip(k, l, '', !!o.show[k])).join('')}</div>`;
    if (s.k === 'Look') {
      body = `<div class="ss-chips big" data-key="art">${[['smoke', 'Smoke', 'Soft light, film grain'], ['ember', 'Ember', 'Our orange glow'], ['floor', 'Trading floor', 'Moving grid'], ['own', 'My photo or clip', 'From your device']].map(([v, l, h]) => chip(v, l, h, A.art === v, ic(v))).join('')}</div>
        <p class="ss-sub">COLOUR</p><div class="ss-chips" data-key="grade">${Object.entries(window.CineCard.grades).map(([v, l]) => chip(v, l, '', A.grade === v, `<i class="ss-sw" style="background:${{ natural: 'linear-gradient(135deg,#6a8,#c84)', bw: 'linear-gradient(135deg,#fff,#222)', ember: '#ff6a2a', blood: '#c3141d', teal: '#13a88a', gold: '#d9a441' }[v] || '#888'}"></i>`)).join('')}</div>
        <p class="ss-sub">NUMBER</p><div class="ss-chips" data-key="color">${chip('', 'White', '', !o.color)}${chip('1', 'Green and silver', '', !!o.color)}</div>`;
    }
    if (s.k === 'Sign') {
      body = `<input class="ss-t" id="tag" maxlength="24" value="${esc(A.tag)}" placeholder="Your name or @handle" aria-label="Name tag"><div class="ss-tagpv">KATANA<span>×</span><b id="tagpv">${esc(A.tag)}</b></div>
        <p class="ss-sub">SIZE</p><div class="ss-chips big" data-key="size">${[['story', 'Story', '9:16 Reels, Stories'], ['post', 'Post', '4:5 feed'], ['wide', 'Wide', '16:9 X, Discord']].map(([v, l, h]) => chip(v, l, h, A.size === v, ic(v))).join('')}</div>`;
    }
    if (s.k === 'Share') {
      body = `<div class="ss-act" style="margin-top:0"><button type="button" class="ss-pill or" id="rec">Make video</button><button type="button" class="ss-pill" id="png">Save picture</button><button type="button" class="ss-pill" id="shr" hidden>Share</button></div><p class="ss-note" id="st" role="status"></p>`;
    }
    q.innerHTML = `<p class="ss-k">STEP ${step + 1} OF ${STEPS.length} · ${s.k.toUpperCase()}</p><h2 class="ss-h">${s.h}</h2>${body}<p class="ss-hint">${s.hint}</p>
      <div class="ss-act">${step ? '<button type="button" class="ss-ghost" data-nav="-1">← Back</button>' : ''}${step < STEPS.length - 1 ? '<button type="button" class="ss-pill" data-nav="1">Continue →</button>' : ''}</div>`;
    q.classList.remove('ss-in'); void q.offsetWidth; q.classList.add('ss-in');
    const pk = $('pick'); if (pk) pk.onchange = () => { A.pick[A.card] = pk.value; load(); };
    const t = $('tag'); if (t) t.oninput = () => { A.tag = t.value; $('tagpv').textContent = A.tag; store.set('ss.tag', A.tag); cc.set({ tag: A.tag }); };
    if (s.k === 'Share') wireShare();
  }

  const fileName = (ext) => `5abifx-${A.card}-${(A.pick[A.card] || '').replace(/[^\w-]+/g, '-')}.${ext}`;
  function deliver(blob, ext) {
    const st = $('st'), shr = $('shr'), file = new File([blob], fileName(ext), { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {   // phones: share sheet (Instagram, Discord, Save)
      video = file; shr.hidden = false; st.textContent = 'Ready. Tap Share to post or save it.'; return;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    st.textContent = `Saved ${file.name} (${(blob.size / 1e6).toFixed(1)} MB).`;
  }
  function wireShare() {
    const rec = $('rec'), st = $('st');
    if (!cc.canRecord()) { rec.disabled = true; st.textContent = 'This browser cannot make videos. Save picture works, or try Chrome or Safari.'; }
    rec.onclick = () => {
      rec.disabled = true; $('shr').hidden = true;
      cc.record((p) => { st.textContent = 'Making your video… ' + Math.round(p * 100) + '%'; })
        .then((x) => { rec.disabled = false; deliver(x.blob, x.ext); })
        .catch((e) => { rec.disabled = false; st.textContent = e.message; });
    };
    $('png').onclick = () => cc.still().then((b) => deliver(b, 'png'));
    $('shr').onclick = () => { if (video) navigator.share({ files: [video] }).catch(() => {}); };
  }

  $('steps').onclick = (e) => { const b = e.target.closest('[data-step]'); if (b) { step = +b.dataset.step; render(); } };
  q.addEventListener('click', (e) => {
    const n = e.target.closest('[data-nav]'); if (n) { step = Math.max(0, Math.min(STEPS.length - 1, step + Number(n.dataset.nav))); render(); return; }
    const b = e.target.closest('.ss-chip'); if (!b) return;
    const box = b.parentElement, v = b.dataset.v;
    if (box.hasAttribute('data-multi')) {
      const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', on);
      const k = cc.get().kind; show[k] = Object.assign({}, cc.get().show, { [v]: on }); store.set('ss.show', JSON.stringify(show));
      cc.set({ show: { [v]: on } }); cc.play(); return;
    }
    const key = box.dataset.key;
    if (key === 'art' && v === 'own') { $('own').click(); return; }
    box.querySelectorAll('.ss-chip').forEach((x) => x.setAttribute('aria-pressed', x === b));
    if (key === 'card') { A.card = v; load(); render(); return; }
    if (key === 'color') { cc.set({ color: !!v }); cc.play(); return; }
    A[key] = v; store.set('ss.' + key, v); cc.set({ [key]: v }); cc.play();
  });
  $('own').onchange = (e) => {
    const f = e.target.files[0]; if (!f) return;
    cc.setBackground(f).then(() => { A.art = 'own'; cc.set({ art: 'own' }); cc.play(); render(); });
  };

  load(); render();
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => cc.play());
})();
