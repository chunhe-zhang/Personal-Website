"use strict";
// Set window.GLOBALX_API_BASE after Azure Function deployment to enable live processed results.
const API_BASE = window.GLOBALX_API_BASE || "";
const CATALOG_URL = "catalog.json?v=recursive-public-exposure-20261018b";

const REGION_NAMES = { US: "United States", AU: "Australia", BR: "Brazil", CO: "Colombia", HK: "Hong Kong", CA: "Canada" };
const REGION_CHIP = { US: "US", CA: "Canada", AU: "Australia", BR: "Brazil", HK: "Hong Kong", CO: "Colombia" };
const REGION_ORDER = ["US", "CA", "AU", "BR", "HK", "CO"];

// Paint colours used inside the SVG diagram (kept in sync with styles.css)
const C = { orange: "#FF5A00", ember: "#B53A00", ink: "#1D2540", slate: "#566078", hatch: "#8FA3C8", hatchPale: "#E6ECF7", gap: "#DDE3EE", gapBar: "#C3CCDD" };

const $ = (s) => document.querySelector(s);
const el = {
  input: $("#fund-search"), list: $("#fund-list"), chips: $("#region-chips"), onlyData: $("#only-data"),
  cov: $("#coverage"), quick: $("#quick"), sr: $("#combo-status"), asof: $("#catalog-asof"),
  stage: $("#stage"), ticker: $("#fund-title"), name: $("#fund-name"), chip: $("#status-chip"),
  facts: $("#fund-facts"), source: $("#product-source"), take: $("#takeaway"), flow: $("#flow"),
  legend: $("#flow-legend"), message: $("#message"), holdings: $("#holdings"), rows: $("#rows"), count: $("#row-count")
};

let products = [];
let current = null;   // { p, items }
let token = 0;        // guards against late responses
let lastW = 0;

/* ------------------------------------------------------------------
   Small helpers
------------------------------------------------------------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(v * 100) / 100;
const plain = (v) => String(r2(v));
function pct(v) {
  if (v !== 0 && Math.abs(v) < 0.01) return "<0.01%";
  return v.toFixed(2) + "%";
}
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
const short = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
const hasData = (p) => Array.isArray(p.holdings) && p.holdings.length > 0;
const keyOf = (p) => p.region_code + "|" + p.ticker;
const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const KIND_LABEL = { full: "Verified snapshot", partial: "Partial snapshot", none: "No holdings yet", busy: "Checking" };
const EXT_ICON = '<svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false"><path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function dot(kind) {
  return '<svg class="dot" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    (kind === "full" ? '<circle cx="6" cy="6" r="3.2" fill="currentColor"/>' : kind === "partial" ? '<path d="M6 2.8a3.2 3.2 0 0 0 0 6.4z" fill="currentColor"/>' : "") + "</svg>";
}
function kindOf(p) {
  if (p.holdings_status === "exposure_available") return "full";
  return hasData(p) ? "partial" : "none";
}

function explainReason(data, p) {
  if (data?.coverage_reason || data?.reason) return data.coverage_reason || data.reason;
  const code = data?.error || data?.coverage_status || "";
  const known = {
    source_http_error: "The official product page returned an HTTP error, so no holdings were accepted.",
    parser_no_holdings: "The public page was reachable, but no recognizable ticker-and-weight table or holdings CSV was found.",
    public_source_unavailable: "The public holdings source could not be fetched or decoded.",
    holdings_unavailable: "This product is in the catalog, but Azure has no normalized holdings snapshot for it yet.",
    fund_holdings_unavailable: "A nested ETF was identified, but its own holdings snapshot is missing; look-through stops at that ETF.",
    silver_snapshot_missing: "Raw source acquisition has not produced a normalized holdings snapshot for this fund.",
    calculation_failed: "The source was acquired, but Azure could not finish the exposure calculation."
  };
  if (known[code]) return known[code];
  if (p?.holdings_status === "raw_html_only") return "Azure Data Factory saved this product page as raw HTML in bronze, but it has not yet been parsed into normalized holdings.";
  if (p?.holdings_status === "top_holdings_captured") return "Only limited top-holdings metadata is recorded; a full normalized holdings snapshot is not available.";
  if (p?.holdings_status === "not_loaded") return "The official product page is mapped, but no successful holdings fetch or normalized snapshot has been recorded yet.";
  return "No verified public holdings snapshot is available. The source does not publish accessible holdings, or the fetch/parse step has not succeeded.";
}

/* ------------------------------------------------------------------
   Turning catalog rows into items the diagram and list can share
------------------------------------------------------------------- */
function parsePath(h, fund) {
  let a = h.paths;
  if (typeof a === "string") a = a.split("→");
  if (!Array.isArray(a)) a = [];
  a = a.map((s) => String(s).trim()).filter((s) => s && s.toLowerCase() !== "direct");
  const ticker = String(h.ticker);
  if (a[0] !== fund) a.unshift(fund);
  if (a[a.length - 1] !== ticker) a.push(ticker);
  return a;
}
function toItems(data, p) {
  const fund = p.ticker;
  // Some rows (cash, options, payables) have "-" as a ticker; show their name instead
  const mk = (kind) => (h) => {
    const raw = String(h.ticker ?? ""), name = h.name || "";
    const label = /[A-Za-z0-9]/.test(raw) ? raw : name || raw || "Unknown";
    const path = parsePath(h, fund);
    path[path.length - 1] = label;
    return { kind, ticker: label, name: label === name ? "" : name, pct: num(h.exposure_pct), path };
  };
  const held = (data.holdings || []).map(mk("stock")).sort((a, b) => b.pct - a.pct);
  const open = (data.unresolved || p.unresolved || []).map(mk("unresolved")).sort((a, b) => b.pct - a.pct);
  const items = [...held, ...open];
  items.forEach((x, i) => { x.i = i; });
  return items;
}

