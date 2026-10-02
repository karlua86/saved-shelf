// Instagram collector. Injected into an instagram.com tab; pages through the user's own saved posts using the
// same endpoint the site uses. Unofficial: may break. Paced at ~1.5 s per page.
(()=>{
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=m=>chrome.runtime.sendMessage(m).catch(()=>{});
const fmt=sec=>{sec=Math.round(+sec||0);if(!sec)return"";const m=Math.floor(sec/60),s=sec%60;return m+":"+String(s).padStart(2,"0")};
function mapMedia(m){
  if(!m||!m.code)return null;
  const clip=m.product_type==="clips";
  const kind=clip?"Reel":m.media_type===8?"Carousel":m.media_type===2?"Video":"Post";
  const cap=((m.caption&&m.caption.text)||"").replace(/\s+/g," ").trim().slice(0,300);
  const cand=(m.image_versions2&&m.image_versions2.candidates)||(m.carousel_media&&m.carousel_media[0]&&m.carousel_media[0].image_versions2&&m.carousel_media[0].image_versions2.candidates)||[];
  const pick=cand.find(c=>c.width&&c.width<=480)||cand[cand.length-1]||cand[0];
  return{src:"Instagram",url:"https://www.instagram.com/"+(clip?"reel":"p")+"/"+m.code+"/",t:cap,ch:m.user&&m.user.username?"@"+m.user.username:"",
    len:m.media_type===2?fmt(m.video_duration):"",kind,tags:[],where:[],wl:false,thumb:pick?pick.url:"",
    savedAt:m.taken_at?m.taken_at*1000:undefined,needsReview:!cap};
}
async function run(opts){
  const items=[];let maxId="",pages=0,complete=false,error=null,retries=0;
  while(pages<60){
    const url="/api/v1/feed/saved/posts/"+(maxId?"?max_id="+encodeURIComponent(maxId):"");
    let r;
    try{r=await fetch(url,{credentials:"include",headers:{"X-IG-App-ID":"936619743392459","X-Requested-With":"XMLHttpRequest"}})}
    catch(e){error="Network error: "+e.message;break}
    if(r.status===401||r.status===403){error="Instagram says you're not signed in. Open instagram.com, log in, and try again.";break}
    if(r.status===429||r.status>=500){
      if(++retries>3){error="Instagram is rate-limiting (HTTP "+r.status+"). Partial results saved; try again later.";break}
      send({type:"shelf-progress",src:"Instagram",msg:"Rate-limited, waiting 30s..."});await sleep(30000);continue;
    }
    let j;try{j=await r.json()}catch(e){error="Unexpected response from Instagram (format may have changed).";break}
    if(!j||!Array.isArray(j.items)){error="Instagram format changed (no items list).";break}
    retries=0;pages++;
    for(const it of j.items){const v=mapMedia(it.media);if(v)items.push(v)}
    send({type:"shelf-progress",src:"Instagram",msg:items.length+" saved posts read..."});
    if(!j.more_available||!j.next_max_id){complete=true;break}
    maxId=j.next_max_id;await sleep(1500);
  }
  if(!complete&&!error)error="Stopped after 60 pages.";
  for(let i=0;i<items.length;i+=100)await chrome.runtime.sendMessage({type:"shelf-items",src:"Instagram",items:items.slice(i,i+100)});
  return{complete,total:items.length,error};
}
window.__shelfRun=run;
window.__shelfTest={mapMedia};
})();
