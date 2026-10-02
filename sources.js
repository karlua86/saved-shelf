// Platforms ("sources"). Built-ins plus any custom sites the user adds in Settings.
// kind "native" = dedicated collector; "generic" = collectors/generic.js driven by a preset (links + optional click steps).
const BUILTIN_SOURCES=[
  {name:"YouTube",match:["*://www.youtube.com/*"],start:"https://www.youtube.com/feed/playlists",file:"collectors/youtube.js",complete:true,check:"youtube",on:true},
  {name:"Instagram",match:["*://www.instagram.com/*"],start:"https://www.instagram.com/",file:"collectors/instagram.js",complete:true,check:"instagram",on:true},
  {name:"Facebook",match:["*://www.facebook.com/*"],start:"https://www.facebook.com/saved/",file:"collectors/facebook.js",needPath:"/saved",check:"facebook",on:true},
  {name:"TikTok",match:["*://www.tiktok.com/*"],start:"https://www.tiktok.com/",file:"collectors/generic.js",
    preset:{linkSel:'a[href*="/video/"]',authorFromHref:"/@([^/]+)/video/",
      steps:[{click:'[data-e2e="nav-profile"]',wait:3000},{clickText:"^(Favou?rites|收藏)$",wait:3000}]}},
  {name:"Xiaohongshu",match:["*://www.xiaohongshu.com/*"],start:"https://www.xiaohongshu.com/explore",file:"collectors/generic.js",
    preset:{linkSel:'a[href*="/explore/"], a[href*="/search_result/"], a.cover',
      steps:[{click:'a[href*="/user/profile/"]',wait:3000},{clickText:"^(收藏|Saved)$",wait:3000}]}},
  {name:"X",match:["*://x.com/*","*://twitter.com/*"],start:"https://x.com/i/bookmarks",needPath:"/i/bookmarks",file:"collectors/generic.js",
    preset:{cardSel:'article[data-testid="tweet"]',cardLink:'a[href*="/status/"]:has(time)',titleSel:'[data-testid="tweetText"]',
      authorFromHref:"(?:x|twitter)\\.com/([^/]+)/status/",thumbSel:'[data-testid="tweetPhoto"] img, video[poster]',steps:[],scrollStep:true}},
  {name:"Threads",match:["*://www.threads.com/*","*://www.threads.net/*"],start:"https://www.threads.com/saved",needPath:"/saved",file:"collectors/generic.js",
    preset:{linkSel:'a[href*="/post/"]',authorFromHref:"/@([^/]+)/post/",steps:[]}},
];
async function getSourceDefs(){
  let c={};try{c=await chrome.storage.local.get(["customSources","enabledSources"])}catch(e){}
  const customs=(c.customSources||[]).filter(s=>s&&s.name&&s.start).map(s=>{
    let host="";try{host=new URL(s.start).hostname}catch(e){}
    return{name:s.name,match:host?["*://"+host+"/*"]:[],start:s.start,file:"collectors/generic.js",custom:true,on:true,
      preset:{linkSel:s.linkSel||"",titleSel:s.titleSel||"",steps:[]}};
  });
  const enabled=c.enabledSources;
  return[...BUILTIN_SOURCES.map(s=>Object.assign({},s,{on:enabled?enabled.includes(s.name):!!s.on})),...customs];
}
