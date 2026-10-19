/* Page-to-page motion: fade the page out the same way it fades in, then follow the link. */
(() => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // new-tab links: a bloom of the page colour from the click point while the browser opens the tab (this page stays in place)
  function launch(a, e) {
    const veil = document.createElement("div");
    veil.className = "launch-veil";
    veil.style.setProperty("--x", (e.clientX || innerWidth / 2) + "px");
    veil.style.setProperty("--y", (e.clientY || innerHeight / 2) + "px");
    document.body.appendChild(veil);
    const target = a.closest(".company-card, .project-card, .contact-item") || a;
    target.classList.add("is-launching");
    setTimeout(() => { veil.remove(); target.classList.remove("is-launching"); }, 900);
  }
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.hasAttribute("download")) return;
    if (a.target === "_blank") { launch(a, e); return; } // the browser opens the new tab; this page stays put
    let u; try { u = new URL(a.href, location.href); } catch (_) { return; }
    if (u.origin !== location.origin || u.pathname === location.pathname) return;
    if (!/(\.html|\/)$/.test(u.pathname)) return;
    e.preventDefault();
    document.documentElement.classList.add("is-leaving");
    setTimeout(() => { location.href = a.href; }, 230);
  });
  addEventListener("pageshow", (e) => { if (e.persisted) document.documentElement.classList.remove("is-leaving"); });
})();
