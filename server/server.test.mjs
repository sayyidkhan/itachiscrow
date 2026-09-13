import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createConfig, createLiveSession, fetchInstagram, generatePanorama, generatePortrait, discoverOffers, generatePlan, getStatus, startServer } from './index.mjs';

const place = { name: 'Gardens by the Bay', lat: 1.2816, lng: 103.8636, address: 'Singapore' };
const config = createConfig({ OPENAI_API_KEY: 'sk-test-secret', INSTAGRAM_ACCESS_TOKEN: 'meta-secret', INSTAGRAM_USER_ID: '123456' });
const ok = body => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });

async function start(t, options = {}) {
  const server = startServer({ port: 0, env: {}, ...options });
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

function post(base, path, body, headers = {}) {
  return fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, ...headers }, body: JSON.stringify(body) });
}

test('status exposes model names and capability booleans without server secrets', () => {
  const status = getStatus(config);
  assert.equal(status.capabilities.live, true);
  assert.equal(status.capabilities.instagram, true);
  assert.equal(status.openai.liveModel, 'gpt-live-1');
  assert.equal(status.openai.imageModel, 'gpt-image-2.5-flare');
  assert.equal(JSON.stringify(status).includes('secret'), false);
  assert.deepEqual(getStatus(createConfig({})).capabilities, { live: false, panorama: false, plan: false, instagram: false });
});

test('panorama uses the exact landing coordinates, seamless 2:1 image dimensions, and a synthetic notice', async () => {
  let request;
  const result = await generatePanorama({ destination: place, spot: { ...place, name: 'Supertree Grove', lat: 1.281 } }, {
    config,
    fetchImpl: async (url, options) => { request = { url, ...options, body: JSON.parse(options.body) }; return ok({ data: [{ b64_json: 'aW1hZ2U=' }] }); },
  });
  assert.equal(request.url, 'https://api.openai.com/v1/images/generations');
  assert.equal(request.headers.Authorization, 'Bearer sk-test-secret');
  assert.equal(request.body.size, '2048x1024');
  assert.equal(request.body.n, 1);
  assert.match(request.body.prompt, /Supertree Grove/);
  assert.match(request.body.prompt, /"lat":1.281/);
  assert.match(request.body.prompt, /50% of the image width/);
  assert.equal(result.imageUrl, 'data:image/jpeg;base64,aW1hZ2U=');
  assert.equal(result.projection, 'equirectangular');
  assert.equal(result.synthetic, true);
  assert.match(result.notice, /not a live photograph/);
});

test('invalid coordinates are rejected before any provider request', async () => {
  let called = false;
  await assert.rejects(generatePanorama({ destination: place, spot: { ...place, lat: 100 } }, { config, fetchImpl: () => { called = true; } }), error => error.status === 400);
  assert.equal(called, false);
});

test('planning requires current web search, preserves itinerary context, and converts citations to usable links', async () => {
  let body;
  const text = 'The gardens open today. [ref]';
  const result = await generatePlan({ destination: place, spot: place, days: 2, budget: 'SGD 150/day', interests: ['gardens', 'food'], savedPlaces: [place] }, {
    config,
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return ok({ status: 'completed', output: [
        { type: 'web_search_call', action: { sources: [{ url: 'https://www.gardensbythebay.com.sg/', title: 'Gardens by the Bay' }] } },
        { type: 'message', content: [{ type: 'output_text', text, annotations: [{ type: 'url_citation', start_index: text.indexOf('[ref]'), end_index: text.length, url: 'https://www.gardensbythebay.com.sg/', title: 'Official opening hours' }, { type: 'url_citation', url: 'javascript:alert(1)', title: 'unsafe' }] }] },
      ] });
    },
  });
  assert.deepEqual(body.tools, [{ type: 'web_search' }]);
  assert.equal(body.tool_choice, 'required');
  assert.equal(JSON.parse(body.input).days, 2);
  assert.equal(JSON.parse(body.input).savedPlaces.length, 1);
  assert.equal(result.sources.length, 1);
  assert.match(result.text, /\[Official opening hours\]\(https:\/\/www.gardensbythebay.com.sg\/\)/);
  assert.doesNotMatch(result.text, /javascript/);
});

