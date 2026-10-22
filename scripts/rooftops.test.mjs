import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../dist/rooftops.js',import.meta.url),'utf8');
const origin={name:'Your location',lat:0,lng:0},point=(x,y)=>({lat:y/111320,lon:x/111320});
const ring=(x,y,w=20,h=20)=>[point(x,y),point(x+w,y),point(x+w,y+h),point(x,y+h),point(x,y)];
const building=(geometry,tags={})=>({type:'way',tags:{building:'yes',...tags},geometry});
const data=(...elements)=>({elements});
function helper(fetch=async()=>({ok:true,text:async()=>JSON.stringify(data())}),timers={setTimeout,clearTimeout}){
 const window={};vm.runInNewContext(source,{window,fetch,AbortController,...timers});return window.CrowRooftops;
}
const xy=p=>({x:p.lng*111320,y:p.lat*111320});

test('starts on the nearest roof rather than the tallest or first returned building',()=>{
 const roof=helper().nearest(origin,data(building(ring(80,0),{name:'Far tower',height:'100'}),building(ring(15,-10),{name:'Nearest roof'})));
 assert.equal(roof.building,'Nearest roof');assert.equal(roof.perch,'rooftop');
 assert(xy(roof).x>=16.5&&xy(roof).x<=25.1);assert(Math.abs(xy(roof).y)<.1);
});
test('keeps a starting location already safely on a roof',()=>{
 const roof=helper().nearest(origin,data(building(ring(-20,-20,40,40))));
 assert.equal(roof.lat,0);assert.equal(roof.lng,0);
});
test('concave buildings and courtyard holes never use an empty centroid',()=>{
 const outer=ring(-30,-30,60,60),hole=ring(-15,-15,30,30);
 const roof=helper().nearest(origin,data({type:'relation',tags:{building:'yes'},members:[{role:'outer',geometry:outer},{role:'inner',geometry:hole}]}));
 const p=xy(roof);assert(Math.abs(p.x)>16.4||Math.abs(p.y)>16.4);assert(Math.abs(p.x)<28.6&&Math.abs(p.y)<28.6);
 const l=[point(10,10),point(60,10),point(60,20),point(20,20),point(20,60),point(10,60),point(10,10)];
 const q=xy(helper().nearest(origin,data(building(l))));
 assert(q.x<20||q.y<20);assert(q.x>11.4&&q.y>11.4);
});
test('raw OSM nodes and split relation outlines resolve into a roof',()=>{
 const geometry=ring(15,-10),nodes=geometry.slice(0,-1).map((p,i)=>({type:'node',id:i+1,...p}));
 const roof=helper().nearest(origin,data(...nodes,{type:'way',id:10,nodes:[1,2,3]},{type:'way',id:11,nodes:[1,4,3]},
  {type:'relation',tags:{building:'yes'},members:[{type:'way',ref:10,role:'outer'},{type:'way',ref:11,role:'outer'}]}));
 assert(roof);assert(xy(roof).x>16.4);
});
test('no nearby building, unfinished buildings and invalid geometry fall back without inventing a roof',()=>{
 for(const d of [null,data(),data(building(ring(300,0))),data(building(ring(5,5),{building:'construction'})),data(building(ring(5,5),{location:'underground'})),data(building([point(1,1),point(2,2)])),data(building([{},null,{}]))])assert.equal(helper().nearest(origin,d),null);
 assert.equal(helper().nearest({lat:NaN,lng:0},data(building(ring(1,1)))),null);
});
test('longitude wrapping finds a roof across the date line',()=>{
 const place={...origin,lng:179.9999},geometry=ring(20,-10).map(p=>({...p,lon:((place.lng+p.lon+540)%360)-180}));
 const roof=helper().nearest(place,data(building(geometry)));assert(roof);assert(roof.lng<0);
});
test('lookup uses an anonymous rounded area, falls back to OSM and reuses only session data',async()=>{
 const calls=[],raw=data(building(ring(15,-10)));
 const api=helper(async(url,options)=>{calls.push({url,options});return calls.length===1?{ok:false}:{ok:true,text:async()=>JSON.stringify(raw)};});
 const location={...origin,lat:.00001234,lng:.00005678};
 assert(await api.find(location));assert(await api.find(location));assert.equal(calls.length,2);
 assert(calls[1].url.startsWith('https://api.openstreetmap.org/api/0.6/map.json?bbox='));
 assert(!calls[0].url.includes('1234'));assert(!calls[0].url.includes('5678'));
 assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.referrerPolicy,'no-referrer');
 assert.equal(calls[0].options.signal.aborted,false);
});
test('provider failures, malformed data and timeouts settle safely',async()=>{
 for(const fetch of [async()=>{throw Error('offline');},async()=>({ok:true,text:async()=>'{invalid'}),async()=>({ok:true,text:async()=>'{}'}),async()=>({ok:true,text:async()=>'x'.repeat(4000001)})])assert.equal(await helper(fetch).find(origin),null);
 const timers=new Map();let id=0;
 const api=helper((_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout')))),{setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(id){timers.delete(id);}});
 const pending=api.find(origin);timers.values().next().value();await new Promise(resolve=>setImmediate(resolve));timers.values().next().value();
 assert.equal(await pending,null);assert.equal(timers.size,0);
});
