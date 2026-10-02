importScripts("taxonomy.js","ids.js","db.js","llm.js","sources.js");

// ---- open the shelf ----
chrome.action.onClicked.addListener(async()=>{
  const url=chrome.runtime.getURL("shelf.html");
  const tabs=await chrome.tabs.query({url});
  if(tabs.length){await chrome.tabs.update(tabs[0].id,{active:true});await chrome.windows.update(tabs[0].windowId,{focused:true})}
  else chrome.tabs.create({url});
});

// ---- status (shown in the shelf's side panel) ----
async function setStatus(key,state,msg){
  const {status={}}=await chrome.storage.session.get("status");
  status[key]={state,msg,ts:Date.now()};
  await chrome.storage.session.set({status});
}
const tell=m=>chrome.runtime.sendMessage(m).catch(()=>{});

// ---- sync ----
const running=new Set();
const runStarts={};

async function waitLoaded(tabId){
  for(let i=0;i<60;i++){const t=await chrome.tabs.get(tabId);if(t.status==="complete")return;await new Promise(r=>setTimeout(r,500))}
}
async function getTab(def){
  const tabs=def.match&&def.match.length?await chrome.tabs.query({url:def.match}):[];
  let tab=tabs[0];
  if(!tab)tab=await chrome.tabs.create({url:def.start,active:true});
  else{
    const needNav=def.needPath&&!(tab.url||"").includes(def.needPath);
    tab=await chrome.tabs.update(tab.id,needNav?{url:def.start,active:true}:{active:true});
  }
  await chrome.windows.update(tab.windowId,{focused:true}).catch(()=>{});
  await waitLoaded(tab.id);
  await new Promise(r=>setTimeout(r,1500));
  return tab;
}
async function runSync(src,mode){
  if(running.has(src))return;
  running.add(src);
  try{
    const def=(await getSourceDefs()).find(s=>s.name===src);
    if(!def)throw new Error("Unknown platform: "+src);
    await setStatus(src,"running","Starting...");
    runStarts[src]=Date.now();
    const {skip}=await chrome.storage.local.get("skip");
    const known=(await loadAll()).filter(o=>o.src===src).map(o=>o.id);
    const tab=await getTab(def);
    await chrome.scripting.executeScript({target:{tabId:tab.id},files:["ids.js",def.file]});
    const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:o=>window.__shelfRun(o),args:[{mode,known,skip,srcName:src,preset:def.preset}]});
    const r=result||{};
    let msg=`${r.total||0} items read`;
    if(r.complete&&def.complete){const n=await markRemoved(src,runStarts[src]);if(n)msg+=`, ${n} no longer saved`}
    if(src==="Facebook"&&mode!=="full"&&r.reachedEnd)msg+=" (new saves only)";
    if(r.error)msg+=" - "+r.error;
    await setStatus(src,r.error&&!r.total?"error":"done",msg);
    await cacheThumbs();
    if(llmReady(await getLLMConfig()))await tagPending();
    tell({type:"shelf-done",src});
  }catch(e){
    await setStatus(src,"error",String(e.message||e));
  }finally{running.delete(src)}
}

// ---- broken-link check ----
async function checkByStatus(items,dead404Only){ // YouTube oEmbed or plain HTTP status
  const dead=[],alive=[];let checked=0,i=0;
  await Promise.all([0,1,2,3].map(async()=>{
    while(i<items.length){
      const o=items[i++];
      try{
        const yt=o.src==="YouTube";
        const url=yt?"https://www.youtube.com/oembed?format=json&url="+encodeURIComponent("https://www.youtube.com/watch?v="+o.id):o.url;
        const r=await fetch(url,{credentials:yt?"omit":"include"});
        if(r.status===404||(!yt&&r.status===410))dead.push(o.key);else if(r.ok)alive.push(o.key);
        // other codes (private/restricted/blocked): can't tell, so keep the item
      }catch(e){}
      checked++;
      if(checked%20===0)await setStatus("Check","running",`${items[0].src}: ${checked}/${items.length} checked, ${dead.length} dead`);
    }
  }));
  return{dead,alive,checked,error:null};
}
async function checkLinks(srcs,autoRemove){
  if(running.has("Check"))return;
  running.add("Check");
  try{
    const defs=await getSourceDefs();
    const all=(await loadAll()).filter(o=>!o.removed&&o.url);
    const core=["YouTube","Instagram","Facebook"],names=new Set();
    for(const s of srcs){if(s==="Other")all.forEach(o=>{if(!core.includes(o.src))names.add(o.src)});else names.add(s)}
    const notes=[];
    for(const src of names){
      const items=all.filter(o=>o.src===src);
      if(!items.length)continue;
      const def=defs.find(d=>d.name===src)||{};
      await setStatus("Check","running",`${src}: starting (${items.length} links)...`);
      let res;
      if(src==="YouTube"||!def.check)res=await checkByStatus(items);
      else{
        const tab=await getTab(def);
        await chrome.scripting.executeScript({target:{tabId:tab.id},files:["ids.js","collectors/linkcheck.js"]});
        const [{result}]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:o=>window.__shelfCheck(o),args:[{src,items:items.map(o=>({key:o.key,url:o.url,id:o.id}))}]});
        res=result||{dead:[],alive:[],checked:0,error:"No result"};
      }
      const byKey=new Map(items.map(o=>[o.key,o]));
      for(const k of res.dead)await updateItem(k,autoRemove?{dead:true,removed:true,dismissed:true,removedReason:"dead"}:{dead:true});
      for(const k of res.alive)if(byKey.get(k).dead)await updateItem(k,{dead:false});
      notes.push(`${src}: ${res.checked} checked, ${res.dead.length} dead${res.error?" ("+res.error+")":""}`);
    }
    await setStatus("Check","done",(notes.join(" | ")||"Nothing to check.")+(autoRemove?" - dead ones removed from shelf (see Removed).":" - see Dead links."));
    tell({type:"shelf-done",src:"Check"});
  }catch(e){await setStatus("Check","error",String(e.message||e))}
  finally{running.delete("Check")}
}

