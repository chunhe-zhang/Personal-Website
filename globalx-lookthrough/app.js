// After Azure deployment set window.GLOBALX_API_BASE to the Function API base ending in /api.
const API_BASE=window.GLOBALX_API_BASE||"";
const DEMO={root_ticker:"AAPP",region:"CA",as_of:"2026-10-14",holdings:[{ticker:"AAPL",exposure_pct:133.54,multiple:1.3354}],paths:[{ticker:"AAPL",exposure_pct:133.54,path:["AAPP","AAPL"]}],unresolved:[]};
const REGION_NAMES={US:"United States",AU:"Australia",BR:"Brazil",CO:"Colombia",HK:"Hong Kong",CA:"Canada"};
const select=document.querySelector("#fund"),rows=document.querySelector("#rows"),message=document.querySelector("#message");
let products=[];
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function populate(list){
 products=list||[];select.innerHTML="";
 const groups=new Map();
 for(const p of products){const code=p.region_code||"CA";if(!groups.has(code)){const g=document.createElement("optgroup");g.label=p.region||REGION_NAMES[code]||code;groups.set(code,g);select.appendChild(g)}
  const o=document.createElement("option");o.value=code+"|"+p.ticker;o.textContent=p.ticker+" · "+p.name;groups.get(code).appendChild(o)}
 const preferred=products.findIndex(p=>p.region_code==="CA"&&p.ticker==="AAPP");select.selectedIndex=Math.max(0,preferred);load()
}
function render(data,p,illustrative=false){
 document.querySelector("#selected").textContent=p.ticker;document.querySelector("#region").textContent=p.region||REGION_NAMES[p.region_code]||p.region_code;
 document.querySelector("#asof").textContent=data.as_of||p.catalog_as_of||"—";
 document.querySelector("#status").textContent=illustrative?"Illustrative snapshot":data.unresolved?.length?data.unresolved.length+" unresolved":"Processed";
 const depth=Math.max(0,...(data.paths||[]).map(x=>x.path?.length||1))-1;
 const list=data.holdings||[],max=Math.max(1,...list.map(x=>Math.abs(Number(x.exposure_pct)||0)));
 rows.innerHTML=list.map((h,i)=>'<article class="row"><span class="rank">'+String(i+1).padStart(2,"0")+'</span><div><div class="security">'+esc(h.ticker)+'</div><div class="path">LOOK-THROUGH · '+esc(p.ticker)+' → '+esc(h.ticker)+' · '+(depth||"direct")+'</div></div><div class="bar-wrap"><div class="bar" style="width:'+Math.min(100,Math.abs(h.exposure_pct)/max*100)+'%"></div></div><div class="value">'+Number(h.exposure_pct).toFixed(2)+'%</div></article>').join("");
 message.className="message";message.textContent=data.unresolved?.length?data.unresolved.length+" nested positions remain unresolved.":list.length?"Exposure is multiplied through the available holdings graph.":"No holdings have been processed for this product yet.";
}
async function load(){
 if(!products.length)return;const [region,ticker]=select.value.split("|"),p=products.find(x=>x.region_code===region&&x.ticker===ticker);if(!p)return;
 rows.innerHTML="";document.querySelector("#selected").textContent=ticker;document.querySelector("#region").textContent=p.region||REGION_NAMES[region];document.querySelector("#asof").textContent=p.catalog_as_of||"2026-10-18";document.querySelector("#status").textContent="Checking";
 const sourceUrl=p.product_url||p.catalog_url;document.querySelector("#product-source").innerHTML=sourceUrl?'<a href="'+esc(sourceUrl)+'" target="_blank" rel="noopener">Open official source ↗</a>':'';
 try{
  if(API_BASE){const res=await fetch(API_BASE.replace(/\/$/,"")+"/lookthrough/"+encodeURIComponent(region)+"/"+encodeURIComponent(ticker));if(res.ok){render(await res.json(),p);return}}
  if(region==="CA"&&ticker==="AAPP"){render(DEMO,p,true);return}
  document.querySelector("#status").textContent=p.holdings_status==="raw_html_only"?"Raw only":"Catalog only";
  message.className="message";message.textContent="This product is in the public catalog, but no normalized holdings snapshot is available in Azure yet. Public holdings coverage varies by region."
 }catch(e){document.querySelector("#status").textContent="Unavailable";message.className="message error";message.textContent="Azure holdings API could not be reached; catalog details remain available."}
}
async function init(){
 try{let list;if(API_BASE){const res=await fetch(API_BASE.replace(/\/$/,"")+"/catalog");if(res.ok)list=(await res.json()).products}
  if(!list){const res=await fetch("catalog.json");if(!res.ok)throw new Error("Catalog could not load");list=(await res.json()).products}
  populate(list)
 }catch(e){document.querySelector("#status").textContent="Catalog error";message.className="message error";message.textContent=e.message}
}
select.addEventListener("change",load);init();
