import { PanoramaViewer } from './panorama.js';
import { CrowLive } from './live.js';

const $ = id => document.getElementById(id);
const emptyContext = {mapReady:false,destination:{name:'Chelsea, New York',lat:40.74334,lng:-73.99423},spot:null,savedPlaces:[]};
let context = window.CrowMap?.getContext() || emptyContext;
let capabilities = {}, scene = null, viewer = null, plan = null;
let generation = null, planning = null, searchSerial = 0, spotSerial = 0, instagramSerial = 0;
let currentTab = 'explore', liveState = {status:'idle',muted:false};
let instagramConnection = {}, oauthPopup = null;
const transcripts = new Map();
const presets={Singapore:{name:'Singapore',lat:1.2868,lng:103.8545},Kyoto:{name:'Kyoto, Japan',lat:35.0036,lng:135.7782},Paris:{name:'Paris, France',lat:48.8566,lng:2.3522}};
const node=(tag,text,className)=>{const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;};
const note=(text,error=false)=>{$('scout-message').textContent=text;$('scout-message').classList.toggle('error',error);};
function safeUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function identity(value){return value?`${value.name}|${value.lat}|${value.lng}`:'';}
function setOpen(open){$('scout-panel').hidden=!open;$('scout-open').setAttribute('aria-expanded',String(open));document.body.classList.toggle('scout-visible',open);}
function tab(name,focus=false){currentTab=name;for(const button of document.querySelectorAll('[data-tab]')){const active=button.dataset.tab===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;$(`panel-${button.dataset.tab}`).hidden=!active;if(active&&focus)button.focus();}}
function preferences(){return {days:Number($('plan-days').value),budget:$('plan-budget').value,interests:$('plan-interests').value.trim()};}
function liveContext(){const prefs=preferences();return {...context,...prefs,interests:prefs.interests.split(/[,\n]/).map(x=>x.trim().slice(0,100)).filter(Boolean).slice(0,12),flightState:context.mode||'exploring'};}
function clearPlan(){planning?.abort();planning=null;plan=null;$('plan-result').replaceChildren();$('plan-sources').replaceChildren();$('download-plan').hidden=true;$('plan-status').textContent='';$('generate-plan').disabled=false;$('generate-plan').textContent='Plan my trip ↗';}
function renderPlan(text){
  const fragment=document.createDocumentFragment();
  const inline=(target,content)=>{const pattern=/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*/g;let from=0;for(const match of content.matchAll(pattern)){target.append(document.createTextNode(content.slice(from,match.index)));if(match[3])target.append(node('strong',match[3]));else{const href=safeUrl(match[2]);if(href){const a=node('a',match[1]);a.href=href;a.target='_blank';a.rel='noopener noreferrer';target.append(a);}else target.append(document.createTextNode(match[0]));}from=match.index+match[0].length;}target.append(document.createTextNode(content.slice(from)));};
  for(const line of text.split('\n')){const heading=/^#{1,4}\s+(.+)/.exec(line);const e=node(heading?'h4':'p','');inline(e,heading?heading[1]:line);fragment.append(e);}
  $('plan-result').replaceChildren(fragment);
}
async function request(path,body,signal){
  let response;
  try{response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal});}
  catch(error){if(error.name==='AbortError')throw error;throw Error('The travel service could not be reached. Check your connection and try again.');}
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data)throw Error(data?.error?.message||'The travel service is unavailable. Start the app with npm run dev.');
  return data;
}
function refreshContext(next){
  const changed=identity(next.destination)!==identity(context.destination);
  const spotChanged=identity(next.spot)!==identity(context.spot);
  context={...emptyContext,...next};
  if(changed||spotChanged){scene=null;$('reopen-scene').hidden=true;$('step-look').classList.remove('active');generation?.abort();generation=null;if($('panorama-dialog').open)$('panorama-dialog').close();clearPlan();}
  if(changed){searchSerial++;spotSerial++;$('destination-results').replaceChildren();$('spot-results').replaceChildren();$('instagram-hashtag').value=context.destination.name.split(',')[0].replace(/[^\p{L}\p{N}_]/gu,'').toLowerCase();instagramSerial++;$('instagram-refresh').disabled=false;$('instagram-posts').replaceChildren();$('instagram-status').textContent=capabilities.instagram?'Refresh to discover this destination’s recent hashtag posts.':'Connect Instagram through Meta to see recent public hashtag photos.';}
  $('destination-label').textContent=context.destination.name.toUpperCase();
  $('journey-destination').textContent=context.destination.name;
  $('journey-state').textContent=context.spot?`Landed at ${context.spot.name}`:context.mode==='arriving'?'Your crow is on its way…':context.mode==='landing'?'Your crow is coming in to land…':context.mode==='taking-off'?'Your crow is lifting off from its perch…':'Choose a specific spot below, or pick one on the map.';
  $('step-land').classList.toggle('active',Boolean(context.spot));
  $('scene-description').textContent=context.spot?`Imagine the surroundings at ${context.spot.name}.`:'Land to imagine the world around your crow.';
  $('generate-scene').disabled=!context.spot||!capabilities.panorama||Boolean(generation);
  if(!generation)$('generate-scene').textContent='Generate scene ↗';
  $('pick-spot').disabled=!context.mapReady;$('land-here').disabled=!context.mapReady;
  $('saved-count').textContent=context.savedPlaces.length?`${context.savedPlaces.length} saved ${context.savedPlaces.length===1?'place':'places'} will help shape this trip.`:'Save places on the map to include them here.';
  live.updateContext(liveContext());
}
async function fly(destination){
  if(!window.CrowMap)throw Error('The map is still starting. Try again shortly.');
  note(`Flying to ${destination.name}…`);setOpen(false);
  const result=await window.CrowMap.flyTo(destination);
  if(result?.cancelled)return {status:'cancelled'};
  setOpen(true);tab('explore');note('You’ve arrived. Choose a spot to land.');
  return {status:'arrived',destination:context.destination};
}
async function search(query,landing=false){
  const serial=landing?++spotSerial:++searchSerial;
  const output=$(landing?'spot-results':'destination-results');
  output.replaceChildren(node('p','Looking for places…'));
  try{
    if(!context.mapReady)throw Error('The 3D map needs a working Google Maps key before you can search for places.');
    const results=await window.CrowMap.searchDestinations(landing?`${query}, ${context.destination.name}`:query);
    if(serial!==(landing?spotSerial:searchSerial))return;
    output.replaceChildren();
    if(!results.length){output.append(node('p','No places found. Try a more specific name.'));return;}
    for(const place of results){const button=node('button',place.name);button.type='button';button.append(node('small',place.address||`${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`));button.onclick=async()=>{output.replaceChildren();try{if(landing){note(`Landing at ${place.name}…`);setOpen(false);await window.CrowMap.landAt(place);}else await fly(place);}catch(error){setOpen(true);note(error.message,true);}};output.append(button);}
  }catch(error){if(serial===(landing?spotSerial:searchSerial))output.replaceChildren(node('p',error.message,'error'));}
}
async function generateScene(signal){
  if(!context.spot)throw Error('Choose a landing spot before generating its surroundings.');
  if(!capabilities.panorama)throw Error('Image generation needs the server’s OpenAI connection.');
  if(generation)return {status:'generating'};
  const controller=new AbortController();generation=controller;
  const cancel=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',cancel,{once:true});
  const target={destination:{...context.destination},spot:{...context.spot}};
  $('generate-scene').disabled=true;$('generate-scene').textContent='Imagining the surroundings…';
  note('Generating your 360° scene. This may take a minute or two.');
  try{
    const result=await request('/api/panorama',target,controller.signal);
    if(generation!==controller||identity(target.spot)!==identity(context.spot))return {status:'cancelled'};
    if(!/^data:image\/(jpeg|png|webp);base64,/.test(result.imageUrl||''))throw Error('The image service returned an invalid scene. Please try again.');
    scene={...result,spot:target.spot};$('reopen-scene').hidden=false;$('step-look').classList.add('active');
    note('Your crow’s surroundings are ready. Drag to look around.');await openScene();
    if(generation!==controller||controller.signal.aborted||identity(target.spot)!==identity(context.spot))return {status:'cancelled'};
    return {status:'generated',summary:`360-degree scene generated for ${target.spot.name}.`};
  }catch(error){if(error.name!=='AbortError'){note(error.message,true);throw error;}return {status:'cancelled'};}
  finally{signal?.removeEventListener('abort',cancel);if(generation===controller){generation=null;$('generate-scene').disabled=!context.spot||!capabilities.panorama;$('generate-scene').textContent='Generate scene ↗';}}
}
async function openScene(){
  if(!scene)return;window.CrowMap?.pause();
  $('panorama-title').textContent=scene.spot.name;$('panorama-download').href=scene.imageUrl;
  if(!$('panorama-dialog').open)$('panorama-dialog').showModal();
  viewer?.destroy();viewer=new PanoramaViewer($('panorama-view'));await viewer.load(scene.imageUrl);
}
async function generatePlan(extraRequest='',signal){
  if(!capabilities.plan)throw Error('Trip planning needs the server’s OpenAI connection.');
  if(planning)return {status:'planning'};
  const controller=new AbortController();planning=controller;
  const cancel=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',cancel,{once:true});
  const body={destination:context.destination,spot:context.spot||undefined,savedPlaces:context.savedPlaces.slice(0,20),...preferences()};
  if(extraRequest)body.request=extraRequest.slice(0,1200);
  setOpen(true);tab('plan');$('generate-plan').disabled=true;$('generate-plan').textContent='Finding your next adventure…';
  $('plan-status').textContent='Building a plan around your interests and checking web sources…';
  $('plan-status').classList.remove('error');
  try{
    const result=await request('/api/plan',body,controller.signal);if(planning!==controller)return {status:'cancelled'};
    if(!result.text?.trim())throw Error('The guide returned an empty plan. Please try again.');
    plan={...result,destination:context.destination.name};renderPlan(plan.text);
    $('plan-sources').replaceChildren();
    for(const source of result.sources||[]){const href=safeUrl(source.url);if(!href)continue;const a=node('a',source.title||new URL(href).hostname);a.href=href;a.target='_blank';a.rel='noopener noreferrer';$('plan-sources').append(a);}
    $('plan-status').textContent=`Made for ${context.destination.name} · Check current hours and bookings before you go.`;
    $('download-plan').hidden=false;return {status:'planned',summary:result.text.slice(0,1800)};
  }catch(error){if(error.name!=='AbortError'){$('plan-status').textContent=error.message;$('plan-status').classList.add('error');throw error;}return {status:'cancelled'};}
  finally{signal?.removeEventListener('abort',cancel);if(planning===controller){planning=null;$('generate-plan').disabled=false;$('generate-plan').textContent='Plan my trip ↗';}}
}
async function instagram(){
  const serial=++instagramSerial;
  if(!capabilities.instagram){$('instagram-status').textContent='Connect Instagram to load recent public hashtag photos.';return;}
  const hashtag=$('instagram-hashtag').value.replace(/^#/,'').trim();if(!hashtag)return;
  $('instagram-status').textContent=`Looking for recent #${hashtag} posts…`;$('instagram-posts').replaceChildren();$('instagram-refresh').disabled=true;
  try{
    const result=await request(`/api/instagram?hashtag=${encodeURIComponent(hashtag)}`);if(serial!==instagramSerial)return;
    let count=0;
    for(const post of result.posts||[]){const href=safeUrl(post.permalink),src=safeUrl(post.imageUrl);if(!href||!src)continue;const a=node('a','');a.href=href;a.target='_blank';a.rel='noopener noreferrer';const img=document.createElement('img');img.src=src;img.alt=post.caption?.slice(0,180)||`Instagram photo tagged ${hashtag}`;img.loading='lazy';img.referrerPolicy='no-referrer';a.append(img,node('p',post.caption||`#${hashtag}`));const date=post.timestamp?new Date(post.timestamp):null;a.append(node('small',`Instagram${date&&!Number.isNaN(+date)?' · '+date.toLocaleDateString():''} ↗`));$('instagram-posts').append(a);count++;}
    $('instagram-status').textContent=count?`${count} recent posts · fetched ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:result.message||'No recent public photos returned for this hashtag. Try another tag.';
  }catch(error){if(serial===instagramSerial)$('instagram-status').textContent=error.message;}
  finally{if(serial===instagramSerial)$('instagram-refresh').disabled=false;}
}
const live = new CrowLive({
  onState(state){liveState=state;const active=['connecting','connected'].includes(state.status);$('voice-toggle').disabled=state.status==='closing';$('voice-toggle').textContent=state.status==='closing'?'Ending…':active?'End call':'Talk ↗';$('voice-toggle').setAttribute('aria-label',active?'End live voice guide':'Start live voice guide');$('voice-orb').classList.toggle('connected',state.status==='connected');$('voice-state').textContent=state.pendingAction?'Your guide is working…':state.status==='connecting'?'Connecting to GPT-Live…':state.status==='connected'?(state.muted?'Connected · Microphone muted':'Connected · Listening'):'GPT-Live · Voice companion';$('voice-controls').hidden=state.status!=='connected';$('voice-mute').textContent=state.muted?'Unmute mic':'Mute mic';$('voice-mute').setAttribute('aria-pressed',String(state.muted));$('voice-audio').hidden=!state.playbackBlocked;},
  onError(error){$('voice-error').textContent=error.message;},
  onTranscript(event){const key=event.role;let p=transcripts.get(key);if(!p){p=node('p','');transcripts.set(key,p);$('voice-transcript').append(p);}p.replaceChildren(node('b',event.role==='user'?'You: ':'Crow: '),document.createTextNode(event.text.slice(-3000)));$('voice-transcript').scrollTop=$('voice-transcript').scrollHeight;},
  async onAction(name,args,{signal}={}){
    if(signal?.aborted)return {status:'cancelled'};
    if(name==='fly_to'||name==='land_at'){
      const query=name==='fly_to'?args.destination:`${args.spot}, ${context.destination.name}`;
      if(!context.mapReady)throw Error('The map is not ready. Ask the user to configure Google Maps.');
      const places=await window.CrowMap.searchDestinations(query);
      if(signal?.aborted)return {status:'cancelled'};
      if(!places.length)return {status:'not_found',summary:'No matching place was found. Ask for a more specific location.'};
      const cancel=()=>window.CrowMap.pause();signal?.addEventListener('abort',cancel,{once:true});
      try{if(name==='fly_to')return await fly(places[0]);const result=await window.CrowMap.landAt(places[0]);return {status:result?.cancelled?'cancelled':'landed',spot:places[0]};}finally{signal?.removeEventListener('abort',cancel);}
    }
    if(name==='generate_panorama')return generateScene(signal);
    if(name==='plan_trip')return generatePlan(args.request,signal);
    if(name==='take_off'){
      if(!context.spot)throw Error('The crow needs to land before it can take off.');
      const cancel=()=>window.CrowMap.pause();signal?.addEventListener('abort',cancel,{once:true});
      try{setOpen(false);const result=await window.CrowMap.takeOff();return {status:result?.cancelled?'cancelled':'airborne',destination:context.destination};}finally{signal?.removeEventListener('abort',cancel);}
    }
    throw Error('Unknown travel action.');
  }
});
async function connectStatus(){
  try{const status=await request('/api/status');capabilities=status.capabilities||{};instagramConnection=status.instagram||{};$('connection-status').textContent=capabilities.live?'● AI configured · GPT-Live + image generation':'AI setup needed · Add OPENAI_API_KEY to the server’s .env';$('instagram-status').textContent=capabilities.instagram?'Instagram connected. Refresh to find recent public hashtag photos.':'Connect Instagram through Meta to see recent public hashtag photos.';
    $('instagram-connect').disabled=!instagramConnection.oauthAvailable;$('instagram-connect').hidden=Boolean(instagramConnection.selectedAccount);
    $('instagram-disconnect').hidden=!instagramConnection.selectedAccount;
    $('instagram-connection').textContent=instagramConnection.selectedAccount?`Connected as ${instagramConnection.selectedAccount.username||instagramConnection.selectedAccount.name}.`:instagramConnection.connection==='account_selection_required'?'Choose the Instagram account to connect.':instagramConnection.oauthAvailable?'Sign in through Facebook to connect a professional Instagram account linked to a Facebook Page.':'Instagram sign-in hasn’t been set up for this app yet.';
    $('instagram-accounts').replaceChildren();
    if(instagramConnection.connection==='account_selection_required')for(const account of instagramConnection.accounts||[]){const button=node('button',account.username||account.name||'Instagram account');button.type='button';button.onclick=async()=>{button.disabled=true;try{await request('/api/instagram/select-account',{accountId:account.id});await connectStatus();await instagram();}catch(error){$('instagram-status').textContent=error.message;button.disabled=false;}};$('instagram-accounts').append(button);}
  }
  catch{$('connection-status').textContent='AI service offline · Run npm run dev to connect';$('instagram-status').textContent='Start the app server and connect Instagram through Meta to load photos.';}
  refreshContext(context);
}
$('scout-open').onclick=()=>setOpen($('scout-panel').hidden);$('scout-close').onclick=()=>{setOpen(false);$('scout-open').focus();};
for(const button of document.querySelectorAll('[data-tab]')){button.onclick=()=>tab(button.dataset.tab);button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=['explore','social','plan'];const index=tabs.indexOf(currentTab);tab(e.key==='Home'?tabs[0]:e.key==='End'?tabs[2]:tabs[(index+(e.key==='ArrowRight'?1:2))%3],true);};}
$('destination-form').onsubmit=e=>{e.preventDefault();search($('destination-input').value.trim());};
$('spot-form').onsubmit=e=>{e.preventDefault();search($('spot-input').value.trim(),true);};
for(const button of document.querySelectorAll('[data-destination]'))button.onclick=()=>fly(presets[button.dataset.destination]).catch(error=>{setOpen(true);note(error.message,true);});
$('pick-spot').onclick=()=>{try{window.CrowMap.selectLandingMode();setOpen(false);note('Click a particular spot on the map to land.');}catch(error){note(error.message,true);}};
$('land-here').onclick=async()=>{try{setOpen(false);await window.CrowMap.landAt(context.destination);}catch(error){setOpen(true);note(error.message,true);}};
$('generate-scene').onclick=()=>generateScene().catch(()=>{});$('reopen-scene').onclick=()=>openScene().catch(error=>note(error.message,true));
$('panorama-close').onclick=()=>$('panorama-dialog').close();$('panorama-dialog').addEventListener('close',()=>{viewer?.destroy();viewer=null;});
$('plan-form').onsubmit=e=>{e.preventDefault();generatePlan().catch(error=>{$('plan-status').textContent=error.message;$('plan-status').classList.add('error');});};
$('instagram-form').onsubmit=e=>{e.preventDefault();instagram();};
$('instagram-connect').onclick=()=>{if(!instagramConnection.oauthAvailable)return;oauthPopup=window.open('/api/instagram/connect','crow-instagram-connect','popup,width=620,height=760');if(!oauthPopup)window.location.assign('/api/instagram/connect');else $('instagram-connection').textContent='Finish signing in in the opened window.';};
$('instagram-disconnect').onclick=async()=>{try{await request('/api/instagram/disconnect',{});instagramSerial++;$('instagram-refresh').disabled=false;$('instagram-posts').replaceChildren();await connectStatus();}catch(error){$('instagram-status').textContent=error.message;}};
async function oauthResult(result){setOpen(true);tab('social');await connectStatus();if(result==='error')$('instagram-status').textContent='Instagram couldn’t connect. Try signing in again and approve the requested account access.';else if(capabilities.instagram)await instagram();}
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==oauthPopup||event.data?.type!=='crow:instagram-return')return;oauthPopup=null;oauthResult(event.data.result);});
$('download-plan').onclick=()=>{if(!plan)return;const content=`# ${plan.destination}\n\n${plan.text}\n\nSources\n${(plan.sources||[]).map(x=>`${x.title}: ${x.url}`).join('\n')}`;const url=URL.createObjectURL(new Blob([content],{type:'text/markdown'}));const a=node('a','');a.href=url;a.download='crow-travel-plan.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('voice-toggle').onclick=async()=>{if(['connecting','connected'].includes(liveState.status)){live.stop();return;}$('voice-error').textContent='';if(!capabilities.live){$('voice-error').textContent='The live guide needs the server’s OpenAI connection.';return;}try{await live.start(liveContext());}catch(error){$('voice-error').textContent=error.message;}};
$('voice-mute').onclick=()=>live.setMuted(!liveState.muted);$('voice-audio').onclick=()=>live.resumeAudio();
for(const id of ['plan-days','plan-budget','plan-interests'])$(id).addEventListener('input',()=>{clearPlan();live.updateContext(liveContext());});
for(const event of ['crow:ready','crow:destination','crow:context'])document.addEventListener(event,e=>refreshContext(e.detail));
document.addEventListener('crow:landing-selected',e=>refreshContext({...e.detail,spot:null}));
document.addEventListener('crow:landed',e=>{refreshContext(e.detail);setOpen(true);tab('explore');note(`Landed at ${context.spot?.name||'your chosen spot'}.`);if($('auto-scene').checked&&capabilities.panorama)generateScene().catch(()=>{});if(capabilities.instagram)instagram();});
window.addEventListener('pagehide',()=>{generation?.abort();planning?.abort();viewer?.destroy();live.stop();});
setOpen(true);
const authResult=new URL(location.href).searchParams.get('instagram');
if(authResult&&window.opener){window.opener.postMessage({type:'crow:instagram-return',result:authResult},location.origin);window.close();}
if(authResult){const url=new URL(location.href);url.searchParams.delete('instagram');url.searchParams.delete('reason');history.replaceState(null,'',url);oauthResult(authResult);}else connectStatus();
