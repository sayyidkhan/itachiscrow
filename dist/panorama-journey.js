export function createPanoramaJourney({ getScene, getContext, request, commit }) {
  const parent=document.getElementById('panorama-dialog');
  const view=document.getElementById('panorama-view');
  const confirmation=document.createElement('dialog');
  confirmation.id='panorama-confirm';
  confirmation.setAttribute('aria-labelledby','panorama-confirm-title');
  confirmation.innerHTML=`<span class="eyebrow">FOLLOW YOUR CURIOSITY</span><h2 id="panorama-confirm-title">Explore this spot?</h2><img id="panorama-target" alt="Your selected spot is marked with a mint circle"><p>Fly closer to the marked spot. GPT will imagine a new 360° view, keeping this scene as its reference.</p><p class="fine-print">An imagined continuation, not a verified location. Generation may take a minute or two.</p><div class="pano-confirm-actions"><button id="panorama-stay" autofocus>Stay here</button><button id="panorama-go" class="primary">Explore this spot ↗</button></div>`;
  const message=document.createElement('p');message.id='panorama-journey-message';message.setAttribute('role','status');
  parent.querySelector('.panorama-footer').after(message);
  document.body.append(confirmation);
  let selection=null,controller=null,timer=null,overlay=null;
  const clear=()=>{
    clearTimeout(timer);timer=null;overlay?.remove();overlay=null;
    view.classList.remove('pano-travelling');view.removeAttribute('aria-busy');
  };
  function cancel(){
    controller?.abort();controller=null;selection=null;clear();
    if(confirmation.open)confirmation.close();
  }
  function select(target){
    if(controller||confirmation.open||!parent.open||!getScene())return;
    selection={...target,scene:getScene(),context:structuredClone(getContext())};
    confirmation.querySelector('img').src=target.viewImage;
    message.textContent='';confirmation.showModal();
  }
  confirmation.querySelector('#panorama-stay').onclick=()=>confirmation.close();
  confirmation.addEventListener('close',()=>{if(!confirmation.open){selection=null;if(!controller)view.querySelector('canvas')?.focus();}});
  confirmation.querySelector('#panorama-go').onclick=async()=>{
    if(!selection||controller)return;
    const target=selection;confirmation.close();
    const current=new AbortController();controller=current;
    const deadline=setTimeout(()=>current.abort('timeout'),190000);
    view.style.setProperty('--pano-target',`${target.x*100}% ${target.y*100}%`);
    view.classList.add('pano-travelling');view.setAttribute('aria-busy','true');
    overlay=document.createElement('div');overlay.className='pano-loading';
    overlay.innerHTML=`<div class="pano-rings" aria-hidden="true"><i></i><i></i><span>↗</span></div><span class="eyebrow">A LITTLE FURTHER</span><h3>Flying towards your next view</h3><p role="status">GPT is imagining what’s waiting there…</p><button type="button">Cancel journey</button>`;
    overlay.querySelector('button').onclick=()=>{cancel();message.textContent='Journey cancelled. Your current scene is still here.';view.querySelector('canvas')?.focus();};
    view.append(overlay);overlay.querySelector('button').focus();
    timer=setTimeout(()=>{if(overlay)overlay.querySelector('p').textContent='Still creating the details. You can stay here or cancel.';},25000);
    try{
      const result=await request('/api/panorama/explore',{
        destination:target.context.destination,spot:target.scene.spot,
        sourceImage:target.scene.imageUrl,viewImage:target.viewImage,
        selection:{x:target.x,y:target.y,yaw:target.yaw,pitch:target.pitch},
      },current.signal);
      if(controller!==current||current.signal.aborted||getScene()!==target.scene||!parent.open)return;
      if(!/^data:image\/(jpeg|png|webp);base64,/.test(result.imageUrl||''))throw Error('The next view could not be loaded. Please try again.');
      const image=new Image();image.src=result.imageUrl;await image.decode();
      if(controller!==current||current.signal.aborted||getScene()!==target.scene||!parent.open)return;
      clear();await commit({...result,spot:target.scene.spot});
      message.textContent='You’ve arrived at a new imagined view. Tap another spot to continue.';
      view.querySelector('canvas')?.focus();
    }catch(error){
      if(controller===current)message.textContent=current.signal.aborted?'The journey timed out. Your current scene is still here; try again.':`${error.message} Your current scene is still here. Tap a spot to retry.`;
    }finally{clearTimeout(deadline);if(controller===current){controller=null;clear();}}
  };
  parent.addEventListener('close',()=>{cancel();message.textContent='';});
  return {select,cancel};
}
