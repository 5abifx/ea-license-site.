// copy buttons on the Affiliate page
document.querySelectorAll('[data-copy]').forEach(function (b) {
  b.addEventListener('click', function () {
    var t = b.getAttribute('data-copy'), old = b.innerHTML;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).catch(function () {
      var a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); document.execCommand('copy'); a.remove();
    }).finally(function () { b.textContent = 'Copied ✓'; setTimeout(function () { b.innerHTML = old; }, 1600); });
  });
});