test('planning rejects excessive trip length, saved places, and incomplete provider output', async () => {
  const options = { config, fetchImpl: async () => ok({ status: 'incomplete', output: [{ type: 'message', content: [{ type: 'output_text', text: 'Half a plan' }] }] }) };
  await assert.rejects(generatePlan({ destination: place, days: 90 }, options), error => error.status === 400);
  await assert.rejects(generatePlan({ destination: place, savedPlaces: Array(21).fill(place) }, options), error => error.status === 400);
  await assert.rejects(generatePlan({ destination: place }, options), error => error.code === 'plan_incomplete');
});

test('planning keeps original citation offsets intact when spans repeat, overlap, or exceed the original text', async () => {
  const text = 'First [1]. Second [2].';
  const result = await generatePlan({ destination: place }, {
    config,
    fetchImpl: async () => ok({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text, annotations: [
      { type: 'url_citation', start_index: 6, end_index: 9, url: 'https://example.com/one', title: 'One' },
      { type: 'url_citation', start_index: 6, end_index: 9, url: 'https://example.com/also', title: 'Also' },
      { type: 'url_citation', start_index: 18, end_index: 21, url: 'https://example.com/two', title: 'Two' },
      { type: 'url_citation', start_index: 0, end_index: 18, url: 'https://example.com/overlap', title: 'Overlap' },
      { type: 'url_citation', start_index: 1, end_index: 40, url: 'https://example.com/invalid', title: 'Invalid' },
    ] }] }] }),
  });
  assert.equal(result.text, 'First [One](https://example.com/one) [Also](https://example.com/also). Second [Two](https://example.com/two).');
});

test('GPT-Live sends the current Live session schema with bounded server-defined tools and no exposed API key', async () => {
  let request;
  const result = await createLiveSession({ sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', context: { destination: place, days: 3 }, apiKey: 'browser-key-is-ignored' }, {
    config,
    fetchImpl: async (url, options) => { request = { url, body: JSON.parse(options.body) }; return ok({ session: { id: 'live_123', secret: 'should-not-leak' }, transport: { type: 'webrtc', sdp: 'v=0\r\nanswer' }, api_key: 'also-not-leaked' }); },
  });
  assert.equal(request.url, 'https://api.openai.com/v1/live/sessions');
  assert.equal(request.body.transport.sdp, 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n', 'Preserve the trailing CRLF required by the actual Live SDP parser');
  assert.equal(request.body.session.model, 'gpt-live-1');
  assert.equal(request.body.session.type, undefined);
  assert.equal(request.body.session.delegation.type, 'responses');
  assert.equal(request.body.session.delegation.responses.parallel_tool_calls, false);
  assert.deepEqual(request.body.session.delegation.responses.tools.slice(1).map(tool => tool.name), ['picture_me_here', 'find_cafes', 'fly_to', 'land_at', 'take_off', 'generate_panorama', 'plan_trip']);
  const takeOff = request.body.session.delegation.responses.tools.find(tool => tool.name === 'take_off');
  assert.deepEqual(takeOff.parameters, { type: 'object', properties: {}, required: [], additionalProperties: false });
  assert.deepEqual(result, { session: { id: 'live_123' }, transport: { type: 'webrtc', sdp: 'v=0\r\nanswer' } });
});

test('Instagram reports a connection requirement honestly and rejects invalid hashtag input', async () => {
  const options = { config: createConfig({}), fetchImpl: () => assert.fail('No external call should be made') };
  assert.equal((await fetchInstagram('singapore', options)).status, 'not_configured');
  await assert.rejects(fetchInstagram('two tags', options), error => error.status === 400);
});

test('travel portrait passes reference bytes to image edits and rejects invalid uploads before provider use', async () => {
  const bytes = Buffer.from([255,216,255,224,0,16]);
  let calls = 0;
  const options = { config, fetchImpl: async (url, request) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/images/edits');
    assert(request.body instanceof FormData);
    assert.deepEqual(Buffer.from(await request.body.get('image[]').arrayBuffer()), bytes);
    assert.match(request.body.get('prompt'), /Preserve their facial identity/);
    assert.equal(request.headers['Content-Type'], undefined);
    return ok({data:[{b64_json:'aW1hZ2U='}]});
  } };
  const result = await generatePortrait({destination:place,photo:`data:image/jpeg;base64,${bytes.toString('base64')}`}, options);
  assert.equal(result.synthetic,true);
  for (const photo of ['https://example.test/photo.jpg','data:image/jpeg;base64,aW1hZ2U=','data:image/svg+xml;base64,aW1hZ2U=']) await assert.rejects(generatePortrait({destination:place,photo},options), error=>error.status===400);
  await assert.rejects(generatePortrait({destination:place,useSavedPhoto:true},options),error=>error.status===400);
  assert.equal(calls,1);
  assert.equal(createConfig({CROW_OWNER_PHOTO:'/private/photo.jpg',PUBLIC_ORIGIN:'https://public.example'}).ownerPhoto,'');
});

