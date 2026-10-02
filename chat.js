// "Ask AI" drawer: asks questions about your saved items. Answers are Markdown with clickable links.
// Flow: 1) cheap call turns the question into multilingual search terms, 2) local search picks candidate items,
// 3) the model answers citing items as {n}; we swap {n} for the REAL link so URLs can never be invented.
(()=>{
const $=id=>document.getElementById(id);
const EXT=typeof chrome!=="undefined"&&chrome.runtime&&chrome.runtime.id;
const KEY="shelfChat";
let hist=[];try{hist=JSON.parse(localStorage.getItem(KEY)||"[]")}catch(e){}
let busy=false,linkWin=null;

const esc=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
// ---- tiny safe Markdown renderer ----
function inline(raw){
  const links=[];
  let s=esc(raw).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(m,t,u)=>{links.push(`<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>`);return"\u0000"+(links.length-1)+"\u0000"});
  s=s.replace(/`([^`]+)`/g,"<code>$1</code>").replace(/\*\*([^*]+)\*\*/g,"<strong>$1</strong>").replace(/(^|[^*])\*([^*\s][^*]*)\*/g,"$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g,(m,i)=>links[+i]);
}
function md(text){
  const out=[];let list=null,para=[],code=null;
  const endPara=()=>{if(para.length){out.push("<p>"+para.map(inline).join("<br>")+"</p>");para=[]}};
  const endList=()=>{if(list){out.push(`<${list.t}>${list.items.map(x=>"<li>"+inline(x)+"</li>").join("")}</${list.t}>`);list=null}};
  for(const line of String(text).split("\n")){
    if(/^```/.test(line)){if(code){out.push("<pre><code>"+esc(code.join("\n"))+"</code></pre>");code=null}else{endPara();endList();code=[]}continue}
    if(code){code.push(line);continue}
    let m;
    if((m=line.match(/^(#{1,4})\s+(.*)$/))){endPara();endList();out.push(`<h${m[1].length+2}>${inline(m[2])}</h${m[1].length+2}>`)}
    else if((m=line.match(/^\s*[-*•]\s+(.*)$/))){endPara();if(!list||list.t!=="ul"){endList();list={t:"ul",items:[]}}list.items.push(m[1])}
    else if((m=line.match(/^\s*\d+[.)]\s+(.*)$/))){endPara();if(!list||list.t!=="ol"){endList();list={t:"ol",items:[]}}list.items.push(m[1])}
    else if(!line.trim()){endPara();endList()}
    else{endList();para.push(line)}
  }
  if(code)out.push("<pre><code>"+esc(code.join("\n"))+"</code></pre>");
  endPara();endList();return out.join("");
}

// ---- links open in a second window ----
async function openLink(url){
  if(EXT){
    try{
      if(linkWin==null)throw 0;
      await chrome.windows.get(linkWin);
      await chrome.tabs.create({windowId:linkWin,url,active:true});
      await chrome.windows.update(linkWin,{focused:true});
    }catch(e){const w=await chrome.windows.create({url,focused:true});linkWin=w.id}
  }else window.open(url,"shelfLinks");
}

// ---- resolve {n} to real links ----
const cleanTitle=t=>String(t||"").replace(/\s+/g," ").trim().slice(0,90).replace(/[\[\]]/g,"(");
function resolve(text,items){
  return text.replace(/\{#?(\d+)\}/g,(m,n)=>{
    const v=items[+n];if(!v)return"";
    const title=cleanTitle(v.t)||(v.ch?v.ch+" ("+v.src+")":v.src+" item");
    const tag=v.src+(v.dead?" · dead link?":"");
    return v.url?`[${title}](${v.url.replace(/\(/g,"%28").replace(/\)/g,"%29")}) *${tag}*`:`**${title}** *${tag}, no link saved*`;
  });
}

// ---- retrieval ----
const STOP=new Set("the a an of to in on for and or is are my me i show list find any all about what which with videos video posts post reels reel saved have has do does can give".split(" "));
function fallbackWords(q){return q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w=>w.length>1&&!STOP.has(w))}
function retrieve(items,kw,topics,src,wl,cap){
  const K=kw.map(k=>String(k).toLowerCase().trim()).filter(k=>k.length>=1&&!STOP.has(k));
  const T=new Set(topics||[]);
  const scored=[];
  items.forEach((v,n)=>{
    if(src&&v.src!==src)return;if(wl&&!v.wl)return;
    const t=(v.t||"").toLowerCase(),c=(v.ch||"").toLowerCase(),w=((v.where||[]).join(" ")+" "+v.tags.join(" ")).toLowerCase();
    let s=0;
    for(const k of K){if(t.includes(k))s+=3;if(c.includes(k))s+=2;if(w.includes(k))s+=1}
    if(v.tags.some(x=>T.has(x)))s+=2;
    if(s>0)scored.push([s,n]);
  });
  scored.sort((a,b)=>b[0]-a[0]);
  return{total:scored.length,ids:scored.slice(0,cap).map(x=>x[1])};
}
const line=(v,n)=>`{${n}}|${v.src}|${v.tags.slice(0,2).join("/")}|${cleanTitle(v.t).slice(0,100)}|${(v.ch||"").slice(0,24)}|${v.len==="short"?"short":v.len||""}${v.wl?"|watch-later":""}${(v.where&&v.where[0])?"|in: "+v.where[0]:""}`;