/* ------------------------------------------------------------------
   The flow diagram: fund, any ETF layers in between, then stocks
------------------------------------------------------------------- */
function buildFlow(fund, items, W) {
  const live = items.filter((x) => x.pct > 0);
  const total = live.reduce((s, x) => s + x.pct, 0);
  const base = Math.max(100, total);
  const NODE = 12, GAP = 4, PITCH = 28, MID_GAP = 26, PT = 40, PB = 12, MAXL = 12;

  // Leaves (right-hand column)
  const byTicker = new Map();
  for (const x of live.filter((x) => x.kind === "stock")) {
    const g = byTicker.get(x.ticker) || { id: x.ticker, label: x.ticker, name: x.name, v: 0, items: [] };
    g.v += x.pct; g.items.push(x.i); byTicker.set(x.ticker, g);
  }
  let stockLeaves = [...byTicker.values()].sort((a, b) => b.v - a.v);
  if (stockLeaves.length > MAXL) {
    const keep = stockLeaves.slice(0, MAXL - 1), rest = stockLeaves.slice(MAXL - 1);
    stockLeaves = keep.concat({ id: "~rest", label: "+" + rest.length + " more", name: rest.length + " smaller positions", v: rest.reduce((s, g) => s + g.v, 0), items: rest.flatMap((g) => g.items), rest: true });
  }
  const leafList = [], leafFor = new Map();
  for (const g of stockLeaves) { leafList.push({ ...g, kind: g.rest ? "rest" : "stock" }); for (const i of g.items) leafFor.set(i, g.id); }
  for (const x of live.filter((x) => x.kind === "unresolved")) {
    const id = "~u:" + x.ticker + ":" + x.i;
    leafList.push({ id, label: x.ticker, name: x.name, v: x.pct, items: [x.i], kind: "open" });
    leafFor.set(x.i, id);
  }
  const gapV = total < 99.95 ? 100 - total : 0;
  if (gapV > 0) leafList.push({ id: "~gap", label: "Unlisted", name: "Not in the public snapshot", v: gapV, items: [], kind: "gap" });

  const D = Math.max(2, ...live.map((x) => x.path.length));

  // Nodes and edges
  const nodes = new Map(), edges = new Map();
  const node = (key, col, label, kind, name) => {
    let n = nodes.get(key);
    if (!n) { n = { key, col, label, kind, name: name || label, v: 0 }; nodes.set(key, n); }
    return n;
  };
  const edge = (a, b, v, ids) => {
    const k = a + ">" + b;
    let e = edges.get(k);
    if (!e) { e = { a, b, v: 0, items: new Set() }; edges.set(k, e); }
    e.v += v; ids.forEach((i) => e.items.add(i));
  };
  const fundNode = node("0|" + fund, 0, fund, "fund");
  for (const L of leafList) node("L|" + L.id, D - 1, L.label, L.kind, L.name).v = L.v;
  for (const x of live) {
    const seq = ["0|" + fund];
    x.path.slice(1, -1).forEach((name, k) => { const key = (k + 1) + "|" + name; node(key, k + 1, name, "mid"); seq.push(key); });
    seq.push("L|" + leafFor.get(x.i));
    for (let k = 0; k < seq.length - 1; k++) edge(seq[k], seq[k + 1], x.pct, [x.i]);
  }
  if (gapV > 0) edge("0|" + fund, "L|~gap", gapV, []);

  // Sizes
  const Hn = Math.min(300, 100 + leafList.length * 18);
  const scale = Hn / base;
  const thick = (v) => Math.max(v * scale, 1.5);
  const outs = new Map(), ins = new Map();
  const push = (m, k, e) => { if (!m.has(k)) m.set(k, []); m.get(k).push(e); };
  for (const e of edges.values()) { e.t = thick(e.v); push(outs, e.a, e); push(ins, e.b, e); }
  const sumT = (a) => (a || []).reduce((s, e) => s + e.t, 0);
  for (const n of nodes.values()) {
    n.th = Math.max(sumT(outs.get(n.key)), sumT(ins.get(n.key)), 1.5);
    if (n.kind === "mid") n.v = (ins.get(n.key) || []).reduce((s, e) => s + e.v, 0);
  }
  fundNode.v = total + gapV;

  // Columns and vertical stacking
  const cols = Array.from({ length: D }, () => []);
  for (const n of nodes.values()) cols[n.col].push(n);
  const leafIdx = new Map(leafList.map((L, i) => ["L|" + L.id, i]));
  const rank = (n) => Math.min(1e9, ...(outs.get(n.key) || []).map((e) => leafIdx.get(e.b) ?? 1e9));
  for (let c = 1; c < D - 1; c++) cols[c].sort((a, b) => rank(a) - rank(b) || b.v - a.v);
  cols[D - 1].sort((a, b) => leafIdx.get(a.key) - leafIdx.get(b.key));

  let H = 0;
  const heights = [];
  cols.forEach((col, c) => {
    // Leaf rows keep a minimum label pitch; middle layers leave room for the label above each bar
    const pitch = c === D - 1 ? PITCH : 0, gap = c > 0 && c < D - 1 ? MID_GAP : GAP;
    let cur = 0, prev = -1e9;
    for (const n of col) {
      let top = cur, mid = top + n.th / 2;
      if (pitch && mid - prev < pitch) { mid = prev + pitch; top = mid - n.th / 2; }
      n.y = top; prev = top + n.th / 2; cur = top + n.th + gap;
    }
    heights[c] = cur - gap;
    H = Math.max(H, heights[c]);
  });
  cols.forEach((col, c) => { const off = PT + (H - heights[c]) / 2; for (const n of col) n.y += off; });
  const Ht = Math.ceil(PT + H + PB);

  const labelW = Math.max(140, Math.min(210, W * 0.42));
  const maxCh = Math.max(6, Math.floor((labelW - NODE - 9 - 54) / 7.4));   // ticker characters that fit beside the percentage
  const leafX = Math.max(NODE + 80, W - labelW - NODE);
  for (const n of nodes.values()) n.x = Math.round((n.col * leafX) / (D - 1));

  // Ribbon offsets inside each node
  for (const n of nodes.values()) {
    let o = n.y;
    for (const e of (outs.get(n.key) || []).sort((a, b) => nodes.get(a.b).y - nodes.get(b.b).y)) { e.sy = o; o += e.t; }
    o = n.y;
    for (const e of (ins.get(n.key) || []).sort((a, b) => nodes.get(a.a).y - nodes.get(b.a).y)) { e.ty = o; o += e.t; }
  }

  // Drawing
  const ids = (set) => "," + [...set].join(",") + ",";
  const ribbonPath = (e) => {
    const A = nodes.get(e.a), B = nodes.get(e.b), x0 = A.x + NODE, x1 = B.x, mx = r2((x0 + x1) / 2);
    const sy = r2(e.sy), ty = r2(e.ty), t = r2(e.t);
    return `M${x0},${sy} C${mx},${sy} ${mx},${ty} ${x1},${ty} L${x1},${r2(ty + t)} C${mx},${r2(ty + t)} ${mx},${r2(sy + t)} ${x0},${r2(sy + t)}Z`;
  };
  let ribbons = "";
  for (const e of [...edges.values()].sort((a, b) => b.v - a.v)) {
    const A = nodes.get(e.a), B = nodes.get(e.b);
    const fill = B.kind === "open" ? "url(#hatch)" : B.kind === "gap" ? C.gap : "url(#flowg)";
    const stroke = B.kind === "open" ? ` stroke="${C.hatch}" stroke-width="1"` : "";
    ribbons += `<path class="rb" d="${ribbonPath(e)}" fill="${fill}"${stroke} data-items="${ids(e.items)}"><title>${esc(A.label)} to ${esc(B.name)}: ${pct(e.v)} of NAV</title></path>`;
  }

  const exc = total > 100.05 ? (total - 100) * scale : 0;
  let marks = "";
  // Fund bar (borrowed exposure above 100% shown in ember)
  marks += `<rect x="${fundNode.x}" y="${r2(fundNode.y)}" width="${NODE}" height="${r2(fundNode.th)}" fill="${C.orange}"/>`;
  if (exc > 0) {
    marks += `<rect x="${fundNode.x}" y="${r2(fundNode.y)}" width="${NODE}" height="${r2(exc)}" fill="${C.ember}"/>`;
    const yy = r2(fundNode.y + exc);
    marks += `<line x1="${fundNode.x}" x2="${fundNode.x + NODE + 30}" y1="${yy}" y2="${yy}" stroke="${C.ink}" stroke-width="1.5" stroke-dasharray="3 3"/>`;
    marks += `<text class="halo" x="${fundNode.x + NODE + 36}" y="${yy + 4}" font-size="11.5" font-weight="600">100% of NAV</text>`;
  }
  marks += `<text class="halo" x="0" y="${r2(fundNode.y - 12)}"><tspan font-size="15" font-weight="700">${esc(short(fund, 14))}</tspan><tspan class="dim" dx="8" font-size="13">${plain(total + gapV)}% of NAV</tspan></text>`;

  const mids = [];
  for (const n of nodes.values()) {
    if (n.kind === "mid") {
      if (!mids.includes(n.label)) mids.push(n.label);
      marks += `<rect x="${n.x}" y="${r2(n.y)}" width="${NODE}" height="${r2(n.th)}" fill="${C.ink}"/>`;
      const its = new Set(); (outs.get(n.key) || []).forEach((e) => e.items.forEach((i) => its.add(i)));
      marks += `<g class="lbl" data-items="${ids(its)}"><title>${esc(n.label)}: ${pct(n.v)} of NAV passes through this fund</title><text class="halo" x="${n.x + NODE / 2}" y="${r2(n.y - 9)}" text-anchor="middle"><tspan font-size="13" font-weight="700">${esc(short(n.label, 12))}</tspan><tspan class="dim" dx="6" font-size="12">${pct(n.v)}</tspan></text></g>`;
    } else if (n.col === D - 1) {
      const fill = n.kind === "open" ? "url(#hatch)" : n.kind === "gap" ? C.gapBar : n.kind === "rest" ? C.slate : C.ink;
      const stroke = n.kind === "open" ? ` stroke="${C.ink}" stroke-width="1"` : "";
      marks += `<rect x="${leafX}" y="${r2(n.y)}" width="${NODE}" height="${r2(n.th)}" fill="${fill}"${stroke}/>`;
      const L = leafList.find((l) => "L|" + l.id === n.key);
      const cy = r2(n.y + n.th / 2 + 4.5);
      marks += `<g class="lbl" data-items="${ids(new Set(L.items))}"><title>${esc(n.name && n.name !== n.label ? n.label + " (" + n.name + ")" : n.label)}: ${pct(n.v)} of NAV</title>` +
        `<text x="${leafX + NODE + 9}" y="${cy}" font-size="13" font-weight="${n.kind === "gap" ? 500 : 700}"${n.kind === "gap" ? ' class="dim"' : ""}>${esc(short(n.label, maxCh))}</text>` +
        `<text class="dim" x="${W}" y="${cy}" text-anchor="end" font-size="12.5">${pct(n.v)}</text></g>`;
    }
  }

  const aria = `${fund} exposure flows to ${leafList.filter((l) => l.kind === "stock" || l.kind === "rest").reduce((s, l) => s + l.items.length, 0)} holdings` + (mids.length ? ` through ${mids.join(" and ")}` : "") + ". The list below has every position.";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" class="flow-svg" viewBox="0 0 ${W} ${Ht}" width="${W}" height="${Ht}" role="img" aria-label="${esc(aria)}">` +
    `<defs>` +
    `<linearGradient id="flowg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${leafX}" y2="0"><stop offset="0" stop-color="${C.orange}"/><stop offset="1" stop-color="#FF8F55"/></linearGradient>` +
    `<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="${C.hatchPale}"/><line x1="0" y1="0" x2="0" y2="6" stroke="${C.hatch}" stroke-width="2.5"/></pattern>` +
    `<clipPath id="reveal"><rect class="sweep" x="-4" y="0" width="${W + 8}" height="${Ht}"/></clipPath>` +
    `</defs>` +
    `<g clip-path="url(#reveal)">${ribbons}</g><g class="late">${marks}</g></svg>`;

  return { svg, mids, total, gapV, leveraged: exc > 0, hasOpen: leafList.some((l) => l.kind === "open"), hasGap: gapV > 0 };
}

