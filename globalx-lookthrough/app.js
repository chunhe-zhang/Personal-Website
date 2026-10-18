// Set window.GLOBALX_API_BASE after Azure Function deployment to enable live processed results.
const API_BASE=window.GLOBALX_API_BASE||"";
const REGION_NAMES={US:"United States",AU:"Australia",BR:"Brazil",CO:"Colombia",HK:"Hong Kong",CA:"Canada"};
const select=document.querySelector("#fund"),rows=document.querySelector("#rows"),message=document.querySelector("#message");
let products=[];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function explainReason(data,p){
 if(data?.coverage_reason||data?.reason)return data.coverage_reason||data.reason;
 const code=data?.error||data?.coverage_status||"";
 const known={
  source_http_error:"The official product page returned an HTTP error, so no holdings were accepted.",
  parser_no_holdings:"The public page was reachable, but no recognizable ticker-and-weight table or holdings CSV was found.",
  public_source_unavailable:"The public holdings source could not be fetched or decoded.",
  holdings_unavailable:"This product is in the catalog, but Azure has no normalized holdings snapshot for it yet.",
  fund_holdings_unavailable:"A nested ETF was identified, but its own holdings snapshot is missing; look-through stops at that ETF.",
  silver_snapshot_missing:"Raw source acquisition has not produced a normalized holdings snapshot for this fund.",
  calculation_failed:"The source was acquired, but Azure could not finish the exposure calculation."
 };
 if(known[code])return known[code];
 if(p?.holdings_status==="raw_html_only")return "Azure Data Factory saved this product page as raw HTML in bronze, but it has not yet been parsed into normalized holdings.";
 if(p?.holdings_status==="top_holdings_captured")return "Only limited top-holdings metadata is recorded; a full normalized holdings snapshot is not available.";
 if(p?.holdings_status==="not_loaded")return "The official product page is mapped, but no successful holdings fetch or normalized snapshot has been recorded yet.";
 return "No verified public holdings snapshot is available. The source does not publish accessible holdings, or the fetch/parse step has not succeeded.";
}
function availabilityLabel(p){
 if(p.holdings_status==="exposure_available")return " · ✓ full";
 if(Array.isArray(p.holdings)&&p.holdings.length)return " · ◒ partial · "+p.holdings.length+" stocks";
 if(p.holdings_status==="top_holdings_captured")return " · ◒ partial source";
 return " · pending"
}
function populate(list){
 products=list||[];select.innerHTML="";
 const full=products.filter(p=>p.holdings_status==="exposure_available").length;
 const partial=products.filter(p=>Array.isArray(p.holdings)&&p.holdings.length&&p.holdings_status!=="exposure_available").length;
 const sourceOnly=products.filter(p=>!p.holdings?.length&&p.holdings_status==="top_holdings_captured").length;
 const pending=products.length-full-partial-sourceOnly;
 const label=document.querySelector("#fund-label");if(label)label.textContent="SELECT A FUND · "+products.length+" PRODUCTS";
 const summary=document.querySelector("#coverage-summary");if(summary)summary.textContent=full+" full snapshots · "+partial+" partial single-stock datasets · "+sourceOnly+" partial source-only · "+pending+" pending";
 const groups=new Map();
 for(const p of products){const code=p.region_code||"CA";if(!groups.has(code)){const g=document.createElement("optgroup");g.label=p.region||REGION_NAMES[code]||code;groups.set(code,g);select.appendChild(g)}
  const o=document.createElement("option");o.value=code+"|"+p.ticker;o.textContent=p.ticker+" · "+p.name+availabilityLabel(p);groups.get(code).appendChild(o)}
 const preferred=products.findIndex(p=>p.region_code==="CA"&&p.ticker==="AAPP");select.selectedIndex=Math.max(0,preferred);load()
}
function render(data,p){
 document.querySelector("#selected").textContent=p.ticker;document.querySelector("#region").textContent=p.region||REGION_NAMES[p.region_code]||p.region_code;
 document.querySelector("#asof").textContent=data.as_of||p.catalog_as_of||"—";
 document.querySelector("#status").textContent=data.coverage_status|| ((data.unresolved||p.unresolved||[]).length?(data.unresolved||p.unresolved).length+" unresolved":"Processed");
 const list=data.holdings||[],max=Math.max(1,...list.map(x=>Math.abs(Number(x.exposure_pct)||0)));
 rows.innerHTML=list.map((h,i)=>'<article class="row"><span class="rank">'+String(i+1).padStart(2,"0")+'</span><div><div class="security">'+esc(h.ticker)+'</div><div class="path">'+esc(h.name||"")+' · '+esc(Array.isArray(h.paths)?h.paths.join(" → "):(h.paths||"direct"))+'</div></div><div class="bar-wrap"><div class="bar" style="width:'+Math.min(100,Math.abs(h.exposure_pct)/max*100)+'%"></div></div><div class="value">'+Number(h.exposure_pct).toFixed(2)+'%</div></article>').join("");
 const unresolvedRows=data.unresolved||p.unresolved||[];
 const unresolved=unresolvedRows.map(x=>(x.ticker||"Unknown")+` (not flattened to a confirmed single stock)`).join(", ");
 if(list.length){message.className="message";const base=data.coverage_reason||"Exposure is multiplied through the available holdings graph.";message.textContent=unresolvedRows.length?base+" Unresolved positions: "+unresolved:base}
 else{message.className="message";message.textContent=explainReason(data,p)}
}
async function load(){
 if(!products.length)return;const [region,ticker]=select.value.split("|"),p=products.find(x=>x.region_code===region&&x.ticker===ticker);if(!p)return;
 rows.innerHTML="";document.querySelector("#selected").textContent=ticker;document.querySelector("#region").textContent=p.region||REGION_NAMES[region];document.querySelector("#asof").textContent=p.as_of||p.catalog_as_of||"—";document.querySelector("#status").textContent="Checking";
 const sourceUrl=p.product_url||p.catalog_url;document.querySelector("#product-source").innerHTML=sourceUrl?'<a href="'+esc(sourceUrl)+'" target="_blank" rel="noopener">Open official source ↗</a>':'';
 try{
  if(API_BASE){
   const res=await fetch(API_BASE.replace(/\/$/,"")+"/lookthrough/"+encodeURIComponent(region)+"/"+encodeURIComponent(ticker));
   const data=await res.json().catch(()=>({}));
   if(res.ok){render(data,p);return}
   if(!p.holdings?.length){document.querySelector("#status").textContent=data.coverage_status||"Exposure pending";message.className="message";message.textContent=explainReason(data,p);return}
  }
  if(Array.isArray(p.holdings)&&p.holdings.length){render({holdings:p.holdings,unresolved:p.unresolved,as_of:p.exposure_as_of,coverage_status:p.coverage_status,coverage_reason:p.coverage_reason},p);return}
  document.querySelector("#status").textContent=p.coverage_status|| (p.holdings_status==="raw_html_only"?"Raw only":"Exposure pending");
  message.className="message";message.textContent=explainReason(p,p)
 }catch(e){if(Array.isArray(p.holdings)&&p.holdings.length){render({holdings:p.holdings,unresolved:p.unresolved,as_of:p.exposure_as_of,coverage_status:p.coverage_status,coverage_reason:p.coverage_reason},p);return}document.querySelector("#status").textContent="Unavailable";message.className="message error";message.textContent="Azure holdings API could not be reached. "+explainReason(p,p)}
}
async function init(){
 try{let list;if(API_BASE){const res=await fetch(API_BASE.replace(/\/$/,"")+"/catalog");if(res.ok)list=(await res.json()).products}
  if(!list){const res=await fetch("catalog.json?v=recursive-public-exposure-20261018b");if(!res.ok)throw new Error("Catalog could not load");list=(await res.json()).products}
  populate(list)
 }catch(e){document.querySelector("#status").textContent="Catalog error";message.className="message error";message.textContent=e.message}
}
select.addEventListener("change",load);init();
