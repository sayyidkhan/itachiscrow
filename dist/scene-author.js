import {authorPhoto,selectedAuthorPhoto} from './author-reference.js';
export function createSceneAuthor({getScene,getViewer,request,cancelJourney}){
 const dialog=document.getElementById('panorama-dialog'),view=document.getElementById('panorama-view'),footer=dialog.querySelector('.panorama-footer'),eyebrow=dialog.querySelector('.eyebrow');
 const tabs=document.createElement('div');tabs.className='scene-mode';tabs.setAttribute('aria-label','Scene mode');tabs.innerHTML='<button type="button" aria-pressed="true">Crow</button><button type="button" aria-pressed="false">Author · picture me here</button>';
 dialog.querySelector('.dialog-top').after(tabs);
 const panel=document.createElement('section');panel.className='author-scene';panel.hidden=true;panel.innerHTML='<p role="status" class="author-scene-status"></p><img class="author-scene-image" hidden alt="AI-generated scene of Sayyid at this location"><div class="author-thumbs" aria-label="Generated variations"></div><div class="author-scene-actions"><button type="button" class="author-retry" hidden>Generate remaining images</button><a class="author-save" hidden download="sayyid-scene.jpg">Save image ↓</a></div><p class="author-scene-note">AI-generated portrait · Use Crow to return to the 360° scene.</p>';
 view.after(panel);
 const [crow,author]=tabs.querySelectorAll('button'),status=panel.querySelector('[role=status]'),img=panel.querySelector('img'),thumbs=panel.querySelector('.author-thumbs'),retry=panel.querySelector('button'),save=panel.querySelector('a');
 let source=null,images=[],controller=null,reference=null,mode='crow';
 let selectedReference=selectedAuthorPhoto();
 window.addEventListener('pageshow',()=>{const next=selectedAuthorPhoto();if(next!==selectedReference){selectedReference=next;reset()}});
 const directions=['Replace the crow with the reference person standing naturally in the scene, relaxed pose, facing the camera, three-quarter body composition.','Replace the crow with the same reference person in a candid walking pose, head turned toward the camera, a natural smile.','Replace the crow with the reference person in a travel portrait, looking toward the camera, casually gesturing toward the landmark.'];
 function select(index){img.src=images[index];img.hidden=false;save.href=images[index];save.download='sayyid-scene-'+(index+1)+'.jpg';save.hidden=false;Array.from(thumbs.children).forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));}
 function cancel(){controller?.abort();controller=null;}
 function setMode(next){mode=next;const active=next==='author';crow.setAttribute('aria-pressed',String(!active));author.setAttribute('aria-pressed',String(active));view.hidden=active;footer.hidden=active;panel.hidden=!active;eyebrow.textContent=active?'YOU, IN THIS PLACE':'YOUR CROW’S POINT OF VIEW';if(!active){cancel();getViewer()?.render();}}
 function reset(){cancel();source=getScene();images=[];reference=null;img.hidden=true;img.removeAttribute('src');thumbs.replaceChildren();save.hidden=true;retry.hidden=true;status.textContent='';setMode('crow');}
 function capture(){const viewer=getViewer();if(!viewer?.canvas)throw Error('Wait for the crow scene to load, then try Author again.');viewer.render();const canvas=document.createElement('canvas');canvas.width=Math.min(1024,viewer.canvas.width);canvas.height=Math.round(canvas.width*viewer.canvas.height/viewer.canvas.width);canvas.getContext('2d').drawImage(viewer.canvas,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.85);}
 async function generate(){
  if(controller||images.length===3)return;
  const current=source,job=new AbortController();controller=job;retry.hidden=true;
  try{const photo=await authorPhoto();
   for(let i=images.length;i<3;i++){
    if(job.signal.aborted||getScene()!==current)return;
    status.textContent=`Creating image ${i+1} of 3… Each image may take a minute or two.`;
    const timer=setTimeout(()=>job.abort(),195000);let result;
    try{result=await request('/api/portrait',{destination:current.spot,photo,sceneImage:reference,scene:directions[i]},job.signal)}finally{clearTimeout(timer)}
    if(job.signal.aborted||getScene()!==current)return;
    if(!/^data:image\/(jpeg|png|webp);base64,/.test(result.imageUrl||''))throw Error('The image service returned no usable image.');
    images.push(result.imageUrl);const button=document.createElement('button');button.type='button';button.setAttribute('aria-label',`Show image ${i+1}`);const thumb=new Image();thumb.src=result.imageUrl;thumb.alt=`Variation ${i+1}`;button.append(thumb);button.onclick=()=>select(i);thumbs.append(button);if(i===0)select(0);
   }
   status.textContent='Three scenes of you. Tap a thumbnail to switch.';
  }catch(error){if(getScene()===current)status.textContent=job.signal.aborted?'Generation stopped. You can continue the remaining images.':error.message}
  finally{if(controller===job){controller=null;retry.hidden=images.length===3||mode!=='author';}}
 }
 crow.onclick=()=>setMode('crow');
 author.onclick=()=>{if(getScene()!==source)reset();cancelJourney();try{if(!reference)reference=capture();setMode('author');generate();}catch(error){setMode('author');status.textContent=error.message;retry.hidden=false}};
 retry.onclick=()=>{if(!reference){setMode('crow');author.click()}else generate()};
 dialog.addEventListener('close',()=>{cancel();});
 return {open(){if(source!==getScene())reset();else setMode('crow');}};
}