test('offer discovery drops expired, undated and unsourced discounts', async () => {
  const sourceUrl='https://cafe.example/promotion';
  const offer={venue:'Example café',offer:'Coffee offer',conditions:'With breakfast',validUntil:'2099-01-01',sourceUrl};
  const result=await discoverOffers({destination:place}, {config,fetchImpl:async(_url,options)=>{
    const body=JSON.parse(options.body);assert.equal(body.tool_choice,'required');assert.equal(body.text.format.strict,true);
    return ok({status:'completed',output:[{type:'web_search_call',action:{sources:[{url:sourceUrl,title:'Café terms'}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'A researched summary',offers:[offer,{...offer,validUntil:'2001-01-01'},{...offer,validUntil:''},{...offer,sourceUrl:'https://invented.example'}]})}]}]});
  }});
  assert.deepEqual(result.offers,[offer]);assert.equal(result.sources.length,1);
});

test('portrait HTTP route accepts bounded photos over the ordinary API limit without exposing private files', async t => {
  const bytes=Buffer.alloc(120000);bytes.set([255,216,255]);
  const base=await start(t,{config,fetchImpl:async()=>ok({data:[{b64_json:'aW1hZ2U='}]})});
  const response=await post(base,'/api/portrait',{destination:place,photo:`data:image/jpeg;base64,${bytes.toString('base64')}`});
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal((await response.json()).synthetic,true);
  assert.equal((await post(base,'/api/portrait',{destination:place,useSavedPhoto:true})).status,400);
  assert.equal((await fetch(base+'/.private/traveller.jpg')).status,404);
});

