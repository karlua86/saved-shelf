// Topic list (taxonomy). Editable in Settings. Format, one per line:
//   # Group name
//   🏠 Topic name | optional description that helps the AI tagger
// The topic called "Fun & Misc" (or, if absent, the last topic) is the catch-all for items with no usable text.
var DEFAULT_TAXONOMY_TEXT=`# Work & money
💼 Business | sales, marketing, entrepreneurship, company setup
💰 Money & Investing | personal finance, investing, tax, economics
🏠 Property | real estate, housing, buying/selling/renting
🎓 Career & Skills | jobs, professional skills, productivity at work
# Tech
🤖 AI | AI tools, prompts, automation
💻 Tech Tips | software, computer and phone how-tos
🔌 Gadgets | devices, gear, reviews
🎬 Video & Content | editing, content creation, social media strategy
# Growth
🧠 Mindset | motivation, habits, success mindset
📚 Learning | study methods, courses, memory techniques
📖 Books & Reading | books, reading, summaries
🗣️ Communication | speaking, negotiation, persuasion
❤️ Relationships | dating, marriage, friendships, family
# Health & food
🥗 Health & Diet | health, nutrition, diet, medical
💪 Fitness | exercise, workouts, sport
🍳 Food & Recipes | cooking, recipes, restaurants
# Home & family
👶 Parenting & Kids | children, parenting, education for kids
🛠️ Home & DIY | home repair, DIY, interior, cleaning
🛍️ Shopping | products, deals, reviews
# Out & about
✈️ Travel | trips, destinations, hotels
🚗 Cars | cars, driving, motorbikes
# Leisure
🎵 Music | songs, musicians
🎮 Gaming | video games
🎉 Fun & Misc | humour, entertainment, anything else, or no caption
`;

var GROUPS=[],EMO={},GLYPH={},DESC={},TOPICS=[];

function parseTaxonomy(text){
  const groups=[],emo={},glyph={},desc={};
  let cur=null;
  for(const raw of String(text||"").split("\n")){
    const line=raw.trim();if(!line)continue;
    let m=line.match(/^#\s*(.+)$/);
    if(m){cur=[m[1].trim(),(groups.length*47+20)%360,[]];groups.push(cur);continue}
    if(!cur){cur=["Topics",20,[]];groups.push(cur)}
    const [head,...rest]=line.split("|");
    const d=rest.join("|").trim();
    let emoji="🏷️",name=head.trim();
    const sp=name.match(/^(\S+)\s+(.+)$/);
    if(sp&&!/^[\p{L}\p{N}]/u.test(sp[1])){emoji=sp[1];name=sp[2].trim()}
    if(!name||cur[2].includes(name)||groups.some(g=>g[2].includes(name)))continue;
    cur[2].push(name);emo[name]=emoji;if(d)desc[name]=d;
    glyph[name]=name.split(/[\s&]+/)[0].slice(0,5).toUpperCase();
  }
  return{groups:groups.filter(g=>g[2].length),emo,glyph,desc};
}
function applyTaxonomy(text){
  let p=parseTaxonomy(text);
  if(!p.groups.length)p=parseTaxonomy(DEFAULT_TAXONOMY_TEXT);
  GROUPS=p.groups;EMO=p.emo;GLYPH=p.glyph;DESC=p.desc;TOPICS=GROUPS.flatMap(g=>g[2]);
}
async function initTaxonomy(){
  let t=DEFAULT_TAXONOMY_TEXT;
  try{const c=await chrome.storage.local.get("taxonomy");if(c.taxonomy&&c.taxonomy.trim())t=c.taxonomy}catch(e){}
  applyTaxonomy(t);
}
function fallbackTopic(){return TOPICS.includes("Fun & Misc")?"Fun & Misc":TOPICS[TOPICS.length-1]}
applyTaxonomy(DEFAULT_TAXONOMY_TEXT);
