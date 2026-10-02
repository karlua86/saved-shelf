// YouTube collector. Injected into a www.youtube.com tab; reads the user's own playlists, Watch Later and
// Saved Shorts using same-origin requests (the same data the YouTube site itself loads). Unofficial: may break.
(()=>{
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=m=>chrome.runtime.sendMessage(m).catch(()=>{});
const progress=msg=>send({type:"shelf-progress",src:"YouTube",msg});

function braceSlice(s,start){ // s[start] === "{" ; returns the balanced JSON object text
  let d=0,str=false,esc=false;
  for(let i=start;i<s.length;i++){
    const c=s[i];
    if(str){if(esc)esc=false;else if(c==="\\")esc=true;else if(c==='"')str=false;continue}
    if(c==='"')str=true;else if(c==="{")d++;else if(c==="}"){d--;if(d===0)return s.slice(start,i+1)}
  }
  return null;
}
function parseInitial(html){
  const k="ytInitialData = ";const i=html.indexOf(k);if(i<0)return null;
  const j=html.indexOf("{",i);const txt=braceSlice(html,j);
  try{return JSON.parse(txt)}catch(e){return null}
}
function parseCtx(html){
  const key=(html.match(/"INNERTUBE_API_KEY":"([^"]+)"/)||[])[1];
  const i=html.indexOf('"INNERTUBE_CONTEXT":');let ctx=null;
  if(i>=0){const j=html.indexOf("{",i);try{ctx=JSON.parse(braceSlice(html,j))}catch(e){}}
  return {key,ctx};
}
function walk(o,fn){
  if(!o||typeof o!=="object")return;
  if(Array.isArray(o)){for(const x of o)walk(x,fn);return}
  fn(o);
  for(const k in o)walk(o[k],fn);
}
const txt=t=>!t?"":(t.simpleText||(t.runs&&t.runs.map(r=>r.text).join(""))||t.content||"");
const fmt=sec=>{sec=+sec;if(!sec)return"";const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${m}:${String(s).padStart(2,"0")}`};

async function sha1(s){const b=await crypto.subtle.digest("SHA-1",new TextEncoder().encode(s));return[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function authHeaders(){
  const m=document.cookie.match(/(?:^|; )(?:SAPISID|__Secure-3PAPISID)=([^;]+)/);
  if(!m)return{};
  const ts=Math.floor(Date.now()/1000),origin="https://www.youtube.com";
  return{Authorization:`SAPISIDHASH ${ts}_${await sha1(`${ts} ${m[1]} ${origin}`)}`,"X-Origin":origin,"X-Goog-AuthUser":"0"};
}
async function getPage(url){
  const r=await fetch(url,{credentials:"include"});
  if(!r.ok)throw new Error("HTTP "+r.status+" for "+url);
  const html=await r.text();
  return{data:parseInitial(html),...parseCtx(html)};
}
async function cont(token,cfg){
  const r=await fetch("/youtubei/v1/browse?key="+cfg.key+"&prettyPrint=false",{method:"POST",credentials:"include",
    headers:{"content-type":"application/json",...await authHeaders()},body:JSON.stringify({context:cfg.ctx,continuation:token})});
  if(!r.ok)throw new Error("HTTP "+r.status+" (continuation)");
  return r.json();
}
function tokens(data){const t=[];walk(data,o=>{const c=o.continuationItemRenderer;const tk=c&&c.continuationEndpoint&&c.continuationEndpoint.continuationCommand&&c.continuationEndpoint.continuationCommand.token;if(tk)t.push(tk)});return t}

function videosIn(data){
  const out=[];
  walk(data,o=>{
    if(o.playlistVideoRenderer){
      const v=o.playlistVideoRenderer;const t=txt(v.title);
      if(!v.videoId||/^\[(Private|Deleted) video\]$/.test(t))return;
      out.push({id:v.videoId,t,ch:txt(v.shortBylineText),len:txt(v.lengthText)||fmt(v.lengthSeconds),short:false});
    }else if(o.reelItemRenderer){
      const v=o.reelItemRenderer;if(v.videoId)out.push({id:v.videoId,t:txt(v.headline),ch:"",len:"short",short:true});
    }else if(o.shortsLockupViewModel){
      const v=o.shortsLockupViewModel;
      const id=v.onTap&&v.onTap.innertubeCommand&&v.onTap.innertubeCommand.reelWatchEndpoint&&v.onTap.innertubeCommand.reelWatchEndpoint.videoId;
      if(id)out.push({id,t:txt(v.overlayMetadata&&v.overlayMetadata.primaryText),ch:"",len:"short",short:true});
    }
  });
  return out;
}
function playlistsIn(data){
  const out=[];
  walk(data,o=>{
    if(o.lockupViewModel&&/PLAYLIST/.test(o.lockupViewModel.contentType||"")){
      const m=o.lockupViewModel;out.push({id:m.contentId,title:txt(m.metadata&&m.metadata.lockupMetadataViewModel&&m.metadata.lockupMetadataViewModel.title)});
    }else if(o.gridPlaylistRenderer||o.playlistRenderer){
      const m=o.gridPlaylistRenderer||o.playlistRenderer;if(m.playlistId)out.push({id:m.playlistId,title:txt(m.title)});
    }
  });
  return out;
}
function titleOf(data,id){
  let t="";
  walk(data,o=>{if(t)return;
    if(o.playlistHeaderRenderer)t=txt(o.playlistHeaderRenderer.title);
    else if(o.playlistMetadataRenderer)t=o.playlistMetadataRenderer.title||"";
    else if(o.pageHeaderViewModel&&o.pageHeaderViewModel.title)t=txt(o.pageHeaderViewModel.title.dynamicTextViewModel&&o.pageHeaderViewModel.title.dynamicTextViewModel.text)||"";
  });
  return t||id;
}
async function drain(first,cfg,pick,label){
  let all=pick(first),toks=tokens(first),guard=0;const seen=new Set();
  while(toks.length&&guard++<80){
    const tk=toks.shift();if(seen.has(tk))continue;seen.add(tk);
    await sleep(500);
    const d=await cont(tk,cfg);
    all=all.concat(pick(d));toks=toks.concat(tokens(d));
    progress(label+": "+all.length+"...");
  }
  return all;
}

async function run(opts){
  opts=opts||{};
  const skip=(opts.skip&&opts.skip.length?opts.skip:["liked videos","recap"]).map(s=>s.toLowerCase());
  const items=new Map(); // videoId -> item
  const add=(v,where,wl)=>{
    let it=items.get(v.id);
    if(!it){it={src:"YouTube",url:(v.short?"https://www.youtube.com/shorts/":"https://www.youtube.com/watch?v=")+v.id,t:v.t,ch:v.ch,len:v.len,tags:[],where:[],wl:false,thumb:"https://i.ytimg.com/vi/"+v.id+"/mqdefault.jpg"};items.set(v.id,it)}
    if(where&&!it.where.includes(where))it.where.push(where);
    if(wl)it.wl=true;
    if(!it.ch&&v.ch)it.ch=v.ch;
  };
  let complete=true;const problems=[];
  try{
    progress("Reading your playlist list...");
    const feed=await getPage("/feed/playlists");
    if(!feed.data)throw new Error("Could not read YouTube. Are you signed in?");
    const cfg={key:feed.key,ctx:feed.ctx};
    if(!cfg.key||!cfg.ctx)throw new Error("YouTube page format changed (no API config found)");
    let pls=await drain(feed.data,cfg,playlistsIn,"Playlists");
    const byId=new Map();for(const p of pls)if(p.id&&!byId.has(p.id))byId.set(p.id,p);
    byId.delete("LL");
    if(!byId.has("WL"))byId.set("WL",{id:"WL",title:"Watch Later"});
    const list=[...byId.values()];
    let n=0;
    for(const p of list){
      n++;
      const idTitle=(p.title||"").toLowerCase();
      if(p.id!=="WL"&&idTitle&&skip.some(s=>idTitle.includes(s)))continue;
      try{
        const pg=await getPage("/playlist?list="+encodeURIComponent(p.id));
        if(!pg.data){problems.push(p.id+": unreadable");complete=false;continue}
        const title=p.id==="WL"?"Watch Later":titleOf(pg.data,p.id);
        if(p.id!=="WL"&&skip.some(s=>title.toLowerCase().includes(s)))continue;
        progress(`${title} (${n}/${list.length})...`);
        const vids=await drain(pg.data,{key:pg.key||cfg.key,ctx:pg.ctx||cfg.ctx},videosIn,title);
        for(const v of vids)add(v,p.id==="WL"?"Watch Later":title,p.id==="WL");
      }catch(e){problems.push((p.title||p.id)+": "+e.message);complete=false}
      await sleep(400);
    }
  }catch(e){
    return{complete:false,error:e.message,total:0};
  }
  const arr=[...items.values()];
  for(let i=0;i<arr.length;i+=200)await chrome.runtime.sendMessage({type:"shelf-items",src:"YouTube",items:arr.slice(i,i+200)});
  return{complete,total:arr.length,error:problems.length?problems.slice(0,3).join("; "):null};
}
window.__shelfRun=run;
window.__shelfTest={parseInitial,videosIn,playlistsIn,titleOf,tokens,braceSlice};
})();
