/* Front page: a neon CZ, then one gesture = one section, flying through a tunnel of cards.
   The same fade / rise / de-blur motion is used on every inner page (theme.css). */
(() => {
  "use strict";
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return; // CSS shows a plain list instead

  const $ = (s) => document.querySelector(s);
  const cards = [...document.querySelectorAll(".card")];
  const N = cards.length;
  const railBtns = [...document.querySelectorAll("#rail button")];
  const hero = $("#hero"), flash = $("#flash"), spacer = $("#spacer");
  const root = document.documentElement;
  const NAMES = ["home", "work", "projects", "timeline", "contact"];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  // page light per section: [front cover, ...cards] read from each card's own colours
  const LIGHT = [["#22d3ee", "#ff4fa3", "#55ff00"]].concat(
    cards.map((c) => ["--a", "--b", "--c"].map((v) => c.style.getPropertyValue(v).trim()))
  );

  let W = innerWidth, H = innerHeight;
  let cur = 0, idx = 0, anim = null, lockUntil = 0, lastWheel = 0, lastAbs = 0, touchY = null;
  let leaving = null, lightIdx = -1;
  let mxn = 0, myn = 0, mxs = 0, mys = 0;

  spacer.style.display = "none";
  root.classList.add("paged");

  function setLight(i) {
    if (i === lightIdx) return;
    lightIdx = i;
    const [a, b, c] = LIGHT[i];
    root.style.setProperty("--a", a); root.style.setProperty("--b", b); root.style.setProperty("--c", c);
    root.style.setProperty("--rail", i === 0 ? "#55ff00" : a);
  }

  /* ---------- navigation: one gesture = one section ---------- */
  function goTo(t) {
    t = clamp(Math.round(t), 0, N);
    if (t === idx && !anim) return;
    const now = performance.now();
    idx = t;
    const dur = Math.max(600, Math.min(1050, 500 + Math.abs(t - cur) * 200));
    anim = { from: cur, to: t, t0: now, dur };
    lockUntil = now + dur;
  }
  const go = (d) => goTo(idx + d);
  railBtns.forEach((b) => b.addEventListener("click", () => goTo(+b.dataset.t)));
  cards.forEach((c, i) => {
    const a = c.querySelector("a");
    a.addEventListener("click", (e) => {
      if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (leaving) return;
      if (idx !== i + 1 || anim) { goTo(i + 1); return; }
      leaving = { i, t0: performance.now(), href: a.href };
      root.style.setProperty("--flash", LIGHT[i + 1][0]);
    });
    a.addEventListener("focus", () => { if (idx !== i + 1) goTo(i + 1); });
  });
  addEventListener("keydown", (e) => {
    if (leaving || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) { e.preventDefault(); go(1); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) { e.preventDefault(); go(-1); }
    else if (e.key === "Home") { e.preventDefault(); goTo(0); }
    else if (e.key === "End") { e.preventDefault(); goTo(N); }
  });
  addEventListener("wheel", (e) => {
    e.preventDefault();
    if (leaving) return;
    const now = performance.now();
    const dy = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
    const a = Math.abs(dy);
    const fresh = now - lastWheel > 110 || a > lastAbs * 1.8 + 6; // new gesture vs trackpad inertia
    lastWheel = now; lastAbs = a;
    if (now < lockUntil || !fresh || a < 4) return;
    go(dy > 0 ? 1 : -1);
  }, { passive: false });
  addEventListener("touchstart", (e) => { touchY = e.touches[0].clientY; }, { passive: true });
  addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
  addEventListener("touchend", (e) => {
    if (touchY == null || leaving) return;
    const dy = touchY - e.changedTouches[0].clientY; touchY = null;
    if (Math.abs(dy) > 38 && performance.now() >= lockUntil - 250) go(dy > 0 ? 1 : -1);
  }, { passive: true });
  addEventListener("pointermove", (e) => { mxn = (e.clientX / W - 0.5) * 2; myn = (e.clientY / H - 0.5) * 2; }, { passive: true });
  addEventListener("resize", () => { W = innerWidth; H = innerHeight; });
  addEventListener("pageshow", (e) => { if (e.persisted) { leaving = null; flash.style.opacity = 0; } });

  /* ---------- one frame ---------- */
  let last = performance.now(), firstFrame = true;
  function frame(now) {
    const f = Math.min((now - last) / 16.667, 3); last = now;
    if (anim) {
      const p = clamp((now - anim.t0) / anim.dur);
      cur = anim.from + (anim.to - anim.from) * ease(p);
      if (p >= 1) { cur = anim.to; anim = null; }
    }
    let lp = 0;
    if (leaving) {
      lp = clamp((now - leaving.t0) / 620);
      if (lp >= 1) { const href = leaving.href; leaving = null; location.href = href; return; }
    }
    mxs += (mxn - mxs) * 0.06 * f; mys += (myn - mys) * 0.06 * f;
    setLight(Math.round(clamp(cur, 0, N)));

    // every element is placed by its distance d from the camera: ahead = further, behind = flown past
    const place = (el, i, tiltable) => {
      const d = i + 1 - cur, ad = Math.abs(d), ahead = d >= 0;
      let op = ahead ? clamp(1.05 - d * 0.55) : clamp(1 + d * 1.7);
      if (d > 3) op = 0;
      if (i >= 0) op *= clamp((cur - 0.12) / 0.55) ** 2 * (3 - 2 * clamp((cur - 0.12) / 0.55)); // cards stay hidden behind the neon CZ at first
      const side = (i % 2 ? 1 : -1) * (0.7 + (((i + 3) % 3)) * 0.18);
      const m = Math.min(ad, 1.4);
      let z = ahead ? -d * 560 : -d * 1100;
      let x = side * W * 0.13 * m * (ahead ? 1 : 1.5);
      let y = (i % 2 ? -1 : 1) * H * 0.05 * m;
      let ry = -side * 9 * m, rx = (i % 2 ? 1 : -1) * 3 * m;
      if (ad < 0.5) {
        const w = 1 - ad * 2;
        ry += mxs * 6 * w; rx += -mys * 5 * w;
        if (tiltable) { el.style.setProperty("--mx", (mxs * w).toFixed(3)); el.style.setProperty("--my", (mys * w).toFixed(3)); }
      }
      let blur = ahead ? Math.min(ad * 2.6, 6) : Math.min(ad * 10, 12);
      if (leaving) {
        const e = lp * lp;
        if (i === leaving.i) { z += e * 950; op = 1; blur = 0; } else op *= 1 - clamp(lp * 1.6);
      }
      el.style.transform = `translate3d(-50%,-50%,0) translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      el.style.opacity = op.toFixed(3);
      el.style.filter = blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : "none";
      el.style.visibility = op > 0.01 ? "visible" : "hidden";
      el.style.zIndex = String(1000 - Math.round(ad * 100));
      return ad;
    };
    place(hero, -1, false); // the neon CZ is the card in front of "Home"
    for (let i = 0; i < N; i++) {
      const ad = place(cards[i], i, true);
      cards[i].classList.toggle("is-front", ad < 0.45 && !leaving);
    }
    root.style.setProperty("--cue-o", clamp(1 - cur * 2.4).toFixed(3));
    document.getElementById("cue").style.opacity = clamp(1 - cur * 2.4).toFixed(3);

    const ri = Math.round(clamp(cur, 0, N));
    railBtns.forEach((b, k) => b.classList.toggle("on", k === ri));
    flash.style.opacity = leaving ? clamp((lp - 0.45) / 0.55).toFixed(3) : "0";

    if (firstFrame) { firstFrame = false; document.body.classList.add("is-ready"); }
    requestAnimationFrame(frame);
  }

  const hash = location.hash.slice(1).toLowerCase();
  const hi = NAMES.indexOf(hash === "articles" ? "timeline" : hash); // old #articles links still land on Timeline
  if (hi >= 0) { idx = hi + 1; cur = idx; }
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
