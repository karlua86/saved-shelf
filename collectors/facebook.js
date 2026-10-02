// Facebook collector. Injected into www.facebook.com/saved/; reads the visible cards (no usable JSON endpoint)
// while scrolling. Facebook rate-limits and the page can crash after ~550 items, so by default we stop once we
// meet a run of items already in the shelf (new saves appear first). Keep the tab visible while it runs.
(()=>{
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=m=>chrome.runtime.sendMessage(m).catch(()=>{});
const JUNK=/^(Add to collection|Share|Unsave|More|Like|Comment|Saved|Save|Remove|Play|Mute|Unmute|Reels?|Videos?|Posts?|Links?)$/i;
const DUR=/^\d{1,2}:\d{2}(:\d{2})?$/;
function normUrl(href){
  try{
    const u=new URL(href,location.origin);const p=u.pathname;
    if(/permalink\.php/.test(p)){const s=u.searchParams.get("story_fbid"),i=u.searchParams.get("id");return u.origin+p+"?story_fbid="+s+(i?"&id="+i:"")}
    if(/^\/watch\/?$/.test(p)){const v=u.searchParams.get("v");return v?u.origin+"/watch/?v="+v:null}
    return u.origin+p.replace(/\/?$/,"/");
  }catch(e){return null}
}
function parseCard(card){
  const links=[...card.querySelectorAll("a[href]")];
  const a=links.find(x=>/\/(reel|videos|posts|permalink\.php|watch)/.test(x.getAttribute("href")||""));
  const url=a?normUrl(a.getAttribute("href")):"";
  const lines=(card.innerText||"").split("\n").map(s=>s.trim()).filter(Boolean);
  const len=lines.find(l=>DUR.test(l))||"";
  const savedTo=lines.find(l=>/Saved to /i.test(l))||"";
  const where=[];const mt=savedTo.match(/Saved to (.+?)(?:\s*\+\s*\d+ others?)?$/i);if(mt)where.push(mt[1].trim());
  let kind="";const kp=savedTo.split("•")[0].trim();
  if(/^Reels?$/i.test(kp))kind="Reels";else if(/^Videos?$/i.test(kp))kind="Video";else if(/^Posts?$/i.test(kp))kind="Post";else if(/^Links?$/i.test(kp))kind="Link";
  if(!kind){kind=/\/reel\//.test(url)?"Reels":/\/videos\/|\/watch/.test(url)?"Video":/posts|permalink/.test(url)?"Post":"Link"}
  const from=lines.map(l=>l.match(/^Saved from (.+?)(?:['’]s (?:post|video|reel|photo)|$)/i)).find(Boolean);
  const ch=from?from[1].trim():"";
  const cands=lines.filter(l=>!JUNK.test(l)&&!DUR.test(l)&&!/Saved (to|from) /i.test(l)&&l!==ch);
  const t=(cands.sort((x,y)=>y.length-x.length)[0]||"").slice(0,300);
  let thumb="",best=0;
  for(const im of card.querySelectorAll("img")){const s=im.currentSrc||im.src||"";if(/scontent|fbcdn/.test(s)){const w=im.naturalWidth||0;if(w>=best){best=w;thumb=s}}}
  const dead=/(content|post|video|reel|link)[^\n]{0,30}(isn.t|is not|no longer) available|may have been (removed|deleted)|unavailable/i.test(card.innerText||"");
  if(!url&&!t)return null;
  return{src:"Facebook",url,t,ch,len,kind,tags:[],where,wl:false,thumb,needsReview:!t,dead:dead||undefined};
}
const processed=new WeakSet();
function newCards(){
  const spans=[...document.querySelectorAll("span")].filter(s=>s.children.length===0&&s.textContent.trim()==="Add to collection"&&!processed.has(s));
  if(!spans.length)return[];
  const all=[...document.querySelectorAll("span")].filter(s=>s.children.length===0&&s.textContent.trim()==="Add to collection");
  const out=[];
  for(const sp of spans){
    processed.add(sp);
    let n=sp,best=null;
    while(n.parentElement){
      n=n.parentElement;
      let c=0;for(const x of all)if(n.contains(x)){c++;if(c>1)break}
      if(c>1)break;best=n;
    }
    if(best)out.push(best);
  }
  return out;
}
async function run(opts){
  opts=opts||{};
  if(!/\/saved/.test(location.pathname))return{complete:false,error:"Open facebook.com/saved first.",total:0};
  const full=opts.mode==="full",known=new Set(opts.known||[]);
  const seen=new Set();let buf=[],total=0,knownRun=0,stall=0,error=null,complete=false,newCount=0;
  const flush=async()=>{if(buf.length){const items=buf;buf=[];await chrome.runtime.sendMessage({type:"shelf-items",src:"Facebook",items})}};
  window.scrollTo(0,0);await sleep(800);
  for(let loop=0;loop<3000;loop++){
    if(/This page isn.t available|Something went wrong/i.test((document.body.innerText||"").slice(0,1500))&&!(document.body.innerText||"").includes("Add to collection")){error="Facebook page crashed. Partial results saved.";break}
    const cs=newCards();let added=0;
    for(const card of cs){
      const it=parseCard(card);if(!it)continue;
      const id=idOf(it);if(seen.has(id))continue;seen.add(id);
      buf.push(it);added++;total++;
      if(known.has(id)){knownRun++}else{knownRun=0;newCount++}
    }
    send({type:"shelf-progress",src:"Facebook",msg:`${total} read, ${newCount} new${document.hidden?" - keep this tab visible!":""}`});
    if(buf.length>=40)await flush();
    if(!full&&knownRun>=25){complete=true;break}
    if(cs.length===0)stall++;else stall=0;
    if(stall>=8){complete=true;break}
    window.scrollTo(0,document.documentElement.scrollHeight);
    await sleep(1300+stall*1500);
    if(stall>=3){window.scrollTo(0,0);await sleep(700);window.scrollTo(0,document.documentElement.scrollHeight)}
  }
  await flush();
  return{complete:false,reachedEnd:complete,total,error};
}
window.__shelfRun=run;
window.__shelfTest={parseCard,normUrl};
})();
