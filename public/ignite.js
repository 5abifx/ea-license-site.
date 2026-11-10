// "Ignition" for the members area: like a car's dials at start-up, every big number and gauge sweeps up to
// full, then settles on its real value. Runs once per page view, after the journal's loading screen closes.
(function () {
  const main = document.querySelector('.app-body main') || document.querySelector('main');
  if (!main) return;
  const RE = /^([+\-−]?)([$€£]?)(\d[\d,]*)(\.\d+)?(\s?(?:%|R|×|x))?$/;
  const easeIn = (t) => t * t * (3 - 2 * t);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const nice = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= v) || 10 * p; };
  const UP = 650, HOLD = 120, DOWN = 900;

  function numbers() {
    const list = [];
    main.querySelectorAll('b, strong, span, em, div, p, td').forEach((el) => {
      if (el.children.length || el.closest('.pl-hero, .plx, [data-no-ig], table, .tp-scroll')) return;
      const t = el.textContent.trim(), m = RE.exec(t);
      if (!m || parseFloat(getComputedStyle(el).fontSize) < 18) return;
      const val = parseFloat(m[3].replace(/,/g, '') + (m[4] || '')), dec = m[4] ? m[4].length - 1 : 0, suf = (m[5] || '').trim();
      const sign = m[1] === '−' || m[1] === '-' ? -1 : 1;
      const peak = suf === '%' || (!suf && !m[2] && !dec && val <= 100) ? 100 : nice(val * 1.6);
      list.push({ el, t, val, peak, dec, sign, plus: m[1] === '+', pre: m[2], suf: m[5] || '', comma: m[3].includes(',') || val >= 1000 });
    });
    return list;
  }
  const fmt = (n, v) => (n.sign < 0 ? '−' : n.plus ? '+' : '') + n.pre
    + v.toLocaleString('en-US', { minimumFractionDigits: n.dec, maximumFractionDigits: n.dec, useGrouping: n.comma }) + n.suf;

  function bars() {
    return [...main.querySelectorAll('i[style*="width"], b[style*="width"]')].filter((el) => !el.closest('.pl-hero, table')).map((el) => ({ el, w: el.style.width }));
  }
  function arcs() {
    return [...main.querySelectorAll('svg circle[class][stroke-dasharray]')].map((el) => {
      const [a, b] = el.getAttribute('stroke-dasharray').split(/[ ,]+/).map(Number);
      const track = [...el.parentNode.querySelectorAll('circle:not([class])')].find((c) => c.getAttribute('r') === el.getAttribute('r') && c.getAttribute('stroke-dasharray'));
      const max = track ? Number(track.getAttribute('stroke-dasharray').split(/[ ,]+/)[0]) : b;
      return Number.isFinite(a) && Number.isFinite(b) ? { el, a, b, max } : null;
    }).filter(Boolean);
  }

  function run() {
    const N = numbers(), B = bars(), A = arcs();
    if (!N.length && !B.length && !A.length) return;
    document.body.classList.add('ig');
    N.forEach((n) => { n.el.textContent = fmt(n, 0); });
    B.forEach((b) => { b.el.style.transition = 'none'; b.el.style.width = '0%'; });
    A.forEach((c) => c.el.setAttribute('stroke-dasharray', `0 ${c.b}`));
    void main.offsetWidth;
    // up to full
    B.forEach((b) => { b.el.style.transition = `width ${UP}ms cubic-bezier(.5,0,.5,1)`; b.el.style.width = '100%'; });
    const t0 = performance.now();
    (function step(now) {
      const e = now - t0;
      let k, phase;
      if (e < UP) { phase = 0; k = easeIn(e / UP); } else if (e < UP + HOLD) { phase = 1; k = 1; } else { phase = 2; k = easeOut(Math.min(1, (e - UP - HOLD) / DOWN)); }
      N.forEach((n) => {
        const v = phase < 2 ? n.peak * k : n.peak + (n.val - n.peak) * k;
        n.el.textContent = phase === 2 && k >= 1 ? n.t : fmt(n, v);
      });
      A.forEach((c) => { const v = phase < 2 ? c.max * k : c.max + (c.a - c.max) * k; c.el.setAttribute('stroke-dasharray', `${v.toFixed(2)} ${c.b}`); });
      if (phase === 2 && k >= 1) {
        A.forEach((c) => c.el.setAttribute('stroke-dasharray', `${c.a} ${c.b}`));
        return;
      }
      requestAnimationFrame(step);
    })(t0);
    // back down to the real values
    setTimeout(() => B.forEach((b) => { b.el.style.transition = `width ${DOWN}ms cubic-bezier(.2,.7,.2,1)`; b.el.style.width = b.w; }), UP + HOLD);
  }

  // wait for the journal's loading screen / welcome intro to close first
  function start() {
    const busy = () => document.querySelector('.plx, .intro');
    let tries = 0;
    (function wait() { if (busy() && tries++ < 60) return setTimeout(wait, 100); setTimeout(run, 150); })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
