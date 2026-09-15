export const usagePolicies={chat:[12,120],search:[20,100],map:[4,10],image:[6,24],voice:[3,12],research:[3,20]};
export function mapKeyEntries(env){
 const numbered=Object.fromEntries(Object.entries(env).filter(([name,value])=>/^CROW_MAPS_KEY[1-9]\d*$/.test(name)&&typeof value==='string'));
 const aliases=['CROW_MAPS_KEY','CROW_MAPS_FALLBACK_KEY','CROW_MAPS_FALLBACK_KEY_2'];
 aliases.forEach((name,i)=>{if(!Object.hasOwn(numbered,'CROW_MAPS_KEY'+(i+1)))numbered['CROW_MAPS_KEY'+(i+1)]=env[name]||'';});
 return Object.entries(numbered).sort(([a],[b])=>Number(a.slice(13))-Number(b.slice(13))).map(([name,key])=>({name,slot:['primary','backup','backup2'][Number(name.slice(13))-1]||'key'+name.slice(13),key:key.trim()})).filter((entry,i,all)=>entry.key&&all.findIndex(other=>other.key===entry.key)===i);
}
export function mapBrowserConfig(env){
 const entries=mapKeyEntries(env);
 const config=entries.map(({name,key})=>`window.${name}=${JSON.stringify(key)};`).join('');
 return config+['CROW_MAPS_KEY','CROW_MAPS_FALLBACK_KEY','CROW_MAPS_FALLBACK_KEY_2'].map((name,i)=>`window.${name}=${JSON.stringify(entries.find(entry=>entry.name==='CROW_MAPS_KEY'+(i+1))?.key||'')};`).join('');
}
export function usageGroup(path){return path==='/api/chat'?'chat':path==='/api/places/search'?'search':path==='/api/map-session'?'map':path==='/api/live/session'?'voice':path==='/api/portrait'||path.startsWith('/api/panorama')?'image':path==='/api/plan'||path==='/api/discover'||path==='/api/recommendations'?'research':null;}
export const usageSQL=`INSERT INTO usage_limits(id,minute,minute_count,hour,hour_count,expires) VALUES(?,?,1,?,1,?)
ON CONFLICT(id) DO UPDATE SET minute=excluded.minute,minute_count=CASE WHEN usage_limits.minute=excluded.minute THEN usage_limits.minute_count+1 ELSE 1 END,hour=excluded.hour,hour_count=CASE WHEN usage_limits.hour=excluded.hour THEN usage_limits.hour_count+1 ELSE 1 END,expires=excluded.expires
WHERE (usage_limits.minute<>excluded.minute OR usage_limits.minute_count<?) AND (usage_limits.hour<>excluded.hour OR usage_limits.hour_count<?)
RETURNING minute_count,hour_count`;
export async function enforceUsage(request,db,group,now=Date.now()){
 if(!db)throw Error('Usage limits unavailable');
 const minute=Math.floor(now/60000),hour=Math.floor(now/3600000),day=Math.floor(now/86400000);
 const raw=group+':'+day+':'+(request.headers.get('cf-connecting-ip')||'unknown');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));const id=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 const [perMinute,perHour]=usagePolicies[group];
 const row=await db.prepare(usageSQL).bind(id,minute,hour,now+86400000,perMinute,perHour).first();
 if(row)return {allowed:true,turn:row.hour_count};
 const current=await db.prepare('SELECT hour,hour_count FROM usage_limits WHERE id=?').bind(id).first();
 const until=current?.hour===hour&&current.hour_count>=perHour?(hour+1)*3600000:(minute+1)*60000;
 return {allowed:false,retryAfter:Math.max(1,Math.ceil((until-now)/1000))};
}
function googleErrorCategory(status){
 if(status===401||status===403)return 'authentication_or_restriction';
 if(status===429)return 'quota_or_rate_limit';
 if(status>=500)return 'provider_unavailable';
 return 'provider_rejected_request';
}
function reportPlaceDiagnostic(onDiagnostic,detail){
 try{onDiagnostic?.({route:'/api/places/search',...detail});}catch{}
}
export async function proxyPlaceSearch(request,env,turn,{fetchImpl=fetch,onDiagnostic}={}){
 if(Number(request.headers.get('content-length'))>4096)return Response.json({error:{message:'Search request is too large.'}},{status:413});
 const reader=request.body?.getReader();if(!reader)return Response.json({error:{message:'Enter a search.'}},{status:400});
 let bytes=0,chunks=[];while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>4096){await reader.cancel();return Response.json({error:{message:'Search request is too large.'}},{status:413})}chunks.push(value)}
 let input;try{const data=new Uint8Array(bytes);let i=0;for(const chunk of chunks){data.set(chunk,i);i+=chunk.length}input=JSON.parse(new TextDecoder().decode(data))}catch{return Response.json({error:{message:'Invalid search request.'}},{status:400})}
 if(typeof input.textQuery!=='string'||!input.textQuery.trim()||input.textQuery.length>250)return Response.json({error:{message:'Enter a place name under 250 characters.'}},{status:400});
 const body={textQuery:input.textQuery,pageSize:6};if(input.includedType==='cafe')body.includedType='cafe';
 const circle=input.locationBias?.circle;if(circle&&Number.isFinite(circle.center?.latitude)&&Number.isFinite(circle.center?.longitude)&&Math.abs(circle.center.latitude)<=90&&Math.abs(circle.center.longitude)<=180)body.locationBias={circle:{center:circle.center,radius:2000}};
 let lastDiagnostic={googleErrorCategory:'unknown'};
 const diagnose=detail=>{lastDiagnostic=detail;reportPlaceDiagnostic(onDiagnostic,detail)};
 const entries=mapKeyEntries(env);
 if(!entries.length){diagnose({providerReached:false,googleErrorCategory:'missing_configuration',httpStatus:null});return Response.json({error:{message:'Place search is temporarily unavailable. Try again shortly.'}},{status:503,headers:{'Retry-After':'30','X-Places-Diagnostic':lastDiagnostic.googleErrorCategory}})}
 const start=(Math.max(1,Number(turn)||1)-1)%entries.length,keys=entries.slice(start).concat(entries.slice(0,start));
 const deadline=Date.now()+45000;
 for(const [index,{key,slot}] of keys.entries()){if(Date.now()>=deadline)break;try{
 const response=await fetchImpl('https://places.googleapis.com/v1/places:searchText',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.photos',Referer:env.PUBLIC_ORIGIN||'https://itachis-crow.promptalchemistlabs.chatgpt.site/'},body:JSON.stringify(body),signal:AbortSignal.timeout(Math.max(1,Math.min(15000,deadline-Date.now()))),redirect:'error'});
 if(response.ok){diagnose({providerReached:true,googleErrorCategory:'ok',httpStatus:response.status,attempt:index+1});return Response.json({...await response.json(),photoKeySlot:slot},{headers:{'Cache-Control':'no-store'}});}
 diagnose({providerReached:true,googleErrorCategory:googleErrorCategory(response.status),httpStatus:response.status,attempt:index+1});
 if(![401,403,429,500,502,503,504].includes(response.status))break;
 }catch{diagnose({providerReached:false,googleErrorCategory:'network_or_timeout',httpStatus:null,attempt:index+1});}}
 return Response.json({error:{message:'Place search is temporarily unavailable. Try again shortly.'}},{status:503,headers:{'Retry-After':'30','X-Places-Diagnostic':lastDiagnostic.googleErrorCategory}});
}
