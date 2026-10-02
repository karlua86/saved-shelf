// Generic collector for TikTok, Xiaohongshu, Threads and any custom site. Runs in YOUR logged-in tab, reads the
// links shown on the page (optionally after clicking through a few steps) while scrolling, and sends them to the shelf.
// Driven by a preset: {linkSel, titleSel, authorFromHref, steps:[{click|clickText, wait}]}.
(()=>{
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const send=m=>chrome.runtime.sendMessage(m).catch(()=>{});
const DUR=/^\d{1,2}:\d{2}(:\d{2})?$/;
const JUNK=/^(\d+\s?[smhdw]|\d+[.,]?\d*[kKmM]?|Like|Likes|Share|Reply|Replies|More|Follow|Following|Saved|Save|Repost|Quote|·|•|赞|收藏|评论|分享)$/i;

function absUrl(h){
  try{const u=new URL(h,location.href);u.hash="";["utm_source","utm_medium","utm_campaign","fbclid","xsec_token","xsec_source"].forEach(k=>u.searchParams.delete(k));return u.href}catch(e){return""}
}
const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0};

async function doSteps(steps,prog){
  for(const st of steps||[]){
    let el=null;
    if(st.click)el=document.querySelector(st.click);
    else if(st.clickText){
      const re=new RegExp(st.clickText,"i");
      el=[...document.querySelectorAll('[role="tab"],a,button,span,p,div,li')].find(e=>e.children.length<=2&&visible(e)&&re.test((e.textContent||"").trim()));
    }
    if(el){prog("Opening saved items...");el.click();}
    await sleep(st.wait||2000);
  }
}

// Heuristic when no selector is given: links that look like content cards (not menus).
function looksLikeContent(a){
  if(a.closest("nav,header,footer,aside,[role=navigation]"))return false;
  const href=a.getAttribute("href")||"";
  if(!href||href.startsWith("#")||/^(javascript|mailto|tel):/i.test(href))return false;
  const txt=(a.innerText||"").trim();
  return !!a.querySelector("img")||txt.length>=15;
}
function parseCard(card,a,preset,srcName){
  const url=absUrl(a.href);
  if(!url)return null;
  const lines=(card.innerText||"").split("\n").map(s=>s.trim()).filter(Boolean);
  const len=lines.find(l=>DUR.test(l))||"";
  let t="";
  if(preset.titleSel){const te=card.querySelector(preset.titleSel);t=te?(te.innerText||te.textContent||"").trim():""}
  if(!t){
    const cands=lines.filter(l=>!JUNK.test(l)&&!DUR.test(l)&&!/^@[\w.]+$/.test(l));
    t=(cands.sort((x,y)=>y.length-x.length)[0]||"");
  }
  const img=[...card.querySelectorAll("img")].sort((x,y)=>(y.naturalWidth||0)-(x.naturalWidth||0))[0];
  if(!t)t=(img&&img.alt)||a.getAttribute("title")||a.getAttribute("aria-label")||"";
  t=t.replace(/\s+/g," ").trim().slice(0,300);
  let ch="";
  if(preset.authorFromHref){const m=url.match(new RegExp(preset.authorFromHref));if(m)ch="@"+decodeURIComponent(m[1])}
  if(!ch){const at=lines.find(l=>/^@[\w.]+$/.test(l));if(at)ch=at}
  const thumb=img?(img.currentSrc||img.src||""):"";
  return{src:srcName,url,t,ch,len,kind:"",tags:[],where:[],wl:false,thumb:/^https?:/.test(thumb)?thumb:"",needsReview:!t};
}
function findCards(preset,seenUrls,srcName){
  const useSel=!!(preset.linkSel&&preset.linkSel.trim());
  const isLink=useSel?(x=>x.matches(preset.linkSel)):looksLikeContent;
  const anchors=useSel?[...document.querySelectorAll(preset.linkSel)]:[...document.querySelectorAll("a[href]")].filter(looksLikeContent);
  const out=[];
  for(const a of anchors){
    const url=absUrl(a.href);if(!url||seenUrls.has(url))continue;
    // card = largest ancestor that still contains only this one link (so title/thumbnail/author come along)
    let card=a,n=a;
    for(let d=0;d<8&&n.parentElement&&n.parentElement!==document.body;d++){
      const p=n.parentElement;
      const urls=new Set([...p.querySelectorAll(useSel?preset.linkSel:"a[href]")].filter(isLink).map(x=>absUrl(x.href)));
      if(urls.size>1)break;
      card=p;n=p;
    }
    const it=parseCard(card,a,preset,srcName);
    if(it){seenUrls.add(url);out.push(it)}
  }
  return out;
}
// Card-selector mode (used for X/Twitter bookmarks): each card is an element we can read directly.
function findCardsBySel(preset,seenUrls,srcName){
  const out=[];
  for(const card of document.querySelectorAll(preset.cardSel)){
    const lnk=card.querySelector(preset.cardLink||"a[href]");
    const a=lnk&&(lnk.closest("a")||lnk);if(!a||!a.href)continue;
    const url=absUrl(a.href).replace(/\/(photo|video|analytics)(\/\d+)?$/,"");
    if(!url||seenUrls.has(url))continue;
    const te=preset.titleSel&&card.querySelector(preset.titleSel);
    let t=te?(te.innerText||te.textContent||"").trim():"";
    if(!t){const lines=(card.innerText||"").split("\n").map(x=>x.trim()).filter(x=>x.length>12);t=lines.sort((x,y)=>y.length-x.length)[0]||""}
    t=t.replace(/\s+/g," ").slice(0,300);
    let ch="";if(preset.authorFromHref){const m=url.match(new RegExp(preset.authorFromHref));if(m)ch="@"+m[1]}
    let thumb="";
    const im=preset.thumbSel&&card.querySelector(preset.thumbSel);
    if(im)thumb=im.tagName==="VIDEO"?im.getAttribute("poster")||"":(im.currentSrc||im.src||"");
    const isVid=!!card.querySelector("video");
    seenUrls.add(url);
    out.push({src:srcName,url,t,ch,len:"",kind:isVid?"Video":"Post",tags:[],where:[],wl:false,thumb:/^https?:/.test(thumb)?thumb:"",needsReview:!t});
  }
  return out;
}
async function run(opts){
  const preset=opts.preset||{},srcName=opts.srcName||"Other";
  const prog=msg=>send({type:"shelf-progress",src:srcName,msg});
  const seen=new Set();let buf=[],total=0,stall=0,error=null,reachedEnd=false;
  const flush=async()=>{if(buf.length){const items=buf;buf=[];await chrome.runtime.sendMessage({type:"shelf-items",src:srcName,items})}};
  try{await doSteps(preset.steps,prog)}catch(e){}
  for(let loop=0;loop<100&&total<(opts.maxItems||3000);loop++){
    const cs=preset.cardSel?findCardsBySel(preset,seen,srcName):findCards(preset,seen,srcName);
    for(const it of cs){buf.push(it);total++}
    prog(`${total} items read${document.hidden?" - keep this tab visible!":""}`);
    if(buf.length>=40)await flush();
    if(cs.length===0)stall++;else stall=0;
    if(stall>=(preset.scrollStep?6:4)){reachedEnd=true;break}
    if(preset.scrollStep)window.scrollBy(0,Math.round(window.innerHeight*0.85));else window.scrollTo(0,document.documentElement.scrollHeight);
    await sleep(1500+stall*1000);
  }
  await flush();
  if(!total)error="Found no saved items on this page. Make sure you're logged in and viewing your saved list"+(preset.linkSel?"":", or set a link selector for this site in Settings")+".";
  return{complete:false,reachedEnd,total,error};
}
window.__shelfRun=run;
window.__shelfTest={absUrl,parseCard,findCards,findCardsBySel};
})();
