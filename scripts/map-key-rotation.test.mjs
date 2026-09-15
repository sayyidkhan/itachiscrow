import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {proxyPlaceSearch,mapKeyEntries,mapBrowserConfig} from '../worker/usage-limits.mjs';

const env={CROW_MAPS_KEY1:'test-one',CROW_MAPS_KEY2:'test-two',CROW_MAPS_KEY3:'test-three'};
const source=readFileSync(new URL('../dist/map-keys.js',import.meta.url),'utf8');
function browser(keys=env,href='https://crow.example/explore.html',storage=new Map()){
 const window={...keys},redirects=[];
 runInNewContext(source,{window,URL,location:{href,replace:url=>redirects.push(url)},localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},document:{querySelector:()=>null}});
 return {api:window.CrowMapKeys,redirects};
}
const request=()=>new Request('https://crow.example/api/places/search',{method:'POST',body:JSON.stringify({textQuery:'Singapore'})});

test('browser rotates three keys across visits and exhausts each key once on failure',()=>{
 const storage=new Map();
 assert.deepEqual(Array.from({length:6},()=>browser(env,undefined,storage).api.key),['test-one','test-two','test-three','test-one','test-two','test-three']);
 for(const slot of ['primary','backup','backup2']){
  let href='https://crow.example/explore.html?mapsKey='+slot;
  const seen=[];
  for(let attempt=0;attempt<3;attempt++){
   const page=browser(env,href);seen.push(page.api.key);
   assert.equal(page.api.retry(),attempt<2);
   if(attempt<2){assert.equal(page.api.retry(),true);assert.equal(page.redirects.length,1);href=page.redirects[0];}
  }
  assert.equal(new Set(seen).size,3);
 }
});

test('browser handles missing, duplicate and two-key configurations without loops',()=>{
 assert.equal(browser({}).api.retry(),false);
 assert.equal(browser({...env,CROW_MAPS_KEY2:'test-one',CROW_MAPS_KEY3:' test-one '}).api.retry(),false);
 const first=browser({...env,CROW_MAPS_KEY3:''});assert.equal(first.api.retry(),true);
 assert.equal(browser({...env,CROW_MAPS_KEY3:''},first.redirects[0]).api.retry(),false);
 assert.equal(browser(env,'https://crow.example/?mapsRetry=NaN').api.retry(),false);
});

test('Places rotates first attempts and uses the matching photo key slot',async()=>{
 const used=[];
 for(let turn=1;turn<=6;turn++){
  const result=await proxyPlaceSearch(request(),env,turn,{fetchImpl:async(url,options)=>{used.push(options.headers['X-Goog-Api-Key']);return Response.json({places:[]});}});
  assert.equal((await result.json()).photoKeySlot,['primary','backup','backup2'][(turn-1)%3]);
 }
 assert.deepEqual(used,['test-one','test-two','test-three','test-one','test-two','test-three']);
});

test('Places retries each distinct key once and keeps diagnostics redacted',async()=>{
 const used=[],diagnostics=[];
 const result=await proxyPlaceSearch(request(),env,2,{onDiagnostic:entry=>diagnostics.push(entry),fetchImpl:async(url,options)=>{used.push(options.headers['X-Goog-Api-Key']);return new Response('',{status:403});}});
 assert.equal(result.status,503);assert.deepEqual(used,['test-two','test-three','test-one']);
 for(const key of Object.values(env))assert.equal(JSON.stringify(diagnostics).includes(key),false);
 let calls=0;
 await proxyPlaceSearch(request(),{...env,CROW_MAPS_KEY2:'test-one',CROW_MAPS_KEY3:' test-one '},1,{fetchImpl:async()=>{calls++;return new Response('',{status:403});}});
 assert.equal(calls,1);
 calls=0;
 await proxyPlaceSearch(request(),env,1,{fetchImpl:async()=>{calls++;return new Response('',{status:400});}});
 assert.equal(calls,1);
});

