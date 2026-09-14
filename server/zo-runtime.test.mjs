import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startZoRuntime } from './zo-runtime.mjs';

async function start(t,options={}){
 const server=await startZoRuntime({port:0,host:'127.0.0.1',databasePath:':memory:',...options,env:{PUBLIC_ORIGIN:'https://crow.example',...options.env}});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 return `http://127.0.0.1:${server.address().port}`;
}

function headers(){return {Origin:'https://crow.example','X-Forwarded-Host':'crow.example','Content-Type':'application/json'};}

test('Zo runtime mirrors protected map and configuration contracts with persistent SQLite admission',async t=>{
 const base=await start(t);
 const config=await fetch(base+'/config.js');
 assert.equal(await config.text(),'window.CROW_MAPS_KEY="";window.CROW_MAPS_FALLBACK_KEY="";');
 const allowed=await fetch(base+'/api/map-session',{method:'POST',headers:headers()});
 assert.deepEqual(await allowed.json(),{allowed:true});
 const rejected=await fetch(base+'/api/map-session',{method:'POST',headers:{...headers(),Origin:'https://other.example'}});
 assert.equal(rejected.status,403);
});

test('Zo runtime emits redacted Places diagnostics without exposing keys',async t=>{
 const diagnostics=[];
 const base=await start(t,{env:{CROW_MAPS_KEY:'private-key'},diagnostic:detail=>diagnostics.push(detail),fetchImpl:async()=>new Response('',{status:403})});
 const response=await fetch(base+'/api/places/search',{method:'POST',headers:headers(),body:JSON.stringify({textQuery:'Singapore cafés'})});
 assert.equal(response.status,503);
 assert.deepEqual(diagnostics,[{route:'/api/places/search',providerReached:true,googleErrorCategory:'authentication_or_restriction',httpStatus:403,attempt:1}]);
  assert.equal(JSON.stringify(diagnostics).includes('private-key'),false);
});

test('Zo runtime creates its persistent SQLite directory on first start',async t=>{
 const parent=await mkdtemp(join(tmpdir(),'crow-zo-runtime-'));
 t.after(()=>rm(parent,{recursive:true,force:true}));
 const server=await startZoRuntime({port:0,host:'127.0.0.1',databasePath:join(parent,'state','usage.sqlite'),env:{PUBLIC_ORIGIN:'https://crow.example'}});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 assert.ok(server.listening);
});

test('Zo runtime reopens its persistent SQLite database after a restart',async t=>{
 const parent=await mkdtemp(join(tmpdir(),'crow-zo-runtime-'));
 const databasePath=join(parent,'state','usage.sqlite');
 t.after(()=>rm(parent,{recursive:true,force:true}));
 const first=await startZoRuntime({port:0,host:'127.0.0.1',databasePath,env:{PUBLIC_ORIGIN:'https://crow.example'}});
 await new Promise(resolve=>first.close(resolve));
 const second=await startZoRuntime({port:0,host:'127.0.0.1',databasePath,env:{PUBLIC_ORIGIN:'https://crow.example'}});
 t.after(()=>new Promise(resolve=>second.close(resolve)));
 assert.ok(second.listening);
});