function legendHTML(f) {
  const li = [`<li><i class="sw sw-flow"></i>Ribbon width is share of fund NAV</li>`];
  if (f.leveraged) li.push(`<li><i class="sw sw-lev"></i>Exposure above 100% of NAV (leverage)</li>`);
  if (f.hasOpen) li.push(`<li><i class="sw sw-hatch"></i>Stops at a position we couldn’t trace to a single stock</li>`);
  if (f.hasGap) li.push(`<li><i class="sw sw-gap"></i>Not in the public snapshot</li>`);
  return li.join("");
}

function listJoin(a) { return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1]; }
function takeaway(fund, items, f) {
  const stocks = items.filter((x) => x.kind === "stock" && x.pct > 0), open = items.filter((x) => x.kind === "unresolved" && x.pct > 0);
  const top = stocks[0], out = [];
  if (top) {
    out.push(stocks.length === 1
      ? `${fund} puts ${pct(top.pct)} of its NAV into ${top.name || top.ticker}.`
      : `${fund}’s public snapshot lists ${stocks.length} holdings. The largest is ${top.ticker} at ${pct(top.pct)} of NAV.`);
  } else if (open.length) {
    out.push(`We couldn’t trace ${fund}’s positions down to single stocks.`);
  }
  if (f.leveraged) out.push("That adds up to more than 100% because the fund uses leverage.");
  else if (f.hasGap) out.push(`Public data covers ${pct(f.total)} of NAV; the rest isn’t published.`);
  if (f.mids.length) out.push(`Some of it passes through ${listJoin(f.mids)}, ${f.mids.length > 1 ? "other Global X funds" : "another Global X fund"}.`);
  if (top && open.length) out.push(`${open.length === 1 ? "One position isn’t" : open.length + " positions aren’t"} traced to a single stock.`);
  return out.join(" ");
}

