/* Hands a file made in the browser (motion video, studio picture) to the member on any device.
   Always shows a real "Save" link they tap themselves, plus "Share" where the device can share files,
   plus "Open" (plays it in a new tab: long-press or right-click there to save), plus a plain tip for
   in-app browsers (Instagram, Discord, WhatsApp...) and WebM files that iPhone or Instagram may refuse.
   Before this, a device that could share hid the download completely (Windows and Mac share menus have no Save),
   and the automatic download fired seconds after the tap, which Safari and in-app browsers block. */
(function () {
'use strict';
const UA = navigator.userAgent || '';
const APPS = [[/Instagram/i, 'Instagram'], [/FBAN|FBAV|FB_IAB|FBIOS/i, 'Facebook'], [/Discord/i, 'Discord'], [/WhatsApp/i, 'WhatsApp'],
  [/Snapchat/i, 'Snapchat'], [/musical_ly|Bytedance|TikTok/i, 'TikTok'], [/LinkedInApp/i, 'LinkedIn'], [/Telegram/i, 'Telegram'], [/\bLine\//, 'LINE']];
const isIOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(UA);
// the app's own browser: Android WebView ("; wv)") or an iPhone web view (no "Safari/" token)
function inApp() {
  const hit = APPS.find(([re]) => re.test(UA));
  if (hit) return hit[1];
  if (isAndroid && /; wv\)/.test(UA)) return 'this app';
  if (isIOS && !/Safari\//.test(UA)) return 'this app';
  return '';
}
const touch = () => isIOS || isAndroid;
const cleanType = (t) => String(t || '').split(';')[0].trim() || 'application/octet-stream';
function canShareFile(file) {
  try { return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { return false; }
}

let lastUrl = '';
/* opts: { status: element under the buttons, blob, name, kind: 'video' | 'picture', btn: classes for the main button, alt: classes for the others } */
function offer(opts) {
  const kind = opts.kind || 'video', st = opts.status;
  const type = cleanType(opts.blob.type);
  const blob = opts.blob.type === type ? opts.blob : new Blob([opts.blob], { type });
  const file = new File([blob], opts.name, { type });
  if (lastUrl) URL.revokeObjectURL(lastUrl);
  const url = lastUrl = URL.createObjectURL(blob);
  let box = st.nextElementSibling && st.nextElementSibling.classList.contains('sv-out') ? st.nextElementSibling : null;
  if (!box) { box = document.createElement('div'); box.className = 'sv-out'; st.after(box); }
  const word = kind === 'video' ? 'video' : 'picture', share = canShareFile(file), app = inApp();
  const btn = opts.btn || 'btn small', alt = opts.alt || 'btn small secondary';
  box.innerHTML = '<div class="sv-btns"></div><p class="sv-tip"></p>';
  const row = box.firstChild, tip = box.lastChild;

  const save = document.createElement('a');
  save.className = btn; save.href = url; save.download = opts.name; save.textContent = 'Save ' + word;
  const sh = document.createElement('button');
  sh.type = 'button'; sh.className = alt; sh.textContent = 'Share';
  sh.onclick = () => navigator.share({ files: [file] }).catch((e) => {
    if (e && e.name === 'AbortError') return;          // they closed the share menu
    tip.textContent = 'Sharing did not work on this device. Tap Save ' + word + ' instead.';
  });
  const open = document.createElement('a');
  open.className = alt; open.href = url; open.target = '_blank'; open.rel = 'noopener'; open.textContent = 'Open ' + word;

  // phones: Share first (Instagram, Discord, Save to Photos); computers: Save first
  if (share && touch()) { sh.className = btn; save.className = alt; row.append(sh, save); } else { row.append(save); if (share) row.append(sh); }
  row.append(open);

  const tips = [];
  if (app) tips.push(`You are inside ${app}'s own browser, which often cannot save files. If nothing happens, tap ••• and choose Open in browser (Safari or Chrome), then make the ${word} again.`);
  else if (isIOS && kind === 'video') tips.push(share ? 'To put it in Photos: tap Share, then Save Video.' : 'Save video puts it in the Files app. Open video, then the share icon, then Save Video puts it in Photos.');
  else if (isIOS) tips.push(share ? 'To put it in Photos: tap Share, then Save Image.' : 'Or tap Open picture, then press and hold it and choose Save to Photos.');
  else if (!touch()) tips.push(`Save ${word} puts it in your Downloads folder.`);
  if (kind === 'video') tips.push('Sharpest on WhatsApp: tap HD before you send, or send it as a Document. On Instagram, turn on Settings, Data usage and media quality, Upload at highest quality.');
  if (/webm/.test(type)) tips.push('This browser makes WebM videos, which iPhone and Instagram may not open. For an MP4, make it in Chrome, Edge or Safari.');
  tip.textContent = tips.join(' ');
  tip.hidden = !tips.length;
  st.textContent = `Ready: ${opts.name} (${(blob.size / 1e6).toFixed(1)} MB).`;
}

function clear(st) {
  const box = st && st.nextElementSibling;
  if (box && box.classList.contains('sv-out')) box.remove();
}
/* message when this browser cannot record at all */
function noRecord() {
  const app = inApp();
  return app ? `${app}'s own browser cannot make videos. Tap ••• and choose Open in browser (Safari or Chrome).`
    : 'This browser cannot make videos. Update it, or use Chrome, Edge or Safari.';
}

window.SaveFile = { offer, clear, noRecord, inApp };
})();
