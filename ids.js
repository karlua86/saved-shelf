// Shared helpers (function declarations only, so re-injecting into a page is safe)
function hash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))>>>0;return h.toString(36)}
function idOf(v){
  if(v.id)return String(v.id);
  const u=v.url||"";let m;
  if((m=u.match(/(?:shorts\/|[?&]v=|youtu\.be\/)([\w-]{11})/)))return m[1];
  if((m=u.match(/instagram\.com\/(?:reel|p|tv)\/([\w-]+)/)))return m[1];
  if((m=u.match(/facebook\.com\/(?:reel|videos)\/(\d+)/)))return m[1];
  if((m=u.match(/(pfbid\w+)/)))return m[1];
  if((m=u.match(/story_fbid=(\d+)/)))return m[1];
  if((m=u.match(/tiktok\.com\/@[^/]+\/video\/(\d+)/)))return m[1];
  if((m=u.match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/)))return m[1];
  if((m=u.match(/threads\.(?:com|net)\/@[^/]+\/post\/([\w-]+)/)))return m[1];
  if((m=u.match(/xiaohongshu\.com\/(?:explore|discovery\/item|search_result|user\/profile\/\w+)\/([0-9a-f]{24})/)))return m[1];
  if(u)return "u"+hash(u.replace(/[#].*$/,"").replace(/\/$/,""));
  return "h"+hash((v.src||"")+"|"+(v.t||"")+"|"+(v.ch||""));
}
function thumbOf(v){
  if(v.thumbData)return v.thumbData;
  if(v.thumb)return v.thumb;
  const m=(v.url||"").match(/(?:shorts\/|[?&]v=|youtu\.be\/)([\w-]{11})/);
  return v.src==="YouTube"&&m?"https://i.ytimg.com/vi/"+m[1]+"/mqdefault.jpg":"";
}
