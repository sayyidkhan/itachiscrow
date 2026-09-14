import {createSceneAuthor} from './scene-author.js';
import { PanoramaViewer } from './panorama.js?v=2';
import { createPanoramaJourney } from './panorama-journey.js';
import { CrowChat } from './chat.js?v=2';
import { CrowLive } from './live.js?v=2';
import { createTravelExperience } from './travel.js';

const $ = id => document.getElementById(id);
const emptyContext = {mapReady:false,destination:{name:'Chelsea, New York',lat:40.74334,lng:-73.99423},spot:null,savedPlaces:[]};
let context = window.CrowMap?.getContext() || emptyContext;
let capabilities = {}, scene = null, viewer = null, plan = null;
let generation = null, planning = null, searchSerial = 0, spotSerial = 0, instagramSerial = 0;
let managedLandings=0, actionAbort=null, sceneTask=null, commandBusy=false;
let currentTab = 'explore', liveState = {status:'idle',muted:false};
let instagramConnection = {}, oauthPopup = null;
const flightStages={departing:'Leaving the familiar',cruising:'Crossing the globe',descending:'A new place comes into view',approaching:'Almost there'};
const transcripts = new Map();
const panoramaJourney=createPanoramaJourney({getScene:()=>scene,getContext:()=>context,request,commit:async next=>{scene=next;await openScene();}});
const presets={Singapore:{name:'Singapore',lat:1.2868,lng:103.8545},Kyoto:{name:'Kyoto, Japan',lat:35.0036,lng:135.7782},Paris:{name:'Eiffel Tower, Paris, France',lat:48.85837,lng:2.294481}};
const node=(tag,text,className)=>{const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e;};
const note=(text,error=false)=>{$('scout-message').textContent=text;$('scout-message').classList.toggle('error',error);$('command-status').textContent=text;$('command-status').classList.toggle('error',error);};
function safeUrl(value){try{const u=new URL(value);return ['http:','https:'].includes(u.protocol)?u.href:null;}catch{return null;}}
function identity(value){return value?`${value.name}|${value.lat}|${value.lng}`:'';}
function setOpen(open,explicit=false){if(open&&!explicit)return;$('scout-panel').hidden=!open;$('scout-open').setAttribute('aria-expanded',String(open));document.body.classList.toggle('scout-visible',open);document.body.classList.toggle('debug-open',open);}
function tab(name,focus=false){currentTab=name;for(const button of document.querySelectorAll('[data-tab]')){const active=button.dataset.tab===name;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;$(`panel-${button.dataset.tab}`).hidden=!active;if(active&&focus)button.focus();}}
function preferences(){return {days:Number($('plan-days').value),budget:$('plan-budget').value,interests:$('plan-interests').value.trim()};}
function liveContext(){const prefs=preferences();return {...context,...prefs,interests:prefs.interests.split(/[,\n]/).map(x=>x.trim().slice(0,100)).filter(Boolean).slice(0,12),flightState:context.mode||'exploring'};}
function clearPlan(){planning?.abort();planning=null;plan=null;$('plan-result').replaceChildren();$('plan-sources').replaceChildren();$('download-plan').hidden=true;$('plan-status').textContent='';$('generate-plan').disabled=false;$('generate-plan').textContent='Plan my trip ↗';}
function renderPlan(text,target=$('plan-result')){
  const fragment=document.createDocumentFragment();
  const inline=(target,content)=>{const pattern=/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*/g;let from=0;for(const match of content.matchAll(pattern)){target.append(document.createTextNode(content.slice(from,match.index)));if(match[3])target.append(node('strong',match[3]));else{const href=safeUrl(match[2]);if(href){const a=node('a',match[1]);a.href=href;a.target='_blank';a.rel='noopener noreferrer';target.append(a);}else target.append(document.createTextNode(match[0]));}from=match.index+match[0].length;}target.append(document.createTextNode(content.slice(from)));};
  for(const line of text.split('\n')){const heading=/^#{1,4}\s+(.+)/.exec(line);const e=node(heading?'h4':'p','');inline(e,heading?heading[1]:line);fragment.append(e);}
  target.replaceChildren(fragment);
}
async function request(path,body,signal){
  let response;
  try{response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{'Accept':'application/json'}:{'Content-Type':'application/json','Accept':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal});}
  catch(error){if(error.name==='AbortError')throw error;throw Error('The travel service could not be reached. Check your connection and try again.');}
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data)throw Error(data?.error?.message||'The travel service is unavailable. Please try again shortly.');
  if(path==='/api/status')travel.configure(data.traveller||{});
  return data;
}
function refreshContext(next){
  const changed=identity(next.destination)!==identity(context.destination);
  const spotChanged=identity(next.spot)!==identity(context.spot);
  context={...emptyContext,...next};
  travel.updateContext(context);
  if(changed||spotChanged){$('command-result').hidden=true;scene=null;$('reopen-scene').hidden=true;$('scene-open').hidden=true;$('step-look').classList.remove('active');generation?.abort();generation=null;if($('panorama-dialog').open)$('panorama-dialog').close();clearPlan();}
  if(changed){searchSerial++;spotSerial++;$('destination-results').replaceChildren();$('spot-results').replaceChildren();$('instagram-hashtag').value=context.destination.name.split(',')[0].replace(/[^\p{L}\p{N}_]/gu,'').toLowerCase();instagramSerial++;$('instagram-refresh').disabled=false;$('instagram-posts').replaceChildren();$('instagram-status').textContent=capabilities.instagram?'Refresh to discover this destination’s recent hashtag posts.':'Connect Instagram through Meta to see recent public hashtag photos.';}
  const findingStart=!context.mapReady&&context.locationStatus==='locating';
  $('destination-label').textContent=findingStart?'FINDING YOUR LOCATION':context.destination.name.toUpperCase();
  $('journey-destination').textContent=findingStart?'Finding your starting point…':context.destination.name;
  $('journey-state').textContent=context.spot?`Landed at ${context.spot.name}`:context.mode==='arriving'?(flightStages[context.flightStage]||'Your crow is on its way…'):context.mode==='landing'?'Your crow is coming in to land…':context.mode==='taking-off'?'Your crow is lifting off from its perch…':'Choose a specific spot below, or pick one on the map.';
  $('world').setAttribute('aria-label',findingStart?'Interactive 3D travel map':`Interactive 3D map near ${context.destination.name}`);
  $('location-status').textContent=context.locationMessage||'';
  $('use-my-location').disabled=!context.mapReady||context.locationStatus==='locating';
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
  setOpen(true);tab('explore');note('You’ve arrived. Tell me where to land or what to explore.');
  return {status:'arrived',destination:context.destination};
}
async function search(query,landing=false){
  const serial=landing?++spotSerial:++searchSerial;
  const output=$(landing?'spot-results':'destination-results');
  output.replaceChildren(node('p','Looking for places…'));
  try{
    if(!context.mapReady)throw Error('The 3D map needs a working Google Maps key before you can search for places.');
    const results=await window.CrowMap.searchDestinations(landing?`${query}, ${context.destination.name}`:landmarkQuery(query));
    if(serial!==(landing?spotSerial:searchSerial))return;
    output.replaceChildren();
    if(!results.length){output.append(node('p','No places found. Try a more specific name.'));return;}
    for(const place of results){const button=node('button',place.name);button.type='button';button.append(node('small',place.address||`${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`));button.onclick=async()=>{output.replaceChildren();try{if(landing){note(`Landing at ${place.name}…`);setOpen(false);await window.CrowMap.landAt(place);}else await fly(place);}catch(error){setOpen(true);note(error.message,true);}};output.append(button);}
  }catch(error){if(serial===(landing?spotSerial:searchSerial))output.replaceChildren(node('p',error.message,'error'));}
}
function generateScene(signal,regenerate=false){
 if(sceneTask){if(!generation||generation.signal.aborted)return sceneTask.catch(()=>{}).then(()=>generateScene(signal,regenerate));return sceneTask;}
 const task=generateSceneNow(signal,regenerate);sceneTask=task;task.finally(()=>{if(sceneTask===task)sceneTask=null;}).catch(()=>{});return task;
}
async function generateSceneNow(signal,regenerate=false){
  if(!context.spot)throw Error('Choose a landing spot before generating its surroundings.');
  if(!capabilities.panorama)throw Error('Image generation needs the server’s OpenAI connection.');
  if(scene&&!regenerate&&identity(scene.spot)===identity(context.spot)){await openScene();return {status:'generated',reused:true,summary:'The existing 360 view is open.'};}
  if(signal?.aborted)return {status:'cancelled'};
  const controller=new AbortController();generation=controller;
  const cancel=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',cancel,{once:true});
  const target={destination:{...context.destination},spot:{...context.spot}};
  $('generate-scene').disabled=true;$('generate-scene').textContent='Imagining the surroundings…';
  note('Generating your 360° scene. This may take a minute or two.');
  try{
    const result=await request('/api/panorama',target,controller.signal);
    if(generation!==controller||identity(target.spot)!==identity(context.spot))return {status:'cancelled'};
    if(!/^data:image\/(jpeg|png|webp);base64,/.test(result.imageUrl||''))throw Error('The image service returned an invalid scene. Please try again.');
    scene={...result,spot:target.spot};$('command-result').hidden=false;$('command-result').textContent='Open 360° view ↗';$('command-result').onclick=()=>openScene();$('reopen-scene').hidden=false;$('step-look').classList.add('active');
    note('Your crow’s surroundings are ready. Drag to look around.');await openScene();
    if(generation!==controller||controller.signal.aborted||identity(target.spot)!==identity(context.spot))return {status:'cancelled'};
    return {status:'generated',summary:`360-degree scene generated for ${target.spot.name}.`};
  }catch(error){if(error.name!=='AbortError'){note(error.message,true);throw error;}return {status:'cancelled'};}
  finally{signal?.removeEventListener('abort',cancel);if(generation===controller){generation=null;$('generate-scene').disabled=!context.spot||!capabilities.panorama;$('generate-scene').textContent='Generate scene ↗';}}
}
const sceneAuthor=createSceneAuthor({getScene:()=>scene,getViewer:()=>viewer,request,cancelJourney:()=>panoramaJourney.cancel()});
async function openScene(){
  if(!scene)return;window.CrowMap?.pause();sceneAuthor.open();
  $('scene-open').hidden=false;
  $('panorama-title').textContent=scene.spot.name;$('panorama-download').href=scene.imageUrl;
  if(!$('panorama-dialog').open)$('panorama-dialog').showModal();
  viewer?.destroy();viewer=new PanoramaViewer($('panorama-view'),{onSelect:panoramaJourney.select});await viewer.load(scene.imageUrl);
}
async function generatePlan(extraRequest='',signal){
  if(!capabilities.plan)throw Error('Trip planning needs the server’s OpenAI connection.');
  if(planning)return {status:'planning'};
  const controller=new AbortController();planning=controller;
  const cancel=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',cancel,{once:true});
  const body={destination:context.destination,spot:context.spot||undefined,savedPlaces:context.savedPlaces.slice(0,20),...preferences()};
  if(extraRequest)body.request=extraRequest.slice(0,1200);
  showResult('plan');tab('plan');$('generate-plan').disabled=true;$('generate-plan').textContent='Finding your next adventure…';
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
const landmarkQuery=query=>/^paris(?:,?\s+france)?[.!?]?$/i.test(query.trim())?'Eiffel Tower, Paris, France':query;
let resultRestore=null;
function restoreResult(){const restore=resultRestore;resultRestore=null;restore?.();}
function closeResult(){if($('result-dialog').open)$('result-dialog').close();restoreResult();}
function showResult(kind){
 closeResult();
 const target=$(kind==='portrait'?'portrait-tools-body':kind==='plan'?'panel-plan':'panel-social');
 const parent=target.parentNode,next=target.nextSibling,wasHidden=target.hidden;
 resultRestore=()=>{parent.insertBefore(target,next);target.hidden=wasHidden;tab(currentTab);};
 $('result-title').textContent=kind==='portrait'?'Picture yourself here':kind==='plan'?'Your travel plan':'Around this stop';
 target.hidden=false;$('result-content').append(target);$('result-dialog').showModal();
 $('command-result').hidden=false;$('command-result').textContent='Open '+(kind==='portrait'?'portrait':kind==='plan'?'travel plan':'local discoveries');$('command-result').onclick=()=>showResult(kind);
}
$('result-close').onclick=closeResult;
$('result-dialog').addEventListener('close',()=>{if(!$('result-dialog').open)restoreResult();});
function addMessage(role,text){
 $('companion').classList.add('has-conversation');
 const p=node('div','',role==='user'?'chat-bubble user':'chat-bubble assistant');
 p.append(node('b',role==='user'?'You':'Crow'));
 const content=node('div','');renderPlan(text,content);p.append(content);$('voice-transcript').append(p);
 while($('voice-transcript').children.length>50)$('voice-transcript').firstElementChild.remove();
 $('voice-transcript').scrollTop=$('voice-transcript').scrollHeight;
 const body=$('companion').querySelector('.companion-body');body.scrollTop=body.scrollHeight;return p;
}
new ResizeObserver(()=>{const log=$('voice-transcript');log.scrollTop=log.scrollHeight;}).observe($('voice-transcript'));
function abortActions(){actionAbort?.abort();generation?.abort();planning?.abort();if(context.mapReady)window.CrowMap?.pause();}
function waitForMap(signal){
 if(context.mapReady)return Promise.resolve();
 note('Your request is queued. Waiting for the 3D map to be ready…');
 return new Promise((resolve,reject)=>{
   let timer;
   const events=['crow:ready','crow:context'];
   const finish=error=>{clearTimeout(timer);for(const event of events)document.removeEventListener(event,check);signal.removeEventListener('abort',cancel);error?reject(error):resolve();};
   const cancel=()=>finish(new DOMException('Journey cancelled.','AbortError'));
   const check=()=>{if(context.mapReady)finish();else if($('loading').querySelector('.failed'))finish(Error('The 3D map could not load. Reload the map and send your destination again.'));};
   timer=setTimeout(()=>finish(Error('The 3D map is taking too long to load. Try your destination again when the city is ready.')),45000);
   for(const event of events)document.addEventListener(event,check);
   signal.addEventListener('abort',cancel,{once:true});
   if(signal.aborted)cancel();else check();
 });
}
async function resolveCommandPlace(query,city){
 if(/^(here|there|this place|current location)$/i.test(query.trim()))return context.spot||context.destination;
 const places=await window.CrowMap.searchDestinations(city?`${query}, ${city}`:landmarkQuery(query));
 if(!places.length)throw Error(`I couldn’t find ${query}. Try a landmark or a more specific address.`);
 return places[0];
}
async function executeAction(name,args,{signal,sessionId}={}){
 if(signal?.aborted)return {status:'cancelled'};
 if(sessionId)chat.stop();
 if(name==='stop'){abortActions();note('Stopped. Where next?');return {status:'stopped'};}
 actionAbort?.abort();const controller=new AbortController();actionAbort=controller;
 const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 const cancel=()=>window.CrowMap?.pause();controller.signal.addEventListener('abort',cancel,{once:true});
 const active=()=>!controller.signal.aborted,guard=()=>{if(!active())throw new DOMException('Journey cancelled.','AbortError');};
 const landAndLook=async(place,view)=>{
   note(`Landing at ${place.name}…`);managedLandings++;
   let result;try{result=await window.CrowMap.landAt(place);}finally{managedLandings--;}
   if(result?.cancelled||!active())return {status:'cancelled'};
   if(!view)return {status:'landed',spot:place};
   try{const panorama=await generateScene(controller.signal);return {...panorama,spot:place,landed:true};}
   catch(error){return {status:'partial',landed:true,spot:place,summary:'Landed successfully, but the 360 view could not be generated.',error:error.message};}
 };
 try{
   if(['travel_to','fly_to','land_at','circle_around','take_off'].includes(name)){await waitForMap(controller.signal);guard();}
   if(name==='travel_to'){
     closeResult();
     note(`Finding ${args.landing_spot} in ${args.destination}…`);
     const destination=await resolveCommandPlace(args.destination);guard();
     const spot=await resolveCommandPlace(args.landing_spot,args.destination);guard();
     note(`Flying to ${destination.name}…`);const arrival=await fly(destination);guard();
     if(arrival?.status==='cancelled')return arrival;
     return await landAndLook(spot,args.generate_view);
   }
   if(name==='fly_to'){closeResult();note(`Finding ${args.destination}…`);const place=await resolveCommandPlace(args.destination);guard();return await fly(place);}
   if(name==='land_at'){closeResult();const place=await resolveCommandPlace(args.spot,context.destination.name);guard();return await landAndLook(place,args.generate_view!==false);}
   if(name==='circle_around'){closeResult();const place=await resolveCommandPlace(args.spot);guard();note(`Circling ${place.name}…`);const result=await window.CrowMap.circleAround(place);if(result?.cancelled)return {status:'cancelled'};note(`Orbit complete around ${place.name}.`);return {status:'completed',place,reducedMotion:result.reducedMotion||false};}
   if(name==='generate_panorama')return await generateScene(controller.signal,args.regenerate===true);
   if(name==='picture_me_here')return await travel.portrait(controller.signal);
   if(name==='find_cafes')return await travel.discover(args.request,controller.signal);
   if(name==='plan_trip')return await generatePlan(args.request,controller.signal);
   if(name==='take_off'){closeResult();const result=await window.CrowMap.takeOff();return {status:result?.cancelled?'cancelled':'airborne',destination:context.destination};}
   throw Error('Unknown travel action.');
 }catch(error){if(!active()||error.name==='AbortError')return {status:'cancelled'};note(error.message,true);throw error;}
 finally{signal?.removeEventListener('abort',abort);controller.signal.removeEventListener('abort',cancel);if(actionAbort===controller)actionAbort=null;}
}
const travel = createTravelExperience({getContext:()=>context,request,renderText:renderPlan,open:()=>{showResult('portrait');tab('explore');},openSocial:()=>{showResult('social');tab('social');},fly});
const live = new CrowLive({
  onState(state){liveState=state;$('command-stop').hidden=!state.pendingAction&&!commandBusy;const active=['connecting','connected'].includes(state.status);$('voice-toggle').disabled=state.status==='closing';$('voice-toggle').textContent=state.status==='closing'?'Ending…':active?'End call':'Talk ↗';$('voice-toggle').setAttribute('aria-label',active?'End live voice guide':'Start live voice guide');$('voice-orb').classList.toggle('connected',state.status==='connected');$('voice-state').textContent=state.pendingAction?'Your guide is working…':state.status==='connecting'?'Connecting to GPT-Live…':state.status==='connected'?(state.muted?'Connected · Microphone muted':'Connected · Listening'):'GPT-Live · Voice companion';$('voice-controls').hidden=state.status!=='connected';$('voice-mute').textContent=state.muted?'Unmute mic':'Mute mic';$('voice-mute').setAttribute('aria-pressed',String(state.muted));$('voice-audio').hidden=!state.playbackBlocked;},
  onError(error){$('voice-error').textContent=error.message;},
  onTranscript(event){let entry=transcripts.get('current');if(!entry||entry.role!==event.role){entry={role:event.role,element:addMessage(event.role,''),text:''};transcripts.set('current',entry);}entry.text+=event.delta;entry.element.lastElementChild.textContent=entry.text.slice(-5000);$('voice-transcript').scrollTop=$('voice-transcript').scrollHeight;},
  onAction:executeAction
});
const chat=new CrowChat({getContext:liveContext,onAction:executeAction,onMessage:addMessage,onProgress:text=>note(text),onError:error=>note(error.message,true),onBusy:busy=>{commandBusy=busy;$('companion').classList.toggle('busy',busy);$('chat-send').disabled=busy;$('chat-send').textContent=busy?'Sending…':'Send ↗';$('chat-input').setAttribute('aria-busy',String(busy));$('command-stop').hidden=!busy&&!liveState.pendingAction;}});
function stopCommand(){chat.stop();chat.completedConversation=null;live.cancelActions();abortActions();note('Stopped. Where next?');}
$('command-stop').onclick=stopCommand;
$('chat-form').onsubmit=event=>{event.preventDefault();const message=$('chat-input').value.trim();if(!message)return;if(commandBusy&&!/^(stop|pause|cancel)[.!]?$/i.test(message)){note('Finish or stop the current request before sending another.');return;}$('chat-input').value='';if(/^(stop|pause|cancel)[.!]?$/i.test(message)){addMessage('user',message);stopCommand();addMessage('assistant','Stopped.');return;}live.cancelActions();abortActions();chat.send(message);};
$('chat-input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();$('chat-form').requestSubmit();}});
for(const button of document.querySelectorAll('[data-command]'))button.onclick=()=>{$('chat-input').value=button.dataset.command;$('chat-input').focus();};
window.addEventListener('pagehide',()=>chat.stop());
async function connectStatus(){
  try{const status=await request('/api/status');capabilities=status.capabilities||{};instagramConnection=status.instagram||{};$('connection-status').textContent=capabilities.chat?'● Chat connected · Enter or Send to reply':capabilities.live?'Voice connected · Text chat unavailable':'AI chat is not configured';$('instagram-status').textContent=capabilities.instagram?'Instagram connected. Refresh to find recent public hashtag photos.':'Connect Instagram through Meta to see recent public hashtag photos.';
    $('instagram-connect').disabled=!instagramConnection.oauthAvailable;$('instagram-connect').hidden=Boolean(instagramConnection.selectedAccount);
    $('instagram-disconnect').hidden=!instagramConnection.selectedAccount;
    $('instagram-connection').textContent=instagramConnection.selectedAccount?`Connected as ${instagramConnection.selectedAccount.username||instagramConnection.selectedAccount.name}.`:instagramConnection.connection==='account_selection_required'?'Choose the Instagram account to connect.':instagramConnection.oauthAvailable?'Sign in through Facebook to connect a professional Instagram account linked to a Facebook Page.':'Instagram sign-in hasn’t been set up for this app yet.';
    $('instagram-accounts').replaceChildren();
    if(instagramConnection.connection==='account_selection_required')for(const account of instagramConnection.accounts||[]){const button=node('button',account.username||account.name||'Instagram account');button.type='button';button.onclick=async()=>{button.disabled=true;try{await request('/api/instagram/select-account',{accountId:account.id});await connectStatus();await instagram();}catch(error){$('instagram-status').textContent=error.message;button.disabled=false;}};$('instagram-accounts').append(button);}
  }
  catch{$('connection-status').textContent='Travel service unavailable · Try refreshing';$('instagram-status').textContent='Photo discovery is temporarily unavailable. Please try again shortly.';}
  refreshContext(context);
}
$('scout-open').onclick=()=>{closeResult();setOpen($('scout-panel').hidden,true);};$('scout-close').onclick=()=>{setOpen(false);$('scout-open').focus();};
$('scout-panel').addEventListener('keydown',event=>{if(event.key==='Escape'){setOpen(false);$('scout-open').focus();}});
for(const button of document.querySelectorAll('[data-tab]')){button.onclick=()=>tab(button.dataset.tab);button.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=['explore','social','plan'];const index=tabs.indexOf(currentTab);tab(e.key==='Home'?tabs[0]:e.key==='End'?tabs[2]:tabs[(index+(e.key==='ArrowRight'?1:2))%3],true);};}
$('destination-form').onsubmit=e=>{e.preventDefault();search($('destination-input').value.trim());};
$('spot-form').onsubmit=e=>{e.preventDefault();search($('spot-input').value.trim(),true);};
for(const button of document.querySelectorAll('[data-destination]'))button.onclick=()=>fly(presets[button.dataset.destination]).catch(error=>{setOpen(true);note(error.message,true);});
$('use-my-location').onclick=async()=>{try{const result=await window.CrowMap.useCurrentLocation();if(!result?.cancelled)note(result?.locationStatus==='located'?'Your crow is back nearby. Choose a destination to explore.':result?.locationMessage||'Choose a destination to continue.');}catch(error){$('location-status').textContent=error.message;}};
$('pick-spot').onclick=()=>{try{window.CrowMap.selectLandingMode();setOpen(false);note('Click a particular spot on the map to land.');}catch(error){note(error.message,true);}};
$('land-here').onclick=async()=>{try{setOpen(false);await window.CrowMap.landAt(context.destination);}catch(error){setOpen(true);note(error.message,true);}};
$('generate-scene').onclick=()=>generateScene(undefined,true).catch(()=>{});$('reopen-scene').onclick=()=>openScene().catch(error=>note(error.message,true));
$('scene-open').onclick=()=>openScene().catch(error=>{setOpen(true);note(error.message,true);});
$('panorama-close').onclick=()=>$('panorama-dialog').close();$('panorama-dialog').addEventListener('close',()=>{viewer?.destroy();viewer=null;});
$('plan-form').onsubmit=e=>{e.preventDefault();generatePlan().catch(error=>{$('plan-status').textContent=error.message;$('plan-status').classList.add('error');});};
$('instagram-form').onsubmit=e=>{e.preventDefault();instagram();};
$('instagram-connect').onclick=()=>{if(!instagramConnection.oauthAvailable)return;const loginUrl=window.CrowUrl?.('/api/instagram/connect')||'/api/instagram/connect';oauthPopup=window.open(loginUrl,'crow-instagram-connect','popup,width=620,height=760');if(!oauthPopup)window.location.assign(loginUrl);else $('instagram-connection').textContent='Finish signing in in the opened window.';};
$('instagram-disconnect').onclick=async()=>{try{await request('/api/instagram/disconnect',{});instagramSerial++;$('instagram-refresh').disabled=false;$('instagram-posts').replaceChildren();await connectStatus();}catch(error){$('instagram-status').textContent=error.message;}};
async function oauthResult(result){showResult('social');tab('social');await connectStatus();if(result==='error')$('instagram-status').textContent='Instagram couldn’t connect. Try signing in again and approve the requested account access.';else if(capabilities.instagram)await instagram();}
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==oauthPopup||event.data?.type!=='crow:instagram-return')return;oauthPopup=null;oauthResult(event.data.result);});
$('download-plan').onclick=()=>{if(!plan)return;const content=`# ${plan.destination}\n\n${plan.text}\n\nSources\n${(plan.sources||[]).map(x=>`${x.title}: ${x.url}`).join('\n')}`;const url=URL.createObjectURL(new Blob([content],{type:'text/markdown'}));const a=node('a','');a.href=url;a.download='crow-travel-plan.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('voice-toggle').onclick=async()=>{if(['connecting','connected'].includes(liveState.status)){live.stop();return;}$('voice-error').textContent='';if(!capabilities.live){$('voice-error').textContent='The live guide needs the server’s OpenAI connection.';return;}try{transcripts.clear();await live.start(liveContext());}catch(error){$('voice-error').textContent=error.message;}};
$('voice-mute').onclick=()=>live.setMuted(!liveState.muted);$('voice-audio').onclick=()=>live.resumeAudio();
for(const id of ['plan-days','plan-budget','plan-interests'])$(id).addEventListener('input',()=>{clearPlan();live.updateContext(liveContext());});
for(const event of ['crow:ready','crow:destination','crow:context'])document.addEventListener(event,e=>refreshContext(e.detail));
document.addEventListener('crow:landing-selected',e=>refreshContext({...e.detail,spot:null}));
document.addEventListener('crow:landed',e=>{refreshContext(e.detail);setOpen(true);tab('explore');note(`Landed at ${context.spot?.name||'your chosen spot'}.`);if(!managedLandings&&$('auto-scene').checked&&capabilities.panorama)generateScene().catch(()=>{});});
window.addEventListener('pagehide',()=>{generation?.abort();planning?.abort();viewer?.destroy();live.stop();});
setOpen(false);
const requestedTool=new URL(location.href).searchParams.get('tool');
if(['scene','portrait','nearby','trip','voice'].includes(requestedTool)){
 if(requestedTool==='portrait')showResult('portrait');else if(requestedTool==='trip')showResult('plan');else if(requestedTool==='nearby')showResult('social');else if(requestedTool==='scene')note('Ask me to land somewhere and create a 360 view.');
 tab(requestedTool==='nearby'?'social':requestedTool==='trip'?'plan':'explore');
 if(requestedTool==='scene')$('scene-tools').open=true;
 if(requestedTool==='portrait')$('portrait-tools').open=true;
 if(requestedTool==='voice')$('voice-toggle').focus();
}
const authResult=new URL(location.href).searchParams.get('instagram');
if(authResult&&window.opener){window.opener.postMessage({type:'crow:instagram-return',result:authResult},location.origin);window.close();}
if(authResult){const url=new URL(location.href);url.searchParams.delete('instagram');url.searchParams.delete('reason');history.replaceState(null,'',url);oauthResult(authResult);}else connectStatus();