/* ------------------------------------------------------------------
   Rendering a selected fund
------------------------------------------------------------------- */
function paintHead(p, kind, data) {
  el.ticker.textContent = p.ticker;
  const nm = p.name && p.name !== p.ticker ? p.name : "";
  el.name.textContent = nm; el.name.hidden = !nm;
  const status = (data && data.coverage_status) || p.coverage_status || (p.holdings_status === "raw_html_only" ? "Raw only" : "");
  el.chip.innerHTML = `<span class="status chip-${kind}"${status ? ` title="${esc(status)}"` : ""}>${dot(kind === "busy" ? "none" : kind)}${KIND_LABEL[kind]}</span>`;
  const region = p.region || REGION_NAMES[p.region_code] || p.region_code;
  const asOf = (data && data.as_of) || p.exposure_as_of || p.catalog_as_of;
  el.facts.textContent = region + (asOf && kind !== "busy" && kind !== "none" ? ", holdings as of " + fmtDate(asOf) : "");
  const url = p.product_url || p.catalog_url;
  el.source.innerHTML = url ? `<a class="ext" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Official fund page ${EXT_ICON}</a>` : "";
}

function rowsHTML(items) {
  const max = Math.max(1, ...items.map((x) => Math.abs(x.pct)));
  return items.map((h) => {
    const open = h.kind === "unresolved";
    return `<li class="row${open ? " is-open" : ""}" data-i="${h.i}">` +
      `<span class="r-rank">${open ? "–" : h.i + 1}</span>` +
      `<div class="r-who"><span class="r-tk">${esc(h.ticker)}</span>${h.name ? `<span class="r-nm">${esc(h.name)}</span>` : ""}<span class="r-pth">${esc(h.path.join(" → "))}</span>${open ? '<span class="r-tag">Not traced to a single stock</span>' : ""}</div>` +
      `<div class="meter" aria-hidden="true"><i style="width:${Math.min(100, (Math.abs(h.pct) / max) * 100)}%"></i></div>` +
      `<span class="r-val">${pct(h.pct)}</span></li>`;
  }).join("");
}