// ---- thumbnail cache (image links on most platforms are signed and expire) ----
async function cacheOne(o){
  try{
    const r=await fetch(o.thumb);if(!r.ok)return;
    const bmp=await createImageBitmap(await r.blob());
    const w=Math.min(360,bmp.width),h=Math.round(bmp.height*w/bmp.width);
    const cv=new OffscreenCanvas(w,h);cv.getContext("2d").drawImage(bmp,0,0,w,h);
    const blob=await cv.convertToBlob({type:"image/jpeg",quality:0.72});
    const data=await new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(blob)});
    await updateItem(o.key,{thumbData:data});
  }catch(e){}
}
async function cacheThumbs(){
  const todo=(await loadAll()).filter(o=>o.src!=="YouTube"&&o.thumb&&!o.thumbData&&!o.removed).slice(0,500);
  let i=0;
  await Promise.all([0,1,2,3].map(async()=>{while(i<todo.length)await cacheOne(todo[i++])}));
  return todo.length;
}

// ---- auto-tagging with your chosen LLM ----
const BATCH=30;
function tagPrompt(){
  const lines=TOPICS.map(t=>`- ${t}${DESC[t]?": "+DESC[t]:""}`).join("\n");
  return `You tag a person's saved social-media items by topic. Titles/captions may be in any language.
Allowed topics (use these exact names only):
${lines}

For each input item choose 1 to 3 topics. The FIRST topic is the primary one. Only use topics from the list. If an item has no usable text, use "${fallbackTopic()}".
Reply with ONLY a JSON array like [{"i":0,"tags":["${TOPICS[0]}","${TOPICS[1]||TOPICS[0]}"]}], one entry per input item, no other text.`;
}
async function tagBatch(items,cfg){
  const input=items.map((o,i)=>({i,source:o.src,title:(o.t||"").slice(0,300),by:o.ch||"",type:o.kind||"",length:o.len||""}));
  const text=await chatLLM(cfg,tagPrompt(),[{role:"user",content:JSON.stringify(input)}],4000);
  const m=text.match(/\[[\s\S]*\]/);if(!m)throw new Error("Unreadable tagging reply");
  return JSON.parse(m[0]);
}
let tagging=false;
async function tagPending(){
  if(tagging)return;tagging=true;
  try{
    await initTaxonomy();
    const cfg=await getLLMConfig();
    if(!llmReady(cfg)){await setStatus("Tag","error",llmMissing(cfg));return}
    const todo=(await loadAll()).filter(o=>!o.removed&&!(o.tags&&o.tags.length)&&!(o.userTags&&o.userTags.length));
    if(!todo.length){await setStatus("Tag","done","Nothing to tag.");return}
    let done=0;
    for(let i=0;i<todo.length;i+=BATCH){
      const batch=todo.slice(i,i+BATCH);
      await setStatus("Tag","running",`${done}/${todo.length}...`);
      const blank=batch.filter(o=>!(o.t||"").trim());
      for(const o of blank)await updateItem(o.key,{tags:[fallbackTopic()],needsReview:true});
      const real=batch.filter(o=>(o.t||"").trim());
      if(real.length){
        const res=await tagBatch(real,cfg);
        for(const x of res){
          const o=real[x.i];if(!o)continue;
          const tags=(x.tags||[]).filter(t=>TOPICS.includes(t)).slice(0,3);
          await updateItem(o.key,{tags:tags.length?tags:[fallbackTopic()],needsReview:!tags.length});
        }
      }
      done+=batch.length;
    }
    await setStatus("Tag","done",`${done} items tagged.`);
    tell({type:"shelf-done",src:"Tag"});
  }catch(e){await setStatus("Tag","error",String(e.message||e))}
  finally{tagging=false}
}

// ---- messages ----
chrome.runtime.onMessage.addListener((m,sender,send)=>{
  if(m.type==="sync"){runSync(m.src,m.mode);send({ok:true});return}
  if(m.type==="checkLinks"){checkLinks(m.srcs||[],!!m.autoRemove);send({ok:true});return}
  if(m.type==="tag"){tagPending();send({ok:true});return}
  if(m.type==="shelf-progress"){setStatus(m.src,"running",m.msg);return}
  if(m.type==="shelf-items"){importItems(m.items).then(n=>send({ok:true,n}),e=>send({ok:false,error:String(e)}));return true}
});
