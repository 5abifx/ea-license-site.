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
  draw(); drawOv();
  if (document.fonts) {
    Promise.all([
      document.fonts.load('200 100px Sora'), document.fonts.load('300 100px Sora'), document.fonts.load('400 40px Sora'),
      document.fonts.load('400 30px "JetBrains Mono"'), document.fonts.load('500 30px "JetBrains Mono"'),
      document.fonts.load('400 30px Manrope'),
      ...(ov ? [document.fonts.load('400 100px "DM Serif Display"'), document.fonts.load('italic 400 100px "DM Serif Display"'),
        document.fonts.load('600 30px Montserrat'), document.fonts.load('500 30px Montserrat')] : []),
    ]).catch(() => {}).finally(() => { draw(); drawOv(); });
  }
})();