function quickPicks() {
  const info = products.filter(hasData).map((p) => ({
    p, n: p.holdings.length,
    total: p.holdings.reduce((s, h) => s + num(h.exposure_pct), 0),
    nested: p.holdings.some((h) => parsePath(h, p.ticker).length > 2)
  }));
  const picks = [];
  const add = (x, label) => { if (x && !picks.some((q) => keyOf(q.p) === keyOf(x.p))) picks.push({ p: x.p, label }); };
  add(info.find((x) => x.p.region_code === "CA" && x.p.ticker === "AAPP" && x.total > 100) || info.find((x) => x.total > 100), "leveraged");
  const wide = [...info].sort((a, b) => b.n - a.n)[0];
  add([...info].filter((x) => x.nested && x !== wide).sort((a, b) => b.n - a.n)[0] || info.find((x) => x.nested), "passes through another ETF");
  add(wide, wide ? wide.n + " holdings" : "");
  return picks;
}
function quickHTML(label) {
  const picks = quickPicks();
  if (!picks.length) return "";
  return `<span>${label}</span>` + picks.map((q) => `<button type="button" class="qbtn" data-pick="${esc(keyOf(q.p))}"><b>${esc(q.p.ticker)}</b><span>${esc(q.label)}</span></button>`).join("");
}

