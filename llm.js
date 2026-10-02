// Bring-your-own LLM. Works with Claude, OpenAI, Gemini, DeepSeek, OpenRouter, Groq, Mistral, a local Ollama,
// or ANY OpenAI-compatible endpoint (choose "Custom" and paste its base URL).
const PROVIDERS={
  anthropic:{label:"Claude (Anthropic)",kind:"anthropic",base:"https://api.anthropic.com/v1",model:"claude-haiku-4-5-20251001"},
  openai:{label:"OpenAI (ChatGPT API)",kind:"openai",base:"https://api.openai.com/v1",model:"gpt-5-mini",maxField:"max_completion_tokens",noTemp:true},
  gemini:{label:"Google Gemini",kind:"openai",base:"https://generativelanguage.googleapis.com/v1beta/openai",model:"gemini-2.5-flash"},
  deepseek:{label:"DeepSeek",kind:"openai",base:"https://api.deepseek.com",model:"deepseek-flash",extra:{thinking:{type:"disabled"}}},
  openrouter:{label:"OpenRouter (hundreds of models)",kind:"openai",base:"https://openrouter.ai/api/v1",model:"openai/gpt-5-mini"},
  groq:{label:"Groq",kind:"openai",base:"https://api.groq.com/openai/v1",model:"llama-3.3-70b-versatile"},
  mistral:{label:"Mistral",kind:"openai",base:"https://api.mistral.ai/v1",model:"mistral-small-latest"},
  ollama:{label:"Ollama (local, no key)",kind:"openai",base:"http://localhost:11434/v1",model:"llama3.1",noKey:true},
  custom:{label:"Custom (any OpenAI-compatible URL)",kind:"openai",base:"",model:""},
};
async function getLLMConfig(){
  if(typeof chrome==="undefined"||!chrome.storage)throw new Error("This only works inside the installed extension.");
  const c=await chrome.storage.local.get(["provider","llmKeys","llmModels","customBase"]);
  const id=PROVIDERS[c.provider]?c.provider:"anthropic",p=PROVIDERS[id];
  return{id,kind:p.kind,label:p.label,noKey:!!p.noKey,maxField:p.maxField||"max_tokens",noTemp:!!p.noTemp,extra:p.extra||{},
    base:id==="custom"?(c.customBase||""):p.base,key:((c.llmKeys||{})[id]||"").trim(),model:((c.llmModels||{})[id]||p.model||"").trim()};
}
const llmReady=cfg=>!!((cfg.key||cfg.noKey)&&cfg.model&&cfg.base);
const llmMissing=cfg=>cfg.id==="custom"&&!cfg.base?"Set the Base URL for your custom provider in Settings.":!cfg.model?"Set a model name in Settings.":"Add your "+cfg.label+" API key in Settings first.";

// messages: [{role:"user"|"assistant",content:string}]; returns the reply text.
async function chatLLM(cfg,system,messages,maxTokens){
  maxTokens=maxTokens||2000;
  if(cfg.kind==="anthropic"){
    const r=await fetch(cfg.base+"/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":cfg.key,"anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
      body:JSON.stringify({model:cfg.model,max_tokens:maxTokens,system,messages})});
    if(!r.ok)throw new Error(cfg.label+" "+r.status+": "+(await r.text()).slice(0,200));
    const j=await r.json();return(j.content||[]).map(c=>c.text||"").join("");
  }
  const url=cfg.base.replace(/\/+$/,"")+"/chat/completions";
  let maxField=cfg.maxField,useTemp=!cfg.noTemp;
  for(let attempt=0;attempt<3;attempt++){
    const body=Object.assign({model:cfg.model,messages:[{role:"system",content:system},...messages],stream:false,[maxField]:maxTokens},cfg.extra);
    if(useTemp)body.temperature=0.3;
    const headers={"content-type":"application/json"};if(cfg.key)headers.authorization="Bearer "+cfg.key;
    const r=await fetch(url,{method:"POST",headers,body:JSON.stringify(body)});
    if(r.ok){const j=await r.json();return(j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content)||""}
    const t=await r.text();
    // Different vendors accept different parameter names; adapt once and retry.
    if(r.status===400&&maxField==="max_tokens"&&/max_completion_tokens/.test(t)){maxField="max_completion_tokens";continue}
    if(r.status===400&&maxField==="max_completion_tokens"&&/max_tokens/.test(t)&&!/max_completion_tokens/.test(t)){maxField="max_tokens";continue}
    if(r.status===400&&useTemp&&/temperature/i.test(t)){useTemp=false;continue}
    throw new Error(cfg.label+" "+r.status+": "+t.slice(0,200));
  }
  throw new Error(cfg.label+": the API rejected the request parameters.");
}
