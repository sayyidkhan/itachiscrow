// Web Request/Response adapter for the existing, validated Node API handler.
let handler, activeEnv;
const publicOrigin = 'https://itachis-crow.promptalchemistlabs.chatgpt.site';
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const group=usageGroup(url.pathname);
    if(group){
      if(request.method!=='POST')return Response.json({error:{message:'Use POST.'}},{status:405});
      if(request.headers.get('origin')!==(env.PUBLIC_ORIGIN||publicOrigin))return Response.json({error:{message:'Use the website to make this request.'}},{status:403});
      let permit;try{permit=await enforceUsage(request,env.DB,group)}catch{return Response.json({error:{message:'Usage protection is temporarily unavailable. Please try again shortly.'}},{status:503,headers:{'Retry-After':'30'}})}
      if(!permit.allowed)return Response.json({error:{code:'usage_limit',message:`You’ve reached the ${group} limit. Try again in ${permit.retryAfter} seconds.`,retryAfter:permit.retryAfter}},{status:429,headers:{'Retry-After':String(permit.retryAfter),'Cache-Control':'no-store'}});
      if(permit.turn===1)ctx?.waitUntil(env.DB.prepare('DELETE FROM usage_limits WHERE id IN (SELECT id FROM usage_limits WHERE expires<? LIMIT 100)').bind(Date.now()).run().catch(()=>{}));
      if(group==='map')return Response.json({allowed:true},{headers:{'Cache-Control':'no-store'}});
      if(group==='search')return proxyPlaceSearch(request,env,permit.turn);
    }
    if (url.pathname === '/config.js') {
      return new Response(mapBrowserConfig(env), {
        headers: {'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-store'},
      });
    }
    if (!url.pathname.startsWith('/api/')) {
      if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405});
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      if (url.pathname.endsWith('.glb')) headers.set('Content-Type','model/gltf-binary');
      if (url.pathname.endsWith('.js') || url.pathname.endsWith('.html') || url.pathname === '/') headers.set('Cache-Control','no-cache');
      return new Response(response.body,{status:response.status,headers});
    }
    // Environment bindings are server-only. Never serialize them into responses.
    if (!handler || activeEnv !== env) {
      activeEnv = env;
      handler = createHandler({env:{...env, CROW_OWNER_PHOTO:'', PUBLIC_ORIGIN:env.PUBLIC_ORIGIN || publicOrigin}});
    }
    const reqEvents = new EventTarget(), resEvents = new EventTarget();
    const req = {
      method:request.method, url:url.pathname+url.search,
      headers:{...Object.fromEntries(request.headers),host:url.host},
      socket:{remoteAddress:request.headers.get('cf-connecting-ip') || 'unknown'},
      once:(event,fn)=>reqEvents.addEventListener(event,fn,{once:true}),
      removeListener:(event,fn)=>reqEvents.removeEventListener(event,fn),
      async *[Symbol.asyncIterator]() {
        if(!request.body)return;
        const reader=request.body.getReader();
        try { while(true){const {done,value}=await reader.read();if(done)break;yield value;} }
        finally { await reader.cancel().catch(()=>{});reader.releaseLock(); }
      },
    };
    let status=200, body=null;
    const headers = new Headers();
    const res = {
      headersSent:false,destroyed:false,writableEnded:false,
      once:(event,fn)=>resEvents.addEventListener(event,fn,{once:true}),
      removeListener:(event,fn)=>resEvents.removeEventListener(event,fn),
      getHeader:name=>headers.get(name),
      setHeader(name,value){headers.delete(name);for(const item of Array.isArray(value)?value:[value])headers.append(name,String(item));},
      writeHead(code,values){status=code;for(const [name,value] of Object.entries(values))this.setHeader(name,value);this.headersSent=true;},
      end(value){body=value??null;this.writableEnded=true;},
    };
    const cancel=()=>reqEvents.dispatchEvent(new Event('aborted'));
    request.signal.addEventListener('abort',cancel,{once:true});
    try { await handler(req,res); }
    finally { request.signal.removeEventListener('abort',cancel); }
    return new Response(body,{status,headers});
  },
};
