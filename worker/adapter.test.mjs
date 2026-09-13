import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';

test('Sites adapter preserves assets, configuration, validation and provider contracts',async()=>{
  const origin='https://itachis-crow.promptalchemistlabs.chatgpt.site';
  const env={OPENAI_API_KEY:'test-server-secret',CROW_MAPS_KEY:'test-browser-key',PUBLIC_ORIGIN:origin,ASSETS:{fetch:async()=>new Response('asset')}};
  const request=(path,body,headers={})=>new Request(origin+path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json',origin,...headers},body:JSON.stringify(body)});
  const status=await worker.fetch(request('/api/status'),env);
  const text=await status.text();assert.equal(status.status,200);assert.ok(!text.includes(env.OPENAI_API_KEY));assert.equal(JSON.parse(text).capabilities.live,true);
  assert.equal(await (await worker.fetch(request('/config.js'),env)).text(),'window.CROW_MAPS_KEY="test-browser-key";');
  const model=await worker.fetch(request('/models/body.glb'),env);assert.equal(model.headers.get('content-type'),'model/gltf-binary');
  const foreign=await worker.fetch(request('/api/panorama',{}, {origin:'https://other.example'}),env);assert.equal(foreign.status,403);
  const invalid=await worker.fetch(request('/api/panorama',{}),env);assert.equal(invalid.status,400);
  const originalFetch=globalThis.fetch;
  const env2={...env};
  const calls=[];
  globalThis.fetch=async(url,options)=>{
    calls.push({url,body:JSON.parse(options.body)});assert.equal(options.headers.Authorization,'Bearer test-server-secret');
    return Response.json(url.endsWith('/images/generations')?{data:[{b64_json:'YWJj'}]}:{session:{id:'test-session'},transport:{type:'webrtc',sdp:'v=0\r\n'}});
  };
  try{
    const spot={name:'Chelsea',lat:40.74,lng:-73.99};
    const panorama=await worker.fetch(request('/api/panorama',{destination:spot,spot}),env2);
    assert.equal(panorama.status,200);assert.equal((await panorama.json()).imageUrl,'data:image/jpeg;base64,YWJj');
    const live=await worker.fetch(request('/api/live/session',{sdp:'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'}),env2);
    assert.equal(live.status,201);assert.equal((await live.json()).session.id,'test-session');
    assert.equal(calls[0].body.model,'gpt-image-2.5-flare');assert.equal(calls[1].body.session.model,'gpt-live-1');
  }finally{globalThis.fetch=originalFetch;}
});
