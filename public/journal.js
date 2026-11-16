// Trade detail page: draws both share cards and saves them as PNG.
(function () {
  const trade = JSON.parse(document.getElementById('trade-data').textContent);
  const c1 = document.getElementById('c1'), c2 = document.getElementById('c2');
  const val = (id) => document.getElementById(id);
  // the card style is remembered in this browser
  try { const st = localStorage.getItem('cardStyle'); if (st && val('style').querySelector(`option[value="${st}"]`)) val('style').value = st; } catch (e) {}
  val('style').addEventListener('change', () => { try { localStorage.setItem('cardStyle', val('style').value); } catch (e) {} });
  const draw = () => window.TradeCards.render(c1, c2, trade, {
    tpl: val('style').value, mode: val('mode').value, rm: val('rm').checked,
  });
  ['style', 'mode', 'rm'].forEach((id) => val(id).addEventListener('change', draw));
  document.querySelectorAll('[data-save]').forEach((b) => b.addEventListener('click', () => {
    const cv = val(b.dataset.save);
    cv.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `5ABIFX-${trade.symbol}-${b.dataset.save === 'c1' ? '1-result' : '2-chart'}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png');
  }));
  // admin-only story overlay (section exists only for admins)
  const ov = val('ov');
  let quote = 0, photo = null;
  const drawOv = (forSave) => ov && window.StoryOverlay.render(ov, trade, {
    style: val('ov-style').value, quote, show: val('ov-show').value, ad: val('ov-ad').checked,
    scrim: val('ov-scrim').checked, candles: val('ov-candles').checked,
    photo: photo && (forSave !== true || val('ov-bake').checked) ? photo : null,
  });
  if (ov) {
    val('ov-style').value = window.StoryOverlay.suggest(trade);
    ['ov-style', 'ov-show', 'ov-ad', 'ov-scrim', 'ov-candles', 'ov-bake'].forEach((id) => val(id).addEventListener('change', () => drawOv()));
    val('ov-style').addEventListener('change', () => { quote = 0; drawOv(); });
    val('ov-next').addEventListener('click', () => { quote++; drawOv(); });
    // the photo stays in the browser: it is only drawn on the canvas, never uploaded
    val('ov-photo').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) { photo = null; drawOv(); return; }
      const img = new Image(); img.onload = () => { photo = img; drawOv(); }; img.src = URL.createObjectURL(f);
    });
    document.querySelector('[data-save-ov]').addEventListener('click', () => { drawOv(true); ov.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `5ABIFX-${trade.symbol}-overlay-${val('ov-style').value}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      drawOv();
    }, 'image/png'); });
  }
  // motion card: a short video recorded in this browser (public/motion-card.js)
  const mvc = val('mv');
  const mv = mvc && window.MotionCard && window.MotionCard.create(mvc, trade, { mode: val('mode').value, rm: val('rm').checked });
  let video = null;
  if (mv) {
    const st = val('mv-st'), rec = val('mv-rec'), shareBtn = val('mv-share');
    const own = () => { const on = val('mv-scene').value === 'own'; ['mv-filebox', 'mv-dimbox', 'mv-private'].forEach((id) => { val(id).hidden = !on; }); };
    const sync = () => { mv.set({ mode: val('mode').value, rm: val('rm').checked, scene: val('mv-scene').value }); video = null; shareBtn.hidden = true; mv.play(); };
    try { const sc = localStorage.getItem('motionScene'); if (sc && sc !== 'own' && val('mv-scene').querySelector(`option[value="${sc}"]`)) val('mv-scene').value = sc; } catch (e) {}
    ['mode', 'rm'].forEach((id) => val(id).addEventListener('change', sync));
    val('mv-scene').addEventListener('change', () => {
      own(); sync();
      try { localStorage.setItem('motionScene', val('mv-scene').value); } catch (e) {}
      if (val('mv-scene').value === 'own' && !val('mv-file').files[0]) val('mv-file').click();
    });
    val('mv-dim').addEventListener('input', (e) => mv.set({ dim: e.target.value / 100 }));
    // the photo or clip is read in the browser only, never sent to the server
    val('mv-file').addEventListener('change', (e) => {
      st.textContent = '';
      mv.setBackground(e.target.files[0] || null).then(() => sync()).catch((err) => { st.textContent = err.message; });
    });
    if (!mv.canRecord()) { rec.disabled = true; st.textContent = 'This browser cannot record video. Try Chrome or Safari.'; }
    const name = (ext) => `5ABIFX-${trade.symbol}-motion.${ext}`;
    const save = (r) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.blob); a.download = name(r.ext); a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    };
    rec.addEventListener('click', () => {
      rec.disabled = true; shareBtn.hidden = true;
      mv.record((p) => { st.textContent = `Recording ${Math.round(p * 100)}%`; }).then((r) => {
        video = r; rec.disabled = false; rec.textContent = 'Make again';
        st.textContent = `Saved ${r.ext.toUpperCase()} (${(r.blob.size / 1e6).toFixed(1)} MB)`;
        const file = new File([r.blob], name(r.ext), { type: r.blob.type });
        // phones: Share opens the share sheet (Instagram, Discord, Save video); computers download the file
        if (navigator.canShare && navigator.canShare({ files: [file] })) { shareBtn.hidden = false; st.textContent = 'Ready. Tap Share to post or save it.'; } else save(r);
      }).catch((err) => { st.textContent = err.message; rec.disabled = false; });
    });
    shareBtn.addEventListener('click', () => {
      if (!video) return;
      navigator.share({ files: [new File([video.blob], name(video.ext), { type: video.blob.type })] }).catch(() => {});
    });
    own(); sync();
  }
  draw(); drawOv();
  if (document.fonts) {
    Promise.all([
      document.fonts.load('200 100px Sora'), document.fonts.load('300 100px Sora'), document.fonts.load('400 40px Sora'),
      document.fonts.load('400 30px "JetBrains Mono"'), document.fonts.load('500 30px "JetBrains Mono"'),
      document.fonts.load('400 30px Manrope'),
      ...(ov ? [document.fonts.load('400 100px "DM Serif Display"'), document.fonts.load('italic 400 100px "DM Serif Display"'),
        document.fonts.load('600 30px Montserrat'), document.fonts.load('500 30px Montserrat')] : []),
    ]).catch(() => {}).finally(() => { draw(); drawOv(); if (mv) mv.play(); });
  }
})();
