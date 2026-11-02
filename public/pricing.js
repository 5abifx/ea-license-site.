// Pricing page: Monthly/Annual switch and plan selection (works without it too: the form submits the defaults)
(function () {
  const form = document.querySelector('.pl-page');
  if (!form) return;
  const hidden = form.querySelector('input[name=billing]');
  form.querySelectorAll('[data-set-billing]').forEach((b) => b.addEventListener('click', () => {
    const v = b.dataset.setBilling;
    hidden.value = v;
    form.querySelectorAll('[data-set-billing]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    form.querySelectorAll('[data-billing]').forEach((el) => { el.hidden = el.dataset.billing !== v; });
  }));
  form.querySelectorAll('.pl input[name=plan]').forEach((r) => r.addEventListener('change', () => {
    form.querySelectorAll('.pl').forEach((c) => c.classList.toggle('on', c.contains(r) && r.checked));
  }));
})();