test('place photo URLs use the third credential when the third slot succeeds',async()=>{
 const window={...env};
 runInNewContext(readFileSync(new URL('../dist/place-search.js',import.meta.url),'utf8'),{window,AbortSignal,fetch:async()=>Response.json({photoKeySlot:'backup2',places:[{location:{latitude:1,longitude:2},photos:[{name:'places/test/photos/test'}]}]})});
 const result=await window.CrowPlaceSearch.search(null,{textQuery:'Singapore'});
 assert.equal(new URL(result.places[0].photos[0].getURI({})).searchParams.get('key'),'test-three');
});

test('Places falls back to the browser only when the hosted Worker cannot reach Google',async()=>{
 const window={...env,CrowMapKeys:{nextSearchKeys:()=>['test-two','test-three']}};
 const calls=[];
 runInNewContext(readFileSync(new URL('../dist/place-search.js',import.meta.url),'utf8'),{window,AbortSignal,fetch:async(url,options)=>{
  calls.push([url,options.headers['X-Goog-Api-Key']]);
  if(url==='/api/places/search')return Response.json({error:{message:'temporary'}},{status:503,headers:{'X-Places-Diagnostic':'network_or_timeout'}});
  return Response.json({places:[{location:{latitude:1,longitude:2},photos:[{name:'places/test/photos/test'}]}]});
 }});
 const result=await window.CrowPlaceSearch.search(null,{textQuery:'Singapore'});
 assert.deepEqual(calls,[['/api/places/search',undefined],['https://places.googleapis.com/v1/places:searchText','test-two']]);
 assert.equal(new URL(result.places[0].photos[0].getURI({})).searchParams.get('key'),'test-two');
});

test('numbered keys sort numerically, allow gaps, and override legacy slots',async()=>{
 const keys={CROW_MAPS_KEY10:'test-ten',CROW_MAPS_KEY2:'test-two',CROW_MAPS_KEY1:'test-one',CROW_MAPS_KEY4:'test-four',CROW_MAPS_KEY5:' test-four ',CROW_MAPS_KEY:'old-one',CROW_MAPS_FALLBACK_KEY:'old-two',OPENAI_API_KEY:'private-test-value'};
 assert.deepEqual(mapKeyEntries(keys).map(entry=>entry.key),['test-one','test-two','test-four','test-ten']);
 const storage=new Map();
 assert.deepEqual(Array.from({length:5},()=>browser(keys,undefined,storage).api.key),['test-one','test-two','test-four','test-ten','test-one']);
 const used=[];
 for(let turn=1;turn<=4;turn++)await proxyPlaceSearch(request(),keys,turn,{fetchImpl:async(url,options)=>{used.push(options.headers['X-Goog-Api-Key']);return Response.json({places:[]});}});
 assert.deepEqual(used,['test-one','test-two','test-four','test-ten']);
 let href='https://crow.example/?mapsKey=key10';
 const seen=[];
 for(let i=0;i<4;i++){const page=browser(keys,href);seen.push(page.api.key);assert.equal(page.api.retry(),i<3);href=page.redirects[0];}
 assert.equal(new Set(seen).size,4);
 assert.equal(browser(keys).api.photoKey('key10'),'test-ten');
 const config=mapBrowserConfig(keys),window={};runInNewContext(config,{window});
 assert.equal(window.CROW_MAPS_KEY10,'test-ten');assert.equal(window.CROW_MAPS_KEY,'test-one');
 assert.equal(config.includes('private-test-value'),false);
 assert.equal(browser(window).api.photoKey('key10'),'test-ten');
});

test('legacy configurations and explicitly blank numbered keys remain supported',()=>{
 const legacy={CROW_MAPS_KEY:'old-one',CROW_MAPS_FALLBACK_KEY:'old-two',CROW_MAPS_FALLBACK_KEY_2:'old-three'};
 assert.deepEqual(mapKeyEntries(legacy).map(entry=>entry.key),['old-one','old-two','old-three']);
 assert.equal(browser(legacy).api.key,'old-one');
 const mixed={...legacy,CROW_MAPS_KEY1:'',CROW_MAPS_KEY2:'new-two'};
 assert.deepEqual(mapKeyEntries(mixed).map(entry=>entry.key),['new-two','old-three']);
 assert.equal(browser(mixed).api.key,'new-two');
});
