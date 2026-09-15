/* Per-browser round robin. A live Maps SDK session keeps one credential. */
(()=>{
 const numbered=Object.fromEntries(Object.keys(window).filter(name=>/^CROW_MAPS_KEY[1-9]\d*$/.test(name)&&typeof window[name]==='string').map(name=>[name,window[name]]));
 ['CROW_MAPS_KEY','CROW_MAPS_FALLBACK_KEY','CROW_MAPS_FALLBACK_KEY_2'].forEach((name,i)=>{if(!Object.hasOwn(numbered,'CROW_MAPS_KEY'+(i+1)))numbered['CROW_MAPS_KEY'+(i+1)]=window[name]||'';});
 const entries=Object.entries(numbered).sort(([a],[b])=>Number(a.slice(13))-Number(b.slice(13))).map(([name,key])=>({name:['primary','backup','backup2'][Number(name.slice(13))-1]||'key'+name.slice(13),key:key.trim()})).filter((entry,i,all)=>entry.key&&all.findIndex(other=>other.key===entry.key)===i);
 const cursors={};
 function next(scope){
  if(!entries.length)return [];
  if(cursors[scope]===undefined){try{cursors[scope]=Number(localStorage.getItem('crow:key-cursor:'+scope))||0}catch{cursors[scope]=0}}
  const start=Math.abs(cursors[scope])%entries.length;cursors[scope]=(start+1)%entries.length;
  try{localStorage.setItem('crow:key-cursor:'+scope,String(cursors[scope]))}catch{}
  return entries.slice(start).concat(entries.slice(0,start));
 }
 const url=new URL(location.href),forced=entries.find(entry=>entry.name===url.searchParams.get('mapsKey'));
 const selected=forced||next('map')[0];let retrying=false;
 window.CrowMapKeys={key:selected?.key||'',photoKey(slot){return entries.find(entry=>entry.name===slot)?.key||''},nextSearchKeys(){return next('search').map(entry=>entry.key)},retry(){
  if(retrying)return true;
  const retries=Number(url.searchParams.get('mapsRetry')||0);
  const other=entries[(entries.indexOf(selected)+1)%entries.length];
  if(!other||other===selected||!Number.isInteger(retries)||retries<0||retries>=entries.length-1)return false;
  retrying=true;url.searchParams.set('mapsKey',other.name);url.searchParams.set('mapsRetry',String(retries+1));
  const note=document.querySelector('#loading p');if(note)note.textContent='Reconnecting with another map key…';
  location.replace(url.href);return true;
 }};
})();
