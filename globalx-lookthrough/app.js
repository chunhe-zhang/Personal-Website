// Set this to the deployed Function API origin after Azure deployment, e.g. https://<app>.azurewebsites.net/api
const API_BASE = window.GLOBALX_API_BASE || "";
const DEMO = {root_ticker:"AAPP",as_of:"2026-10-14",holdings:[{ticker:"AAPL",exposure_pct:133.54,multiple:1.3354}],paths:[{ticker:"AAPL",exposure_pct:133.54,path:["AAPP","AAPL"]}],unresolved:[]};
const select=document.querySelector("#fund"),rows=document.querySelector("#rows"),message=document.querySelector("#message");
function show(data,ticker){
 document.querySelector("#selected").textContent=ticker;document.querySelector("#asof").textContent=data.as_of||"—";
 const depth=Math.max(0,...(data.paths||[]).map(x=>x.path?.length||1))-1;document.querySelector("#depth").textContent=depth?depth+" layers":"Direct";
 document.querySelector("#status").textContent=data.unresolved?.length?data.unresolved.length+" unresolved":"Processed";
 message.textContent=data.unresolved?.length?data.unresolved.length+" fund positions could not be expanded; see source coverage notes.":"";message.className="message";
 const list=data.holdings||[],max=Math.max(1,...list.map(x=>Math.abs(Number(x.exposure_pct)||0)));
 rows.innerHTML=list.map((h,i)=>'<article class="row"><span class="rank">'+String(i+1).padStart(2,"0")+'</span><div><div class="security">'+escapeHtml(h.ticker)+'</div><div class="path">LOOK-THROUGH · '+escapeHtml(ticker)+' → '+escapeHtml(h.ticker)+'</div></div><div class="bar-wrap"><div class="bar" style="width:'+Math.min(100,Math.abs(h.exposure_pct)/max*100)+'%"></div></div><div class="value">'+Number(h.exposure_pct).toFixed(2)+'%</div></article>').join("");
 if(!list.length){message.textContent="No processed holdings snapshot is available for this fund yet.";message.className="message"}
}
function escapeHtml(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
async function load(){
 const ticker=select.value;rows.innerHTML="";message.textContent="Loading processed holdings…";message.className="message";
 try{if(!API_BASE){if(ticker==="AAPP"){show(DEMO,ticker);document.querySelector("#status").textContent="Illustrative snapshot"}else throw new Error("Azure API is not connected yet.");return}
 const response=await fetch(API_BASE.replace(/\/$/,"")+"/lookthrough/"+encodeURIComponent(ticker));if(!response.ok)throw new Error("No processed snapshot ("+response.status+")");show(await response.json(),ticker)
 }catch(error){document.querySelector("#selected").textContent=ticker;document.querySelector("#asof").textContent="—";document.querySelector("#depth").textContent="—";document.querySelector("#status").textContent="Unavailable";message.textContent=error.message;message.className="message error"}
}
select.addEventListener("change",load);load();