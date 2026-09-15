import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,cp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {loadRuntimeConfig,readFileConfig,validateFileConfig} from './config-file.mjs';
import {startZoRuntime} from './zo-runtime.mjs';

async function fixture(t){
 const root=await mkdtemp(join(tmpdir(),'crow-config-'));
 t.after(()=>rm(root,{recursive:true,force:true}));return root;
}

test('private config supplies settings while environment overrides remain compatible',async t=>{
 const root=await fixture(t);
 await writeFile(join(root,'config.json'),JSON.stringify({OPENAI_TEXT_MODEL:'file-model',PORT:8806,APP_BASE_PATH:'/crow'}));
 await writeFile(join(root,'.env'),'OPENAI_API_KEY=private-fixture\nCROW_MAPS_KEY1=test-map\nPUBLIC_ORIGIN=https://crow.example\n');
 const env=await loadRuntimeConfig({root,env:{}});
 assert.equal(env.OPENAI_API_KEY,'private-fixture');assert.equal(env.CROW_MAPS_KEY1,'test-map');
 assert.equal(env.PORT,8806);assert.equal(env.APP_BASE_PATH,'/crow');
 const override=await loadRuntimeConfig({root,env:{OPENAI_API_KEY:'legacy-secret',OPENAI_TEXT_MODEL:'env-model'}});
 assert.equal(override.OPENAI_API_KEY,'legacy-secret');assert.equal(override.OPENAI_TEXT_MODEL,'env-model');
 const server=await startZoRuntime({env,port:0,host:'127.0.0.1',databasePath:':memory:'});
 t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port;
 const response=await fetch(base+'/api/status',{headers:{'x-forwarded-host':'crow.example'}});
 const body=await response.text();assert.equal(response.status,200);
 assert.equal(JSON.parse(body).capabilities.chat,true);assert.equal(JSON.parse(body).openai.planModel,'file-model');assert.ok(!body.includes('private-fixture'));
 for(const path of ['/config.json','/config.example.json','/config%2ejson','/server/index.js'])assert.equal((await fetch(base+path)).status,404);
 const config=await (await fetch(base+'/config.js')).text();assert.ok(!config.includes('private-fixture'));
});

test('missing config has defaults and malformed config fails without exposing contents',async t=>{
 const root=await fixture(t);
 assert.equal((await loadRuntimeConfig({root,env:{}})).PORT,3000);
 await writeFile(join(root,'config.json'),'{"OPENAI_API_KEY":"secret-fixture"');
 await assert.rejects(loadRuntimeConfig({root,env:{}}),error=>error.message==='config.json is not valid JSON.');
 for(const value of [[],null,{OPENAI_API_KEY:123},{PORT:0},{PORT:70000},{PUBLIC_ORIGIN:'https://wrong.example'},{CROW_MAPS_KEY1:'map-fixture'}])assert.throws(()=>validateFileConfig(value));
 assert.throws(()=>validateFileConfig({OPENAI_API_KEY:'secret-fixture'}),error=>error.message==='Move OPENAI_API_KEY from config.json to .env or a runtime secret binding.');
 await assert.rejects(readFileConfig(join(root,'absent.json')),/Unable to read/);
});

test('Worker builds exclude local config unless explicitly selected and never publish it as an asset',async t=>{
 const root=await fixture(t),source=fileURLToPath(new URL('../',import.meta.url));
 for(const dir of ['server','worker','dist','drizzle'])await mkdir(join(root,dir));
 for(const file of ['server/index.mjs','worker/adapter.mjs','worker/usage-limits.mjs','config.example.json'])await cp(join(source,file),join(root,file));
 await writeFile(join(root,'package.json'),'{"type":"module"}');
 await writeFile(join(root,'config.json'),JSON.stringify({OPENAI_TEXT_MODEL:'configured-model'}));
 await writeFile(join(root,'.env'),'OPENAI_API_KEY=build-private-fixture\n');
 await writeFile(join(root,'dist','config.json'),'never-public-fixture');
 const run=promisify(execFile),script=join(source,'scripts/build-sites.mjs');
 await run(process.execPath,[script],{cwd:root});
 assert.ok(!(await readFile(join(root,'dist/server/index.js'),'utf8')).includes('build-private-fixture'));
 await assert.rejects(stat(join(root,'dist/client/config.json')),error=>error.code==='ENOENT');
 const {stdout,stderr}=await run(process.execPath,[script,'--config','config.json'],{cwd:root});
 assert.ok(!stdout.includes('build-private-fixture')&&!stderr.includes('build-private-fixture'));
 assert.ok(!(await readFile(join(root,'dist/server/index.js'),'utf8')).includes('build-private-fixture'));
 const worker=(await import(pathToFileURL(join(root,'dist/server/index.js')).href)).default;
 const env={PUBLIC_ORIGIN:'https://crow.example',CROW_MAPS_KEY1:'map-fixture',ASSETS:{fetch:()=>new Response('asset')}};
 const unconfigured=await worker.fetch(new Request('https://crow.example/api/status'),env);
 assert.equal((await unconfigured.json()).capabilities.chat,false);
 env.OPENAI_API_KEY='runtime-private-fixture';
 const configuredEnv={...env};
 const status=await worker.fetch(new Request('https://crow.example/api/status'),configuredEnv);
 const text=await status.text();assert.ok(!text.includes('runtime-private-fixture'));
 assert.equal(JSON.parse(text).capabilities.chat,true);assert.equal(JSON.parse(text).openai.planModel,'configured-model');
 const browser=await (await worker.fetch(new Request('https://crow.example/config.js'),configuredEnv)).text();assert.ok(!browser.includes('runtime-private-fixture'));
 for(const path of ['/config.json','/config.example.json','/config%2ejson','/server/index.js'])assert.equal((await worker.fetch(new Request('https://crow.example'+path),env)).status,404);
 await writeFile(join(root,'config.json'),JSON.stringify({OPENAI_API_KEY:'build-private-fixture'}));
 await assert.rejects(run(process.execPath,[script,'--config','config.json'],{cwd:root}),error=>error.stderr.includes('Move OPENAI_API_KEY')&&!error.stderr.includes('build-private-fixture'));
});
