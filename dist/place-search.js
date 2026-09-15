/* Search limits and credential rotation are enforced by the server. */
window.CrowPlaceSearch={async search(Place,options){
 const body={textQuery:options.textQuery,includedType:options.includedType};
 if(options.locationBias){const {center,radius}=options.locationBias;body.locationBias={circle:{center:{latitude:center.lat,longitude:center.lng},radius}}}
 const response=await fetch('/api/places/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(50000)});
 const data=await response.json();if(!response.ok)throw Error(data.error?.message||'Place search is unavailable.');
 const photoKey={primary:window.CROW_MAPS_KEY,backup:window.CROW_MAPS_FALLBACK_KEY,backup2:window.CROW_MAPS_FALLBACK_KEY_2}[data.photoKeySlot]||window.CROW_MAPS_KEY;
 return {places:(data.places||[]).filter(p=>p.location).map(p=>({...p,displayName:p.displayName?.text||'Place',location:{lat:p.location.latitude,lng:p.location.longitude},googleMapsURI:p.googleMapsUri,photos:(p.photos||[]).map(photo=>({authorAttributions:photo.authorAttributions||[],getURI({maxWidth=480}={}){return 'https://places.googleapis.com/v1/'+photo.name+'/media?maxWidthPx='+Math.min(4800,Math.max(1,maxWidth))+'&key='+encodeURIComponent(photoKey)}}))}))};
}};
