/* Search limits are enforced by the server. If a hosted Worker cannot reach Google,
   the restricted browser key provides a same-feature fallback from the public origin. */
async function browserPlacesFallback(body){
 const keys=window.CrowMapKeys?.nextSearchKeys?.()||[window.CROW_MAPS_KEY1||window.CROW_MAPS_KEY,window.CROW_MAPS_KEY2||window.CROW_MAPS_FALLBACK_KEY,window.CROW_MAPS_KEY3||window.CROW_MAPS_FALLBACK_KEY_2].filter(Boolean);
 let lastError;
 for(const key of keys){
  try{
   const response=await fetch('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.photos'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   if(response.ok)return {...await response.json(),photoKey:key};
   lastError=Error('Place search is unavailable.');
   if(![401,403,429,500,502,503,504].includes(response.status))break;
  }catch{lastError=Error('Place search is unavailable.');}
 }
 throw lastError||Error('Place search is unavailable.');
}
window.CrowPlaceSearch={async search(Place,options){
 const body={textQuery:options.textQuery,includedType:options.includedType};
 if(options.locationBias){const {center,radius}=options.locationBias;body.locationBias={circle:{center:{latitude:center.lat,longitude:center.lng},radius}}}
 const response=await fetch('/api/places/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(50000)});
 let data=await response.json();if(!response.ok){if(response.headers.get('X-Places-Diagnostic')==='network_or_timeout')data=await browserPlacesFallback(body);else throw Error(data.error?.message||'Place search is unavailable.');}
 const photoKey=data.photoKey||window.CrowMapKeys?.photoKey(data.photoKeySlot)||{primary:window.CROW_MAPS_KEY1||window.CROW_MAPS_KEY,backup:window.CROW_MAPS_KEY2||window.CROW_MAPS_FALLBACK_KEY,backup2:window.CROW_MAPS_KEY3||window.CROW_MAPS_FALLBACK_KEY_2}[data.photoKeySlot];
 return {places:(data.places||[]).filter(p=>p.location).map(p=>({...p,displayName:p.displayName?.text||'Place',location:{lat:p.location.latitude,lng:p.location.longitude},googleMapsURI:p.googleMapsUri,photos:(p.photos||[]).map(photo=>({authorAttributions:photo.authorAttributions||[],getURI({maxWidth=480}={}){return 'https://places.googleapis.com/v1/'+photo.name+'/media?maxWidthPx='+Math.min(4800,Math.max(1,maxWidth))+'&key='+encodeURIComponent(photoKey)}}))}))};
}};
