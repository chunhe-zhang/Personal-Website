/* Types each page title in over a fixed 320 ms, like the front page cards. */
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const h = document.querySelector("body[data-theme] h1");
  if (!h) return;
  const text = h.textContent.trim();
  if (!text) return;
  h.setAttribute("aria-label", text);
  const D = 320, t0 = performance.now() + 60;
  const set = (k) => { h.innerHTML = `<span class="t" aria-hidden="true"></span>`; h.firstChild.textContent = text.slice(0, k); const r = document.createElement("span"); r.className = "r"; r.setAttribute("aria-hidden", "true"); r.textContent = text.slice(k); h.appendChild(r); };
  set(0);
  const tick = () => {
    const p = Math.min(1, Math.max(0, (performance.now() - t0) / D));
    if (p >= 1) { h.textContent = text; h.removeAttribute("aria-label"); return; }
    set(Math.ceil(text.length * p));
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