test('Instagram searches the official hashtag edge, returns images and carousel photos with original attribution, and excludes videos and unsafe links', async () => {
  const calls = [];
  const response = await fetchInstagram('#singapore', {
    config,
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), options });
      if (calls.length === 1) return ok({ data: [{ id: '998877' }] });
      return ok({ data: [
        { id: '1', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/a.jpg', permalink: 'https://www.instagram.com/p/a/', caption: 'Real caption', timestamp: '2026-09-13T01:00:00+0000' },
        { id: '2', media_type: 'VIDEO', media_url: 'https://cdn.example/b.mp4', permalink: 'https://www.instagram.com/p/b/' },
        { id: '3', media_type: 'CAROUSEL_ALBUM', children: { data: [{ media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/c.jpg' }] }, permalink: 'https://www.instagram.com/p/c/' },
        { id: '4', media_type: 'IMAGE', media_url: 'javascript:alert(1)', permalink: 'https://www.instagram.com/p/d/' },
        { id: '5', media_type: 'IMAGE', media_url: 'https://cdn.example/a.jpg', permalink: 'https://www.instagram.com.evil.example/p/e/' },
      ] });
    },
  });
  assert.equal(calls[0].url.pathname, '/v25.0/ig_hashtag_search');
  assert.equal(calls[0].url.searchParams.get('q'), 'singapore');
  assert.equal(calls[0].url.searchParams.get('access_token'), null);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer meta-secret');
  assert.equal(calls[1].url.pathname, '/v25.0/998877/recent_media');
  assert.doesNotMatch(calls[1].url.searchParams.get('fields'), /username|thumbnail_url/);
  assert.equal(response.status, 'connected');
  assert.equal(response.posts.length, 2);
  assert.equal(response.posts[0].attribution, 'Instagram');
  assert.equal(response.posts[0].username, undefined);
  assert.equal(response.posts[0].timestamp, '2026-09-13T01:00:00.000Z');
});

test('HTTP API uses precise configuration errors and rejects cross-origin requests without provider calls', async t => {
  const base = await start(t, { fetchImpl: () => assert.fail('Must not call provider') });
  let response = await post(base, '/api/plan', { destination: place });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, 'openai_not_configured');
  response = await post(base, '/api/plan', { destination: place }, { Origin: 'https://unrelated.example' });
  assert.equal(response.status, 403);
  response = await fetch(`${base}/api/instagram?hashtag=singapore`, { headers: { 'Sec-Fetch-Site': 'cross-site' } });
  assert.equal(response.status, 403);
  const rebindingStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(`${base}/api/status`, { headers: { Host: 'evil.example' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject);
    request.end();
  });
  assert.equal(rebindingStatus, 403);
});

test('HTTP input handling rejects malformed JSON, non-JSON, oversized bodies, and unsupported methods', async t => {
  const base = await start(t);
  let response = await fetch(`${base}/api/plan`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(response.status, 400);
  response = await fetch(`${base}/api/plan`, { method: 'POST', body: 'wrong' });
  assert.equal(response.status, 415);
  response = await post(base, '/api/plan', { giant: 'a'.repeat(100 * 1024) });
  assert.equal(response.status, 413);
  response = await fetch(`${base}/api/plan`);
  assert.equal(response.status, 405);
});

test('provider failures are actionable without forwarding provider body, secrets, or request details', async t => {
  const base = await start(t, { config, fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'sk-test-secret meta-secret private details' } }), { status: 403 }) });
  const response = await post(base, '/api/panorama', { destination: place, spot: place });
  const result = await response.json();
  assert.equal(response.status, 502);
  assert.equal(result.error.code, 'provider_auth_error');
  assert.doesNotMatch(JSON.stringify(result), /secret|private details/);
});