function render(res, p) {
  const data = res.data || {};
  const items = res.error ? [] : toItems(data, p);
  current = { p, items };
  if (!items.length) {
    paintHead(p, "none", data);
    el.take.textContent = `We don’t have holdings for ${p.ticker} yet.`;
    el.legend.innerHTML = ""; el.rows.innerHTML = ""; el.holdings.hidden = true; el.message.className = "message"; el.message.textContent = "";
    const why = esc(explainReason(res.error ? p : data, p));
    el.flow.innerHTML = `<div class="empty" role="status">${res.error ? '<p class="empty-why err">Azure holdings API could not be reached.</p>' : ""}<p class="empty-why">${why}</p><div class="quick">${quickHTML("Try a fund that has data")}</div></div>`;
    return;
  }
  const kind = p.holdings_status === "exposure_available" ? "full" : "partial";
  paintHead(p, kind, data);
  el.rows.innerHTML = rowsHTML(items);
  const nStocks = items.filter((x) => x.kind === "stock").length, nOpen = items.length - nStocks;
  el.count.textContent = nStocks + (nStocks === 1 ? " holding" : " holdings") + (nOpen ? ", " + nOpen + " untraced" : "");
  el.holdings.hidden = false;
  const open = items.filter((x) => x.kind === "unresolved");
  const base = data.coverage_reason || "Exposure is multiplied through the available holdings graph.";
  el.message.className = "message";
  el.message.textContent = open.length ? base + " Positions we couldn’t trace to a single stock: " + open.map((x) => x.ticker).join(", ") + "." : base;
  drawFlow(true);
}

function drawFlow(animate) {
  if (!current || !current.items.length) return;
  const W = Math.max(300, Math.round(el.flow.clientWidth) || 900);
  const f = buildFlow(current.p.ticker, current.items, W);
  el.flow.innerHTML = f.svg;
  if (!animate) el.flow.querySelector("svg").classList.add("still");
  el.legend.innerHTML = legendHTML(f);
  if (animate) el.take.textContent = takeaway(current.p.ticker, current.items, f);
  lastW = W;
}

async function load(p) {
  const my = ++token;
  const local = () => ({ holdings: p.holdings, unresolved: p.unresolved, as_of: p.exposure_as_of, coverage_status: p.coverage_status, coverage_reason: p.coverage_reason });
  let res;
  try {
    if (API_BASE) {
      const r = await fetch(API_BASE.replace(/\/$/, "") + "/lookthrough/" + encodeURIComponent(p.region_code) + "/" + encodeURIComponent(p.ticker));
      const data = await r.json().catch(() => ({}));
      if (r.ok) res = { data };
      else if (!hasData(p)) res = { data };
    }
    if (!res) res = hasData(p) ? { data: local() } : { data: p };
  } catch (e) {
    res = hasData(p) ? { data: local() } : { error: true, data: p };
  }
  if (my !== token) return;
  render(res, p);
}

function selectProduct(p, opts = {}) {
  el.input.value = p.ticker;
  try { history.replaceState(null, "", "#" + p.region_code + "/" + encodeURIComponent(p.ticker)); } catch (e) { /* ignore */ }
  current = { p, items: [] };
  paintHead(p, "busy");
  el.take.textContent = "";
  if (opts.scroll && el.stage.scrollIntoView) el.stage.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" });
  return load(p);
}

/* ------------------------------------------------------------------
   Fund picker (searchable combobox)
------------------------------------------------------------------- */
const ui = { region: "ALL", onlyData: false, query: "", active: -1, open: false, shown: [] };

