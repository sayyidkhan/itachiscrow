import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { createHandler } from './index.mjs';
import { enforceUsage, proxyPlaceSearch, usageGroup, mapBrowserConfig } from '../worker/usage-limits.mjs';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const migrationPath=resolve(ROOT,'drizzle/0000_abnormal_avengers.sql');

function json(res,status,data,headers={}){
 const body=JSON.stringify(data);
 res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Length':Buffer.byteLength(body),...headers});
 res.end(body);
}

function expectedOrigin(req,env){
 if(env.PUBLIC_ORIGIN?.trim())return env.PUBLIC_ORIGIN.trim();
 const protocol=(req.headers['x-forwarded-proto']||'http').split(',')[0].trim();
 return `${protocol}://${req.headers.host}`;
}

function normaliseTrustedProxyHost(req,env){
 const remote=req.socket.remoteAddress||'';
 if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote))return;
 const forwarded=typeof req.headers['x-forwarded-host']==='string'?req.headers['x-forwarded-host'].split(',')[0].trim():'';
 try{
  if(forwarded&&env.PUBLIC_ORIGIN&&forwarded===new URL(env.PUBLIC_ORIGIN).host)req.headers.host=forwarded;
 }catch{}
}

function normaliseBasePath(value){
 if(typeof value!=='string'||!value.trim()||value.trim()==='/')return '';
 const path=value.trim().replace(/\/+$/,'');
 return path.startsWith('/')?path:`/${path}`;
}

function requestBasePath(req,env){
 const remote=req.socket.remoteAddress||'';
 const loopback=['127.0.0.1','::1','::ffff:127.0.0.1'].includes(remote);
 const forwarded=typeof req.headers['x-forwarded-prefix']==='string'?req.headers['x-forwarded-prefix'].split(',')[0]:'';
 return normaliseBasePath(loopback&&forwarded?forwarded:env.APP_BASE_PATH);
}

function browserConfig(env,basePath){
 return `window.CROW_BASE_PATH=${JSON.stringify(basePath)};window.CrowUrl=path=>typeof path==='string'&&path.startsWith('/')&&!path.startsWith('//')?window.CROW_BASE_PATH+path:path;if(window.CROW_BASE_PATH){const crowFetch=window.fetch.bind(window);window.fetch=(input,init)=>crowFetch(typeof input==='string'?window.CrowUrl(input):input,init);}${mapBrowserConfig(env)}`;
}

function sameOrigin(req,env){
 return req.headers.origin===expectedOrigin(req,env);
}

function requestIp(req){
 const remote=req.socket.remoteAddress||'unknown';
 const loopback=remote==='127.0.0.1'||remote==='::1'||remote==='::ffff:127.0.0.1';
 if(loopback&&typeof req.headers['x-forwarded-for']==='string')return req.headers['x-forwarded-for'].split(',')[0].trim()||remote;
 return remote;
}

function usageRequest(req){
 return new Request('http://zo-runtime.internal/',{headers:{'cf-connecting-ip':requestIp(req)}});
}

function d1Compatible(db){
 return {prepare(sql){
   const statement=db.prepare(sql);
   return {bind(...values){return {first:async()=>statement.get(...values)||null,run:async()=>statement.run(...values)}}};
 }};
}

export async function openUsageDatabase(path=':memory:'){
 if(path!==':memory:')await mkdir(dirname(path),{recursive:true});
 const db=new DatabaseSync(path);
 const table=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='usage_limits'").get();
 if(!table){
  const migration=(await readFile(migrationPath,'utf8')).replaceAll('--> statement-breakpoint','');
  db.exec(migration);
 }
 return {db,adapter:d1Compatible(db)};
}

function safeDiagnostic(detail){
 console.info(JSON.stringify({event:'itachiscrow_places_proxy',...detail}));
}

export async function startZoRuntime({port=Number(process.env.PORT||3000),host='0.0.0.0',env=process.env,databasePath=process.env.CROW_USAGE_DB||resolve(ROOT,'.zo-data/usage.sqlite'),fetchImpl=globalThis.fetch,diagnostic=safeDiagnostic}={}){
 const usage=await openUsageDatabase(databasePath);
 const core=createHandler({env,fetchImpl});
 const server=createServer(async(req,res)=>{
  normaliseTrustedProxyHost(req,env);
  const path=new URL(req.url,'http://localhost').pathname;
   if(path==='/config.js'){
    const body=browserConfig(env,requestBasePath(req,env));
     res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body)});res.end(body);return;
   }
   const group=usageGroup(path);
   if(!group){core(req,res);return;}
   if(req.method!=='POST'){json(res,405,{error:{message:'Use POST.'}});return;}
   if(!sameOrigin(req,env)){json(res,403,{error:{message:'Use the website to make this request.'}});return;}
   try{
     const permit=await enforceUsage(usageRequest(req),usage.adapter,group);
     if(!permit.allowed){json(res,429,{error:{code:'usage_limit',message:`You’ve reached the ${group} limit. Try again in ${permit.retryAfter} seconds.`,retryAfter:permit.retryAfter}},{'Retry-After':String(permit.retryAfter)});return;}
     if(group==='map'){json(res,200,{allowed:true});return;}
     if(group==='search'){
       const request=new Request(expectedOrigin(req,env)+path,{method:'POST',headers:{'content-type':req.headers['content-type']||'','content-length':req.headers['content-length']||''},body:req,duplex:'half'});
       const response=await proxyPlaceSearch(request,env,permit.turn,{fetchImpl,onDiagnostic:diagnostic});
       res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
     }
     core(req,res);
   }catch{
     json(res,503,{error:{message:'Usage protection is temporarily unavailable. Please try again shortly.'}},{'Retry-After':'30'});
   }
 });
 server.requestTimeout=200_000;server.headersTimeout=15_000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);resolve();});});
 server.on('close',()=>usage.db.close());
 return server;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{loadEnvFile(resolve(ROOT,'.env'));}catch(error){if(error.code!=='ENOENT')throw error;}
 startZoRuntime().then(server=>console.log(`Crow Explorer Zo runtime: http://localhost:${server.address().port}`)).catch(error=>{console.error(`Unable to start Crow Explorer Zo runtime (${error.code||'server_error'}).`);process.exitCode=1;});
}
