// Admin > Storage (/admin/storage): how much server disk each member uses, so the owner can see who stores the most
// (Study room screenshots, saved Share Studio cards, journal trades with their candles, Study room boards) and how
// full the disk is. Sizes are read straight from the database, so they are always current. Also a small card on
// each member's Admin page (userCard).
const fs = require('fs');
const path = require('path');
const { esc } = require('./views');

const DISK_GB = Number(process.env.DISK_GB) || 5;              // size of the Render disk
const SHOT_CAP = Number(process.env.STUDY_SHOT_CAP) || 150;    // same cap as src/study.js

function mb(b) { b = Number(b) || 0; return b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : b >= 1e3 ? Math.round(b / 1e3) + ' KB' : b + ' B'; }

function setup(app, { db, requireAdmin, page, DATA_DIR }) {
  const has = (t) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(t));
  // per member: { shots, shotB, cards, cardB, trades, tradeB, boardB, total }
  function usage(uid) {
    const W = uid ? ' WHERE user_id = ?' : '', A = uid ? [uid] : [], out = {};
    const add = (rows, nk, bk) => rows.forEach((r) => { const o = (out[r.u] = out[r.u] || { u: r.u, shots: 0, shotB: 0, cards: 0, cardB: 0, trades: 0, tradeB: 0, boardB: 0 }); if (nk) o[nk] = r.n; o[bk] = r.b || 0; });
    if (has('study_shots')) add(db.prepare(`SELECT user_id AS u, COUNT(*) AS n, SUM(length(jpg)) AS b FROM study_shots${W} GROUP BY user_id`).all(...A), 'shots', 'shotB');
    if (has('card_gallery')) add(db.prepare(`SELECT user_id AS u, COUNT(*) AS n, SUM(length(jpg)) AS b FROM card_gallery${W} GROUP BY user_id`).all(...A), 'cards', 'cardB');
    // a trade row is ~300 bytes plus its saved candles
    add(db.prepare(`SELECT user_id AS u, COUNT(*) AS n, SUM(length(candles) + 300) AS b FROM journal_trades${W} GROUP BY user_id`).all(...A), 'trades', 'tradeB');
    if (has('study_boards')) add(db.prepare(`SELECT user_id AS u, SUM(length(data)) AS b FROM study_boards${W} GROUP BY user_id`).all(...A), null, 'boardB');
    Object.values(out).forEach((o) => (o.total = o.shotB + o.cardB + o.tradeB + o.boardB));
    return out;
  }
  function diskInfo() {
    const size = (f) => { try { return fs.statSync(path.join(DATA_DIR, f)).size; } catch (e) { return 0; } };
    const dbB = size('licenses.db') + size('licenses.db-wal');
    let filesB = 0; try { fs.readdirSync(path.join(DATA_DIR, 'ea-files')).forEach((f) => { filesB += size(path.join('ea-files', f)); }); } catch (e) { /* none */ }
    let free = null; try { const s = fs.statfsSync(DATA_DIR); free = s.bavail * s.bsize; } catch (e) { /* older node */ }
    return { dbB, filesB, free };
  }

  app.get('/admin/storage', requireAdmin, (req, res) => {
    const all = Object.values(usage(0)).sort((a, b) => b.total - a.total);
    const users = Object.fromEntries(db.prepare('SELECT id, name, email, is_admin FROM users').all().map((u) => [u.id, u]));
    const d = diskInfo(), cap = DISK_GB * 1e9, used = d.dbB + d.filesB, pct = Math.min(100, used / cap * 100);
    const sum = (k) => all.reduce((a, o) => a + o[k], 0);
    const bar = (p, warn) => `<span class="st-bar"><i style="width:${Math.max(1, Math.min(100, p)).toFixed(1)}%" class="${p >= 90 ? 'bad' : p >= warn ? 'warn' : ''}"></i></span>`;
    const rows = all.slice(0, 300).map((o) => { const u = users[o.u] || {}; const name = u.name || u.email || 'Deleted member #' + o.u;
      return `<tr><td><a href="/admin/users/${o.u}">${esc(name)}</a>${u.is_admin ? ' <span class="tag">admin</span>' : ''}${u.name && u.email ? `<br><small class="muted">${esc(u.email)}</small>` : ''}</td>
        <td class="right"><b>${mb(o.total)}</b></td>
        <td class="right">${mb(o.shotB)}<br><small class="muted">${o.shots} of ${SHOT_CAP}</small> ${bar(o.shots / SHOT_CAP * 100, 70)}</td>
        <td class="right">${mb(o.cardB)}<br><small class="muted">${o.cards} card${o.cards === 1 ? '' : 's'}</small></td>
        <td class="right">${mb(o.tradeB)}<br><small class="muted">${o.trades.toLocaleString('en-US')} trades</small></td>
        <td class="right">${mb(o.boardB)}</td></tr>`; }).join('');
    page(req, res, 'Storage', `
    <style>.st-bar{display:inline-block;vertical-align:middle;width:64px;height:5px;border-radius:3px;background:rgba(255,255,255,.08);overflow:hidden}.st-bar i{display:block;height:100%;background:#26c6a0}.st-bar i.warn{background:#f5a524}.st-bar i.bad{background:#f0464b}
      .st-big .st-bar{width:100%;height:8px;margin-top:8px}.st-table td,.st-table th{padding:8px 10px;vertical-align:top}.st-table .right{text-align:right;white-space:nowrap}</style>
    <div class="tabs"><a href="/admin/sales">Dashboard</a><a href="/admin">Users</a><a href="/admin/eas">EAs</a><a href="/admin/mentorship">Mentorship</a><a href="/admin/security">Security</a><a class="on" href="/admin/storage">Storage</a></div>
    <section class="card st-big"><h1>Storage</h1>
      <p class="muted small">How much server disk each member uses. Screenshots are the big one (about 0.3 MB each, up to ${SHOT_CAP} per member). Sizes come straight from the database, so they are always up to date.</p>
      <div class="stats vz-kpis">
        <div><span>Disk used</span><strong>${mb(used)}<small class="muted"> / ${DISK_GB} GB</small></strong>${bar(pct, 70)}</div>
        <div><span>Free on disk</span><strong>${d.free == null ? '-' : mb(d.free)}</strong></div>
        <div><span>Members storing</span><strong>${all.filter((o) => o.total > 0).length}</strong></div>
        <div><span>Screenshots</span><strong>${mb(sum('shotB'))}<small class="muted"> · ${sum('shots')}</small></strong></div>
      </div>
      <p class="muted small">Database ${mb(d.dbB)} · EA files ${mb(d.filesB)} · Share cards ${mb(sum('cardB'))} · Trades ${mb(sum('tradeB'))} · Boards ${mb(sum('boardB'))}</p>
    </section>
    <section class="card"><h2>By member</h2><p class="muted small">Biggest first. Click a name to open the member.</p>
      <div class="sd-scroll"><table class="st-table"><thead><tr><th>Member</th><th class="right">Total</th><th class="right">Screenshots</th><th class="right">Share cards</th><th class="right">Trades</th><th class="right">Study boards</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="muted">Nothing stored yet.</td></tr>'}</tbody></table></div>
    </section>`);
  });

  // one line for a member's Admin page
  function userCard(uid) {
    const o = usage(uid)[uid];
    if (!o) return '<section class="card"><h2>Storage</h2><p class="muted small">Nothing stored yet.</p></section>';
    return `<section class="card"><div class="row between"><h2>Storage <span class="muted small">${mb(o.total)}</span></h2><a class="small" href="/admin/storage">All members →</a></div>
      <p class="muted small">Screenshots ${mb(o.shotB)} (${o.shots} of ${SHOT_CAP}) · Share cards ${mb(o.cardB)} (${o.cards}) · Trades ${mb(o.tradeB)} (${o.trades.toLocaleString('en-US')}) · Study boards ${mb(o.boardB)}</p></section>`;
  }
  return { usage, userCard };
}

module.exports = { setup, mb };
