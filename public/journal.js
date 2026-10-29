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
  draw();
  if (document.fonts) {
    Promise.all([
      document.fonts.load('900 100px "Big Shoulders Display"'), document.fonts.load('800 100px "Big Shoulders Display"'),
      document.fonts.load('600 30px "IBM Plex Mono"'), document.fonts.load('500 30px "IBM Plex Mono"'),
      document.fonts.load('700 30px "Hanken Grotesk"'), document.fonts.load('500 30px "Hanken Grotesk"'),
    ]).catch(() => {}).finally(draw);
  }
})();
