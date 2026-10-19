/* Page-to-page motion: fade the page out the same way it fades in, then follow the link. */
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
    let u; try { u = new URL(a.href, location.href); } catch (_) { return; }
    if (u.origin !== location.origin || u.pathname === location.pathname) return;
    if (!/(\.html|\/)$/.test(u.pathname)) return;
    e.preventDefault();
    document.documentElement.classList.add("is-leaving");
    setTimeout(() => { location.href = a.href; }, 300);
  });
  addEventListener("pageshow", (e) => { if (e.persisted) document.documentElement.classList.remove("is-leaving"); });
})();
