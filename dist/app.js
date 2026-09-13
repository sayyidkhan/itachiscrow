/* Browser-only Maps demo credential. No privileged server credentials. */
const MAPS_KEY=window.CROW_MAPS_KEY || '';
const $=id=>document.getElementById(id);
let map,Place,Marker,ready=false,playing=false,transitioning=false,progress=0,heading=125,speed=8,high=false,frameId,last=0,selected=null,detailSerial=0,placesLoaded=false;
let crowParts=[], flightTime=0, bank=0, crowHeading=125;
let startupFailed=false, sceneSteady=false, modelsMounted=false, startupTimer, sceneTimer, placesPromise;
const MODEL_BASE=new URL('models/',document.currentScript?.src || document.baseURI);
const FRAME_INTERVAL=1000/24;
function setFlightView(active){document.body.classList.toggle('in-flight',active);}
function finishLoading(){
 if(startupFailed||!sceneSteady||!modelsMounted||ready)return;
 clearTimeout(startupTimer);clearTimeout(sceneTimer);ready=true;
 $('loading').hidden=true;for(const id of ['fly','restart','speed','height','nearby'])$(id).disabled=false;
 status('Ready · Chelsea loop');hint('Start your flight. Pause to explore the city.');registerTools();
}
async function ensurePlaces(){
 if(!placesPromise)placesPromise=google.maps.importLibrary('places').then(lib=>{Place=lib.Place;return lib}).catch(error=>{placesPromise=null;throw error});
 return placesPromise;
}
const saved=new Set(),found=new Map(),markers=[];
// Prepared street-centre loop; rounded junctions keep camera turns continuous.
const corners=[{lat:40.74440,lng:-73.99505},{lat:40.74288,lng:-73.99298},{lat:40.74225,lng:-73.99343},{lat:40.74378,lng:-73.99551}];
const mix=(a,b,t)=>({lat:a.lat+(b.lat-a.lat)*t,lng:a.lng+(b.lng-a.lng)*t});
const distance=(a,b)=>Math.hypot((b.lat-a.lat)*111320,(b.lng-a.lng)*84300);
const bearing=(a,b)=>(Math.atan2((b.lng-a.lng)*Math.cos(a.lat*Math.PI/180),b.lat-a.lat)*180/Math.PI+360)%360;
const points=[];
for(let i=0;i<corners.length;i++){
 const a=corners[(i+3)%4],b=corners[i],d=corners[(i+1)%4];
 const enter=mix(b,a,Math.min(.15,12/distance(a,b))),exit=mix(b,d,Math.min(.15,12/distance(b,d)));
 for(let j=0;j<=20;j++){const t=j/20;points.push(mix(mix(enter,b,t),mix(b,exit,t),t));}
}
points.push(points[0]);let total=0;const lengths=[0];for(let i=1;i<points.length;i++){total+=distance(points[i-1],points[i]);lengths.push(total)}
function at(s){s=((s%total)+total)%total;let i=1;while(i<lengths.length-1&&lengths[i]<s)i++;return mix(points[i-1],points[i],(s-lengths[i-1])/(lengths[i]-lengths[i-1]||1));}
// Models live in Google's scene graph, sharing the city's depth and perspective.
// All three GLBs use the same shoulder pivot. No HTML bird or image billboard.
const radians=Math.PI/180;
const wrapAngle=v=>(v%360+360)%360;
const angleDelta=(a,b)=>((a-b+540)%360)-180;
function flightPosition(s){
 const p=at(s),h=bearing(at(s-8),at(s+8))*radians;
 const weave=3.4*Math.sin(s*Math.PI*2/64)+.9*Math.sin(s*Math.PI*2/29);
 return {lat:p.lat-Math.sin(h)*weave/111320,lng:p.lng+Math.cos(h)*weave/84300,
 altitude:105+2.2*Math.sin(s/31)+.22*Math.sin(flightTime*2*Math.PI*1.6)};
}
function flightBearing(s){return bearing(flightPosition(s-1),flightPosition(s+1));}
function camera(s){
 const p=at(s),ahead=at(s+4);
 return {center:{lat:p.lat+(ahead.lat-p.lat)*.65,lng:p.lng+(ahead.lng-p.lng)*.65,altitude:106.5+2.2*Math.sin(s/31)},
 heading:bearing(at(s-10),at(s+10)),tilt:high?48:65,range:high?90:48,roll:0,fov:50};
}
function poseCrow(s){
 const position=flightPosition(s);
 // Three wingbeats then a short glide, with slight asymmetry while banking.
 const cycle=flightTime%3.8;
 const envelope=cycle<2.6?Math.min(1,cycle/.25,(2.6-cycle)/.3):0;
 const flap=8+envelope*32*Math.sin(flightTime*Math.PI*2*1.6);
 const pitch=-Math.atan2(flightPosition(s+1).altitude-flightPosition(s-1).altitude,2)/radians+.8*envelope*Math.sin(flightTime*Math.PI*2*1.6);
 crowParts.forEach((part,i)=>{
  part.position=position;
  part.orientation={heading:wrapAngle(crowHeading),tilt:wrapAngle(pitch),
   roll:wrapAngle(bank+(i===1?flap:i===2?-flap:0))};
 });
}
async function mountCrow(Model){
 if(!Model)throw Error('3D model support is unavailable');
 const names=['body','left-wing','right-wing'];
 // Google's renderer uses credentialed XHR; wildcard-CORS hosts fail even when fetch succeeds.
 // Keep both downloads same-origin and end the URL in .glb; renderer query URLs fail to draw.
 await Promise.all(names.map(async name=>{
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(new URL(name+'.glb',MODEL_BASE),{signal:controller.signal,credentials:'same-origin',cache:'no-cache'});
   if(!response.ok)throw Error('Crow model download failed');
   const data=await response.arrayBuffer();
   if(data.byteLength<12||new DataView(data).getUint32(0,true)!==0x46546c67)throw Error('Invalid crow model');
  }finally{clearTimeout(timer)}
 }));
 if(startupFailed)return;
 crowParts=names.map(name=>new Model({src:new URL(name+'.glb',MODEL_BASE),position:flightPosition(0),altitudeMode:'ABSOLUTE',scale:2.2}));
 crowHeading=flightBearing(0);poseCrow(0);
 // Require a steady event after models have been appended, not just after API import.
 sceneSteady=false;modelsMounted=true;crowParts.forEach(part=>map.append(part));
}
function hint(s){$('hint').textContent=s;}
function status(s){$('status').textContent=s;}
function stop(){setFlightView(false);playing=false;transitioning=false;cancelAnimationFrame(frameId);map?.stopCameraAnimation?.();$('fly').innerHTML='Resume flight <span aria-hidden="true">↗</span>';status('Paused · explore the map');}
function draw(t){if(!playing)return;if(t-last<FRAME_INTERVAL){frameId=requestAnimationFrame(draw);return;}const dt=Math.min((t-last)/1000,.1);last=t;flightTime+=dt;progress+=dt*speed;if(progress>=total){progress=total;stop();$('fly').textContent='Fly again';status('Flight complete');hint('You’ve scouted the block. Tap Places to explore what’s nearby.');$('progress').style.width='100%';$('progress-text').textContent='100%';return;}
 const cam=camera(progress);const turn=angleDelta(flightBearing(progress),crowHeading);
 crowHeading=wrapAngle(crowHeading+turn*(1-Math.exp(-dt*6)));
 const curvature=angleDelta(flightBearing(progress+3),flightBearing(progress-3))*radians/6;
 const targetBank=Math.atan(speed*speed*curvature/9.81)/radians;
 bank+=(Math.max(-32,Math.min(32,targetBank))-bank)*(1-Math.exp(-dt*4));
 heading=wrapAngle(heading+angleDelta(cam.heading,heading)*(1-Math.exp(-dt*2)));poseCrow(progress);
 map.center=cam.center;map.heading=heading;map.tilt=cam.tilt;map.range=cam.range;map.roll=cam.roll;map.fov=cam.fov;
 $('progress').style.width=progress/total*100+'%';$('progress-text').textContent=Math.floor(progress/total*100)+'%';
 const fraction=progress/total;status(fraction<.40?'Gliding · W 23rd Street':fraction<.5?'Turning · 6th Avenue':fraction<.90?'Gliding · W 22nd Street':'Turning · 7th Avenue');frameId=requestAnimationFrame(draw);}
