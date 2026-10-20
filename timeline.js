/* Timeline stage map: the path draws as you scroll, the player marker follows it,
   and each stage unlocks (with a small burst + toast) when the player reaches it. */
(() => {
  "use strict";
  const wrap = document.getElementById("tl-wrap");
  if (!wrap) return;
  const svg = document.getElementById("tl-svg");
  const grad = document.getElementById("tl-grad");
  const paths = ["tl-track", "tl-glow", "tl-line"].map((id) => document.getElementById(id));
  const [track, glow, line] = paths;
  const avatar = document.getElementById("tl-avatar");
  const stages = [...wrap.querySelectorAll(".stage")];
  const nodes = stages.map((s) => s.querySelector(".stage-node"));
  const hudN = document.getElementById("hud-n");
  const hudBar = document.getElementById("hud-bar");
  const hudYears = document.getElementById("hud-years");
  const toast = document.getElementById("tl-toast");
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FOCUS = 0.62; // the "player" sits at 62% of the viewport height

  let total = 0, samples = [], stageLen = [], ready = false, raf = 0, toastTimer = 0, lastCur = -1;
  const seen = new Set();

  stages.forEach((s) => { const b = document.createElement("span"); b.className = "burst"; b.setAttribute("aria-hidden", "true"); s.appendChild(b); });

  function centers() {
    const wr = wrap.getBoundingClientRect();
    return nodes.map((n) => { const r = n.getBoundingClientRect(); return [r.left + r.width / 2 - wr.left, r.top + r.height / 2 - wr.top]; });
  }

  function layout() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    grad.setAttribute("y2", String(h));
    const pts = centers();
    let d = `M${pts[0][0]} ${Math.max(0, pts[0][1] - 70)} L${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [cx, cy] = pts[i], my = (ay + cy) / 2;
      d += ` C${ax} ${my} ${cx} ${my} ${cx} ${cy}`;
    }
    paths.forEach((p) => p.setAttribute("d", d));
    total = line.getTotalLength();
    samples = [];
    const K = 600;
    for (let k = 0; k <= K; k++) samples.push(line.getPointAtLength((total * k) / K).y);
    stageLen = pts.map(([, y]) => lengthAtY(y));
    [glow, line].forEach((p) => { p.style.strokeDasharray = `${total} ${total}`; });
    update();
  }

  function lengthAtY(y) {
    const K = samples.length - 1;
    if (y <= samples[0]) return 0;
    for (let k = 1; k <= K; k++) {
      if (samples[k] >= y) {
        const f = (y - samples[k - 1]) / Math.max(1e-6, samples[k] - samples[k - 1]);
        return ((k - 1 + f) / K) * total;
      }
    }
    return total;
  }

  function showToast(i) {
    const s = stages[i];
    const title = s.querySelector("h2").textContent.replace(/_$/, "");
    const label = s.classList.contains("stage-next") ? "Next stage" : `Stage ${nodes[i].textContent} unlocked`;
    toast.style.setProperty("--t", getComputedStyle(s).getPropertyValue("--s").trim());
    toast.innerHTML = "";
    const ico = document.createElement("span"); ico.className = "ico"; ico.textContent = s.classList.contains("stage-next") ? "?" : "★";
    const txt = document.createElement("span");
    const b = document.createElement("b"); b.textContent = label;
    txt.append(b, document.createTextNode(`${title} · ${s.dataset.years}`));
    toast.append(ico, txt);
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
  }

  function update() {
    raf = 0;
    if (!total) return;
    const top = wrap.getBoundingClientRect().top;
    const atBottom = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    let L = reduce || atBottom ? total : lengthAtY(innerHeight * FOCUS - top);
    L = Math.min(total, Math.max(0, L));
    [glow, line].forEach((p) => { p.style.strokeDashoffset = String(total - L); });
    const p = line.getPointAtLength(L);
    avatar.style.transform = `translate(${p.x}px, ${p.y}px)`;

    let cur = 0;
    stages.forEach((s, i) => {
      const on = L >= stageLen[i] - 1;
      if (on) cur = i;
      if (on && !s.classList.contains("on")) {
        s.classList.add("on");
        if (ready && !reduce) {
          s.classList.remove("just"); void s.offsetWidth; s.classList.add("just");
          if (!seen.has(i)) showToast(i);
        }
        seen.add(i);
      } else if (!on && s.classList.contains("on")) {
        s.classList.remove("on", "just");
      }
    });
    if (cur !== lastCur) {
      stages.forEach((s, i) => s.classList.toggle("cur", i === cur));
      const col = getComputedStyle(stages[cur]).getPropertyValue("--s").trim();
      const hud = stages[cur].classList.contains("stage-next") ? "#b36bff" : col;
      root.style.setProperty("--hud", hud);
      hudN.textContent = nodes[cur].textContent;
      hudYears.textContent = stages[cur].dataset.years;
      lastCur = cur;
    }
    hudBar.style.width = `${(L / total) * 100}%`;
  }

  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };

  function jumpTo(i) {
    const r = nodes[i].getBoundingClientRect();
    const y = scrollY + r.top + r.height / 2 - innerHeight * FOCUS + 2;
    scrollTo({ top: Math.max(0, y), behavior: reduce ? "auto" : "smooth" });
  }
  nodes.forEach((n, i) => n.addEventListener("click", () => jumpTo(i)));
  stages.forEach((s, i) => {
    const card = s.querySelector(".stage-card");
    card.addEventListener("click", (e) => { if (!e.target.closest("a")) jumpTo(i); });
    if (reduce) return;
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty("--px", `${x * 100}%`); card.style.setProperty("--py", `${y * 100}%`);
      card.style.setProperty("--rx", `${(x - 0.5) * 6}deg`); card.style.setProperty("--ry", `${(0.5 - y) * 6}deg`);
    });
    card.addEventListener("pointerleave", () => { card.style.setProperty("--rx", "0deg"); card.style.setProperty("--ry", "0deg"); });
  });
  // number keys 1–7 jump straight to a stage
  addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || /input|textarea|select/i.test(e.target.tagName)) return;
    const k = parseInt(e.key, 10);
    if (k >= 1 && k <= stages.length) jumpTo(k - 1);
  });

  addEventListener("scroll", schedule, { passive: true });
  addEventListener("resize", () => requestAnimationFrame(layout));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  layout();
  // let the entrance animation settle before measuring again, then enable toasts
  setTimeout(() => { layout(); ready = true; }, 700);
})();

/* Photo gallery: a stage logo with data-gallery='[{"src":"…","alt":"…","credit":"…","href":"…"}]'
   becomes clickable and opens a full-screen slideshow. Logos without photos stay plain. */
(() => {
  "use strict";
  const logos = [...document.querySelectorAll(".stage-logo[data-gallery]")]
    .map((el) => { try { return [el, JSON.parse(el.dataset.gallery)]; } catch (_) { return null; } })
    .filter((x) => x && Array.isArray(x[1]) && x[1].length);
  if (!logos.length) return;

  const box = document.createElement("div");
  box.className = "tl-gallery";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Photo gallery");
  box.innerHTML = `
    <div class="tl-gallery-box">
      <div class="tl-gallery-stage"></div>
      <button class="tl-gallery-btn tl-gallery-close" type="button" aria-label="Close gallery">✕</button>
      <button class="tl-gallery-btn tl-gallery-prev" type="button" aria-label="Previous photo">‹</button>
      <button class="tl-gallery-btn tl-gallery-next" type="button" aria-label="Next photo">›</button>
      <div class="tl-gallery-cap"><div><h3></h3><p></p><small></small></div><div class="tl-gallery-dots"></div></div>
    </div>`;
  document.body.appendChild(box);
  const stageEl = box.querySelector(".tl-gallery-stage");
  const h3 = box.querySelector("h3"), sub = box.querySelector(".tl-gallery-cap p"), credit = box.querySelector("small");
  const dots = box.querySelector(".tl-gallery-dots");
  const prev = box.querySelector(".tl-gallery-prev"), next = box.querySelector(".tl-gallery-next");
  let items = [], i = 0, lastFocus = null, timer = 0, touchX = null;

  function show(n) {
    i = (n + items.length) % items.length;
    [...stageEl.children].forEach((im, k) => im.classList.toggle("on", k === i));
    [...dots.children].forEach((d, k) => { d.classList.toggle("on", k === i); d.setAttribute("aria-current", k === i ? "true" : "false"); });
    const it = items[i];
    credit.textContent = "";
    if (it.credit) {
      if (it.href) { const a = document.createElement("a"); a.href = it.href; a.target = "_blank"; a.rel = "noopener noreferrer"; a.textContent = it.credit; credit.append("Photo: ", a); }
      else credit.textContent = "Photo: " + it.credit;
    }
    clearTimeout(timer);
    if (items.length > 1) timer = setTimeout(() => show(i + 1), 5000);
  }

  function open(el, list) {
    const stage = el.closest(".stage");
    items = list;
    box.style.setProperty("--g", getComputedStyle(stage).getPropertyValue("--s").trim());
    h3.textContent = stage.querySelector("h2").textContent;
    sub.textContent = [stage.querySelector(".stage-sub")?.textContent, stage.dataset.years].filter(Boolean).join(" · ");
    stageEl.innerHTML = ""; dots.innerHTML = "";
    list.forEach((it, k) => {
      const im = new Image(); im.src = it.src; im.alt = it.alt || ""; im.decoding = "async"; stageEl.appendChild(im);
      const d = document.createElement("button"); d.type = "button"; d.setAttribute("aria-label", `Photo ${k + 1} of ${list.length}`);
      d.addEventListener("click", () => show(k)); dots.appendChild(d);
    });
    prev.hidden = next.hidden = dots.hidden = list.length < 2;
    lastFocus = document.activeElement;
    box.classList.add("open");
    document.documentElement.style.overflow = "hidden";
    show(0);
    box.querySelector(".tl-gallery-close").focus();
  }
  function close() {
    box.classList.remove("open");
    document.documentElement.style.overflow = "";
    clearTimeout(timer);
    if (lastFocus) lastFocus.focus();
  }

  logos.forEach(([el, list]) => {
    el.classList.add("has-photos");
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", `Open photos: ${el.closest(".stage").querySelector("h2").textContent}`);
    el.removeAttribute("aria-hidden");
    const go = (e) => { e.stopPropagation(); e.preventDefault(); open(el, list); };
    el.addEventListener("click", go);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") go(e); });
  });
  box.querySelector(".tl-gallery-close").addEventListener("click", close);
  prev.addEventListener("click", () => show(i - 1));
  next.addEventListener("click", () => show(i + 1));
  box.addEventListener("click", (e) => { if (e.target === box) close(); });
  addEventListener("keydown", (e) => {
    if (!box.classList.contains("open")) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") show(i - 1);
    else if (e.key === "ArrowRight") show(i + 1);
    else if (e.key === "Tab") { // keep focus inside the dialog
      const f = [...box.querySelectorAll("button:not([hidden]), a")]; const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    }
    e.stopImmediatePropagation();
  }, true);
  stageEl.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
  stageEl.addEventListener("touchend", (e) => {
    if (touchX == null) return; const dx = e.changedTouches[0].clientX - touchX; touchX = null;
    if (Math.abs(dx) > 40) show(i + (dx < 0 ? 1 : -1));
  });
})();
