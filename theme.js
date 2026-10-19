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
    setTimeout(() => { veil.remove(); target.classList.remove("is-launching"); }, 1250);
  }
  // hold ~0.95s on the colour bloom, then open the new tab (this page never navigates)
  function openLater(a) {
    setTimeout(() => {
      const w = window.open(a.href, "_blank");
      if (w) { try { w.opener = null; } catch (_) {} }
    }, 950);
  }
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a || a.hasAttribute("download")) return;
    if (a.target === "_blank") { // play the effect, pause, then open a new tab; this page stays put
      if (/^(mailto|tel):/i.test(a.href)) return;
      e.preventDefault(); if (a.dataset.busy) return; a.dataset.busy = 1;
      launch(a, e); openLater(a);
      setTimeout(() => { delete a.dataset.busy; }, 1300);
      return;
    }
    let u; try { u = new URL(a.href, location.href); } catch (_) { return; }
    if (u.origin !== location.origin || u.pathname === location.pathname) return;
    if (!/(\.html|\/)$/.test(u.pathname)) return;
    e.preventDefault();
    document.documentElement.classList.add("is-leaving");
    setTimeout(() => { location.href = a.href; }, 230);
  });
  addEventListener("pageshow", (e) => { if (e.persisted) document.documentElement.classList.remove("is-leaving"); });
})();
