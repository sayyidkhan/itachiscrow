import {defaultAuthorPhoto} from './author-reference.js';
const $=id=>document.getElementById(id);
let place=null, controller=null;
try{place=JSON.parse(localStorage.getItem('crow:author-destination'))}catch{}
$('destination').value=place?.name||'Eiffel Tower, Paris, France';
if(!place)$('place-note').textContent='Enter a landmark, neighbourhood, or city.';
const scenes={'Landmark portrait':'Waist-up travel portrait near the landmark, natural daylight, clear facial detail, landmark visible behind the person.','Café stop':'A candid seated portrait at a nearby outdoor café, destination visible in the surroundings, relaxed pose, natural facial expression.','Evening walk':'A cinematic evening walk near the landmark, three-quarter body framing, warm city lights, face clearly illuminated and recognisable.'};
$('cancel').onclick=()=>controller?.abort();
$('author-form').onsubmit=async event=>{
 event.preventDefault();if(controller)return;
 const name=$('destination').value.trim();if(!name)return;
 const selected=document.querySelector('input[name="scene"]:checked').value;
 const scene=scenes[selected]+' '+$('direction').value.trim();
 const destination={name,...(place?.name===name?{lat:place.lat,lng:place.lng}:{})};
 const job=new AbortController();controller=job;const timeout=setTimeout(()=>job.abort('timeout'),200000);
 $('generate').disabled=true;$('cancel').hidden=false;$('status').className='';$('status').textContent='Creating your scene… This can take a minute or two.';
 try{
  const photo=await defaultAuthorPhoto();
  const response=await fetch('/api/portrait',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({destination,photo,scene}),signal:job.signal});
  const result=await response.json();if(!response.ok)throw Error(result.error?.message||result.message||'Could not generate this scene. Try again.');
  if(job.signal.aborted)return;
  if(!/^data:image\/(jpeg|png|webp);base64,/.test(result.imageUrl||''))throw Error('No image returned. Please try again.');
  const figure=document.createElement('figure'),img=new Image(),caption=document.createElement('figcaption'),text=document.createElement('div'),heading=document.createElement('h3'),note=document.createElement('small'),download=document.createElement('a');
  img.src=result.imageUrl;img.alt=`AI-generated ${selected.toLowerCase()} of Sayyid Khan at ${name}`;heading.textContent=name;note.textContent=selected+' · AI-generated';text.append(heading,note);download.href=result.imageUrl;download.download='sayyid-travel-'+Date.now()+'.jpg';download.textContent='Save image ↓';download.className='download';caption.append(text,download);figure.append(img,caption);$('gallery').prepend(figure);while($('gallery').children.length>6)$('gallery').lastElementChild.remove();$('empty').hidden=true;
  $('status').textContent='Your scene is ready. Generate again for a new variation. Save images before leaving this page.';$('generate').textContent='Generate another variation ↗';
 }catch(error){$('status').className='error';$('status').textContent=job.signal.aborted?(job.signal.reason==='timeout'?'Generation took too long. Try again.':'Generation cancelled.'):error.message}
 finally{clearTimeout(timeout);controller=null;$('generate').disabled=false;$('cancel').hidden=true}
};
window.addEventListener('pagehide',()=>controller?.abort());