const KW_SYSTEM=`You turn a question about someone's saved videos/posts into search terms. The saved items can have titles in any language.
Reply with ONLY JSON: {"keywords":[up to 25 short search terms: English plus equivalents and synonyms in the other languages likely to appear (for example Chinese, Spanish, Malay, French)],"topics":[up to 4 topic names copied exactly from the topic list that fit the question],"source":"" or "YouTube" or "Facebook" or "Instagram" (only if the question names one),"watchLater":true or false}`;

function answerSystem(items){
  const counts={};items.forEach(v=>v.tags.forEach(t=>counts[t]=(counts[t]||0)+1));
  const bySrc={};items.forEach(v=>bySrc[v.src]=(bySrc[v.src]||0)+1);
  return `You are the search assistant for a person's personal "Saved Shelf" of items they saved across social platforms.
Answer ONLY from the candidate items given in the latest user message. If nothing fits, say so plainly and suggest other search words.
FORMAT: reply in Markdown, in the language the user wrote in. Refer to every item ONLY by its token exactly as given, e.g. {12} (the app turns it into a clickable link, so NEVER write URLs yourself and never retype titles). Write items as a bullet list: "- {12} — why it matches (short)". Group under short headings when there are many. List at most 15 items unless asked for more, most relevant first. If more matched than you listed, say how many more.
Shelf stats (for counting questions): ${items.length} items; by source ${JSON.stringify(bySrc)}; by topic ${JSON.stringify(counts)}. Counts of candidates you were shown may be partial.`;
}

async function ask(q){
  const items=window.__shelfItems||[];
  const cfg=await getLLMConfig();
  if(!llmReady(cfg))throw new Error(llmMissing(cfg));
  const prevQ=[...hist].slice(0,-1).reverse().find(h=>h.role==="user");
  let kw=[],topics=[],src="",wl=false;
  try{
    const r=await chatLLM(cfg,KW_SYSTEM,[{role:"user",content:JSON.stringify({question:q,previousQuestion:prevQ?prevQ.raw:"",topicList:TOPICS})}],500);
    const j=JSON.parse((r.match(/\{[\s\S]*\}/)||["{}"])[0]);
    kw=j.keywords||[];topics=(j.topics||[]).filter(t=>TOPICS.includes(t));src=["YouTube","Facebook","Instagram"].includes(j.source)?j.source:"";wl=!!j.watchLater;
  }catch(e){}
  if(!kw.length)kw=fallbackWords(q);
  const res=retrieve(items,kw,topics,src,wl,150);
  const lines=res.ids.map(n=>line(items[n],n)).join("\n");
  const user=`Question: ${q}\n\nCandidate items (${res.total} matched, showing ${res.ids.length}). Format: {token}|source|topics|title|channel|length|extra\n${lines||"(no candidates matched)"}`;
  const turns=hist.slice(-6).map(h=>({role:h.role,content:h.role==="assistant"?(h.raw||h.md):h.raw}));
  const reply=await chatLLM(cfg,answerSystem(items),[...turns,{role:"user",content:user}],1800);
  return{raw:reply,md:resolve(reply,items)};
}

// ---- UI ----
function bubble(role,html,cls){
  const d=document.createElement("div");d.className="msg "+role+(cls?" "+cls:"");d.innerHTML=html;
  $("chatLog").append(d);$("chatLog").scrollTop=$("chatLog").scrollHeight;return d;
}
function paintAll(){
  $("chatLog").replaceChildren();
  if(!hist.length)bubble("bot",md("Ask me about your saved items, e.g.\n\n- *Which videos did I save about cooking?*\n- *Show Instagram reels about investing*\n- *Anything on Watch Later about AI tools?*\n\nI search all your saved items and give clickable links that open in a second window."));
  for(const h of hist)bubble(h.role==="user"?"me":"bot",h.role==="user"?"<p>"+esc(h.raw)+"</p>":md(h.md));
}
function save(){try{localStorage.setItem(KEY,JSON.stringify(hist.slice(-40)))}catch(e){}}
async function send(){
  if(busy)return;const q=$("chatIn").value.trim();if(!q)return;
  $("chatIn").value="";busy=true;$("chatSend").disabled=true;
  hist.push({role:"user",raw:q});save();
  if(hist.length===1)$("chatLog").replaceChildren();
  bubble("me","<p>"+esc(q)+"</p>");
  const wait=bubble("bot","<p><em>Searching your shelf...</em></p>","wait");
  try{
    const r=await ask(q);
    wait.remove();hist.push({role:"assistant",raw:r.raw,md:r.md});save();bubble("bot",md(r.md));
  }catch(e){wait.remove();bubble("bot","<p class=\"err\">"+esc(e.message||e)+"</p>");hist.pop();save()}
  busy=false;$("chatSend").disabled=false;$("chatIn").focus();
}
function download(){
  const body="# Saved Shelf chat\n\n"+hist.map(h=>h.role==="user"?"**You:** "+h.raw:h.md).join("\n\n---\n\n")+"\n";
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([body],{type:"text/markdown"}));
  a.download="saved-shelf-chat-"+new Date().toISOString().slice(0,10)+".md";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function init(){
  const dr=$("chat");
  const toggle=on=>{dr.classList.toggle("open",on);document.body.classList.toggle("chatopen",on);if(on)setTimeout(()=>$("chatIn").focus(),50)};
  $("askBtn").onclick=()=>toggle(!dr.classList.contains("open"));
  $("chatClose").onclick=()=>toggle(false);
  $("chatSend").onclick=send;
  $("chatIn").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}};
  $("chatClear").onclick=()=>{hist=[];save();paintAll()};
  $("chatSave").onclick=download;
  $("chatLog").addEventListener("click",e=>{const a=e.target.closest("a[href]");if(a){e.preventDefault();openLink(a.href)}});
  paintAll();
}
init();
})();
