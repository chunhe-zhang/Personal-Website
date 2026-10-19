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
  const spacer = $("#spacer"), flash = $("#flash"), heroSub = $("#hero-sub"), cue = $("#cue");
  const root = document.documentElement;
  const NAMES = ["home", "work", "projects", "articles", "contact"];
  const ACC = ["#22d3ee", "#55ff00", "#ff7a1a", "#b36bff", "#ff4fa3"];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const ACC_RGB = ACC.map(hex);
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);

  let W = 0, H = 0, DPR = 1, step = 600;
  let cur = 0, prev = 0;
  let mx = -9999, my = -9999, mxn = 0, myn = 0, mxs = 0, mys = 0;
  let idx = 0, anim = null, lockUntil = 0, lastWheel = 0, lastAbs = 0, touchY = null;
  let letterPath = null, letterW = 8;
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
    const path = new Path2D();
    path.moveTo(ox + lw, oy + t); path.lineTo(ox + t, oy + t); path.lineTo(ox + t, oy + lh - t); path.lineTo(ox + lw, oy + lh - t);
    path.moveTo(zx, oy + t); path.lineTo(zx + lw, oy + t); path.lineTo(zx, oy + lh - t); path.lineTo(zx + lw, oy + lh - t);
    c.stroke(path);
    letterPath = path; letterW = sw;
    const data = c.getImageData(0, 0, off.width, off.height).data;
    const raw = [];
    const stride = 2;
    for (let y = 0; y < off.height; y += stride)
      for (let x = 0; x < off.width; x += stride)
        if (data[(y * off.width + x) * 4 + 3] > 128) raw.push([x, y]);
    const want = W < 700 ? 3600 : 6500;
    for (let i = raw.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [raw[i], raw[j]] = [raw[j], raw[i]]; }
    raw.length = Math.min(raw.length, want);
    GROUPS.forEach((g) => (g.list = []));
    pts = raw.map(([hx, hy]) => {
      const a = Math.random() * Math.PI * 2, r = Math.max(W, H) * (0.25 + Math.random() * 0.5);
      const sa = Math.random() * Math.PI * 2, sr = Math.max(W, H) * (0.5 + Math.random() * 0.8);
      const gi = Math.random() < 0.72 ? 0 : Math.random() < 0.55 ? 1 : Math.random() < 0.5 ? 2 : 3;
      const p = {
        hx, hy,
        x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r, vx: 0, vy: 0,
        sx: W / 2 + Math.cos(sa) * sr, sy: H / 2 + Math.sin(sa) * sr,
        delay: Math.random() * 120 + (hx / W) * 120,
        ph: Math.random() * 6.28, sz: 1.8 + Math.random() * 1.5,
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
    spacer.style.display = "none";
    buildPoints();
    if (!stars.length) buildStars();
  }

  /* ---------- typewriter titles ---------- */
  const typing = new WeakMap();
  const TYPE_MS = 320; // same total time for every title, however long
  function typeIn(el) {
    const text = el.dataset.text;
    const id = (typing.get(el) || 0) + 1; typing.set(el, id);
    const t0 = performance.now() + 40;
    el.innerHTML = `<span class="t"></span><span class="r">${text}</span>`;
    const tick = () => {
      if (typing.get(el) !== id) return;
      const p = clamp((performance.now() - t0) / TYPE_MS);
      const k = Math.ceil(text.length * p);
      if (p >= 1) { el.textContent = text; return; }
      el.innerHTML = `<span class="t">${text.slice(0, k)}</span><span class="r">${text.slice(k)}</span>`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- navigation: one gesture = one section ---------- */
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  function goTo(t) {
    t = clamp(Math.round(t), 0, N);
    const now = performance.now();
    if (t === idx && !anim) return;
    idx = t;
    const dur = Math.max(700, Math.min(1300, 600 + Math.abs(t - cur) * 260));
    anim = { from: cur, to: t, t0: now, dur };
    lockUntil = now + dur;
  }
  const go = (d) => goTo(idx + d);
  railBtns.forEach((b) => b.addEventListener("click", () => goTo(+b.dataset.t)));
  cards.forEach((c, i) => {
    c.querySelector("a").addEventListener("click", (e) => {
      if (e.button || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (leaving) return;
      if (idx !== i + 1 || anim) { goTo(i + 1); return; }
      leaving = { i, t0: performance.now(), href: c.querySelector("a").href };
      root.style.setProperty("--flash", ACC[i]);
    });
    c.querySelector("a").addEventListener("focus", () => { if (idx !== i + 1) goTo(i + 1); });
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
    // a new gesture = a pause since the last event, or a clearly stronger push (ignores trackpad inertia)
    const fresh = now - lastWheel > 110 || a > lastAbs * 1.8 + 6;
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
  addEventListener("pointermove", (e) => { mx = e.clientX; my = e.clientY; mxn = (mx / W - 0.5) * 2; myn = (my / H - 0.5) * 2; }, { passive: true });
  addEventListener("pointerleave", () => { mx = my = -9999; });
  addEventListener("resize", resize);
  addEventListener("pageshow", (e) => { if (e.persisted) { leaving = null; flash.style.opacity = 0; } });

  /* ---------- frame ---------- */
  let last = performance.now();
  function frame(now) {
    const f = Math.min((now - last) / 16.667, 3); last = now;
    const time = now - startTime;

    // eased glide between sections
    prev = cur;
    if (anim) {
      const p = clamp((now - anim.t0) / anim.dur);
      cur = anim.from + (anim.to - anim.from) * ease(p);
      if (p >= 1) { cur = anim.to; anim = null; }
    }
    const speed = Math.abs(cur - prev) / f;

    // leaving transition progress
    let lp = 0;
    if (leaving) {
      lp = clamp((now - leaving.t0) / 780);
      if (lp >= 1) { const href = leaving.href; leaving = null; location.href = href; return; }
    }

    // accent colour follows the section in view
    const ai = clamp(Math.round(cur) - 1, 0, N - 1);
    const tgt = cur < 0.5 ? hex("#55ff00") : ACC_RGB[ai];
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
      const formed = clamp((time - 350) / 350);
      if (formed > 0 && letterPath) {
        ctx.globalAlpha = heroA * formed * 0.3;
        ctx.strokeStyle = "#3fd400"; ctx.lineWidth = letterW; ctx.lineJoin = "miter"; ctx.miterLimit = 1.4; ctx.lineCap = "butt";
        ctx.shadowColor = "#55ff00"; ctx.shadowBlur = 16;
        ctx.stroke(letterPath);
        ctx.shadowBlur = 0;
      }
      const R = Math.min(130, W * 0.2), R2 = R * R;
      const damp = Math.pow(0.8, f);
      for (const g of GROUPS) {
        ctx.fillStyle = g.color;
        ctx.globalAlpha = heroA * 0.95;
        for (const p of g.list) {
          const live = time > p.delay;
          const tx = lerp(p.hx, p.sx, s), ty = lerp(p.hy, p.sy, s);
          if (live) {
            const k = 0.16 + s * 0.03;
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
    const ready = clamp((time - 400) / 400);
    heroSub.style.opacity = (ho * ready).toFixed(3);
    cue.style.opacity = (ho * clamp((time - 600) / 400)).toFixed(3);

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
      if (newFront >= 0 && time > 300) typeIn(cards[newFront].querySelector(".title"));
    }

    // rail
    const ri = Math.round(clamp(cur, 0, N));
    railBtns.forEach((b, k) => b.classList.toggle("on", k === ri));
    root.style.setProperty("--rail", ri === 0 ? "#55ff00" : ACC[ri - 1]);

    // flash overlay while leaving
    flash.style.opacity = leaving ? clamp((lp - 0.45) / 0.55).toFixed(3) : "0";

    requestAnimationFrame(frame);
  }

  /* ---------- go ---------- */
  document.documentElement.classList.add("paged");
  resize();
  const hash = location.hash.slice(1).toLowerCase();
  const hi = NAMES.indexOf(hash);
  if (hi >= 0) { idx = hi + 1; cur = prev = idx; startTime -= 3000; }
  requestAnimationFrame((t) => { last = t; frame(t); });
})();
