// Fills the broker email from the form and wires the Copy buttons (nothing is sent anywhere)
(function () {
  const $ = (id) => document.getElementById(id);
  const val = (id, ph) => ($(id) && $(id).value.trim()) || ph;
  function render() {
    const acct = val('eb-acct', '[ACCOUNT NUMBER]');
    const server = val('eb-server', '[SERVER NAME]');
    const name = val('eb-name', '[YOUR NAME]');
    $('eb-subject').textContent = `Request to enable EA trading on account ${acct}`;
    $('eb-email').textContent =
`Hello Support,

I'd like to use a risk-management Expert Advisor called KATANA on my MT5 account ${acct} (server: ${server}), but my orders are rejected with "AutoTrading disabled by server".

KATANA only manages the trades I place myself: position size, stop loss, and my daily loss and drawdown limits. It does not copy trades from other accounts, and it does not use HFT, tick scalping, latency arbitrage or hedging across accounts.

Could you please enable EA trading on this account, or let me know if you need anything else from me?

Thank you,
${name}`;
    $('eb-chat').textContent =
`Hi, could you please enable EA trading on my MT5 account ${acct} (server: ${server})? I get "AutoTrading disabled by server". The EA is KATANA, a risk-management EA that only manages my own trades (position size, stop loss, daily loss limit). No copy trading, HFT or arbitrage. Thanks!`;
  }
  ['eb-acct', 'eb-server', 'eb-name'].forEach((id) => {
    const el = $(id); if (el) { el.addEventListener('input', render); el.addEventListener('change', render); }
  });
  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const text = $(b.dataset.copy).textContent;
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    const old = b.textContent; b.textContent = 'Copied ✓'; setTimeout(() => { b.textContent = old; }, 1600);
  }));
  render();
})();