let transitionTimer;
function start(){
 if(!ready)return;
 if(playing||transitioning){clearTimeout(transitionTimer);stop();return;}
 if(progress>=total)progress=0;
 $('details').close();detailSerial++;transitioning=true;map.stopCameraAnimation?.();
 const cam=camera(progress);heading=cam.heading;
 map.flyCameraTo({endCamera:cam,durationMillis:1000});poseCrow(progress);
 $('fly').textContent='Pause flight Ⅱ';status('Returning to the crow');
 hint('Tap a place to investigate. Drag the map to pause.');
 transitionTimer=setTimeout(()=>{
  if(!transitioning)return;
  map.stopCameraAnimation?.();Object.assign(map,camera(progress));
  transitioning=false;playing=true;setFlightView(true);last=performance.now();
  frameId=requestAnimationFrame(draw);
 },1050);
}
function reset(){
 clearTimeout(transitionTimer);stop();progress=0;flightTime=0;bank=0;
 crowHeading=flightBearing(0);poseCrow(0);heading=camera(0).heading;
 Object.assign(map,camera(0));
 $('progress').style.width='0%';$('progress-text').textContent='0%';
 $('fly').textContent='Start flight ↗';status('Ready · Chelsea loop');
 hint('Follow the crow around the block, then investigate a place.');
}
function fail(message){startupFailed=true;clearTimeout(startupTimer);clearTimeout(sceneTimer);clearTimeout(transitionTimer);stop();ready=false;for(const id of ['fly','restart','speed','height','nearby'])$(id).disabled=true;$('loading').hidden=false;$('loading').querySelector('.spinner').classList.add('failed');$('loading').querySelector('h2').textContent='The city couldn’t load';$('loading').querySelector('p').textContent=message;$('reload').hidden=false;status('Map unavailable');;}
function el(tag,text,cls){const e=document.createElement(tag);e.textContent=text;if(cls)e.className=cls;return e;}
function safeLink(url,label){try{const u=new URL(url);if(!['https:','http:'].includes(u.protocol))return null;const a=el('a',label);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null}}
async function openPlace(id){if(!id)return;clearTimeout(transitionTimer);stop();selected=id;const serial=++detailSerial;const pane=$('detail-content');pane.replaceChildren(el('h2','Opening this place…'),el('p','Fetching available details from Google.'));if(!$('details').open)$('details').showModal();
 try{await ensurePlaces();const p=found.get(id)||new Place({id});await p.fetchFields({fields:['displayName','formattedAddress','location','googleMapsURI','primaryTypeDisplayName','businessStatus','regularOpeningHours','websiteURI','nationalPhoneNumber']});if(serial!==detailSerial)return;found.set(id,p);pane.replaceChildren(el('h2',p.displayName||'Place details'));pane.append(el('p',p.primaryTypeDisplayName||'Local business'));const dl=document.createElement('dl');const row=(a,b)=>{if(b){dl.append(el('dt',a),el('dd',b))}};row('Address',p.formattedAddress);row('Phone',p.nationalPhoneNumber);if(p.businessStatus&&p.businessStatus!=='OPERATIONAL')row('Business status',p.businessStatus.replaceAll('_',' ').toLowerCase());pane.append(dl);
 if(p.regularOpeningHours?.weekdayDescriptions?.length){pane.append(el('h3','Regular opening hours'));const ul=el('ul','','hours');p.regularOpeningHours.weekdayDescriptions.forEach(x=>ul.append(el('li',x)));pane.append(ul)}else pane.append(el('p','Opening hours weren’t supplied for this place.'));
 const actions=el('div','','actions');const g=safeLink(p.googleMapsURI||'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p.displayName||'Place')+'&query_place_id='+encodeURIComponent(id),'Open in Google Maps');if(g)actions.append(g);const website=safeLink(p.websiteURI,'Website');if(website)actions.append(website);const save=el('button',saved.has(id)?'Saved this session ✓':'Save place');save.onclick=()=>{saved.has(id)?saved.delete(id):saved.add(id);save.textContent=saved.has(id)?'Saved this session ✓':'Save place'};actions.append(save);pane.append(actions);pane.append(el('p','Place data: Google Maps · Photos and reviews are not included in this demo.','attribution'));
 for(const a of p.attributions||[]){const node=safeLink(a.providerURI,a.provider||'Data provider');if(node)pane.append(node)}
 }catch(e){if(serial!==detailSerial)return;pane.replaceChildren(el('h2','Details unavailable'),el('p','Google didn’t return place details. Demo limits or API permissions may apply.','error'));const p=found.get(id);if(p?.displayName)pane.append(el('p',p.displayName));const a=safeLink('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(p?.displayName||'Place')+'&query_place_id='+encodeURIComponent(id),'View on Google Maps');pane.append(a);const retry=el('button','Retry details');retry.onclick=()=>openPlace(id);pane.append(retry);}}
async function nearby(){if(!ready)return;const rail=$('places');if(placesLoaded){rail.hidden=!rail.hidden;return;}rail.hidden=false;rail.replaceChildren(el('p','Finding nearby places…'));$('nearby').disabled=true;try{await ensurePlaces();const {places}=await Place.searchNearby({fields:['id','displayName','location','primaryTypeDisplayName'],locationRestriction:{center:{lat:40.74334,lng:-73.99423},radius:260},includedPrimaryTypes:['restaurant','cafe','store'],maxResultCount:12});rail.replaceChildren();if(!places.length){rail.append(el('p','No places returned. Tap a map label instead.'));return;}for(const p of places){found.set(p.id,p);const b=el('button',p.displayName||'Explore place');b.append(el('small',p.primaryTypeDisplayName||'View details'));b.onclick=()=>openPlace(p.id);rail.append(b);if(Marker&&p.location){try{const m=new Marker({position:p.location,label:p.displayName,altitudeMode:'CLAMP_TO_GROUND',extruded:false});m.addEventListener('gmp-click',e=>{e.stopPropagation();openPlace(p.id)});map.append(m);markers.push(m)}catch{}}}placesLoaded=true;}catch{rail.replaceChildren(el('p','Place search unavailable. Tap a labelled business on the map, or try again.'));}finally{$('nearby').disabled=false}}
window.initCrow=async()=>{
 try{
  if(startupFailed)return;
  const lib=await google.maps.importLibrary('maps3d');
  if(startupFailed)return;
  Marker=lib.Marker3DInteractiveElement;const cam=camera(0);heading=cam.heading;
  map=new lib.Map3DElement({...cam,fov:50,mode:'HYBRID',gestureHandling:'GREEDY',defaultUIHidden:true});
  map.style.width='100%';map.style.height='100%';
  map.addEventListener('gmp-error',()=>fail('Google’s 3D map could not initialize. Try reopening this link in Safari, or reload the city.'));
  map.addEventListener('gmp-steadychange',event=>{sceneSteady=event.isSteady===true;finishLoading()});
  map.addEventListener('webglcontextlost',()=>fail('The browser lost its 3D graphics session. Close other tabs and reload the city.'),true);
  map.addEventListener('gmp-click',e=>{if(e.placeId){e.preventDefault?.();openPlace(e.placeId)}});
  map.addEventListener('pointerdown',()=>{if(playing||transitioning){clearTimeout(transitionTimer);stop();hint('Exploring freely. Resume flight to return to the route.')}});
  $('world').append(map);
  $('loading').querySelector('p').textContent='Loading the city and 3D crow…';
  await mountCrow(lib.Model3DElement);
  if(startupFailed)return;
  finishLoading();
  sceneTimer=setTimeout(()=>{
   if(ready||startupFailed)return;
   $('loading').querySelector('h2').textContent='The city is still rendering';
   $('loading').querySelector('p').textContent='Keep this page open a little longer, or reload. If it repeatedly closes, open the link directly in Safari.';
   $('reload').hidden=false;
  },18000);
 }catch(e){fail(e.name==='AbortError'?'The crow download timed out. Check your connection and reload.':e.message?.toLowerCase().includes('model')?'The 3D crow could not load. Check your connection and reload.':'The city could not start. Try opening this link directly in Safari.')}
};
window.gm_authFailure=()=>fail('Google rejected the map key. Check demo access and any website restrictions, then reload.');
$('fly').onclick=start;$('restart').onclick=reset;$('nearby').onclick=nearby;$('reload').onclick=()=>location.reload();$('speed').onclick=()=>{speed=speed===8?12:speed===12?4:8;$('speed').textContent=speed===8?'1×':speed===12?'1.5×':'0.5×'};$('height').onclick=()=>{high=!high;$('height').textContent=high?'Lower view':'Higher view';if(!ready)return;if(playing){const cam=camera(progress);map.tilt=cam.tilt;map.range=cam.range}else if(!transitioning)map.flyCameraTo({endCamera:camera(progress),durationMillis:900})};$('labels').onchange=e=>{if(map)map.mode=e.target.checked?'HYBRID':'SATELLITE'};$('close').onclick=()=>{detailSerial++;$('details').close()};$('details').addEventListener('cancel',()=>detailSerial++);$('info').onclick=()=>{if(playing||transitioning){clearTimeout(transitionTimer);stop()}$('about').showModal()};$('close-about').onclick=$('about-done').onclick=()=>$('about').close();document.addEventListener('visibilitychange',()=>{if(document.hidden&&(playing||transitioning)){clearTimeout(transitionTimer);stop()}});document.addEventListener('keydown',e=>{if(e.code==='Space'&&!$('details').open&&!$('about').open&&!['BUTTON','INPUT','A'].includes(document.activeElement?.tagName)){e.preventDefault();start()}});
function registerTools(){const context=document.modelContext;if(!context?.registerTool)return;const controller=new AbortController();window.addEventListener('pagehide',()=>controller.abort(),{once:true});for(const tool of [{name:'set_crow_flight',description:'Start or pause the visible Chelsea crow flight.',inputSchema:{type:'object',properties:{playing:{type:'boolean'}},required:['playing'],additionalProperties:false},execute(input){if(!input||typeof input.playing!=='boolean'||Object.keys(input).some(k=>k!=='playing'))throw Error('playing must be a boolean');if(input.playing&&!playing&&!transitioning)start();if(!input.playing){clearTimeout(transitionTimer);stop()}return {playing,returningToRoute:transitioning,progress:Math.round(progress/total*100)}}},{name:'inspect_crow_place',description:'Open a previously discovered business and retrieve Google place details.',inputSchema:{type:'object',properties:{placeId:{type:'string'}},required:['placeId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},async execute(input){if(!input||typeof input.placeId!=='string'||!found.has(input.placeId)||Object.keys(input).some(k=>k!=='placeId'))throw Error('Choose a discovered place ID');await openPlace(input.placeId);return {placeId:selected,detailsOpen:$('details').open}}}])try{Promise.resolve(context.registerTool(tool,{signal:controller.signal})).catch(()=>{})}catch{}}
const script=document.createElement('script');script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(MAPS_KEY)+'&v=beta&loading=async&callback=initCrow';script.async=true;script.onerror=()=>fail('Couldn’t reach Google Maps. Check your connection, then try again.');startupTimer=setTimeout(()=>{if(!ready&&!startupFailed){$('loading').querySelector('p').textContent='Still connecting. Try opening the link in Safari if this page repeatedly closes.';$('reload').hidden=false}},22000);document.head.append(script);
