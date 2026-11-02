// Trade detail page: draws both share cards and saves them as PNG.
(function () {
  const trade = JSON.parse(document.getElementById('trade-data').textContent);
  const c1 = document.getElementById('c1'), c2 = document.getElementById('c2');
  const val = (id) => document.getElementById(id);
  const draw = () => window.TradeCards.render(c1, c2, trade, {
    tpl: 'katana', size: 'story', mode: val('mode').value, rm: val('rm').checked,
  });
  ['mode', 'rm'].forEach((id) => val(id).addEventListener('change', draw));
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
  const drawOv = () => ov && window.StoryOverlay.render(ov, trade, {
    style: val('ov-style').value, show: val('ov-show').value, ad: val('ov-ad').checked, scrim: val('ov-scrim').checked,
  });
  if (ov) {
    val('ov-style').value = window.StoryOverlay.suggest(trade);
    ['ov-style', 'ov-show', 'ov-ad', 'ov-scrim'].forEach((id) => val(id).addEventListener('change', drawOv));
    document.querySelector('[data-save-ov]').addEventListener('click', () => ov.toBlob((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `5ABIFX-${trade.symbol}-overlay-${val('ov-style').value}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 'image/png'));
  }
  draw(); drawOv();
  if (document.fonts) {
    Promise.all([
      document.fonts.load('900 100px "Big Shoulders Display"'), document.fonts.load('800 100px "Big Shoulders Display"'),
      document.fonts.load('600 30px "IBM Plex Mono"'), document.fonts.load('500 30px "IBM Plex Mono"'),
      document.fonts.load('700 30px "Hanken Grotesk"'), document.fonts.load('500 30px "Hanken Grotesk"'),
      ...(ov ? [document.fonts.load('400 100px "DM Serif Display"'), document.fonts.load('italic 400 100px "DM Serif Display"'),
        document.fonts.load('600 30px Montserrat'), document.fonts.load('500 30px Montserrat')] : []),
    ]).catch(() => {}).finally(() => { draw(); drawOv(); });
  }
})();
