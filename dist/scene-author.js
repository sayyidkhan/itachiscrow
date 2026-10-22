import {authorPhoto,selectedAuthorPhoto,prepareAuthorPhoto,saveAuthorPhoto} from './author-reference.js';

export function createSceneAuthor({getScene,getViewer,request,cancelJourney}){
 const dialog=document.getElementById('panorama-dialog'),view=document.getElementById('panorama-view'),footer=dialog.querySelector('.panorama-footer'),eyebrow=dialog.querySelector('.eyebrow');
 const tabs=document.createElement('div');tabs.className='scene-mode';tabs.setAttribute('aria-label','Scene mode');
 tabs.innerHTML='<button type="button" aria-pressed="true">Crow</button><button type="button" aria-pressed="false">Author · picture me here</button>';
 dialog.querySelector('.dialog-top').after(tabs);
 const panel=document.createElement('section');panel.className='author-scene';panel.hidden=true;
 panel.innerHTML=`<div class="author-progress"><div class="author-progress-mark" aria-hidden="true"><img src="images/crow-mark.svg" width="28" height="28" alt=""></div><div><p role="status" class="author-scene-status"></p><p class="author-progress-detail"></p></div><button type="button" class="author-stop" hidden>Stop</button></div>
 <div class="author-reference-controls"><button type="button" class="author-change-reference">Change reference photo</button><button type="button" class="author-reset-reference">Use default photo</button><input type="file" class="author-reference-file" accept="image/jpeg,image/png,image/webp" aria-label="Choose author reference photo" hidden><span class="author-reference-status" role="status"></span></div>
 <div class="author-thumbs" role="group" aria-label="Generated variations"></div>
 <figure class="author-preview" hidden><img class="author-scene-image" alt=""><figcaption><span class="author-selected-label"></span><a class="author-save" download>Save image ↓</a></figcaption></figure>
 <form class="author-variations"><label for="author-direction">Shape your next variations <span>Optional</span></label><textarea id="author-direction" rows="2" maxlength="400" placeholder="Try a closer portrait, a candid pose, or a different outfit…"></textarea><div class="author-scene-actions"><button type="submit" class="author-more">Generate 3 more <span aria-hidden="true">↗</span></button><button type="button" class="author-retry" hidden>Retry unfinished</button></div><p class="author-scene-note">Three images per batch · AI-generated · Save your favourites before leaving.</p></form>`;
 view.after(panel);
 const [crow,author]=tabs.querySelectorAll('button');
 const status=panel.querySelector('[role=status]'),detail=panel.querySelector('.author-progress-detail'),thumbs=panel.querySelector('.author-thumbs'),preview=panel.querySelector('.author-preview'),img=preview.querySelector('img'),save=preview.querySelector('a'),label=preview.querySelector('span'),form=panel.querySelector('form'),direction=panel.querySelector('textarea'),more=panel.querySelector('.author-more'),retry=panel.querySelector('.author-retry'),stop=panel.querySelector('.author-stop');
 const directions=['Replace the crow with the reference person in a relaxed, three-quarter travel portrait, facing the camera.','Replace the crow with the reference person walking candidly, head turned to the camera with a natural smile.','Replace the crow with the reference person casually gesturing towards the landmark, face clearly visible.'];
 let source=null,items=[],controller=null,reference=null,mode='crow',selected=null;
 let selectedReference=selectedAuthorPhoto();
 function state(){
  return {available:Boolean(getScene()),open:dialog.open,mode,generating:Boolean(controller),reference:selectedReference?'custom':'default',direction:direction.value,selected:selected?.id||0,variations:items.map(item=>({id:item.id,state:item.state})),status:status.textContent};
 }
 function changed(){window.dispatchEvent(new CustomEvent('crow:author-state',{detail:state()}))}

 const current=job=>controller===job&&!job.signal.aborted&&getScene()===source&&mode==='author'&&dialog.open;
 function select(item,reveal=false){
  selected=item;img.src=item.url;img.alt=`AI-generated variation ${item.id} of you at ${source.spot.name}`;
  save.href=item.url;save.download=`author-scene-${item.id}.${item.url.startsWith('data:image/png')?'png':item.url.startsWith('data:image/webp')?'webp':'jpg'}`;
  label.textContent=`Variation ${String(item.id).padStart(2,'0')}`;preview.hidden=false;
  if(reveal)preview.scrollIntoView({block:'nearest'});
  changed();
  for(const button of thumbs.querySelectorAll('[aria-pressed]'))button.setAttribute('aria-pressed',String(Number(button.dataset.id)===item.id));
 }
 function render(){
  thumbs.replaceChildren();
  for(const item of items){
   const card=document.createElement('div');card.className='author-variation';card.dataset.state=item.state;
   const button=document.createElement('button');button.type='button';button.dataset.id=item.id;
   if(item.url){
    const thumb=new Image();thumb.src=item.url;thumb.alt='';button.append(thumb);
    button.setAttribute('aria-label',`Show variation ${item.id}`);button.setAttribute('aria-pressed',String(selected===item));button.onclick=()=>select(item,true);
   }else{
    button.disabled=item.state==='pending'||Boolean(controller);
    button.setAttribute('aria-label',item.state==='pending'?`Creating variation ${item.id}`:`Retry variation ${item.id}`);
    const glyph=document.createElement('span');glyph.className='author-variation-glyph';glyph.textContent=item.state==='pending'?'✧':'↻';glyph.setAttribute('aria-hidden','true');button.append(glyph);
    button.onclick=()=>generate([item]);
   }
   const caption=document.createElement('span');caption.className='author-variation-caption';caption.textContent=String(item.id).padStart(2,'0')+' · '+(item.url?'Ready':item.state==='pending'?'Creating':item.state==='stopped'?'Stopped':'Retry');button.append(caption);card.append(button);
   if(item.error){const error=document.createElement('p');error.className='author-variation-error';error.textContent=item.error;card.append(error)}
   thumbs.append(card);
  }
  const busy=Boolean(controller);panel.dataset.generating=String(busy);thumbs.setAttribute('aria-busy',String(busy));
  more.disabled=busy;direction.disabled=busy;stop.hidden=!busy;retry.hidden=busy||!items.some(item=>!item.url);
  more.firstChild.textContent=items.length?'Generate 3 more ':'Generate 3 scenes ';
  panel.querySelector('.author-reset-reference').hidden=!selectedReference;changed();
 }
 function cancel(){
  if(!controller)return;
  controller.abort();controller=null;
  for(const item of items)if(item.state==='pending'){item.state='stopped';item.error=''}
  status.textContent='Generation stopped';detail.textContent='Finished images are saved here. Retry any unfinished variation.';render();
 }
 function setMode(next){
  mode=next;const active=next==='author';dialog.classList.toggle('scene-author-open',active);crow.setAttribute('aria-pressed',String(!active));author.setAttribute('aria-pressed',String(active));
  view.hidden=active;footer.hidden=active;panel.hidden=!active;eyebrow.textContent=active?'YOU, IN THIS PLACE':'YOUR CROW’S POINT OF VIEW';
  if(!active){cancel();getViewer()?.render()}
  changed();
 }
 function reset(){
  cancel();source=getScene();items=[];reference=null;selected=null;preview.hidden=true;img.removeAttribute('src');save.removeAttribute('href');direction.value='';status.textContent='';detail.textContent='';render();setMode('crow');
 }
 function capture(){
  const viewer=getViewer();if(!viewer?.canvas)throw Error('Wait for the crow scene to load, then try Author again.');
  viewer.render();const canvas=document.createElement('canvas');canvas.width=Math.min(1024,viewer.canvas.width);canvas.height=Math.round(canvas.width*viewer.canvas.height/viewer.canvas.width);
  canvas.getContext('2d').drawImage(viewer.canvas,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.85);
 }
 async function generate(unfinished){
  if(controller||mode!=='author'||!dialog.open)return;
  if(getScene()!==source){reset();return}
  try{if(!reference)reference=capture()}catch(error){status.textContent=error.message;return}
  const job=new AbortController();controller=job;
  const batch=unfinished||directions.map((pose,index)=>({id:items.length+index+1,scene:pose+(direction.value.trim()?` Additional direction: ${direction.value.trim()}`:''),state:'pending',url:null,error:''}));
  if(!unfinished)items.push(...batch);
  for(const item of batch){item.state='pending';item.error=''}
  const sceneImage=reference,destination={...source.spot};
  function progress(){
   const ready=batch.filter(item=>item.url).length,pending=batch.filter(item=>item.state==='pending').length;
   status.textContent=pending?`Creating your ${batch.length===1?'variation':'variations'} · ${ready} of ${batch.length} ready`:ready===batch.length?'Your variations are ready':`${ready} of ${batch.length} ready · retry unfinished images`;
   detail.textContent=pending?'Creating together. Each image appears as soon as it is ready. This can take a minute or two.':'Choose a favourite, or add a direction for your next three.';
   render();
  }
  progress();
  try{
   const photo=await authorPhoto();if(!current(job))return;
   await Promise.allSettled(batch.map(async item=>{
    const child=new AbortController(),abort=()=>child.abort();job.signal.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>child.abort('timeout'),195000);
    try{
     const result=await request('/api/portrait',{destination,photo,sceneImage,scene:item.scene},child.signal);
     if(!current(job))return;
     if(child.signal.aborted)throw Error('This image took too long. Try again.');
     if(!/^data:image\/(jpeg|png|webp);base64,/.test(result.imageUrl||''))throw Error('No usable image returned. Try again.');
     item.url=result.imageUrl;item.state='ready';if(!selected)select(item);
    }catch(error){if(current(job)){item.state='error';item.error=child.signal.aborted?'This image took too long. Try again.':error.message}}
    finally{clearTimeout(timer);job.signal.removeEventListener('abort',abort);if(current(job))progress()}
   }));
  }catch(error){
   if(current(job)){for(const item of batch){item.state='error';item.error=error.message}progress()}
  }finally{
   if(controller===job){controller=null;render()}
  }
 }

 const file=panel.querySelector('.author-reference-file'),referenceStatus=panel.querySelector('.author-reference-status');
 let referenceVersion=0;
 async function changeReference(data){
  saveAuthorPhoto(data);selectedReference=data;reset();setMode('author');
  referenceStatus.textContent=data?'Reference photo updated. Generate a new batch when ready.':'Default reference restored. Generate a new batch when ready.';
 }
 panel.querySelector('.author-change-reference').onclick=()=>file.click();
 file.onchange=async()=>{
  const version=++referenceVersion,sceneAtSelection=getScene();
  try{if(file.files[0]){const data=await prepareAuthorPhoto(file.files[0]);if(version===referenceVersion&&sceneAtSelection===getScene())await changeReference(data)}}
  catch(error){referenceStatus.textContent=error.message}
  finally{file.value=''}
 };
 panel.querySelector('.author-reset-reference').onclick=()=>{referenceVersion++;changeReference(null).catch(error=>referenceStatus.textContent=error.message)};
 function control({command,direction:nextDirection='',variation=0}){
  if(command==='close'){dialog.close();return {...state(),status:'closed'}}
  if(command==='stop'){cancel();return {...state(),status:'stopped'}}
  if(getScene()!==source)reset();
  if(command==='status')return state();
  if(command==='crow'){setMode('crow');return state()}
  cancelJourney();setMode('author');
  if(nextDirection)direction.value=nextDirection;
  if(command==='reference'){
   referenceStatus.textContent='Choose a clear face photo using Change reference photo. Your photo is sent to OpenAI only when you generate.';
   panel.querySelector('.author-change-reference').scrollIntoView({block:'nearest'});
   panel.querySelector('.author-change-reference').focus({preventScroll:true});
   return {...state(),status:'needs_photo',summary:referenceStatus.textContent};
  }
  if(command==='reset_reference'){referenceVersion++;changeReference(null).catch(error=>referenceStatus.textContent=error.message);return state()}
  if(command==='select'||command==='download'){
   const item=variation?items.find(item=>item.id===variation):selected;
   if(!item?.url)throw Error('Choose a ready variation before selecting or saving it.');
   select(item,true);
   if(command==='download')save.click();
   return {...state(),status:command==='download'?'download_requested':'selected'};
  }
  if(command==='retry'){
   if(controller)return {...state(),status:'generating'};
   const unfinished=items.filter(item=>!item.url&&(!variation||item.id===variation)).slice(0,3);
   if(!unfinished.length)throw Error('There are no unfinished variations to retry.');
   generate(unfinished);
  }else if(command==='generate'||(command==='open'&&!items.length))generate();
  if(command==='open'&&selected)preview.scrollIntoView({block:'nearest'});
  return {...state(),summary:'Author controls are open. Images appear progressively; use status to check completion.'};
 }
 crow.onclick=()=>setMode('crow');
 author.onclick=()=>{if(getScene()!==source)reset();cancelJourney();setMode('author');if(!items.length)generate()};
 form.onsubmit=event=>{event.preventDefault();generate()};
 retry.onclick=()=>generate(items.filter(item=>!item.url).slice(0,3));stop.onclick=cancel;
 dialog.addEventListener('close',()=>{if(!dialog.open)cancel()});window.addEventListener('pagehide',cancel);
 window.addEventListener('pageshow',()=>{const next=selectedAuthorPhoto();if(next!==selectedReference){selectedReference=next;reset()}});
 return {state,control,cancel,open(){if(source!==getScene())reset();else setMode('crow')}};
}
