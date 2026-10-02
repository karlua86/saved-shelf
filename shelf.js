(async()=>{
await initTaxonomy();
const RAW=await loadAll();
const ALL=RAW.map(v=>{const tg=(v.userTags&&v.userTags.length?v.userTags:v.tags)||[];return Object.assign({},v,{tags:tg.length?tg:["Untagged"],ch:v.ch||"",t:v.t||""})});
const DATA=ALL.filter(v=>!v.removed),REMOVED=ALL.filter(v=>v.removed);
window.__shelfItems=DATA;
const st={q:"",tags:new Set(),wl:false,sh:false,nr:false,dead:false,rm:false,src:"",view:"tiles",limit:120};
try{const s=JSON.parse(localStorage.getItem("shelf3")||"null");if(s){st.q=s.q||"";st.tags=new Set(s.tags||[]);st.wl=!!s.wl;st.sh=!!s.sh;st.src=s.src||"";st.view=s.view||"tiles"}}catch(e){}
{const sg=document.getElementById("srcSeg");const names=[...new Set(ALL.map(v=>v.src))].sort();if(st.src&&!names.includes(st.src))st.src="";
 sg.replaceChildren(...["",...names].map(n=>{const b=document.createElement("button");b.dataset.src=n;b.textContent=n||"All";return b}))}
const $=id=>document.getElementById(id);
const secs=l=>{if(!l)return 1e9;if(l==="short")return 30;return l.split(":").reduce((a,b)=>a*60+(+b),0)};
const isShort=v=>secs(v.len)<120;
const counts={};DATA.forEach(v=>v.tags.forEach(t=>counts[t]=(counts[t]||0)+1));
const TAGS=Object.keys(counts).sort((a,b)=>counts[b]-counts[a]||a.localeCompare(b));
const GOF={};const HUE={};let gi=0;GROUPS.forEach(([g,h,ts],k)=>ts.forEach((t,j)=>{GOF[t]=gi++;HUE[t]=(h+j*11)%360}));
TAGS.forEach((t,i)=>{if(!(t in GOF)){GOF[t]=gi++;HUE[t]=Math.round((i*137.5)%360)}});
let tsort="group",mine=[];try{tsort=localStorage.getItem("shelfSort")||"group";mine=JSON.parse(localStorage.getItem("shelfMine")||"[]")}catch(e){}
function myOrder(){const known=mine.filter(t=>t in counts);TAGS.forEach(t=>{if(!known.includes(t))known.push(t)});return known}
function orderedTags(){if(tsort==="count")return TAGS.slice();if(tsort==="az")return TAGS.slice().sort((a,b)=>a.localeCompare(b));if(tsort==="mine")return myOrder();return TAGS.slice().sort((a,b)=>GOF[a]-GOF[b])}
function startDrag(e,row){e.preventDefault();const list=$("tags");const g=window;row.classList.add("dragging");document.body.classList.add("dragmode");const y0=e.clientY;let moved=false;
  const move=ev=>{moved=true;const rows=[...list.querySelectorAll(".trow")];const others=rows.filter(r=>r!==row);let placed=false;for(const r of others){const b=r.getBoundingClientRect();if(ev.clientY<b.top+b.height/2){if(row.nextElementSibling!==r)list.insertBefore(row,r);placed=true;break}}if(!placed&&list.lastElementChild!==row)list.append(row);row.style.transform="";};
  const up=()=>{g.removeEventListener("pointermove",move);g.removeEventListener("pointerup",up);g.removeEventListener("pointercancel",up);row.classList.remove("dragging");document.body.classList.remove("dragmode");if(moved){mine=[...list.querySelectorAll(".trow")].map(r=>r.dataset.t);saveSort();render()}};
  g.addEventListener("pointermove",move);g.addEventListener("pointerup",up);g.addEventListener("pointercancel",up)}
function keyMove(e,t){if(e.key!=="ArrowUp"&&e.key!=="ArrowDown")return;e.preventDefault();const o=myOrder();const i=o.indexOf(t),j=e.key==="ArrowUp"?i-1:i+1;if(j<0||j>=o.length)return;[o[i],o[j]]=[o[j],o[i]];mine=o;saveSort();render();const b=[...$("tags").querySelectorAll(".grip")][j];b&&b.focus()}
function saveSort(){try{localStorage.setItem("shelfSort",tsort);localStorage.setItem("shelfMine",JSON.stringify(mine))}catch(e){}}
function save(){try{localStorage.setItem("shelf3",JSON.stringify({q:st.q,tags:[...st.tags],wl:st.wl,sh:st.sh,src:st.src,view:st.view}))}catch(e){}}
function el(tag,cls,txt){const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e}
function toggleTag(t){st.tags.has(t)?st.tags.delete(t):st.tags.add(t);st.limit=120;render()}
const isVideo=v=>v.src==="YouTube"||/Reel|video/i.test(v.kind||"")||!!v.len;
function cover(v){
  const a=el(v.url?"a":"div","cover");if(v.url){a.href=v.url;a.target="_blank";a.rel="noopener"}
  a.style.setProperty("--h",HUE[v.tags[0]]);
  const th=thumbOf(v);if(th){const im=document.createElement("img");im.className="thumb";im.loading="lazy";im.alt="";im.referrerPolicy="no-referrer";im.onload=()=>a.classList.add("hasimg");im.onerror=()=>im.remove();im.src=th;a.prepend(im)}
  a.append(el("span","glyph",GLYPH[v.tags[0]]||"•"));
  const s=el("span","src");s.append(el("i"),v.src+(v.src!=="YouTube"&&v.kind?" · "+v.kind:""));a.append(s);
  a.append(el("span","ttl",v.t));
  if(isVideo(v)){const p=el("span","play");p.innerHTML='<svg viewBox="0 0 10 12"><path d="M0 0l10 6-10 6z"/></svg>';a.append(p)}
  const d=v.len==="short"?"Short":(v.len||"");if(d)a.append(el("span","dur",d));
  if(v.dead)a.append(el("span","wlb dead","Dead link"));else if(v.wl)a.append(el("span","wlb","Watch later"));
  a.setAttribute("aria-label",v.t);
  return a}
function chips(v){const c=el("div","chips");v.tags.forEach(t=>{const b=el("button","chip");b.style.setProperty("--h",HUE[t]);b.append((EMO[t]||"🏷️")+" ",el("i"),t);b.setAttribute("aria-pressed",st.tags.has(t));b.onclick=()=>toggleTag(t);c.append(b)});const ed=el("button","chip","✎ Edit");ed.title="Edit topics";ed.onclick=()=>editTags(v);c.append(ed);return c}
function render(){
  save();
  $("q").value=st.q;$("wl").setAttribute("aria-pressed",st.wl);$("sh").setAttribute("aria-pressed",st.sh);$("nr").setAttribute("aria-pressed",st.nr);$("dd").setAttribute("aria-pressed",st.dead);$("rm").setAttribute("aria-pressed",st.rm);
  document.querySelectorAll("[data-src]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.src===st.src));
  $("vTiles").setAttribute("aria-pressed",st.view==="tiles");$("vList").setAttribute("aria-pressed",st.view==="list");
  const q=st.q.trim().toLowerCase();
  const rows=(st.rm?REMOVED:DATA).filter(v=>(!st.src||v.src===st.src)&&(!st.wl||v.wl)&&(!st.sh||isShort(v))&&(!st.nr||v.needsReview||v.tags[0]==="Untagged")&&(!st.dead||v.dead)&&[...st.tags].every(t=>v.tags.includes(t))&&(!q||(v.t+" "+v.ch).toLowerCase().includes(q)))
    .sort((a,b)=>{const o=orderedTags();return o.indexOf(a.tags[0])-o.indexOf(b.tags[0])||a.t.localeCompare(b.t)});
  $("tsort").value=tsort;$("mineHint").hidden=tsort!=="mine";
  const ord=orderedTags();const kids=[];
  const mk=t=>{const b=el("button","tag");b.style.setProperty("--h",HUE[t]);b.append(el("span","emo",EMO[t]||"🏷️"),el("span","dot"),t,el("span","n",counts[t]));b.setAttribute("aria-pressed",st.tags.has(t));b.onclick=()=>toggleTag(t);return b};
  if(tsort==="group"){GROUPS.forEach(([g,h,ts])=>{const have=ts.filter(t=>t in counts);if(!have.length)return;kids.push(el("p","grp",g));have.forEach(t=>kids.push(mk(t)))});ord.filter(t=>!GROUPS.some(g=>g[2].includes(t))).forEach(t=>kids.push(mk(t)))}
  else if(tsort==="mine"){ord.forEach(t=>{const r=el("div","trow");r.dataset.t=t;const g=el("button","grip","☰");g.setAttribute("aria-label","Drag to move "+t);g.title="Drag to reorder";g.onpointerdown=e=>startDrag(e,r);g.onkeydown=e=>keyMove(e,t);r.append(g,mk(t));kids.push(r)})}
  else ord.forEach(t=>kids.push(mk(t)));
  $("tags").replaceChildren(...kids);
  $("count").textContent=rows.length+(rows.length===1?" item":" items");
  const act=[...st.tags].map(t=>{const b=el("button","pill",(EMO[t]||"🏷️")+" "+t);b.onclick=()=>toggleTag(t);return b});
  if(st.tags.size||q||st.wl||st.sh||st.nr||st.dead||st.rm||st.src){const c=el("button","clear","Clear all");c.onclick=()=>{st.q="";st.tags.clear();st.wl=st.sh=st.nr=st.dead=st.rm=false;st.src="";render()};act.push(c)}
  if(st.dead&&!st.rm&&rows.length){const bb=el("button","clear","Remove these "+rows.length+" dead items from shelf");bb.onclick=async()=>{if(!confirm("Remove "+rows.length+" dead-link items from your shelf? (You can restore them from the Removed view. This does not unsave them on YouTube/Facebook/Instagram.)"))return;for(const v of rows)await updateItem(v.key,{removed:true,dismissed:true,removedReason:"dead"});location.reload()};act.push(bb)}
  $("active").replaceChildren(...act);
  const out=$("out");
  if(!rows.length){out.replaceChildren(el("p","empty","Nothing matches. Remove a topic or clear the search."));return}
  const shown=rows.slice(0,st.limit);
  let box;
  if(st.view==="tiles"){
    box=el("div","grid");
    shown.forEach(v=>{const t=el("div","tile");t.append(cover(v));const m=el("div","meta");m.append(el("div","ch",v.ch||v.src));m.append(chips(v));t.append(m);box.append(t)});
  }else{
    box=el("div","list");
    const h=el("div","row lhead");["","Title","Channel","Topics","Length"].forEach((x,i)=>{const c=el("span","c"+i,x);if(i===4)c.className="d";h.append(c)});box.append(h);
    shown.forEach(v=>{const r=el("div","row");r.append(cover(v));const tc=el("div","c1");const a=el(v.url?"a":"span","t",v.t);if(v.url){a.href=v.url;a.target="_blank";a.rel="noopener"}tc.append(a);tc.append(el("div","s",v.src+(v.wl?" · Watch later":"")+(v.where&&v.where.length?" · "+v.where.join(", "):"")));r.append(tc);r.append(el("div","s c3",v.ch||""));const c4=chips(v);c4.classList.add("c4");r.append(c4);r.append(el("div","d",v.len==="short"?"Short":(v.len||v.kind||"")));box.append(r)});
  }
  const frag=[box];
  if(rows.length>st.limit){const m=el("button","more","Show "+Math.min(120,rows.length-st.limit)+" more of "+(rows.length-st.limit));m.onclick=()=>{st.limit+=120;render()};frag.push(m)}
  out.replaceChildren(...frag);
}
$("q").oninput=e=>{st.q=e.target.value;st.limit=120;render()};
$("wl").onclick=()=>{st.wl=!st.wl;render()};
$("sh").onclick=()=>{st.sh=!st.sh;render()};
$("nr").onclick=()=>{st.nr=!st.nr;render()};
$("dd").onclick=()=>{st.dead=!st.dead;render()};$("rm").onclick=()=>{st.rm=!st.rm;render()};
document.querySelectorAll("[data-src]").forEach(b=>b.onclick=()=>{st.src=b.dataset.src;st.limit=120;render()});
$("tsort").onchange=e=>{tsort=e.target.value;if(tsort==="mine"&&!mine.length)mine=TAGS.slice().sort((a,b)=>GOF[a]-GOF[b]);saveSort();render()};
$("vTiles").onclick=()=>{st.view="tiles";render()};$("vList").onclick=()=>{st.view="list";render()};
(function(){const app=document.querySelector(".app"),rz=$("resizer");const MIN=200,MAX=560,DEF=272;
const set=w=>{w=Math.max(MIN,Math.min(MAX,Math.round(w)));app.style.setProperty("--side",w+"px");return w};
let w=DEF;try{w=+localStorage.getItem("shelfSide")||DEF}catch(e){}set(w);
const store=v=>{try{localStorage.setItem("shelfSide",v)}catch(e){}};
rz.onpointerdown=e=>{e.preventDefault();rz.classList.add("on");document.body.classList.add("resizing");const x0=e.clientX,w0=parseInt(getComputedStyle(app).getPropertyValue("--side"))||DEF;
  const mv=ev=>{w=set(w0+ev.clientX-x0)};const up=()=>{window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);rz.classList.remove("on");document.body.classList.remove("resizing");store(w)};
  window.addEventListener("pointermove",mv);window.addEventListener("pointerup",up)};
rz.ondblclick=()=>{w=set(DEF);store(w)};
rz.onkeydown=e=>{if(e.key==="ArrowLeft"||e.key==="ArrowRight"){e.preventDefault();w=set(w+(e.key==="ArrowLeft"?-16:16));store(w)}};})();
render();
$("imp").onclick=()=>$("file").click();
$("file").onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const arr=JSON.parse(await f.text());const n=await importItems(Array.isArray(arr)?arr:arr.items||[]);toast("Imported "+n+" items");location.reload()}catch(err){toast("Import failed: "+err.message)}};
$("exp").onclick=()=>{const blob=new Blob([JSON.stringify(RAW,null,1)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="saved-shelf-"+new Date().toISOString().slice(0,10)+".json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)};

// ---- edit tags dialog ----
function editTags(v){
  const dlg=document.createElement("dialog");dlg.className="dlg";
  const h=el("h2",null,"Topics for this item");const sub=el("p","hint",v.t.slice(0,120)||v.src+" item");
  const hint=el("p","hint","Pick up to 3. The first one picked is the primary topic (cover colour).");
  const sel=(v.tags[0]==="Untagged")?[]:v.tags.slice();
  const box=el("div","pick");
  const draw=()=>{box.replaceChildren(...TOPICS.map(t=>{const b=el("button","chip pk",(EMO[t]||"🏷️")+" "+t);b.setAttribute("aria-pressed",sel.includes(t));b.onclick=()=>{const i=sel.indexOf(t);if(i>=0)sel.splice(i,1);else if(sel.length<3)sel.push(t);draw()};return b}))};draw();
  const row=el("div","dlgbtns");const ok=el("button","pri","Save"),no=el("button",null,"Cancel");
  no.onclick=()=>dlg.close();
  ok.onclick=async()=>{if(!sel.length)return;await updateItem(v.key,{userTags:sel,reviewed:true,needsReview:false});dlg.close();location.reload()};
  const del=el("button","danger",v.removed?"Restore to shelf":"Remove from shelf");
  del.onclick=async()=>{if(v.removed){await updateItem(v.key,{removed:false,dismissed:false,removedReason:""})}else{await updateItem(v.key,{removed:true,dismissed:true,removedReason:"user"})}dlg.close();location.reload()};
  const note=el("p","hint","Removing hides it here only. It stays saved on the original site, and later syncs will not bring it back.");
  row.append(del,no,ok);dlg.append(h,sub,hint,box,note,row);document.body.append(dlg);dlg.onclose=()=>dlg.remove();dlg.showModal();
}
// ---- sync + settings (only inside the installed extension) ----
const EXT=typeof chrome!=="undefined"&&chrome.runtime&&chrome.runtime.id;
if(!EXT)$("syncbox").hidden=true;
else{
  const LABEL=k=>k==="Tag"?"Tagging: ":k==="Check"?"Link check: ":k+": ";
  const paint=async()=>{const {status={}}=await chrome.storage.session.get("status");
    $("stat").replaceChildren(...Object.keys(status).map(k=>{const d=el("div",null,LABEL(k)+(status[k].msg||status[k].state||""));d.dataset.state=status[k].state;return d}))};
  paint();chrome.storage.onChanged.addListener((c,a)=>{if(a==="session"&&c.status)paint()});
  chrome.runtime.onMessage.addListener(m=>{if(m.type==="shelf-done")setTimeout(()=>location.reload(),800)});
  const go=src=>chrome.runtime.sendMessage({type:"sync",src,mode:$("full").checked?"full":"new"});
  (await getSourceDefs()).filter(d=>d.on).forEach(d=>{const bt=el("button",null,d.name);bt.onclick=()=>go(d.name);$("syncBtns").append(bt)});
  $("scan").onclick=()=>{
    const d=document.createElement("dialog");d.className="dlg";
    d.innerHTML='<h2>Check for broken links</h2><p class="hint">Finds saved items that no longer open (deleted, removed or unavailable).</p><label class="ck"><input type="checkbox" id="cY" checked> YouTube (fast)</label><label class="ck"><input type="checkbox" id="cI" checked> Instagram (about 1 second per item; opens an Instagram tab)</label><label class="ck"><input type="checkbox" id="cF"> Facebook (slow, about 3 seconds per item; opens a Facebook tab)</label><label class="ck"><input type="checkbox" id="cO"> Other platforms (can only detect "not found" pages)</label><label class="ck"><input type="checkbox" id="cR" checked> Remove broken ones from the shelf automatically</label><p class="hint">Removing only hides them here (restore from the Removed view); nothing is unsaved on the sites. Keep the tabs open until it finishes. Private or restricted items are kept.</p><div class="dlgbtns"><button id="cNo">Cancel</button><button class="pri" id="cGo">Start</button></div>';
    document.body.append(d);
    d.querySelector("#cNo").onclick=()=>d.close();
    d.querySelector("#cGo").onclick=()=>{
      const srcs=[["cY","YouTube"],["cI","Instagram"],["cF","Facebook"],["cO","Other"]].filter(x=>d.querySelector("#"+x[0]).checked).map(x=>x[1]);
      if(!srcs.length)return;
      chrome.runtime.sendMessage({type:"checkLinks",srcs,autoRemove:d.querySelector("#cR").checked});
      d.close();toast("Checking links in the background...");
    };
    d.onclose=()=>d.remove();d.showModal();
  };
  $("tagNow").onclick=()=>chrome.runtime.sendMessage({type:"tag"});
  $("cfg").onclick=()=>openSettings();
}

if(!DATA.length)$("out").replaceChildren(el("p","empty","No items yet. Open Settings to pick your AI and platforms, then use the Sync buttons (or Import JSON)."));
})();