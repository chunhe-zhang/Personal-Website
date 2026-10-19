/* Animated front page: particle initials -> scroll through a 3D tunnel of section cards.
   Plain canvas + CSS 3D, no libraries. */
(() => {
  "use strict";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return; // CSS shows a plain stacked list instead

  const $ = (s) => document.querySelector(s);
  const cv = $("#fx"), ctx = cv.getContext("2d");
  const cards = [...document.querySelectorAll(".card")];
  const N = cards.length;
  const railBtns = [...document.querySelectorAll("#rail button")];
  const spacer = $("#spacer"), flash = $("#flash");
  const root = document.documentElement;
  const NAMES = ["home", "work", "projects", "articles", "contact"];
  const ACC = ["#55ff00", "#22d3ee", "#ff7a1a", "#b36bff", "#ff4fa3"];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const ACC_RGB = ACC.map(hex);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);

  let W = 0, H = 0, DPR = 1, step = 600;
  let target = 0, cur = 0, prev = 0;
  let mx = -9999, my = -9999, mxn = 0, myn = 0, mxs = 0, mys = 0;
  let lastScroll = 0, snapped = true, touching = false;
  let leaving = null;
  let startTime = performance.now();
  let accent = [85, 255, 0];
  let frontIdx = -1;

  /* ---------- particles (initials) ---------- */
  let pts = [];
  const GROUPS = [
    { color: "#55ff00", list: [] },
    { color: "#d8ffc4", list: [] },
    { color: "#22d3ee", list: [] },
    { color: "#c46bff", list: [] },
  ];

  function buildPoints() {
    const size = Math.min(W * (W < 700 ? 0.36 : 0.42), H * 0.44);
    const lh = size, lw = size * 0.8, gap = size * 0.24, sw = Math.max(6, size * 0.17);
    const ox = (W - (lw * 2 + gap)) / 2, oy = H * 0.46 - lh / 2;
    const off = document.createElement("canvas");
    off.width = Math.ceil(W); off.height = Math.ceil(H);
    const c = off.getContext("2d");
    c.strokeStyle = "#fff"; c.lineWidth = sw; c.lineJoin = "miter"; c.miterLimit = 1.4; c.lineCap = "butt";
    const t = sw / 2, zx = ox + lw + gap;
    c.beginPath(); c.moveTo(ox + lw, oy + t); c.lineTo(ox + t, oy + t); c.lineTo(ox + t, oy + lh - t); c.lineTo(ox + lw, oy + lh - t); c.stroke();
    c.beginPath(); c.moveTo(zx, oy + t); c.lineTo(zx + lw, oy + t); c.lineTo(zx, oy + lh - t); c.lineTo(zx + lw, oy + lh - t); c.stroke();
    const data = c.getImageData(0, 0, off.width, off.height).data;
    const raw = [];
    const stride = W < 700 ? 2 : 3;
    for (let y = 0; y < off.height; y += stride)
      for (let x = 0; x < off.width; x += stride)
        if (data[(y * off.width + x) * 4 + 3] > 128) raw.push([x, y]);
    const want = W < 700 ? 2400 : 3200;
    for (let i = raw.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [raw[i], raw[j]] = [raw[j], raw[i]]; }
    raw.length = Math.min(raw.length, want);
    GROUPS.forEach((g) => (g.list = []));
    pts = raw.map(([hx, hy]) => {
      const a = Math.random() * Math.PI * 2, r = Math.max(W, H) * (0.6 + Math.random() * 0.9);
      const sa = Math.random() * Math.PI * 2, sr = Math.max(W, H) * (0.5 + Math.random() * 0.8);
      const gi = Math.random() < 0.72 ? 0 : Math.random() < 0.55 ? 1 : Math.random() < 0.5 ? 2 : 3;
      const p = {
        hx, hy,
        x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r, vx: 0, vy: 0,
        sx: W / 2 + Math.cos(sa) * sr, sy: H / 2 + Math.sin(sa) * sr,
        delay: Math.random() * 700 + (hx / W) * 700,
        ph: Math.random() * 6.28, sz: 1.3 + Math.random() * 1.7,
      };
      GROUPS[gi].list.push(p);
      return p;
    });
  }

  /* ---------- stars (tunnel) ---------- */
  let stars = [];
  function buildStars() {
    const n = W < 700 ? 140 : 260;
    stars = Array.from({ length: n }, () => ({
      x: (Math.random() * 2 - 1), y: (Math.random() * 2 - 1), z: 0.04 + Math.random() * 0.96, hue: Math.random() < 0.45 ? 1 : 0,
    }));
  }

  /* ---------- layout ---------- */
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    step = 0.85 * H;
    spacer.style.height = N * step + H + "px";
    buildPoints();
    if (!stars.length) buildStars();
    target = clamp(scrollY / step, 0, N + 0);
  }

  /* ---------- text scramble on titles ---------- */
  const GLYPH = "!<>-_/[]{}=+*^?#01";
  const scrambling = new WeakMap();
  function scramble(el) {
    const text = el.dataset.text;
    const t0 = performance.now(), dur = 520;
    const id = (scrambling.get(el) || 0) + 1; scrambling.set(el, id);
    const tick = () => {
      if (scrambling.get(el) !== id) return;
      const p = clamp((performance.now() - t0) / dur);
      let out = "";
      for (let i = 0; i < text.length; i++)
        out += p >= (i + 1) / (text.length + 1) ? text[i] : GLYPH[(Math.random() * GLYPH.length) | 0];
      el.textContent = out;
      if (p < 1) requestAnimationFrame(tick); else el.textContent = text;
    };
    tick();
  }
  cards.forEach((c) => {
    const title = c.querySelector(".title");
    c.querySelector("a").addEventListener("pointerenter", () => scramble(title));
  });

  /* ---------- navigation ---------- */
  const goTo = (t) => scrollTo({ top: clamp(t, 0, N) * step, behavior: "smooth" });
  railBtns.forEach((b) => b.addEventListener("click", () => goTo(+b.dataset.t)));
  cards.forEach((c, i) => {
    c.querySelector("a").addEventListener("click", (e) => {
      if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (leaving) return;
      if (Math.abs(i + 1 - cur) > 0.45) { goTo(i + 1); return; }
      leaving = { i, t0: performance.now(), href: c.querySelector("a").href };
      root.style.setProperty("--flash", ACC[i]);
    });
    c.querySelector("a").addEventListener("focus", () => { if (Math.abs(i + 1 - cur) > 0.45) goTo(i + 1); });
  });
  addEventListener("keydown", (e) => {
    if (leaving || e.altKey || e.ctrlKey || e.metaKey) return;
    const here = Math.round(target);
    if (e.key === "ArrowDown" || e.key === "PageDown" || (e.key === " " && !e.shiftKey)) { e.preventDefault(); goTo(here + 1); }
    else if (e.key === "ArrowUp" || e.key === "PageUp" || (e.key === " " && e.shiftKey)) { e.preventDefault(); goTo(here - 1); }
    else if (e.key === "Home") { e.preventDefault(); goTo(0); }
    else if (e.key === "End") { e.preventDefault(); goTo(N); }
  });
  addEventListener("scroll", () => { lastScroll = performance.now(); snapped = false; target = clamp(scrollY / step, 0, N); }, { passive: true });
  addEventListener("touchstart", () => (touching = true), { passive: true });
  addEventListener("touchend", () => { touching = false; lastScroll = performance.now(); }, { passive: true });
  addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; mxn = (mx / W - 0.5) * 2; myn = (my / H - 0.5) * 2; }, { passive: true });
  addEventListener("pointerleave", () => { mx = my = -9999; });
  addEventListener("resize", resize);
  addEventListener("pageshow", (e) => { if (e.persisted) { leaving = null; flash.style.opacity = 0; } });

  /* ---------- frame ---------- */
  let last = performance.now();
  function frame(now) {
    const f = Math.min((now - last) / 16.667, 3); last = now;
    const time = now - startTime;

    // smooth scroll value
    prev = cur;
    cur += (target - cur) * Math.min(1, 0.11 * f);
    if (Math.abs(target - cur) < 0.0004) cur = target;
    const speed = Math.abs(cur - prev) / f;

    // snap to the nearest section once scrolling stops
    if (!snapped && !touching && !leaving && now - lastScroll > 170) {
      snapped = true;
      const near = Math.round(target);
      if (Math.abs(target - near) > 0.012) goTo(near);
    }

    // leaving transition progress
    let lp = 0;
    if (leaving) {
      lp = clamp((now - leaving.t0) / 780);
      if (lp >= 1) { const href = leaving.href; leaving = null; location.href = href; return; }
    }

    // accent colour follows the section in view
    const ai = clamp(Math.round(cur) - 1, 0, N - 1);
    const tgt = cur < 0.5 ? ACC_RGB[0] : ACC_RGB[ai];
    for (let k = 0; k < 3; k++) accent[k] += (tgt[k] - accent[k]) * 0.08 * f;

    // ---- background ----
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    const [ar, ag, ab] = accent.map(Math.round);
    const gx = W / 2 + mxs * 40, gy = H * 0.48 + mys * 30;
    const grd = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.7);
    grd.addColorStop(0, `rgba(${ar},${ag},${ab},0.17)`);
    grd.addColorStop(0.55, `rgba(${ar},${ag},${ab},0.04)`);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);

    mxs += (mxn - mxs) * 0.06 * f; mys += (myn - mys) * 0.06 * f;

    // ---- stars ----
    const boost = 0.0007 + speed * 0.28 + lp * lp * 0.05;
    ctx.globalCompositeOperation = "lighter";
    const cx = W / 2 + mxs * -22, cy = H * 0.47 + mys * -16;
    const scl = Math.max(W, H) * 0.3;
    ctx.lineCap = "round";
    for (const s of stars) {
      const z0 = s.z;
      s.z -= boost * f * (0.5 + s.z);
      if (s.z < 0.04) { s.z = 1; s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; continue; }
      const px = cx + (s.x / s.z) * scl, py = cy + (s.y / s.z) * scl;
      if (px < -20 || px > W + 20 || py < -20 || py > H + 20) { s.z = 1; s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; continue; }
      const a = clamp(1 - s.z) * (s.hue ? 0.85 : 0.6) + 0.05;
      const size = (1 - s.z) * 2.1 + 0.4;
      ctx.globalAlpha = a;
      const col = s.hue ? `rgb(${ar},${ag},${ab})` : "#cfe";
      const zp = s.z + (z0 - s.z) * 3 + boost * 2;
      const qx = cx + (s.x / zp) * scl, qy = cy + (s.y / zp) * scl;
      if (Math.hypot(px - qx, py - qy) > 2.5) {
        ctx.strokeStyle = col; ctx.lineWidth = size; ctx.beginPath(); ctx.moveTo(qx, qy); ctx.lineTo(px, py); ctx.stroke();
      } else { ctx.fillStyle = col; ctx.fillRect(px - size / 2, py - size / 2, size, size); }
    }

    // ---- initials particles ----
    const s = smooth(clamp(cur / 0.85));
    const heroA = 1 - s;
    if (heroA > 0.01) {
      const R = Math.min(130, W * 0.2), R2 = R * R;
      const damp = Math.pow(0.84, f);
      for (const g of GROUPS) {
        ctx.fillStyle = g.color;
        ctx.globalAlpha = heroA * 0.95;
        for (const p of g.list) {
          const live = time > p.delay;
          const tx = lerp(p.hx, p.sx, s), ty = lerp(p.hy, p.sy, s);
          if (live) {
            const k = 0.055 + s * 0.03;
            p.vx += (tx - p.x) * k * f; p.vy += (ty - p.y) * k * f;
            const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
            if (d2 < R2 && d2 > 1) { const d = Math.sqrt(d2), fo = (1 - d / R) * 5.5 * f; p.vx += (dx / d) * fo; p.vy += (dy / d) * fo; }
            p.vx *= damp; p.vy *= damp;
            p.x += p.vx; p.y += p.vy;
          }
          const wob = Math.sin(time * 0.0018 + p.ph) * 0.9 * (1 - s);
          ctx.fillRect(p.x + wob - p.sz / 2, p.y + wob * 0.6 - p.sz / 2, p.sz, p.sz);
        }
      }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";

    // hero captions
    const ho = clamp(1 - cur * 2.4);
    root.style.setProperty("--hero-o", ho.toFixed(3));
    root.style.setProperty("--cue-o", ho.toFixed(3));
    if (!document.body.classList.contains("is-ready") && time > 1700) document.body.classList.add("is-ready");

    // ---- cards ----
    let newFront = -1;
    for (let i = 0; i < N; i++) {
      const el = cards[i];
      const d = i + 1 - cur, ad = Math.abs(d), ahead = d >= 0;
      let op = ahead ? clamp(1.05 - d * 0.55) : clamp(1 + d * 1.7);
      if (d > 3) op = 0;
      op *= smooth(clamp((cur - 0.12) / 0.55)); // cards stay hidden behind the initials at first
      const side = (i % 2 ? 1 : -1) * (0.7 + (i % 3) * 0.18);
      const m = Math.min(ad, 1.4);
      let z = ahead ? -d * 560 : -d * 1100;
      let x = side * W * 0.13 * m * (ahead ? 1 : 1.5);
      let y = (i % 2 ? -1 : 1) * H * 0.05 * m;
      let ry = -side * 9 * m, rx = (i % 2 ? 1 : -1) * 3 * m;
      const front = ad < 0.45 && !leaving;
      if (ad < 0.5) {
        const w = 1 - ad * 2;
        ry += mxs * 6 * w; rx += -mys * 5 * w;
        el.style.setProperty("--mx", (mxs * w).toFixed(3)); el.style.setProperty("--my", (mys * w).toFixed(3));
      }
      let blur = ahead ? Math.min(ad * 2.6, 6) : Math.min(ad * 10, 12);
      if (leaving) {
        const e = lp * lp;
        if (i === leaving.i) { z += e * 950; op = lp > 0.72 ? 1 - (lp - 0.72) / 0.28 * 0.0 : 1; blur = 0; }
        else op *= 1 - clamp(lp * 1.6);
      }
      el.style.transform = `translate3d(-50%,-50%,0) translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,${z.toFixed(1)}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg)`;
      el.style.opacity = op.toFixed(3);
      el.style.filter = blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : "none";
      el.style.visibility = op > 0.01 ? "visible" : "hidden";
      el.style.zIndex = String(1000 - Math.round(ad * 100));
      el.classList.toggle("is-front", front);
      if (ad < 0.3) newFront = i;
    }
    if (newFront !== frontIdx) {
      frontIdx = newFront;
      if (newFront >= 0 && time > 300) scramble(cards[newFront].querySelector(".title"));
    }

    // rail
    const ri = Math.round(clamp(cur, 0, N));
    railBtns.forEach((b, k) => b.classList.toggle("on", k === ri));
    root.style.setProperty("--rail", ri === 0 ? ACC[0] : ACC[ri - 1]);

    // flash overlay while leaving
    flash.style.opacity = leaving ? clamp((lp - 0.45) / 0.55).toFixed(3) : "0";

    requestAnimationFrame(frame);
  }

  /* ---------- go ---------- */
  resize();
  const hash = location.hash.slice(1).toLowerCase();
  const hi = NAMES.indexOf(hash);
  if (hi >= 0) { scrollTo(0, (hi + 1) * step); target = cur = prev = hi + 1; startTime -= 3000; }
  else { target = cur = prev = clamp(scrollY / step, 0, N); }
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
