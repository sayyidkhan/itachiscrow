import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.CROW_TEST_URL || 'http://127.0.0.1:8806/';
const liveSource = await readFile(new URL('../dist/live.js', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: process.env.CROW_BROWSER_EXECUTABLE, args: ['--no-sandbox'] });
try {
  for (const [width, height] of [[320,568], [390,844], [430,932], [740,390], [390,380], [1280,844]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.CROW_MAPS_KEY1="test";' }));
    await context.route('**/api/map-session', route => route.fulfill({ json: { ok: true } }));
    await context.route('**/api/status', route => route.fulfill({ json: { capabilities: { chat: true, live: true } } }));
    await context.route('https://overpass-api.de/**', route => route.fulfill({ json: { elements: [] } }));
    await context.route('**/live.js*', route => route.fulfill({ contentType: 'text/javascript', body: liveSource.replace('this.options = options;', 'this.options = options; window.cameraVoice = this;') }));
    await context.route('https://maps.googleapis.com/maps/api/js?*', route => route.fulfill({ contentType: 'text/javascript', body: `
      class Map3D extends HTMLElement {
        constructor(options){super();Object.assign(this,options);window.testMap=this;}
        flyCameraTo({endCamera}){Object.assign(this,endCamera);if(endCamera.altitudeMode==='RELATIVE_TO_MESH')this.center={...this.center,altitude:this.center.altitude+10};queueMicrotask(()=>this.dispatchEvent(new Event('gmp-animationend')));}
        stopCameraAnimation(){}
      }
      class Model extends HTMLElement {constructor(options){super();Object.assign(this,options);}}
      customElements.define('test-map',Map3D);customElements.define('test-model',Model);
      window.google={maps:{importLibrary:async name=>name==='places'?{Place:class{static async searchNearby(){return {places:[]};}}}:{Map3DElement:Map3D,Model3DElement:Model}}};
      window.initCrow();
    ` }));
    await context.addInitScript(() => { navigator.geolocation.getCurrentPosition = (_, error) => error({ code: 2 }); });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let args, results, requestContext, serial = 0;
    await context.route('**/api/chat', route => {
      const body = route.request().postDataJSON();
      requestContext = body.context;
      if (body.results) results = body.results;
      return route.fulfill({ json: body.results ? { conversationId: 'camera-chat', text: 'Camera check ' + serial, calls: [] } : { conversationId: 'camera-chat', calls: [{ name: 'camera', call_id: 'camera-' + serial, arguments: JSON.stringify(args) }] } });
    });
    const snapshot = () => page.evaluate(() => ({ position: CrowMap.getContext().position, heading: CrowMap.getContext().heading, view: CrowMap.getCameraView(), rendered: { heading: testMap.heading, tilt: testMap.tilt, range: testMap.range }, centre: { ...testMap.center } }));
    const send = async (message, action) => {
      args = action; results = null; serial++;
      await page.locator('#chat-input').fill(message);
      await page.locator('#chat-send').click();
      await page.getByText('Camera check ' + serial, { exact: true }).waitFor();
      return JSON.parse(results[0].output);
    };
    await page.goto(new URL('explore.html', base).href);
    await page.waitForFunction(() => window.CrowMap?.getContext().mapReady && window.cameraVoice);
    await page.locator('#auto-scene').evaluate(input => { input.checked = false; });
    await page.locator('#chat-open').click();
    const initial = await snapshot();
    assert.equal((await send('Look left 30 degrees and zoom in', { command: 'adjust', rotation: -30, tilt: null, zoom: .8 })).status, 'completed');
    assert.deepEqual((await snapshot()).view, { rotation: -30, tilt: initial.view.tilt, zoom: .8 });
    assert.deepEqual(requestContext.camera, (await snapshot()).view, 'Continuations receive the changed camera');
    assert(await page.locator('#companion').isVisible(), 'Camera actions keep chat open');
    assert(await page.locator('#camera-panel').isHidden(), 'Camera actions do not reopen the pad over chat');
    for (const [command, rotation, tilt] of [['above', -30, 0], ['side', 90, 65], ['front', -180, 65], ['behind', 0, 65]]) {
      await send('Show me from ' + command, { command });
      assert.deepEqual((await snapshot()).view, { rotation, tilt, zoom: .8 });
    }
    await send('Set the camera angle', { command: 'set', rotation: 170, tilt: 40, zoom: 2 });
    await send('A little further right', { command: 'adjust', rotation: 30 });
    assert.equal((await snapshot()).view.rotation, -160);
    const beforeInvalid = await snapshot();
    assert.equal((await send('Invalid camera action', { command: 'set', tilt: -1 })).status, 'error');
    assert.deepEqual(await snapshot(), beforeInvalid);
    await page.evaluate(() => { CrowMap.freeRoam(); testMap.center = { lat: 1.4, lng: 103.9, altitude: 100 }; testMap.heading = 123; testMap.tilt = 42; testMap.range = 90; });
    const beforeFind = await snapshot();
    await send('Find crow at this same angle', { command: 'find_crow' });
    assert.deepEqual((await snapshot()).rendered, beforeFind.rendered);
    assert.equal(await page.evaluate(() => CrowMap.getContext().freeRoaming), false);
    assert.deepEqual((await snapshot()).position, initial.position);
    assert.equal((await snapshot()).heading, initial.heading);
    const beforeStatus = await snapshot();
    await send('What is the camera angle?', { command: 'status' });
    assert.deepEqual(await snapshot(), beforeStatus);
    await send('Reset camera', { command: 'reset' });
    assert.deepEqual((await snapshot()).view, { rotation: 0, tilt: 65, zoom: 1 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const turn = send('Look right', { command: 'adjust', rotation: 90 });
    await page.waitForFunction(() => CrowMap.getCameraView().rotation === 90);
    const intermediate = (await snapshot()).rendered.heading;
    assert(intermediate > initial.heading && intermediate < initial.heading + 90, 'Chat uses smooth camera movement');
    await turn;
    await page.waitForFunction(() => Math.abs(testMap.heading - ((CrowMap.getContext().heading + 90) % 360)) < .01);
    assert.deepEqual((await snapshot()).position, initial.position);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#companion-toggle').click();
    await page.evaluate(async () => {
      await CrowMap.beginSteering();
      window.steerHeartbeat = setInterval(() => CrowMap.steer(1,0), 50);
      cameraVoice.status = 'connected'; cameraVoice.sessionId = 'simulated-voice';
      cameraVoice._actionAbort = new AbortController();
      window.voiceOutputs = [];
      cameraVoice._channel = { readyState: 'open', send: value => voiceOutputs.push(JSON.parse(value)) };
      cameraVoice._notify();
    });
    const voiceResult = await page.evaluate(async () => {
      const before = CrowMap.getCameraView();
      const event = event => cameraVoice._receive({ type: 'response.event', delegation_id: 'camera-test', event }, cameraVoice._generation);
      event({ type: 'response.created', response: { id: 'voice-camera' } });
      event({ type: 'response.output_item.done', item: { type: 'function_call', call_id: 'voice-zoom', name: 'camera', arguments: JSON.stringify({ command: 'adjust', rotation: -15, tilt: -10, zoom: .8 }) } });
      event({ type: 'response.completed', response: { id: 'voice-camera' } });
      await cameraVoice._actionQueue;
      return { before, view: CrowMap.getCameraView(), steering: CrowMap.getContext().steering, outputs: voiceOutputs, context: cameraVoice.context };
    });
    assert.equal(voiceResult.steering, true, 'Spoken camera commands preserve active steering');
    assert.equal(voiceResult.view.rotation, voiceResult.before.rotation - 15);
    assert.equal(voiceResult.view.tilt, voiceResult.before.tilt - 10);
    assert.equal(voiceResult.view.zoom, voiceResult.before.zoom * .8);
    assert.deepEqual(voiceResult.context.camera, voiceResult.view);
    assert.equal(JSON.parse(voiceResult.outputs.find(event => event.item?.type === 'function_call_output').item.output).status, 'completed');
    await page.evaluate(() => { clearInterval(steerHeartbeat); CrowMap.endSteering(); cameraVoice.status = 'idle'; cameraVoice._notify(); });
    assert.deepEqual(errors, []);
    console.log(`${width}×${height}: chat camera commands, smooth motion, presets, exact values, validation, same-angle find crow and simulated voice while steering passed.`);
    await context.close();
  }
} finally { await browser.close(); }
