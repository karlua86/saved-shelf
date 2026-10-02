// Local store: IndexedDB, items keyed by "Source:id". Needs ids.js loaded first.
const DB_NAME="savedshelf",STORE="items";
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:"key"});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function loadAll(){const db=await openDB();return new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
// Merge incoming items. Existing tags/user edits survive; collector fields (title, thumb, where...) refresh.
async function importItems(list){
  const db=await openDB(),now=Date.now();
  const old=await loadAll();const byKey=new Map(old.map(o=>[o.key,o]));
  const legacy=new Map();for(const o of old)if(/^h/.test(o.id)&&o.src==="Facebook")legacy.set((o.t||"").slice(0,60),o);
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,"readwrite"),os=tx.objectStore(STORE);let n=0;const used=new Set();
    for(const v of list){
      if(!v||!v.src)continue;
      let id=idOf(v);while(used.has(v.src+":"+id))id+="-2";used.add(v.src+":"+id);
      const key=v.src+":"+id;let o=byKey.get(key);
      if(!o&&!/^h/.test(id)){const lg=legacy.get((v.t||"").slice(0,60));if(lg&&lg.src===v.src&&!used.has("L"+lg.key)){o=lg;used.add("L"+lg.key);os.delete(lg.key)}}
      o=o||{};
      os.put(Object.assign({},o,v,{key,id,
        tags:(v.tags&&v.tags.length)?v.tags:(o.tags||[]),
        where:v.where||o.where||[],
        userTags:o.userTags||v.userTags,
        reviewed:o.reviewed||v.reviewed||false,
        needsReview:o.needsReview||v.needsReview||false,
        thumbData:(v.thumb&&o.thumb&&v.thumb!==o.thumb&&v.src!=="YouTube")?o.thumbData:(o.thumbData||v.thumbData),
        firstSeen:o.firstSeen||v.firstSeen||now,lastSeen:now,removed:!!o.dismissed,dismissed:!!o.dismissed}));
      n++;
    }
    tx.oncomplete=()=>res(n);tx.onerror=()=>rej(tx.error);
  });
}
async function updateItem(key,patch){
  const db=await openDB();
  return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite"),os=tx.objectStore(STORE);const g=os.get(key);
    g.onsuccess=()=>{if(g.result)os.put(Object.assign({},g.result,patch))};tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)});
}
// After a COMPLETE sync of one source, flag items it no longer returned.
async function markRemoved(src,runStart){
  const db=await openDB(),all=await loadAll();let n=0;
  return new Promise((res,rej)=>{const tx=db.transaction(STORE,"readwrite"),os=tx.objectStore(STORE);
    for(const o of all)if(o.src===src&&(o.lastSeen||0)<runStart&&!o.removed){os.put(Object.assign({},o,{removed:true,removedReason:"gone"}));n++}
    tx.oncomplete=()=>res(n);tx.onerror=()=>rej(tx.error)});
}
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.append(t);setTimeout(()=>t.remove(),3500)}