function matches() {
  const q = ui.query.trim().toLowerCase();
  let list = products.filter((p) => (ui.region === "ALL" || p.region_code === ui.region) && (!ui.onlyData || hasData(p)));
  const scored = [];
  for (const p of list) {
    const t = p.ticker.toLowerCase(), n = String(p.name || "").toLowerCase();
    let s = 0;
    if (q) s = t === q ? 1 : t.startsWith(q) ? 2 : t.includes(q) ? 3 : n.includes(q) ? 4 : 0;
    if (q && !s) continue;
    scored.push({ p, s, d: hasData(p) ? 0 : 1 });
  }
  scored.sort((a, b) => a.s - b.s || a.d - b.d || a.p.ticker.localeCompare(b.p.ticker));
  return scored.map((x) => x.p);
}
function optHTML(p, n) {
  const k = kindOf(p), nm = p.name && p.name !== p.ticker ? p.name : "";
  return `<li class="opt" role="option" id="opt-${n}" data-n="${n}" aria-selected="false">` +
    `<span class="opt-tk">${esc(p.ticker)}</span><span class="opt-nm">${esc(nm)}</span>` +
    `<span class="opt-meta"><span class="opt-rg">${esc(p.region_code)}</span><span class="opt-st">${dot(k)}<span class="opt-st-text">${k === "full" ? "Verified" : k === "partial" ? "Partial" : "No data yet"}</span></span></span></li>`;
}
function renderList() {
  ui.shown = matches();
  el.list.innerHTML = ui.shown.length ? ui.shown.map(optHTML).join("") : '<li class="none" role="presentation">No funds match. Try a ticker such as QYLD.</li>';
  el.sr.textContent = ui.shown.length + (ui.shown.length === 1 ? " fund" : " funds");
  if (ui.active >= ui.shown.length) ui.active = ui.shown.length - 1;
  paintActive();
}
function paintActive() {
  el.list.querySelectorAll(".opt").forEach((o) => o.setAttribute("aria-selected", String(+o.dataset.n === ui.active)));
  const a = ui.active >= 0 ? $("#opt-" + ui.active) : null;
  if (a) { el.input.setAttribute("aria-activedescendant", a.id); a.scrollIntoView && a.scrollIntoView({ block: "nearest" }); }
  else el.input.removeAttribute("aria-activedescendant");
}
function openList() {
  if (el.input.disabled) return;
  if (!ui.open) {
    ui.open = true; el.list.hidden = false; el.input.setAttribute("aria-expanded", "true");
    renderList();
    const cur = current ? ui.shown.findIndex((p) => keyOf(p) === keyOf(current.p)) : -1;
    ui.active = ui.query ? 0 : Math.max(0, cur);
    if (!ui.shown.length) ui.active = -1;
    paintActive();
  }
}
function closeList() {
  ui.open = false; el.list.hidden = true; el.input.setAttribute("aria-expanded", "false"); el.input.removeAttribute("aria-activedescendant");
  ui.query = "";
  if (current) el.input.value = current.p.ticker;
}
function choose(p) { closeList(); selectProduct(p, { scroll: true }); }

el.input.addEventListener("focus", () => { ui.query = ""; el.input.select(); openList(); });
el.input.addEventListener("input", () => { ui.query = el.input.value; if (!ui.open) openList(); renderList(); ui.active = ui.shown.length ? 0 : -1; paintActive(); });
el.input.addEventListener("blur", () => setTimeout(() => { if (document.activeElement !== el.input) closeList(); }, 120));
el.input.addEventListener("keydown", (e) => {
  const n = ui.shown.length;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!ui.open) { openList(); return; }
    if (!n) return;
    ui.active = e.key === "ArrowDown" ? (ui.active + 1) % n : (ui.active - 1 + n) % n;
    paintActive();
  } else if (e.key === "Home" && ui.open && n) { e.preventDefault(); ui.active = 0; paintActive(); }
  else if (e.key === "End" && ui.open && n) { e.preventDefault(); ui.active = n - 1; paintActive(); }
  else if (e.key === "Enter") { if (ui.open && ui.active >= 0 && ui.shown[ui.active]) { e.preventDefault(); choose(ui.shown[ui.active]); } }
  else if (e.key === "Escape") { if (ui.open) { e.preventDefault(); closeList(); el.input.select(); } }
});
el.list.addEventListener("mousedown", (e) => e.preventDefault());
el.list.addEventListener("click", (e) => { const o = e.target.closest(".opt"); if (o) choose(ui.shown[+o.dataset.n]); });
el.list.addEventListener("pointermove", (e) => { const o = e.target.closest(".opt"); if (o && +o.dataset.n !== ui.active) { ui.active = +o.dataset.n; paintActive(); } });

el.onlyData.addEventListener("change", () => { ui.onlyData = el.onlyData.checked; if (ui.open) { renderList(); } else el.input.focus(); });
el.chips.addEventListener("click", (e) => {
  const b = e.target.closest(".chip-btn"); if (!b) return;
  ui.region = b.dataset.region;
  el.chips.querySelectorAll(".chip-btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  if (ui.open) { renderList(); ui.active = ui.shown.length ? 0 : -1; paintActive(); } else el.input.focus();
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-pick]"); if (!b) return;
  const p = products.find((x) => keyOf(x) === b.dataset.pick);
  if (p) { closeList(); selectProduct(p, { scroll: true }); }
});

