import {defaultAuthorPhoto} from './author-reference.js';
const $ = id => document.getElementById(id);
const element = (tag, text, className) => { const e=document.createElement(tag);e.textContent=text;if(className)e.className=className;return e; };
const placeKey = context => JSON.stringify(context.spot || context.destination);
function link(label, url) {
  try { const parsed=new URL(url);if(parsed.protocol!=='https:')return element('span',label);const a=element('a',label);a.href=parsed.href;a.target='_blank';a.rel='noopener noreferrer';return a; } catch { return element('span',label); }
}

export function createTravelExperience({getContext, request, renderText, open, openSocial, fly}) {
  const stylesheet=document.createElement('link');stylesheet.rel='stylesheet';stylesheet.href='travel.css';document.head.append(stylesheet);
  const card=element('section','','traveller-card');
  card.innerHTML=`<p id="portrait-location">Choose a destination, then make a travel portrait.</p><label class="field-label" for="traveller-photo">YOUR PHOTO</label><input id="traveller-photo" type="file" accept="image/jpeg,image/png,image/webp"><img id="traveller-preview" alt="Your selected reference photo" hidden><label id="saved-photo-option" class="auto-scene" hidden><input id="use-saved-photo" type="checkbox" checked> Use my saved preview photo</label><p class="fine-print">Your photo is sent to OpenAI only when you ask to generate. Uploads stay in this tab until you leave.</p><button id="picture-me" class="primary full-width" disabled>Picture me here ↗</button><button id="remove-photo" hidden>Remove uploaded photo</button><p id="portrait-status" class="inline-status" role="status"></p><figure id="portrait-result" hidden><img id="travel-portrait" alt="AI-generated travel portrait"><figcaption>AI-generated · an imagined visit</figcaption><a id="portrait-download" download="my-imagined-trip.jpg">Save travel portrait ↓</a></figure>`;
  $('portrait-tools-body').append(card);
  const discovery=element('section','','traveller-card');
  discovery.innerHTML=`<span class="eyebrow">MAKE YOURSELF AT HOME</span><h3>Cafés & good finds</h3><p>Explore nearby cafés, then check the web for current offers.</p><button id="find-cafes" class="primary full-width">Find cafés & deals ↗</button><p id="cafe-status" class="inline-status" role="status"></p><div id="cafe-results" class="cafe-results"></div><p id="offer-status" class="inline-status" role="status"></p><div id="offer-summary" class="plan-result"></div><div id="offer-results" class="cafe-results"></div><div id="offer-sources" class="plan-sources"></div>`;
  $('panel-social').prepend(discovery);
  let config={}, photo=null, uploadSerial=0, portraitJob=null, discoveryJob=null, key=placeKey(getContext());
  function controls() { $('picture-me').disabled=!config.portrait||(!photo&&!($('use-saved-photo').checked&&config.savedPhoto))||Boolean(portraitJob); }
  function configure(value) { config=value;$('saved-photo-option').hidden=!config.savedPhoto;controls(); }
  function clearPortrait() { $('portrait-result').hidden=true;$('travel-portrait').removeAttribute('src');$('portrait-download').removeAttribute('href'); }
  function updateContext(context) {
    $('portrait-location').textContent=`Imagine visiting ${context.spot?.name||context.destination.name}.`;
    const next=placeKey(context);
    if(next===key)return;key=next;
    portraitJob?.abort();discoveryJob?.abort();portraitJob=null;discoveryJob=null;clearPortrait();
    for(const id of ['portrait-status','cafe-status','offer-status'])$(id).textContent='';
    for(const id of ['cafe-results','offer-summary','offer-results','offer-sources'])$(id).replaceChildren();
    $('find-cafes').disabled=false;controls();
  }
  function removePhoto() { uploadSerial++;portraitJob?.abort();portraitJob=null;photo=null;$('traveller-photo').value='';$('traveller-preview').removeAttribute('src');$('traveller-preview').hidden=true;$('remove-photo').hidden=true;$('portrait-status').textContent='';clearPortrait();controls(); }
  defaultAuthorPhoto().then(data=>{if(uploadSerial||photo)return;photo=data;$('traveller-preview').src=data;$('traveller-preview').hidden=false;controls()}).catch(error=>{$('portrait-status').textContent=error.message});
  $('remove-photo').onclick=removePhoto;
  $('use-saved-photo').onchange=()=>{portraitJob?.abort();portraitJob=null;clearPortrait();controls();};
  $('traveller-photo').onchange=async()=>{
    const file=$('traveller-photo').files[0];if(!file)return;
    removePhoto();const serial=uploadSerial;
    try {
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Choose a JPEG, PNG or WebP photo under 5 MB.');
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read this photo.'));reader.readAsDataURL(file);});
      const preview=new Image();preview.src=data;await preview.decode();
      if(serial!==uploadSerial)return;
      photo=data;$('traveller-preview').src=data;$('traveller-preview').hidden=false;$('remove-photo').hidden=false;$('portrait-status').textContent='Photo ready. Ask “picture me here” or use the button.';
    } catch(error) { if(serial===uploadSerial)$('portrait-status').textContent=error.message; }
    controls();
  };
  function job(signal) { const controller=new AbortController();const cancel=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',cancel,{once:true});return {controller,cleanup:()=>signal?.removeEventListener('abort',cancel)}; }
  async function portrait(signal) {
    open();$('portrait-tools').open=true;
    if(!config.portrait)throw Error('Image generation is currently unavailable.');
    if(!photo&&!($('use-saved-photo').checked&&config.savedPhoto))throw Error('Choose your photo in Explore before asking to picture yourself here.');
    if(portraitJob)return {status:'generating'};
    const {controller,cleanup}=job(signal);portraitJob=controller;controls();clearPortrait();
    const destination={...(getContext().spot||getContext().destination)};
    $('portrait-status').textContent='Creating your imagined visit… This may take a minute or two.';
    try {
      const result=await request('/api/portrait',{destination,...(photo?{photo}:{useSavedPhoto:true})},controller.signal);
      if(controller.signal.aborted||portraitJob!==controller)return {status:'cancelled'};
      if(!/^data:image\/(jpeg|png|webp);base64,/.test(result.imageUrl||''))throw Error('The service returned an invalid portrait.');
      $('travel-portrait').src=result.imageUrl;$('travel-portrait').alt=`AI-generated portrait of you visiting ${destination.name}`;$('portrait-download').href=result.imageUrl;$('portrait-result').hidden=false;
      $('portrait-status').textContent='Your imagined visit is ready.';$('portrait-result').scrollIntoView({block:'nearest',behavior:'smooth'});
      return {status:'generated',summary:`Your AI-generated portrait at ${destination.name} is displayed with a download link.`};
    } catch(error) { if(controller.signal.aborted)return {status:'cancelled'};$('portrait-status').textContent=error.message;throw error; }
    finally {cleanup();if(portraitJob===controller){if(controller.signal.aborted)$('portrait-status').textContent='Generation cancelled.';portraitJob=null;controls();}}
  }
  async function discover(extraRequest='Find cafés and current good-value offers nearby.',signal) {
    openSocial();
    if(discoveryJob)return {status:'searching'};
    const {controller,cleanup}=job(signal);discoveryJob=controller;
    const current=()=>discoveryJob===controller&&!controller.signal.aborted;
    const destination={...(getContext().spot||getContext().destination)};
    $('find-cafes').disabled=true;$('cafe-status').textContent='Finding cafés on Google Maps…';$('offer-status').textContent=config.discovery?'Checking current web sources…':'Offer research is unavailable. Google results can still load.';
    for(const id of ['cafe-results','offer-summary','offer-results','offer-sources'])$(id).replaceChildren();
    try {
      const results=await Promise.allSettled([
        (async()=>{
          const cafes=await window.CrowMap.searchCafes();if(!current())return [];
          for(const cafe of cafes){
            const item=element('article','','cafe-card');
            if(cafe.photo?.url){const imageLink=link('',cafe.photo.url);if(imageLink.href){const img=element('img','');img.src=imageLink.href;img.alt=cafe.name;img.loading='lazy';item.append(img);}}
            item.append(element('h4',cafe.name),element('p',cafe.address||''));
            if(Number.isFinite(cafe.rating))item.append(element('p',`★ ${cafe.rating} · ${cafe.ratingCount||0} Google reviews`));
            item.append(link('Photos & reviews on Google Maps ↗',cafe.mapsUrl||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cafe.name)}&query_place_id=${encodeURIComponent(cafe.id||'')}`));
            for(const author of cafe.photo?.authors||[])item.append(link(`Photo: ${author.displayName||'Google contributor'}`,author.uri));
            const go=element('button','Fly here ↗');go.onclick=()=>fly(cafe).catch(error=>{$('cafe-status').textContent=error.message;});item.append(go);$('cafe-results').append(item);
          }
          $('cafe-status').textContent=cafes.length?`${cafes.length} cafés · Google Maps`:'No cafés returned. Try a nearby landmark.';
          return cafes.map(({name,address,rating,mapsUrl})=>({name,address,rating,mapsUrl}));
        })(),
        (async()=>{
          if(!config.discovery)return null;
          const result=await request('/api/discover',{destination,request:extraRequest},controller.signal);if(!current())return null;
          renderText(result.summary,$('offer-summary'));
          $('offer-status').textContent=`${result.offers.length?`${result.offers.length} sourced offers`:'No current promotions verified'} · Checked ${new Date(result.checkedAt).toLocaleString()}`;
          for(const offer of result.offers){const item=element('article','','cafe-card');item.append(element('h4',offer.venue),element('p',offer.offer),element('p',offer.conditions),element('p',`Valid until ${offer.validUntil} · Confirm with venue`),link('Check offer & terms ↗',offer.sourceUrl));$('offer-results').append(item);}
          for(const source of result.sources||[])$('offer-sources').append(link(source.title,source.url));
          return result;
        })()
      ]);
      if(!current())return {status:'cancelled'};
      if(results[0].status==='rejected')$('cafe-status').textContent=results[0].reason.message;
      if(results[1].status==='rejected')$('offer-status').textContent=results[1].reason.message;
      const cafes=results[0].status==='fulfilled'?results[0].value:[];
      const offers=results[1].status==='fulfilled'?results[1].value:null;
      return {status:results.every(r=>r.status==='fulfilled')?'completed':'partial',cafes,summary:offers?.summary||$('offer-status').textContent,offers:offers?.offers||[],sources:offers?.sources||[]};
    } finally {cleanup();if(discoveryJob===controller){if(controller.signal.aborted)$('offer-status').textContent='Search cancelled.';discoveryJob=null;$('find-cafes').disabled=false;}}
  }
  $('picture-me').onclick=()=>portrait().catch(error=>{$('portrait-status').textContent=error.message;});
  $('find-cafes').onclick=()=>discover().catch(error=>{$('cafe-status').textContent=error.message;});
  window.addEventListener('pagehide',()=>{portraitJob?.abort();discoveryJob?.abort();photo=null;});
  updateContext(getContext());
  return {configure,updateContext,portrait,discover};
}
