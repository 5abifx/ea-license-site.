// "Hide private info": masks account numbers, broker servers, your name and the journal key
// so the journal can be screenshotted and shared. The choice is remembered on this browser.
(function () {
  const KEY = 'hidePrivate';
  const read = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const apply = (on) => {
    document.body.classList.toggle('private', on);
    document.querySelectorAll('.priv-toggle').forEach((b) => {
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? 'Show private info' : 'Hide private info';
    });
    if (on) document.querySelectorAll('details.connect[open]').forEach((d) => { d.open = false; });
  };
  apply(read());
  document.querySelectorAll('.priv-toggle').forEach((b) => b.addEventListener('click', () => {
    const on = !document.body.classList.contains('private');
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* private window: still works for this page */ }
    apply(on);
  }));

  // journal key: hidden until "Show"; "Copy" works without showing it
  document.querySelectorAll('.keybox').forEach((box) => {
    const code = box.querySelector('code'), key = code.dataset.key, dots = code.textContent;
    const show = box.querySelector('.key-show'), copy = box.querySelector('.key-copy');
    show.addEventListener('click', () => {
      const hidden = code.textContent === dots;
      code.textContent = hidden ? key : dots;
      show.textContent = hidden ? 'Hide' : 'Show';
    });
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(key); copy.textContent = 'Copied'; }
      catch (e) { code.textContent = key; show.textContent = 'Hide'; }
      setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
    });
  });
})();
