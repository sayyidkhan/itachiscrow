import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {proxyPlaceSearch} from '../worker/usage-limits.mjs';

const env={CROW_MAPS_KEY:'test-one',CROW_MAPS_FALLBACK_KEY:'test-two',CROW_MAPS_FALLBACK_KEY_2:'test-three'};
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
 assert.equal(browser({...env,CROW_MAPS_FALLBACK_KEY:'test-one',CROW_MAPS_FALLBACK_KEY_2:' test-one '}).api.retry(),false);
 const first=browser({...env,CROW_MAPS_FALLBACK_KEY_2:''});assert.equal(first.api.retry(),true);
 assert.equal(browser({...env,CROW_MAPS_FALLBACK_KEY_2:''},first.redirects[0]).api.retry(),false);
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
 await proxyPlaceSearch(request(),{...env,CROW_MAPS_FALLBACK_KEY:'test-one',CROW_MAPS_FALLBACK_KEY_2:' test-one '},1,{fetchImpl:async()=>{calls++;return new Response('',{status:403});}});
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
