// Settings dialog: AI provider/key/model, platforms (built-in + your own sites), topic list, YouTube playlist skips.
async function openSettings(){
  const c=await chrome.storage.local.get(["provider","llmKeys","llmModels","customBase","enabledSources","customSources","taxonomy","skip"]);
  const keys=Object.assign({},c.llmKeys),models=Object.assign({},c.llmModels);
  const enabled=c.enabledSources||BUILTIN_SOURCES.filter(s=>s.on).map(s=>s.name);
  const customs=(c.customSources||[]).map(x=>Object.assign({},x));
  const E=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
  const dlg=document.createElement("dialog");dlg.className="dlg wide";
  dlg.innerHTML=`<h2>Settings</h2>
  <h3>AI (tagging and Ask AI)</h3>
  <label>Provider<select id="sProv">${Object.entries(PROVIDERS).map(([id,p])=>`<option value="${id}">${E(p.label)}</option>`).join("")}</select></label>
  <label id="gBase">Base URL (OpenAI-compatible, ending in /v1)<input id="sBase" placeholder="https://your-provider.example.com/v1"></label>
  <label id="gKey">API key<input id="sKey" type="password" autocomplete="off"></label>
  <label>Model<input id="sModel"></label>
  <div class="dlgbtns inline"><button id="sTest">Test connection</button><span id="sTestOut" class="hint"></span></div>
  <p class="hint">Your key stays in this browser profile and is sent only to the provider you pick. Cost is tiny: tagging 1,000 items is typically a few cents.</p>
  <h3>Platforms</h3>
  <div id="sPlat">${BUILTIN_SOURCES.map(s=>`<label class="ck"><input type="checkbox" data-plat="${E(s.name)}" ${enabled.includes(s.name)?"checked":""}> ${E(s.name)}</label>`).join("")}</div>
  <p class="hint">Built-in platforms (TikTok, Xiaohongshu, X and Threads are experimental). Add any other site you are logged in to:</p>
  <div id="sCust"></div><div class="dlgbtns inline"><button id="sAddSite">+ Add a site</button></div>
  <h3>Topics</h3>
  <p class="hint">One per line: <code>🏠 Name | description</code>. Lines starting with <code>#</code> are group headings. The AI only uses these topics.</p>
  <textarea id="sTax" rows="9" spellcheck="false"></textarea>
  <div class="dlgbtns inline"><button id="sTaxReset">Reset topics to default</button></div>
  <h3>YouTube</h3>
  <label>Skip playlists whose name contains (one per line)<textarea id="sSkip" rows="3"></textarea></label>
  <div class="dlgbtns"><button id="sNo">Cancel</button><button class="pri" id="sOk">Save</button></div>`;
  document.body.append(dlg);
  const q=s=>dlg.querySelector(s);
  // --- provider fields ---
  let cur=PROVIDERS[c.provider]?c.provider:"anthropic";
  q("#sProv").value=cur;
  const stash=()=>{keys[cur]=q("#sKey").value.trim();models[cur]=q("#sModel").value.trim();if(cur==="custom")c.customBase=q("#sBase").value.trim()};
  const paintProv=()=>{
    const p=PROVIDERS[cur];
    q("#gBase").hidden=cur!=="custom";q("#gKey").hidden=!!p.noKey;
    q("#sBase").value=c.customBase||"";q("#sKey").value=keys[cur]||"";
    q("#sModel").value=models[cur]||"";q("#sModel").placeholder=p.model||"model name";
  };
  q("#sProv").onchange=()=>{stash();cur=q("#sProv").value;paintProv()};paintProv();
  // --- custom sites ---
  const drawCust=()=>{
    q("#sCust").replaceChildren(...customs.map((s,i)=>{
      const d=document.createElement("div");d.className="cust";
      d.innerHTML=`<input data-k="name" placeholder="Name, e.g. Pinterest" value="${E(s.name||"")}"><input data-k="start" placeholder="Page with your saved items (https://...)" value="${E(s.start||"")}"><input data-k="linkSel" placeholder="Advanced: CSS selector for item links (optional)" value="${E(s.linkSel||"")}"><input data-k="titleSel" placeholder="Advanced: CSS selector for titles (optional)" value="${E(s.titleSel||"")}"><button data-del="${i}" title="Remove">×</button>`;
      d.querySelectorAll("input").forEach(inp=>inp.oninput=()=>{customs[i][inp.dataset.k]=inp.value.trim()});
      d.querySelector("[data-del]").onclick=()=>{customs.splice(i,1);drawCust()};
      return d;
    }));
  };
  drawCust();
  q("#sAddSite").onclick=()=>{customs.push({name:"",start:"",linkSel:"",titleSel:""});drawCust()};
  q("#sTax").value=c.taxonomy&&c.taxonomy.trim()?c.taxonomy:DEFAULT_TAXONOMY_TEXT;
  q("#sTaxReset").onclick=()=>{q("#sTax").value=DEFAULT_TAXONOMY_TEXT};
  q("#sSkip").value=(c.skip||["liked videos","recap"]).join("\n");

  const originOf=u=>{try{const x=new URL(u);return x.protocol+"//"+x.hostname+"/*"}catch(e){return null}};
  async function ensureOrigins(origins){
    origins=[...new Set(origins.filter(Boolean))];
    const need=[];for(const o of origins)if(!(await chrome.permissions.contains({origins:[o]})))need.push(o);
    if(!need.length)return true;
    return chrome.permissions.request({origins:need});
  }
  q("#sTest").onclick=async()=>{
    const out=q("#sTestOut");out.textContent="Testing...";
    stash();const p=PROVIDERS[cur];
    const cfg={id:cur,kind:p.kind,label:p.label,noKey:!!p.noKey,maxField:p.maxField||"max_tokens",noTemp:!!p.noTemp,extra:p.extra||{},base:cur==="custom"?(c.customBase||""):p.base,key:keys[cur]||"",model:models[cur]||p.model||""};
    if(!llmReady(cfg)){out.textContent=llmMissing(cfg);return}
    try{
      const ok=await ensureOrigins([originOf(cfg.base)]);
      if(!ok){out.textContent="Permission to reach that server was declined.";return}
      const r=await chatLLM(cfg,"You are a connection test.",[{role:"user",content:"Reply with the single word OK."}],30);
      out.textContent="Works: "+r.trim().slice(0,40);
    }catch(e){out.textContent=String(e.message||e).slice(0,200)}
  };
  q("#sNo").onclick=()=>dlg.close();
  q("#sOk").onclick=async()=>{
    stash();
    const en=[...dlg.querySelectorAll("[data-plat]")].filter(x=>x.checked).map(x=>x.dataset.plat);
    const cs=customs.filter(s=>s.name&&originOf(s.start));
    const p=PROVIDERS[cur];
    const origins=cs.map(s=>originOf(s.start));
    if(cur==="custom"&&c.customBase)origins.push(originOf(c.customBase));
    // Request access to the user's own sites now (needs this click as the user gesture).
    let granted=true;try{granted=await ensureOrigins(origins)}catch(e){granted=false}
    await chrome.storage.local.set({provider:cur,llmKeys:keys,llmModels:models,customBase:c.customBase||"",enabledSources:en,customSources:cs,
      taxonomy:q("#sTax").value.trim(),skip:q("#sSkip").value.split("\n").map(x=>x.trim().toLowerCase()).filter(Boolean)});
    dlg.close();
    toast(granted?"Settings saved":"Saved, but access to your custom site(s) was not granted");
    setTimeout(()=>location.reload(),900);
  };
  dlg.onclose=()=>dlg.remove();dlg.showModal();
}
