import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { startZoRuntime } from './zo-runtime.mjs';

async function start(t,options={}){
 const server=await startZoRuntime({port:0,host:'127.0.0.1',databasePath:':memory:',...options,env:{PUBLIC_ORIGIN:'https://crow.example',...options.env}});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 return `http://127.0.0.1:${server.address().port}`;
}

function headers(){return {Origin:'https://crow.example','X-Forwarded-Host':'crow.example','Content-Type':'application/json'};}

test('Zo recommendations share research allowance and reject foreign origins', async t => {
 const base=await start(t,{env:{OPENAI_API_KEY:'test-key'},fetchImpl:()=>assert.fail('Invalid input must not reach provider')});
 const send=origin=>fetch(base+'/api/recommendations',{method:'POST',headers:{...headers(),Origin:origin},body:'{}'});
 assert.equal((await send('https://other.example')).status,403);
 for(let i=0;i<3;i++)assert.equal((await send('https://crow.example')).status,400);
 assert.equal((await send('https://crow.example')).status,429);
});

test('Zo runtime mirrors protected map and configuration contracts with persistent SQLite admission',async t=>{
 const base=await start(t,{env:{CROW_MAPS_KEY3:'third-test-key'}});
 const config=await fetch(base+'/config.js',{headers:{...headers(),'X-Forwarded-Prefix':'/crow'}});
 const configBody=await config.text();
 assert.match(configBody,/window\.CROW_BASE_PATH="\/crow"/);
 assert.match(configBody,/window\.CrowUrl=/);
 assert.doesNotMatch(configBody,/window\.CROW_MAPS_KEY1=/);
 assert.match(configBody,/window\.CROW_MAPS_KEY3="third-test-key"/);
 const page=await fetch(base+'/',{headers:headers()});
 assert.equal(page.status,200);
 const allowed=await fetch(base+'/api/map-session',{method:'POST',headers:headers()});
 assert.deepEqual(await allowed.json(),{allowed:true});
 const rejected=await fetch(base+'/api/map-session',{method:'POST',headers:{...headers(),Origin:'https://other.example'}});
 assert.equal(rejected.status,403);
});

test('Zo public pages accept external link navigation without opening APIs or private files',async t=>{
 const base=await start(t,{fetchImpl:()=>assert.fail('Must not call provider')});
 const send=(path,options={})=>new Promise((resolve,reject)=>{
  const req=request(base+path,options,res=>{
   res.resume();
   res.on('end',()=>resolve({status:res.statusCode,headers:new Headers(res.headers)}));
  });
  req.on('error',reject);req.end();
 });
 const navigation={'X-Forwarded-Host':'crow.example','Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
 for(const path of ['/','/explore.html','/customise.html']){
  const response=await send(path,{headers:navigation});
  assert.equal(response.status,200,path);
  assert.match(response.headers.get('content-type'),/text\/html/);
 }
 assert.equal((await send('/',{method:'HEAD',headers:navigation})).status,200);
 for(const path of ['/api/status','/api/instagram/connect'])assert.equal((await send(path,{headers:navigation})).status,403,path);
 for(const path of ['/api/map-session','/api/places/search','/api/chat']){
  assert.equal((await send(path,{method:'POST',headers:{...navigation,Origin:'https://other.example'}})).status,403,path);
 }
 for(const path of ['/.env','/config.json','/server/index.mjs'])assert.equal((await send(path,{headers:navigation})).status,404,path);
 for(const overrides of [
  {'X-Forwarded-Host':'other.example'},
  {'Sec-Fetch-Mode':'cors','Sec-Fetch-Dest':'empty'},
  {'Sec-Fetch-Dest':'iframe'},
 ])assert.equal((await send('/',{headers:{...navigation,...overrides}})).status,403);
 assert.equal((await send('/',{method:'POST',headers:navigation})).status,403);
});

test('Zo runtime emits redacted Places diagnostics without exposing keys',async t=>{
 const diagnostics=[];
 const base=await start(t,{env:{CROW_MAPS_KEY1:'private-key'},diagnostic:detail=>diagnostics.push(detail),fetchImpl:async()=>new Response('',{status:403})});
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