test('static serving confines files to dist including symlinks, encoded traversal, and hidden files', async t => {
  const root = await mkdtemp(join(tmpdir(), 'crow-server-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const distDir = join(root, 'dist');
  await mkdir(distDir);
  await writeFile(join(distDir, 'index.html'), '<h1>Crow</h1>');
  await writeFile(join(root, 'secret.txt'), 'secret');
  await writeFile(join(distDir, '.env'), 'hidden-secret');
  await symlink(join(root, 'secret.txt'), join(distDir, 'leak.txt'));
  const base = await start(t, { distDir });
  assert.equal(await (await fetch(base)).text(), '<h1>Crow</h1>');
  assert.equal((await fetch(`${base}/leak.txt`)).status, 404);
  assert.equal((await fetch(`${base}/%2eenv`)).status, 404);
  assert.equal((await fetch(`${base}/..%2fsecret.txt`)).status, 404);
  const head = await fetch(base, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('a local request rate limit bounds costly provider endpoints', async t => {
  const base = await start(t, { config: { ...createConfig({}), requestLimit: 1 } });
  assert.equal((await post(base, '/api/plan', { destination: place })).status, 503);
  assert.equal((await post(base, '/api/plan', { destination: place })).status, 429);
  assert.equal((await fetch(`${base}/api/status`)).status, 200);
});

for (const [path, body] of [
  ['/api/panorama', { destination: place, spot: place }],
  ['/api/plan', { destination: place }],
  ['/api/live/session', { sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }],
  ['/api/instagram?hashtag=singapore', null],
]) {
  test(`disconnecting ${path} aborts its pending upstream request`, { timeout: 3000 }, async t => {
    let started, cancelled, providerSignal;
    const upstreamStarted = new Promise(resolve => { started = resolve; });
    const upstreamCancelled = new Promise(resolve => { cancelled = resolve; });
    const base = await start(t, {
      config,
      fetchImpl: async (url, options) => {
        // Exercise cancellation of the second Graph API call as well as OpenAI calls.
        if (new URL(url).pathname.endsWith('/ig_hashtag_search')) return ok({ data: [{ id: '998877' }] });
        providerSignal = options.signal;
        return new Promise((_resolve, reject) => {
          providerSignal.addEventListener('abort', () => { cancelled(); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
          started();
        });
      },
    });
    const request = httpRequest(`${base}${path}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', Origin: base } }, response => response.resume());
    request.on('error', () => {}); // Destroying the browser connection intentionally resets the socket.
    t.after(() => request.destroy());
    request.end(body ? JSON.stringify(body) : undefined);
    await upstreamStarted;
    assert.equal(providerSignal.aborted, false);
    request.destroy();
    await upstreamCancelled;
    assert.equal(providerSignal.aborted, true);
    assert.equal((await fetch(`${base}/api/status`)).status, 200);
  });
}

test('an already-cancelled request never dispatches a provider call', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(generatePanorama({ destination: place, spot: place }, {
    config, signal: controller.signal, fetchImpl: () => assert.fail('Cancelled work must not be dispatched'),
  }), error => error.code === 'request_cancelled');
});

const oauthConfig = createConfig({ META_APP_ID: '123456789', META_APP_SECRET: 'meta-app-test-secret' });
const accountRows = [
  { id: '101', name: 'First Page', instagram_business_account: { id: '201', username: 'first_ig' } },
  { id: '102', name: 'Second Page', instagram_business_account: { id: '202', username: 'second_ig' } },
];

async function beginLogin(base) {
  const response = await fetch(`${base}/api/instagram/connect`, { redirect: 'manual' });
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('location'));
  const cookie = response.headers.getSetCookie().find(value => value.startsWith('crow_ig_oauth=')).split(';')[0];
  return { location, cookie, headers: response.headers };
}

async function finishLogin(base, login, code = 'test-code', extra = '') {
  return fetch(`${base}/api/instagram/callback?state=${login.location.searchParams.get('state')}&code=${code}${extra}`, {
    redirect: 'manual', headers: { Cookie: login.cookie, Origin: 'https://www.facebook.com', 'Sec-Fetch-Site': 'cross-site' },
  });
}

function loginCookie(response) {
  return response.headers.getSetCookie().find(value => value.startsWith('crow_ig_session=')).split(';')[0];
}

test('Instagram sign-in is available only after app configuration and uses a code flow with an HttpOnly state cookie', async t => {
  const unconfigured = await start(t);
  let response = await fetch(`${unconfigured}/api/status`);
  assert.equal((await response.json()).instagram.connection, 'app_not_configured');
  response = await fetch(`${unconfigured}/api/instagram/connect`, { redirect: 'manual' });
  assert.equal(response.headers.get('location'), '/?instagram=error&reason=app_not_configured');
  const base = await start(t, { config: oauthConfig });
  const login = await beginLogin(base);
  assert.equal(login.location.origin, 'https://www.facebook.com');
  assert.equal(login.location.pathname, '/v25.0/dialog/oauth');
  assert.equal(login.location.searchParams.get('response_type'), 'code');
  assert.equal(login.location.searchParams.get('redirect_uri'), `${base}/api/instagram/callback`);
  assert.match(login.location.searchParams.get('scope'), /instagram_basic/);
  assert.equal(login.location.searchParams.has('client_secret'), false);
  assert.match(login.headers.getSetCookie()[0], /HttpOnly; SameSite=Lax; Max-Age=600/);
  assert.equal(login.headers.get('referrer-policy'), 'no-referrer');
});

test('Instagram OAuth keeps tokens server-side, isolates browsers, and disconnects only the signed-in session', async t => {
  const calls = [];
  const base = await start(t, {
    config: oauthConfig,
    fetchImpl: async (url, options) => {
      const endpoint = new URL(url);
      calls.push({ endpoint, options });
      if (endpoint.pathname.endsWith('/oauth/access_token')) return ok({ access_token: 'oauth-user-token-secret', expires_in: 3600 });
      if (endpoint.pathname.endsWith('/me/accounts')) return ok({ data: [accountRows[0]] });
      if (endpoint.pathname.endsWith('/ig_hashtag_search')) return ok({ data: [{ id: '777' }] });
      return ok({ data: [{ id: 'post', media_type: 'IMAGE', media_url: 'https://cdn.example/photo.jpg', permalink: 'https://www.instagram.com/p/post/' }] });
    },
  });
  const login = await beginLogin(base);
  const callback = await finishLogin(base, login);
  assert.equal(callback.status, 302);
  assert.equal(callback.headers.get('location'), '/?instagram=connected');
  assert.equal(calls[0].endpoint.searchParams.get('client_secret'), oauthConfig.metaAppSecret);
  assert.equal(calls[0].endpoint.searchParams.get('redirect_uri'), `${base}/api/instagram/callback`);
  const cookie = loginCookie(callback);
  assert.doesNotMatch(cookie, /oauth-user-token-secret/);
  const status = await (await fetch(`${base}/api/status`, { headers: { Cookie: cookie } })).json();
  assert.equal(status.instagram.connection, 'connected');
  assert.equal(status.instagram.connectionSource, 'oauth');
  assert.equal(status.instagram.selectedAccount.id, '201');
  assert.doesNotMatch(JSON.stringify(status), /secret|test-code/);
  const stranger = await (await fetch(`${base}/api/status`)).json();
  assert.equal(stranger.capabilities.instagram, false);
  assert.deepEqual(stranger.instagram.accounts, []);
  const feed = await (await fetch(`${base}/api/instagram?hashtag=singapore`, { headers: { Cookie: cookie } })).json();
  assert.equal(feed.status, 'connected');
  const hashtagCall = calls.find(call => call.endpoint.pathname.endsWith('/ig_hashtag_search'));
  assert.equal(hashtagCall.options.headers.Authorization, 'Bearer oauth-user-token-secret');
  assert.equal(hashtagCall.endpoint.searchParams.get('user_id'), '201');
  const disconnect = await post(base, '/api/instagram/disconnect', {}, { Cookie: cookie });
  assert.equal(disconnect.status, 200);
  assert.match(disconnect.headers.getSetCookie()[0], /Max-Age=0/);
  const disconnected = await (await fetch(`${base}/api/status`, { headers: { Cookie: cookie } })).json();
  assert.equal(disconnected.capabilities.instagram, false);
});

test('Instagram OAuth requires explicit account selection and rejects another account ID', async t => {
  const base = await start(t, { config: oauthConfig, fetchImpl: async url => new URL(url).pathname.endsWith('/oauth/access_token') ? ok({ access_token: 'oauth-token', expires_in: 3600 }) : ok({ data: accountRows }) });
  const callback = await finishLogin(base, await beginLogin(base));
  assert.equal(callback.headers.get('location'), '/?instagram=select_account');
  const cookie = loginCookie(callback);
  const status = await (await fetch(`${base}/api/status`, { headers: { Cookie: cookie } })).json();
  assert.equal(status.instagram.connection, 'account_selection_required');
  assert.equal(status.capabilities.instagram, false);
  assert.equal(status.instagram.accounts.length, 2);
  const accounts = await (await fetch(`${base}/api/instagram/accounts`, { headers: { Cookie: cookie } })).json();
  assert.equal(accounts.selectedAccount, null);
  assert.equal((await post(base, '/api/instagram/select-account', { accountId: '999' }, { Cookie: cookie })).status, 403);
  assert.equal((await post(base, '/api/instagram/select-account', { accountId: '202' })).status, 401);
  const selected = await post(base, '/api/instagram/select-account', { accountId: '202' }, { Cookie: cookie });
  assert.equal((await selected.json()).selectedAccount.username, 'second_ig');
  assert.equal((await (await fetch(`${base}/api/status`, { headers: { Cookie: cookie } })).json()).capabilities.instagram, true);
});

test('Instagram OAuth rejects mismatched, replayed, expired, and denied sign-ins without leaking provider errors', async t => {
  let clock = Date.now(), calls = 0;
  const base = await start(t, { config: oauthConfig, now: () => clock, fetchImpl: async () => { calls += 1; return new Response('token-secret provider details', { status: 400 }); } });
  const first = await beginLogin(base);
  const second = await beginLogin(base);
  const mismatch = await finishLogin(base, { ...first, cookie: second.cookie });
  assert.equal(mismatch.headers.get('location'), '/?instagram=error&reason=state_mismatch');
  assert.equal(calls, 0);
  const denied = await finishLogin(base, first, 'unused', '&error=access_denied&error_description=private-data');
  assert.equal(denied.headers.get('location'), '/?instagram=error&reason=access_denied');
  const replay = await finishLogin(base, first);
  assert.equal(replay.headers.get('location'), '/?instagram=error&reason=state_expired');
  assert.equal(calls, 0);
  clock += 11 * 60_000;
  const expired = await finishLogin(base, second);
  assert.equal(expired.headers.get('location'), '/?instagram=error&reason=state_expired');
  assert.equal(calls, 0);
  const failure = await finishLogin(base, await beginLogin(base));
  assert.equal(failure.headers.get('location'), '/?instagram=error&reason=login_failed');
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify([...failure.headers]), /secret|private-data|test-code/);
});

test('Instagram sessions expire with the provider token and missing professional accounts remain disconnected', async t => {
  let clock = Date.now(), noAccounts = false;
  const base = await start(t, { config: oauthConfig, now: () => clock, fetchImpl: async url => new URL(url).pathname.endsWith('/oauth/access_token') ? ok({ access_token: 'expiring-token', expires_in: 10 }) : ok({ data: noAccounts ? [] : [accountRows[0]] }) });
  const callback = await finishLogin(base, await beginLogin(base));
  const cookie = loginCookie(callback);
  clock += 11_000;
  assert.equal((await (await fetch(`${base}/api/status`, { headers: { Cookie: cookie } })).json()).capabilities.instagram, false);
  noAccounts = true;
  const empty = await finishLogin(base, await beginLogin(base));
  assert.equal(empty.headers.get('location'), '/?instagram=error&reason=no_accounts');
  assert.equal(empty.headers.getSetCookie().some(value => value.startsWith('crow_ig_session=')), false);
});

test('production Instagram OAuth cookies are Secure and callbacks use the configured HTTPS origin', async t => {
  const base = await start(t, { config: { ...oauthConfig, publicOrigin: 'https://crow.example' } });
  const result = await new Promise((resolve, reject) => {
    const request = httpRequest(`${base}/api/instagram/connect`, { headers: { Host: 'crow.example', Origin: 'https://crow.example' } }, response => { response.resume(); resolve({ status: response.statusCode, headers: response.headers }); });
    request.on('error', reject); request.end();
  });
  assert.equal(result.status, 302);
  assert.match(result.headers['set-cookie'][0], /; Secure$/);
  assert.equal(new URL(result.headers.location).searchParams.get('redirect_uri'), 'https://crow.example/api/instagram/callback');
});
