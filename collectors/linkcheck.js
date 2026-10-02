// Link checker. Injected into an Instagram or Facebook tab so requests use your own logged-in session.
// Returns {dead:[keys], alive:[keys], checked, error}. Only items with high-confidence "gone" answers are dead.
(()=>{
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=m=>chrome.runtime.sendMessage(m).catch(()=>{});
const prog=msg=>send({type:"shelf-progress",src:"Check",msg});
const A="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const scToId=sc=>{let n=0n;for(const c of sc){const i=A.indexOf(c);if(i<0)return null;n=n*64n+BigInt(i)}return n.toString()};

async function igCheck(items){
  const dead=[],alive=[];let error=null,checked=0,retries=0;
  for(const it of items){
    const m=(it.url||"").match(/instagram\.com\/(?:reel|p|tv)\/([\w-]+)/);const id=m&&scToId(m[1]);
    if(!id){continue}
    let r;
    try{r=await fetch("/api/v1/media/"+id+"/info/",{credentials:"include",headers:{"X-IG-App-ID":"936619743392459","X-Requested-With":"XMLHttpRequest"}})}
    catch(e){error="Network error: "+e.message;break}
    if(r.status===401||r.status===403&&/login|checkpoint/i.test(r.url)){error="Instagram says you're not signed in.";break}
    if(r.status===429||r.status>=500){
      if(++retries>3){error="Instagram is rate-limiting. Partial results kept.";break}
      prog("Instagram: rate-limited, waiting 30s...");await sleep(30000);continue;
    }
    retries=0;checked++;
    if(r.status===404)dead.push(it.key);else if(r.ok)alive.push(it.key);
    if(checked%10===0)prog(`Instagram: ${checked}/${items.length} checked, ${dead.length} dead`);
    await sleep(1200);
  }
  return{dead,alive,checked,error};
}

const FB_GONE=/(this content isn['’’]t available|content isn['’’]t available right now|the link you followed may be broken|this page isn['’’]t available)/i;
async function fbGet(url){
  const r=await fetch(url,{credentials:"include",redirect:"follow"});
  const text=await r.text();
  return{status:r.status,url:r.url,text};
}
async function fbCheck(items){
  const dead=[],alive=[];let error=null,checked=0;
  // Calibration: the "gone" wording must show up on a bogus link and NOT on at least one real saved item,
  // otherwise Facebook's page text can't be used to tell them apart and we stop without changing anything.
  try{
    const bogus=await fbGet("https://www.facebook.com/reel/10000000000001/");
    const goods=[];for(const it of items.slice(0,3)){goods.push(await fbGet(it.url));await sleep(1500)}
    const okBogus=bogus.status===404||FB_GONE.test(bogus.text);
    const okGood=goods.some(g=>g.status===200&&!FB_GONE.test(g.text));
    if(!okBogus||!okGood)return{dead,alive,checked,error:"Facebook pages don't show a reliable 'unavailable' signal right now, so nothing was changed on Facebook."};
  }catch(e){return{dead,alive,checked,error:"Facebook calibration failed: "+e.message}}
  for(const it of items){
    let g;
    try{g=await fbGet(it.url)}catch(e){error="Network error: "+e.message;break}
    if(/\/login|checkpoint/.test(g.url)){error="Facebook asked for login/checkpoint. Stopped; partial results kept.";break}
    if(g.status===429||/temporarily blocked|going too fast/i.test(g.text.slice(0,200000))){error="Facebook is rate-limiting. Stopped; partial results kept.";break}
    checked++;
    if(g.status===404||(g.status===200&&FB_GONE.test(g.text)))dead.push(it.key);else if(g.status===200)alive.push(it.key);
    if(checked%5===0)prog(`Facebook: ${checked}/${items.length} checked, ${dead.length} dead`);
    await sleep(2500+Math.random()*1500);
  }
  return{dead,alive,checked,error};
}
window.__shelfCheck=o=>o.src==="Instagram"?igCheck(o.items):fbCheck(o.items);
window.__shelfTest={scToId};
})();
