/* Trade cards: draws the result card and the chart card on a canvas.
   Shared by the journal pages. Exposes window.TradeCards. */
(function () {
const SIZES = { story: 1920, post: 1350, square: 1080 };
const state = { tpl: 'katana', size: 'story', mode: 'money', rm: true, candles: { data: [], example: false } };
const D = '"Big Shoulders Display", "Arial Narrow", sans-serif';
const M = '"IBM Plex Mono", ui-monospace, monospace';
const B = '"Hanken Grotesk", system-ui, sans-serif';
const $ = id => document.getElementById(id);
const num = v => { const n = parseFloat(String(v).replace(/,/g, "")); return Number.isFinite(n) ? n : null; };
const MINUS = "−";
const sign = n => (n < 0 ? MINUS : "+");

function money(n) { return n === null ? "—" : sign(n) + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function pctTxt(n) { return n === null ? "—" : sign(n) + Math.abs(n).toFixed(2) + "%"; }
function rTxt(n) { return n === null ? "—" : sign(n) + Math.abs(n).toFixed(2) + "R"; }
function pipsTxt(n) { return n === null ? "" : sign(n) + Math.abs(n).toLocaleString("en-US") + " pips"; }
function primary(t) {
  if (state.mode === "pct") return pctTxt(num(t.pct));
  if (state.mode === "r") return rTxt(num(t.r));
  return money(num(t.pnl));
}
function isWin(t) {
  const v = num(t.pnl) ?? num(t.r) ?? num(t.pct) ?? 0;
  return v >= 0;
}
function duration(t) {
  const a = tsOf(t.open), b = tsOf(t.close);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return "—";
  const m = Math.round((b - a) / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
}
const MON = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
function dayTxt(s) { if (!s || s.length < 10) return ""; return `${Number(s.slice(8,10))} ${MON.at(Number(s.slice(5,7)) - 1)} ${s.slice(0,4)}`; }
function timeTxt(s) { if (!s || s.length < 16) return "—"; return `${Number(s.slice(8,10))} ${MON.at(Number(s.slice(5,7)) - 1)} ${s.slice(11,16)}`; }
function secondary(t) {
  const parts = [pipsTxt(num(t.pips))];
  if (state.mode !== "r") parts.push(rTxt(num(t.r)));
  if (state.mode === "r" && num(t.pct) !== null) parts.push(pctTxt(num(t.pct)));
  parts.push(duration(t));
  return parts.filter(p => p && p !== "—").join("  ·  ");
}
function nearly(a, b, ref) { a = num(a); b = num(b); ref = num(ref); if (a === null || b === null) return false; const tol = Math.max(Math.abs(ref ?? a) * 0.00005, 1e-9); return Math.abs(a - b) <= tol; }

/* ---------- canvas helpers ---------- */
function font(ctx, w, size, fam) { ctx.font = `${w} ${size}px ${fam}`; }
function text(ctx, s, x, y, o) {
  font(ctx, o.w || 400, o.size, o.fam || B);
  ctx.fillStyle = o.color; ctx.textAlign = o.align || "left"; ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) ctx.letterSpacing = (o.ls || 0) + "px";
  ctx.fillText(s, x, y);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
}
function fit(ctx, s, maxW, size, w, fam, ls = 0) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = ls + "px";
  let sz = size;
  while (sz > 12) { font(ctx, w, sz, fam); if (ctx.measureText(s).width <= maxW) break; sz -= 2; }
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  return sz;
}
function measure(ctx, s, w, size, fam, ls = 0) {
  font(ctx, w, size, fam);
  if ("letterSpacing" in ctx) ctx.letterSpacing = ls + "px";
  const m = ctx.measureText(s).width;
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  return m;
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function pill(ctx, s, x, y, bg, fg, size = 40) {
  const w = measure(ctx, s, 800, size, D, 3) + 44, h = size + 22;
  rrect(ctx, x, y, w, h, h / 2); ctx.fillStyle = bg; ctx.fill();
  text(ctx, s, x + w / 2, y + h / 2 + size * 0.36, { w: 800, size, fam: D, color: fg, align: "center", ls: 3 });
  return w;
}
/* scale a fixed-height middle block into whatever room the format leaves */
function middle(ctx, W, y0, y1, need, draw) {
  const m = Math.min(1, (y1 - y0) / need);
  const cy = (y0 + y1) / 2;
  ctx.save();
  ctx.translate(W / 2 * (1 - m), cy - need * m / 2);
  ctx.scale(m, m);
  draw();
  ctx.restore();
}
function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/* ---------- templates ---------- */
function drawKatana(ctx, W, H, t) {
  const win = isWin(t), acc = win ? "#e3b341" : "#e5484d", ink = "#f3efe6", dim = "#8d8b85", pad = 80;
  ctx.fillStyle = "#0d0e11"; ctx.fillRect(0, 0, W, H);
  // fine hatching
  ctx.strokeStyle = "rgba(255,255,255,0.025)"; ctx.lineWidth = 2;
  for (let x = -H; x < W; x += 18) { ctx.beginPath(); ctx.moveTo(x, H); ctx.lineTo(x + H, 0); ctx.stroke(); }
  // the slash
  const g = ctx.createLinearGradient(W, 0, 0, H);
  g.addColorStop(0, acc + "00"); g.addColorStop(0.45, acc + "33"); g.addColorStop(1, acc + "00");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(W * 0.78, -20); ctx.lineTo(W * 1.02, -20); ctx.lineTo(W * 0.22, H + 20); ctx.lineTo(-W * 0.02, H + 20); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.globalAlpha = 0.85;
  ctx.beginPath(); ctx.moveTo(W * 0.92, -10); ctx.lineTo(W * 0.1, H + 10); ctx.stroke(); ctx.globalAlpha = 1;

  text(ctx, t.handle || "", pad, pad + 24, { w: 700, size: 34, color: ink });
  text(ctx, ("TRADE CLOSED · " + dayTxt(t.close)).trim(), W - pad, pad + 22, { w: 500, size: 24, fam: M, color: dim, align: "right", ls: 3 });
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(pad, pad + 52, W - 2 * pad, 2);

  const footY = H - pad;
  if (state.rm) text(ctx, `RISK ${num(t.risk) ?? "—"}% · PROTECTED BY KATANA`, pad, footY, { w: 600, size: 24, fam: M, color: acc, ls: 3 });
  text(ctx, t.ticket ? "#" + t.ticket : "", W - pad, footY, { w: 500, size: 24, fam: M, color: dim, align: "right", ls: 2 });
  ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(pad, footY - 50, W - 2 * pad, 2);

  middle(ctx, W, pad + 90, footY - 80, 910, () => {
    const pw = pill(ctx, t.side, pad, 10, acc, "#0d0e11", 38);
    text(ctx, t.setup || "", pad + pw + 24, 56, { w: 500, size: 32, color: dim });
    const s1 = fit(ctx, t.symbol || "", W - 2 * pad, 170, 900, D, 4);
    text(ctx, t.symbol || "", pad - 6, 110 + s1 * 0.82, { w: 900, size: s1, fam: D, color: ink, ls: 4 });
    const res = primary(t), s2 = fit(ctx, res, W - 2 * pad, 300, 900, D);
    text(ctx, res, pad - 8, 330 + s2 * 0.8, { w: 900, size: s2, fam: D, color: acc });
    text(ctx, secondary(t), pad, 640, { w: 500, size: 34, fam: M, color: ink });
    const cols = [pad, pad + (W - 2 * pad) / 3, pad + 2 * (W - 2 * pad) / 3];
    const cells = [["ENTRY", t.entry], ["EXIT", t.exit], ["LOTS", t.lots], ["STOP LOSS", t.sl], ["TAKE PROFIT", t.tp], ["OPENED", timeTxt(t.open)]];
    ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(pad, 690, W - 2 * pad, 2);
    cells.forEach(([k, v], i) => {
      const x = cols.at(i % 3), y = 750 + Math.floor(i / 3) * 100;
      text(ctx, k, x, y - 4, { w: 500, size: 21, fam: M, color: dim, ls: 4 });
      const vs = fit(ctx, String(v || "—"), (W - 2 * pad) / 3 - 20, 38, 600, M);
      text(ctx, String(v || "—"), x, y + 44, { w: 600, size: vs, fam: M, color: ink });
    });
  });
}

function drawPass(ctx, W, H, t) {
  const win = isWin(t), acc = win ? "#1f8a5b" : "#c8372d", paper = "#f4efe4", ink = "#16181d", dim = "#7a756b", outer = "#14213a";
  ctx.fillStyle = outer; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let y = 0; y < H; y += 44) ctx.fillRect(0, y, W, 2);
  const CW = 940, CH = 1500, k = Math.min((W - 110) / CW, (H - 110) / CH);
  ctx.save();
  ctx.translate((W - CW * k) / 2, (H - CH * k) / 2); ctx.scale(k, k);
  ctx.shadowColor = "rgba(0,0,0,0.35)"; ctx.shadowBlur = 40; ctx.shadowOffsetY = 18;
  rrect(ctx, 0, 0, CW, CH, 36); ctx.fillStyle = paper; ctx.fill();
  ctx.shadowColor = "transparent";
  const perf = 1070;
  ctx.fillStyle = outer;
  [0, CW].forEach(x => { ctx.beginPath(); ctx.arc(x, perf, 34, 0, Math.PI * 2); ctx.fill(); });
  ctx.strokeStyle = "#cfc7b6"; ctx.lineWidth = 3; ctx.setLineDash([14, 12]);
  ctx.beginPath(); ctx.moveTo(56, perf); ctx.lineTo(CW - 56, perf); ctx.stroke(); ctx.setLineDash([]);
  const L = 70, R = CW - 70;
  ctx.save(); rrect(ctx, 0, 0, CW, CH, 36); ctx.clip(); ctx.fillStyle = acc; ctx.fillRect(0, 0, CW, 14); ctx.restore();
  text(ctx, "TRADE PASS", L, 112, { w: 900, size: 52, fam: D, color: acc, ls: 6 });
  text(ctx, t.handle || "", R, 106, { w: 700, size: 32, color: ink, align: "right" });
  ctx.fillStyle = "#d9d1c0"; ctx.fillRect(L, 146, R - L, 2);
  const c3 = [L, L + (R - L) * 0.42, L + (R - L) * 0.72];
  [["SYMBOL", t.symbol], ["SIDE", t.side], ["LOTS", t.lots]].forEach(([k2, v], i) => {
    text(ctx, k2, c3.at(i), 214, { w: 500, size: 22, fam: M, color: dim, ls: 4 });
    text(ctx, String(v || "—"), c3.at(i), 290, { w: 800, size: 68, fam: D, color: ink, ls: 2 });
  });
  text(ctx, "ENTRY", L, 400, { w: 500, size: 22, fam: M, color: dim, ls: 4 });
  text(ctx, "EXIT", R, 400, { w: 500, size: 22, fam: M, color: dim, ls: 4, align: "right" });
  const ps = Math.min(fit(ctx, String(t.entry || "—"), 330, 140, 900, D), fit(ctx, String(t.exit || "—"), 330, 140, 900, D));
  text(ctx, String(t.entry || "—"), L - 4, 530, { w: 900, size: ps, fam: D, color: ink });
  text(ctx, String(t.exit || "—"), R + 4, 530, { w: 900, size: ps, fam: D, color: ink, align: "right" });
  const ax0 = CW / 2 - 60, ax1 = CW / 2 + 60, ay = 488;
  ctx.strokeStyle = acc; ctx.lineWidth = 6; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ax1, ay); ctx.moveTo(ax1 - 22, ay - 20); ctx.lineTo(ax1, ay); ctx.lineTo(ax1 - 22, ay + 20); ctx.stroke();
  text(ctx, timeTxt(t.open), L, 584, { w: 500, size: 26, fam: M, color: dim });
  text(ctx, timeTxt(t.close), R, 584, { w: 500, size: 26, fam: M, color: dim, align: "right" });
  ctx.fillStyle = "#d9d1c0"; ctx.fillRect(L, 640, R - L, 2);
  [["STOP LOSS", t.sl], ["TAKE PROFIT", t.tp], ["DURATION", duration(t)]].forEach(([k2, v], i) => {
    text(ctx, k2, c3.at(i), 704, { w: 500, size: 22, fam: M, color: dim, ls: 4 });
    const vs = fit(ctx, String(v || "—"), 240, 56, 800, D);
    text(ctx, String(v || "—"), c3.at(i), 770, { w: 800, size: vs, fam: D, color: ink });
  });
  text(ctx, "SETUP", L, 860, { w: 500, size: 22, fam: M, color: dim, ls: 4 });
  text(ctx, t.setup || "—", L, 916, { w: 600, size: 42, color: ink });
  if (state.rm) {
    rrect(ctx, L, 960, R - L, 64, 12); ctx.fillStyle = acc + "1f"; ctx.fill();
    text(ctx, `RISK ${num(t.risk) ?? "—"}% · PROTECTED BY KATANA RISK MANAGER`, CW / 2, 1001, { w: 600, size: 22, fam: M, color: acc, align: "center", ls: 2 });
  }
  text(ctx, "RESULT", L, 1140, { w: 500, size: 22, fam: M, color: dim, ls: 4 });
  const res = primary(t), rs = fit(ctx, res, 520, 210, 900, D);
  text(ctx, res, L - 6, 1200 + rs * 0.8, { w: 900, size: rs, fam: D, color: acc });
  text(ctx, secondary(t), L, 1420, { w: 500, size: 28, fam: M, color: ink });
  // barcode from the ticket number
  let h = hash(t.ticket || t.symbol || "x"), x = R - 250;
  ctx.fillStyle = ink;
  while (x < R) { h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; const bw = 2 + (h % 4) * 2; ctx.fillRect(x, 1130, bw, 190); x += bw + 3 + ((h >>> 8) % 3) * 2; }
  text(ctx, t.ticket ? "#" + t.ticket : "", R, 1356, { w: 500, size: 22, fam: M, color: dim, align: "right", ls: 3 });
  ctx.restore();
}

function drawMap(ctx, W, H, t) {
  const win = isWin(t), acc = win ? "#34c77b" : "#f05252", ink = "#e8edf6", dim = "#7d8aa5", bg = "#0b1220", pad = 80;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(125,138,165,0.10)"; ctx.lineWidth = 1;
  for (let x = pad; x <= W - pad; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  text(ctx, t.handle || "", pad, pad + 24, { w: 700, size: 34, color: ink });
  text(ctx, dayTxt(t.close), W - pad, pad + 22, { w: 500, size: 24, fam: M, color: dim, align: "right", ls: 3 });
  const hs = H < 1200 ? 0.78 : 1, top = pad + 70;
  ctx.save(); ctx.translate(pad, top); ctx.scale(hs, hs);
  const symSize = fit(ctx, t.symbol || "", (W - 2 * pad) / hs - 260, 130, 900, D, 3);
  text(ctx, t.symbol || "", -4, 120, { w: 900, size: symSize, fam: D, color: ink, ls: 3 });
  pill(ctx, t.side, measure(ctx, t.symbol || "", 900, symSize, D, 3) + 24, 42, acc, bg, 36);
  const res = primary(t), rs = fit(ctx, res, (W - 2 * pad) / hs, 220, 900, D);
  text(ctx, res, -6, 185 + rs * 0.8, { w: 900, size: rs, fam: D, color: acc });
  text(ctx, secondary(t), 0, 455, { w: 500, size: 32, fam: M, color: ink });
  ctx.restore();
  const yA = top + 510 * hs, yB = H - pad - 110;
  const lv = [["TP", num(t.tp), "#34c77b", true], ["SL", num(t.sl), "#f05252", true], ["ENTRY", num(t.entry), "#9db2d6", false], ["EXIT", num(t.exit), acc, false]].filter(l => l[1] !== null);
  if (lv.length >= 2) {
    let lo = Math.min(...lv.map(l => l[1])), hi = Math.max(...lv.map(l => l[1]));
    const span = (hi - lo) || 1; lo -= span * 0.08; hi += span * 0.08;
    const Y = p => yB - (p - lo) / (hi - lo) * (yB - yA);
    const labels = lv.map(l => ({ l, y: Y(l[1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < labels.length; i++) if (labels.at(i).y - labels.at(i - 1).y < 44) labels.at(i).y = labels.at(i - 1).y + 44;
    labels.forEach(({ l: [name, p, col, dash], y: ly }) => {
      const y = Y(p);
      ctx.strokeStyle = col; ctx.lineWidth = name === "EXIT" ? 3 : 2; ctx.setLineDash(dash ? [16, 12] : []);
      ctx.beginPath(); ctx.moveTo(pad + 250, y); ctx.lineTo(W - pad, y); ctx.stroke(); ctx.setLineDash([]);
      text(ctx, name, pad, ly + 9, { w: 600, size: 24, fam: M, color: col, ls: 3 });
      text(ctx, String(p), pad + 236, ly + 9, { w: 500, size: 24, fam: M, color: ink, align: "right" });
    });
    const e = num(t.entry), x = num(t.exit);
    if (e !== null && x !== null) {
      const x0 = pad + 320, x1 = W - pad - 120, y0 = Y(e), y1 = Y(x);
      ctx.strokeStyle = acc; ctx.lineWidth = 7; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0);
      ctx.fillStyle = acc; ctx.beginPath();
      ctx.moveTo(x1 + 10 * Math.cos(a), y1 + 10 * Math.sin(a));
      ctx.lineTo(x1 - 34 * Math.cos(a - 0.45), y1 - 34 * Math.sin(a - 0.45));
      ctx.lineTo(x1 - 34 * Math.cos(a + 0.45), y1 - 34 * Math.sin(a + 0.45)); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(x0, y0, 12, 0, Math.PI * 2); ctx.fillStyle = "#9db2d6"; ctx.fill();
    }
  }
  const fy = H - pad;
  ctx.fillStyle = "rgba(125,138,165,0.25)"; ctx.fillRect(pad, fy - 50, W - 2 * pad, 2);
  if (state.rm) text(ctx, `RISK ${num(t.risk) ?? "—"}% · PROTECTED BY KATANA`, pad, fy, { w: 600, size: 24, fam: M, color: ink, ls: 3 });
  text(ctx, `${t.lots || "—"} LOTS · ${duration(t)}`, W - pad, fy, { w: 500, size: 24, fam: M, color: dim, align: "right", ls: 2 });
}

function drawDiscipline(ctx, W, H, t) {
  const win = isWin(t), acc = win ? "#1f7a50" : "#c8372d", ink = "#121212", dim = "#6f6a60", pad = 90;
  ctx.fillStyle = "#f1eee8"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ink; ctx.fillRect(0, 0, 18, H);
  text(ctx, t.handle || "", pad, pad + 24, { w: 700, size: 34, color: ink });
  text(ctx, dayTxt(t.close), W - pad, pad + 22, { w: 500, size: 24, fam: M, color: dim, align: "right", ls: 3 });
  const atSL = nearly(t.exit, t.sl, t.entry), atTP = nearly(t.exit, t.tp, t.entry);
  const head1 = win ? (atTP ? "TARGET HIT." : "PROFIT TAKEN.") : (atSL ? "STOPPED OUT." : "SMALL LOSS.");
  const head2 = "PLAN FOLLOWED.";
  const checks = [];
  if (num(t.sl) !== null) checks.push(`Stop loss set at ${t.sl}`);
  if (num(t.risk) !== null) checks.push(`Risk capped at ${num(t.risk)}% of the account`);
  if (atSL) checks.push("Closed at the planned stop, no moving it");
  if (atTP) checks.push("Closed at the planned target");
  if (state.rm) checks.push("Guarded by the KATANA risk manager");
  middle(ctx, W, pad + 90, H - pad - 70, 980, () => {
    const s1 = Math.min(fit(ctx, head1, W - 2 * pad, 190, 900, D), fit(ctx, head2, W - 2 * pad, 190, 900, D));
    text(ctx, head1, pad - 6, s1 * 0.85, { w: 900, size: s1, fam: D, color: ink });
    text(ctx, head2, pad - 6, s1 * 1.75, { w: 900, size: s1, fam: D, color: acc });
    const y0 = s1 * 1.75 + 90;
    const line = `${primary(t)}  ·  ${t.symbol || ""} ${t.side}`;
    const ls = fit(ctx, line, W - 2 * pad, 56, 600, M);
    text(ctx, line, pad, y0, { w: 600, size: ls, fam: M, color: ink });
    ctx.fillStyle = "#d8d2c6"; ctx.fillRect(pad, y0 + 40, W - 2 * pad, 2);
    checks.forEach((c, i) => {
      const y = y0 + 120 + i * 84;
      rrect(ctx, pad, y - 34, 44, 44, 8); ctx.fillStyle = acc; ctx.fill();
      ctx.strokeStyle = "#f1eee8"; ctx.lineWidth = 6; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(pad + 11, y - 12); ctx.lineTo(pad + 19, y - 3); ctx.lineTo(pad + 34, y - 22); ctx.stroke();
      const cs = fit(ctx, c, W - 2 * pad - 70, 36, 500, B);
      text(ctx, c, pad + 70, y, { w: 500, size: cs, color: ink });
    });
  });
  text(ctx, win ? "Process first. Profit follows." : "Losses are part of the plan.", pad, H - pad, { w: 600, size: 30, color: dim });
  text(ctx, t.ticket ? "#" + t.ticket : "", W - pad, H - pad, { w: 500, size: 22, fam: M, color: dim, align: "right", ls: 2 });
}

const DRAW = { katana: drawKatana, pass: drawPass, map: drawMap, discipline: drawDiscipline };

function tsOf(s) { if (!s) return null; const v = Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : s + 'Z'); return Number.isFinite(v) ? v : null; }
function parsePartials(t) {
  if (Array.isArray(t.partials)) return t.partials.map(p => ({ price: num(p.price), lots: p.lots != null ? String(p.lots) : "", t: tsOf(p.time) })).filter(p => p.price !== null);
  return [];
}
/* ---------- chart card (slide 2) ---------- */
const PAL = {
  katana: { bg: "#0d0e11", ink: "#f3efe6", dim: "#8d8b85", grid: "rgba(255,255,255,0.06)", up: "#e9e4d8", down: "#55534f", good: "#e3b341", bad: "#e5484d", entry: "#9db2d6", font: D },
  map: { bg: "#0b1220", ink: "#e8edf6", dim: "#7d8aa5", grid: "rgba(125,138,165,0.12)", up: "#dfe6f2", down: "#3c4a66", good: "#34c77b", bad: "#f05252", entry: "#9db2d6", font: D },
  pass: { bg: "#f4efe4", ink: "#16181d", dim: "#7a756b", grid: "rgba(22,24,29,0.07)", up: "#f4efe4", down: "#16181d", good: "#1f8a5b", bad: "#c8372d", entry: "#2c5aa0", font: D },
  discipline: { bg: "#f1eee8", ink: "#121212", dim: "#6f6a60", grid: "rgba(18,18,18,0.07)", up: "#f1eee8", down: "#121212", good: "#1f7a50", bad: "#c8372d", entry: "#2c5aa0", font: D }
};
function tag(ctx, s, x, y, bg, fg, align = "left", size = 24) {
  const w = measure(ctx, s, 600, size, M) + 24, h = size + 18, x0 = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
  rrect(ctx, x0, y - h / 2, w, h, 8); ctx.fillStyle = bg; ctx.fill();
  text(ctx, s, x0 + 12, y + size * 0.35, { w: 600, size, fam: M, color: fg });
  return { x0, w, h };
}
function drawChart(ctx, W, H, t) {
  const P = PAL[state.tpl] || PAL.katana, pad = 70, buy = t.side !== "SELL", win = isWin(t);
  ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
  text(ctx, t.handle || "", pad, pad + 24, { w: 700, size: 34, color: P.ink });
  text(ctx, "2 / 2  ·  THE TRADE", W - pad, pad + 22, { w: 500, size: 24, fam: M, color: P.dim, align: "right", ls: 3 });
  const sym = t.symbol || "", ss = fit(ctx, sym, 520, 104, 900, D, 3);
  text(ctx, sym, pad - 4, pad + 150, { w: 900, size: ss, fam: D, color: P.ink, ls: 3 });
  const sw = measure(ctx, sym, 900, ss, D, 3);
  text(ctx, t.tf || "", pad + sw + 20, pad + 148, { w: 600, size: 30, fam: M, color: P.dim });
  pill(ctx, t.side, pad + sw + 20 + measure(ctx, t.tf || "", 600, 30, M) + 20, pad + 92, buy ? P.good : P.bad, P.bg, 34);
  const res = primary(t);
  text(ctx, res, W - pad, pad + 150, { w: 900, size: fit(ctx, res, 380, 96, 900, D), fam: D, color: win ? P.good : P.bad, align: "right" });

  const x0 = pad, x1 = W - pad - 200, y0 = pad + 210, y1 = H - pad - 170;
  const all = state.candles.data;
  const o = tsOf(t.open), c = tsOf(t.close), e = num(t.entry), x = num(t.exit), sl = num(t.sl), tp = num(t.tp);
  const near = ms => { let best = 0; all.forEach((k, i) => { if (Math.abs(k.t - ms) < Math.abs(all.at(best).t - ms)) best = i; }); return best; };
  if (!all.length || o === null || c === null) {
    text(ctx, "Add candles to draw the chart", W / 2, (y0 + y1) / 2, { w: 600, size: 34, color: P.dim, align: "center" });
    return;
  }
  const io = near(o), ic = near(c);
  let a = Math.max(0, io - 40), b = Math.min(all.length - 1, ic + 18);
  if (b - a > 110) a = Math.max(0, b - 110);
  const cs = all.slice(a, b + 1), n = cs.length;
  const prices = cs.flatMap(k => [k.h, k.l]).concat([e, x, sl, tp].filter(v => v !== null));
  let lo = Math.min(...prices), hi = Math.max(...prices); const sp = (hi - lo) || 1; lo -= sp * 0.06; hi += sp * 0.06;
  const Y = p => y1 - (p - lo) / (hi - lo) * (y1 - y0), cw = (x1 - x0) / n, X = i => x0 + (i - a + 0.5) * cw;
  // grid
  ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
  for (let g = 0; g <= 6; g++) { const yy = y0 + (y1 - y0) * g / 6; ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); }
  // risk and reward boxes, like a position tool
  const bx0 = X(io), bx1 = X(ic);
  if (e !== null && tp !== null) { ctx.fillStyle = P.good + "26"; ctx.fillRect(bx0, Math.min(Y(e), Y(tp)), bx1 - bx0, Math.abs(Y(tp) - Y(e))); }
  if (e !== null && sl !== null) { ctx.fillStyle = P.bad + "26"; ctx.fillRect(bx0, Math.min(Y(e), Y(sl)), bx1 - bx0, Math.abs(Y(sl) - Y(e))); }
  // level lines
  const level = (p, col, dash, wdt) => { if (p === null) return; ctx.strokeStyle = col; ctx.lineWidth = wdt; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x0, Y(p)); ctx.lineTo(x1 + 8, Y(p)); ctx.stroke(); ctx.setLineDash([]); };
  level(tp, P.good, [14, 10], 2); level(sl, P.bad, [14, 10], 2); level(e, P.entry, [], 2);
  // candles
  cs.forEach((k, j) => {
    const cx = X(a + j), up = k.c >= k.o, bw = Math.max(2, cw * 0.62);
    ctx.strokeStyle = up ? (P.up === P.bg ? P.down : P.up) : P.down; ctx.lineWidth = Math.max(1.5, cw * 0.12);
    ctx.beginPath(); ctx.moveTo(cx, Y(k.h)); ctx.lineTo(cx, Y(k.l)); ctx.stroke();
    const top = Y(Math.max(k.o, k.c)), hgt = Math.max(2, Math.abs(Y(k.o) - Y(k.c)));
    ctx.fillStyle = up ? P.up : P.down; ctx.fillRect(cx - bw / 2, top, bw, hgt);
    if (up && P.up === P.bg) { ctx.lineWidth = 2; ctx.strokeStyle = P.down; ctx.strokeRect(cx - bw / 2, top, bw, hgt); }
  });
  // price tags on the axis, nudged apart
  const tags = [["TP", tp, P.good, t.tp], ["SL", sl, P.bad, t.sl], ["ENTRY", e, P.entry, t.entry]].filter(z => z[1] !== null).map(z => ({ z, y: Y(z[1]) })).sort((p, q) => p.y - q.y);
  for (let i = 1; i < tags.length; i++) if (tags.at(i).y - tags.at(i - 1).y < 46) tags.at(i).y = tags.at(i - 1).y + 46;
  tags.forEach(({ z: [nm, p, col, raw], y }) => tag(ctx, `${nm} ${raw}`, x1 + 12, y, col, P.bg, "left", fit(ctx, `${nm} ${raw}`, W - x1 - 12 - 24, 22, 600, M)));
  // markers
  const callout = (cx, cy, label, col, above) => {
    const ly = Math.min(y1 - 24, Math.max(y0 + 24, cy + (above ? -64 : 64)));
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, ly); ctx.stroke();
    const w = measure(ctx, label, 600, 22, M) + 24, lx = Math.min(x1 - w, Math.max(x0, cx - w / 2));
    tag(ctx, label, lx, ly, col, P.bg, "left", 22);
  };
  if (e !== null) {
    ctx.fillStyle = P.entry; ctx.beginPath(); ctx.arc(X(io), Y(e), 11, 0, Math.PI * 2); ctx.fill();
    callout(X(io), Y(e), `ENTRY ${t.entry}`, P.entry, !buy);
  }
  parsePartials(t).filter(p => p.t !== null).forEach((p, i) => {
    const ip = near(p.t); if (ip < a || ip > b) return;
    ctx.fillStyle = P.good; ctx.beginPath(); ctx.arc(X(ip), Y(p.price), 10, 0, Math.PI * 2); ctx.fill();
    callout(X(ip), Y(p.price), `PARTIAL ${i + 1}${p.lots ? " · " + p.lots + " lots" : ""}`, P.good, buy);
  });
  if (x !== null) {
    const col = win ? P.good : P.bad, cx = X(ic), cy = Y(x);
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - 12, cy - 12); ctx.lineTo(cx + 12, cy + 12); ctx.moveTo(cx + 12, cy - 12); ctx.lineTo(cx - 12, cy + 12); ctx.stroke();
    callout(cx, cy, `EXIT ${t.exit}`, col, win ? buy : !buy);
  }
  if (state.candles.example) text(ctx, "EXAMPLE CANDLES · NOT REAL PRICE DATA", x0, y1 + 34, { w: 600, size: 20, fam: M, color: P.dim, ls: 2 });
  // footer stats
  const rr = e !== null && sl !== null && tp !== null && Math.abs(e - sl) > 0 ? (Math.abs(tp - e) / Math.abs(e - sl)).toFixed(2) : "—";
  const stats = [["PLANNED R:R", `1 : ${rr}`], ["PARTIALS", String(parsePartials(t).length)], ["HELD", duration(t)]];
  ctx.fillStyle = P.grid; ctx.fillRect(pad, H - pad - 120, W - 2 * pad, 2);
  stats.forEach(([k, v], i) => {
    const sx = pad + i * (W - 2 * pad) / 3;
    text(ctx, k, sx, H - pad - 70, { w: 500, size: 21, fam: M, color: P.dim, ls: 4 });
    text(ctx, v, sx, H - pad - 12, { w: 800, size: 52, fam: D, color: P.ink });
  });
}



function render(resultCanvas, chartCanvas, trade, opts) {
  Object.assign(state, opts || {});
  state.candles = { data: (trade.candles || []).map(k => ({ t: k[0] * 1000, o: k[1], h: k[2], l: k[3], c: k[4] })), example: false };
  for (const cv of [resultCanvas, chartCanvas]) { cv.width = 1080; cv.height = SIZES[state.size]; }
  DRAW[state.tpl](resultCanvas.getContext('2d'), 1080, SIZES[state.size], trade);
  drawChart(chartCanvas.getContext('2d'), 1080, SIZES[state.size], trade);
}
window.TradeCards = { render, primary: t => primary(t), rTxt, num, duration };
})();