/* Hover linking between ribbons and list rows */
function hot(ids) {
  const on = !!(ids && ids.length), set = new Set(ids || []);
  el.flow.classList.toggle("has-hot", on);
  el.flow.querySelectorAll("[data-items]").forEach((n) => n.classList.toggle("is-hot", on && n.dataset.items.split(",").some((s) => s && set.has(+s))));
  el.rows.querySelectorAll(".row").forEach((r) => r.classList.toggle("is-hot", on && set.has(+r.dataset.i)));
}
el.flow.addEventListener("pointerover", (e) => {
  const n = e.target.closest && e.target.closest("[data-items]");
  hot(n ? n.dataset.items.split(",").filter(Boolean).map(Number) : null);
});
el.flow.addEventListener("pointerleave", () => hot(null));
el.rows.addEventListener("pointerover", (e) => { const r = e.target.closest(".row"); hot(r ? [+r.dataset.i] : null); });
el.rows.addEventListener("pointerleave", () => hot(null));

/* Redraw the diagram when its container changes width (no replay of the sweep) */
if (typeof ResizeObserver !== "undefined") {
  let t;
  new ResizeObserver(() => {
    clearTimeout(t);
    t = setTimeout(() => { const w = Math.round(el.flow.clientWidth); if (w && Math.abs(w - lastW) > 2 && current && current.items.length) drawFlow(false); }, 120);
  }).observe(el.flow);
}

/* ------------------------------------------------------------------
   Catalog
------------------------------------------------------------------- */
function paintCatalog(asOf) {
  const full = products.filter((p) => p.holdings_status === "exposure_available").length;
  const partial = products.filter((p) => hasData(p) && p.holdings_status !== "exposure_available").length;
  const none = products.length - full - partial;
  el.cov.innerHTML =
    `<div class="covbar" aria-hidden="true"><i class="c-full" style="flex:${full}"></i><i class="c-part" style="flex:${partial}"></i><i class="c-none" style="flex:${none}"></i></div>` +
    `<ul class="covlegend"><li>${dot("full")}${full} verified</li><li>${dot("partial")}${partial} partial</li><li>${dot("none")}${none} without holdings yet</li></ul>`;
  const counts = {};
  products.forEach((p) => { counts[p.region_code] = (counts[p.region_code] || 0) + 1; });
  const regions = REGION_ORDER.filter((r) => counts[r]).concat(Object.keys(counts).filter((r) => !REGION_ORDER.includes(r)));
  el.chips.innerHTML = [`<button type="button" class="chip-btn" data-region="ALL" aria-pressed="true">All<span class="n">${products.length}</span></button>`]
    .concat(regions.map((r) => `<button type="button" class="chip-btn" data-region="${esc(r)}" aria-pressed="false" aria-label="${esc(REGION_NAMES[r] || r)}, ${counts[r]} funds">${esc(REGION_CHIP[r] || REGION_NAMES[r] || r)}<span class="n">${counts[r]}</span></button>`)).join("");
  el.quick.innerHTML = quickHTML("Start with");
  if (asOf) el.asof.textContent = "Catalog updated " + fmtDate(asOf);
}

function fromHash() {
  const m = /^#([A-Za-z]{2})\/(.+)$/.exec(location.hash || "");
  if (!m) return null;
  const region = m[1].toUpperCase();
  let ticker; try { ticker = decodeURIComponent(m[2]); } catch (e) { return null; }
  return products.find((p) => p.region_code === region && p.ticker === ticker) || null;
}

function populate(list, asOf) {
  products = list || [];
  paintCatalog(asOf);
  el.input.disabled = false;
  el.input.placeholder = "Search " + products.length + " funds by ticker or name";
  const first = fromHash() || products.find((p) => p.region_code === "CA" && p.ticker === "AAPP") || products.find(hasData) || products[0];
  if (first) selectProduct(first);
}

async function init() {
  el.message.className = "message"; el.message.textContent = "Loading the public catalog…";
  try {
    let list, asOf;
    if (API_BASE) {
      const res = await fetch(API_BASE.replace(/\/$/, "") + "/catalog");
      if (res.ok) { const j = await res.json(); list = j.products; asOf = j.catalog_as_of; }
    }
    if (!list) {
      const res = await fetch(CATALOG_URL);
      if (!res.ok) throw new Error("Catalog could not load");
      const j = await res.json(); list = j.products; asOf = j.catalog_as_of;
    }
    populate(list, asOf || (list && list[0] && list[0].catalog_as_of));
  } catch (e) {
    el.chip.innerHTML = "";
    el.ticker.textContent = "Catalog error";
    el.message.className = "message error";
    el.message.innerHTML = esc(e.message) + ' <button type="button" class="retry">Try again</button>';
    const b = el.message.querySelector(".retry"); if (b) b.addEventListener("click", init);
  }
}

window.addEventListener("hashchange", () => {
  const p = fromHash();
  if (p && (!current || keyOf(current.p) !== keyOf(p))) selectProduct(p, { scroll: true });
});
init();
