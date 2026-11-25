// iOS only raises the keyboard for a focus() made inside the tap itself, and a field that mounts a
// render later misses it. Focusing a throwaway input in the tap raises it; the real field then
// takes the focus over and the keyboard stays up.
export function primeKeyboard() {
  const el = document.createElement('input');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;border:0;padding:0';
  document.body.appendChild(el);
  el.focus();
  setTimeout(() => el.remove(), 1000);
}
