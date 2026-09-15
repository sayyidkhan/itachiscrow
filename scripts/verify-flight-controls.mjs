import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.CROW_TEST_URL || 'http://127.0.0.1:8806/';
const output = new URL('../_debug/flight-controls/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CROW_BROWSER_EXECUTABLE, args: ['--no-sandbox'] });
try {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [740, 390], [390, 380], [1280, 844]]) {
    if (process.env.CROW_TEST_VIEWPORT && process.env.CROW_TEST_VIEWPORT !== `${width}x${height}`) continue;
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: true });
    context.setDefaultTimeout(30_000);
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.CROW_MAPS_KEY1="test";' }));
    await context.route('**/api/map-session', route => route.fulfill({ json: { ok: true } }));
    await context.route('**/api/status', route => route.fulfill({ json: { capabilities: { chat: true, live: true, panorama: true } } }));
    let panoramaRequests = 0;
    await context.route('**/api/panorama', route => { panoramaRequests++; return route.fulfill({status:503,json:{error:{message:'Generation disabled in verification'}}}); });
    await context.route('https://maps.googleapis.com/maps/api/js?*', route => route.fulfill({ contentType: 'text/javascript', body: `
      (()=>{window.nearbyRequests=[]; window.nearbyMode='success';
      class Map3D extends HTMLElement {
        constructor(options){super();Object.assign(this,options);window.testMap=this;}
        flyCameraTo({endCamera}){Object.assign(this,endCamera);if(endCamera.altitudeMode==='RELATIVE_TO_MESH')this.center={...this.center,altitude:this.center.altitude+10};queueMicrotask(()=>this.dispatchEvent(new Event('gmp-animationend')));}
        stopCameraAnimation(){}
      }
      class Model extends HTMLElement {constructor(options){super();Object.assign(this,options);}}
      customElements.define('test-map',Map3D);customElements.define('test-model',Model);
      class Place {
        static async searchNearby(request){
          window.nearbyRequests.push(request);
          if(window.nearbyMode==='error')throw Error('Provider unavailable');
          if(window.nearbyMode==='pending')await new Promise(resolve=>window.releaseNearby=resolve);
          if(window.nearbyMode==='empty')return {places:[]};
          return {places:Array.from({length:8},(_,i)=>({id:'place-'+i,displayName:'Waterfront place '+(i+1),primaryTypeDisplayName:'Museum',location:{lat:request.locationRestriction.center.lat+i*.0001,lng:request.locationRestriction.center.lng},async fetchFields(){},photos:[{getURI:()=>new URL('images/crow-mark.svg',document.baseURI).href,authorAttributions:[{displayName:'Photo contributor',uri:'https://example.com/photographer'}]}]}))};
        }
      }
      window.google={maps:{importLibrary:async name=>name==='places'?{Place}:{Map3DElement:Map3D,Model3DElement:Model}}};
      window.initCrow();})();
    ` }));
    await context.addInitScript(() => {
      navigator.geolocation.getCurrentPosition = (_, error) => error({ code: 2 });
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(new URL('explore.html', base).href);
      await page.waitForFunction(() => window.CrowMap?.getContext().mapReady);
      await page.waitForFunction(() => ['fly', 'free-roam', 'land-map', 'nearby', 'steering-toggle'].every(id => !document.getElementById(id).disabled));
      await page.locator('#auto-scene').evaluate(input => { input.checked = false; });
      for (const id of ['fly', 'free-roam', 'circle-map', 'land-map', 'nearby']) {
        assert(await page.locator('#' + id).isVisible());
        assert(await page.locator('#' + id).isEnabled(), id + ' is enabled');
      }
      assert.equal(await page.evaluate(() => nearbyRequests.length), 0);
      await page.locator('#fly').click();
      await page.waitForFunction(() => window.CrowMap.getContext().mode === 'taking-off');
      await page.waitForFunction(() => window.CrowMap.getContext().mode === 'hovering');
      const pose = await page.evaluate(() => ({ ...document.querySelector('test-model').position }));
      await page.locator('#free-roam').click();
      assert.equal(await page.locator('#free-roam').getAttribute('aria-pressed'), 'true');
      await page.evaluate(() => { testMap.center = { lat: 1.3, lng: 103.86, altitude: 100 }; });
      await page.locator('#free-roam').click();
      assert.equal(await page.locator('#free-roam').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.evaluate(() => testMap.center.lat), pose.lat);
      await page.locator('#land-map').click();
      assert.equal(await page.locator('#land-map').textContent(), 'Cancel land');
      await page.locator('#land-map').click();
      assert.equal(await page.evaluate(() => CrowMap.getContext().landingMode), false);
      await page.evaluate(() => CrowMap.flyTo({ name: 'The Arts House', lat: 1.2886, lng: 103.851 }));
      await page.locator('.nearby-card').first().waitFor();
      assert.equal(await page.evaluate(() => nearbyRequests.length), 1);
      assert.equal(await page.locator('.nearby-card').count(), 8);
      assert.equal(await page.locator('.nearby-credits a').first().getAttribute('href'), 'https://example.com/photographer');
      await page.locator('.nearby-art img').first().dispatchEvent('error');
      await page.locator('.nearby-art .discovery-art img').first().waitFor({ state: 'attached' });
      const fallbackImage = page.locator('.nearby-art .discovery-art img').first();
      if (await fallbackImage.isVisible()) await fallbackImage.evaluate(image => image.decode());
      assert.equal(await page.locator('.nearby-illustration-label').first().textContent(), 'Illustration');
      await page.locator('.nearby-art .discovery-art img').first().dispatchEvent('error');
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.nearby-art .art-unavailable').count(), 1);
      assert.equal(await page.locator('.nearby-art .art-unavailable img').count(), 0);
      const bounds = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return { panel: rect('#nearby-panel'), toolbar: rect('.controls'), map: rect('#world'), chat: rect('#chat-launcher'), overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert(!bounds.overflow);
      assert(bounds.panel.top >= bounds.toolbar.bottom, 'Carousel does not cover the flight controls: ' + JSON.stringify(bounds));
      assert(bounds.panel.bottom <= bounds.map.bottom - 40, 'Google attribution remains clear');
      assert(bounds.panel.bottom <= bounds.chat.top || bounds.panel.right <= bounds.chat.left, 'Carousel stays clear of Chat and Talk');
      await page.locator('#places').focus();
      await page.keyboard.press('ArrowRight');
      assert(await page.locator('#places').evaluate(rail => rail.scrollLeft > 0));
      await page.screenshot({ path: new URL(`arrival-${width}x${height}.png`, output).pathname });
      await page.locator('#nearby-close').click();
      assert(await page.locator('#nearby-panel').isHidden());
      await page.locator('#nearby').click();
      assert.equal(await page.evaluate(() => nearbyRequests.length), 1);
      await page.locator('.nearby-card button').first().click();
      await page.locator('#details').waitFor();
      await page.getByRole('button', { name: 'Land here ↘' }).click();
      await page.waitForFunction(() => CrowMap.getContext().mode === 'landed');
      await page.waitForFunction(() => nearbyRequests.length === 2);
      assert.equal(await page.locator('#fly').textContent(), 'Lift off');
      await page.locator('#chat-open').click();
      if (width <= 1000) assert(await page.locator('#nearby-panel').isHidden());
      await page.locator('#companion-toggle').click();
      assert(await page.locator('#nearby-panel').isVisible());
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('crow:voice-state', { detail: { status: 'connected', muted: false } })));
      if (width <= 1000) assert(await page.locator('#nearby-panel').isHidden());
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('crow:voice-state', { detail: { status: 'idle' } })));
      await page.evaluate(() => { nearbyMode = 'error'; return CrowMap.flyTo({ name: 'Next stop', lat: 1.29, lng: 103.85 }); });
      await page.getByRole('button', { name: 'Try nearby again' }).waitFor();
      await page.evaluate(() => { nearbyMode = 'success'; });
      await page.getByRole('button', { name: 'Try nearby again' }).click();
      await page.locator('.nearby-card').first().waitFor();
      await page.evaluate(() => { nearbyMode = 'pending'; return CrowMap.flyTo({ name: 'Old stop', lat: 1.3, lng: 103.86 }); });
      await page.waitForFunction(() => Boolean(window.releaseNearby));
      await page.locator('#nearby-close').click();
      await page.evaluate(() => { nearbyMode = 'success'; releaseNearby(); });
      await page.waitForFunction(() => !document.getElementById('nearby').disabled);
      assert(await page.locator('#nearby-panel').isHidden(), 'Closing a pending search stays closed');
      await page.evaluate(() => { window.releaseNearby = null; nearbyMode = 'pending'; return CrowMap.flyTo({ name: 'Stale stop', lat: 1.31, lng: 103.87 }); });
      await page.waitForFunction(() => Boolean(window.releaseNearby));
      await page.evaluate(() => { nearbyMode = 'success'; return CrowMap.flyTo({ name: 'Latest stop', lat: 1.32, lng: 103.88 }); });
      await page.locator('.nearby-card').first().waitFor();
      await page.evaluate(() => releaseNearby());
      assert.equal(await page.locator('#nearby-title').textContent(), 'Around Latest stop');
      await page.evaluate(() => { nearbyMode = 'empty'; return CrowMap.flyTo({ name: 'Quiet stop', lat: 1.33, lng: 103.89 }); });
      await page.getByText('No places returned.', { exact: false }).waitFor();
      await page.locator('#nearby-close').click();
      await page.locator('#steering-toggle').click();
      const pad = page.locator('#crow-joystick');
      const steeringBounds = await pad.boundingBox();
      assert(steeringBounds.y >= bounds.toolbar.bottom, 'Joystick stays below the toolbar');
      assert(steeringBounds.y + steeringBounds.height < height - 40, 'Joystick clears attribution');
      const start = await page.evaluate(() => CrowMap.getContext());
      await pad.focus();
      await page.keyboard.down('ArrowUp');
      await page.waitForFunction(lat => Math.abs(CrowMap.getContext().position.lat - lat) > .00003, start.position.lat);
      await page.keyboard.up('ArrowUp');
      const stopped = await page.evaluate(() => CrowMap.getContext());
      assert.equal(stopped.steering, false);
      assert.equal(stopped.destination.lat, stopped.position.lat, 'Nearby context follows the steered crow');
      assert.equal(stopped.destination.lng, stopped.position.lng);
      await page.waitForTimeout(180);
      assert.deepEqual(await page.evaluate(() => CrowMap.getContext().position), stopped.position);
      await page.keyboard.down('ArrowRight');
      await page.waitForFunction(heading => Math.abs(CrowMap.getContext().heading - heading) > 12, stopped.heading);
      await page.keyboard.up('ArrowRight');
      const beforePointer = await page.evaluate(() => CrowMap.getContext().position);
      await page.mouse.move(steeringBounds.x + steeringBounds.width / 2, steeringBounds.y + 10);
      await page.mouse.down();
      await page.waitForFunction(lat => Math.abs(CrowMap.getContext().position.lat - lat) > .00002, beforePointer.lat);
      await page.mouse.move(steeringBounds.x + steeringBounds.width + 20, steeringBounds.y - 20);
      await page.mouse.up();
      assert.equal(await page.evaluate(() => CrowMap.getContext().steering), false);
      if (width === 390 && height === 844) {
        const cdp = await context.newCDPSession(page);
        const centre = {x:steeringBounds.x+steeringBounds.width/2,y:steeringBounds.y+steeringBounds.height/2};
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[centre]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...centre,y:centre.y-30}]});
        await page.waitForFunction(() => CrowMap.getContext().steering);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[centre]});
        await page.waitForTimeout(100);
        const neutral = await page.evaluate(() => CrowMap.getContext().position);
        await page.waitForTimeout(150);
        assert.deepEqual(await page.evaluate(() => CrowMap.getContext().position),neutral,'Neutral joystick holds position');
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...centre,y:centre.y-30}]});
        await page.waitForFunction(lat => Math.abs(CrowMap.getContext().position.lat-lat)>.00001,neutral.lat);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
        assert.equal(await page.evaluate(() => CrowMap.getContext().steering),false,'Touch cancellation stops steering');
        await page.evaluate(() => CrowMap.beginSteering());
        await page.waitForTimeout(800);
        assert.equal(await page.evaluate(() => CrowMap.getContext().steering),false,'Lost input heartbeat stops steering');
      }
      await pad.focus();
      await page.keyboard.down('ArrowUp');
      await page.waitForFunction(() => CrowMap.getContext().steering);
      await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.keyboard.up('ArrowUp');
      assert.equal(await page.evaluate(() => CrowMap.getContext().steering), false);
      const beforeVoice = await page.evaluate(() => CrowMap.getContext());
      await page.evaluate(() => CrowMap.navigate('higher'));
      const afterVoice = await page.evaluate(() => CrowMap.getContext());
      assert(afterVoice.position.altitude > beforeVoice.position.altitude + 20);
      assert.equal(afterVoice.steering, false, 'Voice directions finish hovering');
      await page.evaluate(() => { window.cancelledNavigation = CrowMap.navigate('forward'); });
      await page.waitForFunction(() => CrowMap.getContext().steering);
      await page.evaluate(() => CrowMap.pause());
      assert.equal(await page.evaluate(async () => (await cancelledNavigation).cancelled), true);
      await page.evaluate(() => CrowMap.navigate('land_here'));
      await page.waitForFunction(() => CrowMap.getContext().mode === 'landed');
      await page.locator('#nearby-close').click();
      await page.locator('#steering-toggle').click();
      await pad.focus();
      await page.keyboard.down('ArrowUp');
      await page.waitForFunction(() => CrowMap.getContext().mode === 'taking-off');
      await page.keyboard.up('ArrowUp');
      await page.waitForTimeout(1400);
      assert.equal(await page.evaluate(() => CrowMap.getContext().steering), false, 'Release during takeoff cancels late steering');
      await page.screenshot({ path: new URL(`steering-${width}x${height}.png`, output).pathname });
      await page.locator('#steering-toggle').click();
      let commandResult, command = 'left';
      await context.route('**/api/chat', route => {
        const body = route.request().postDataJSON();
        if (body.results) commandResult = body.results;
        return route.fulfill({json: body.results ? {text:command === 'left' ? 'Turned left.' : 'Landed here.',calls:[]} : {conversationId:'steering-check',calls:[{name:'navigate',call_id:command,arguments:JSON.stringify({command})}]}});
      });
      await page.locator('#chat-open').click();
      await page.locator('#chat-input').fill('Turn left');
      await page.locator('#chat-send').click();
      await page.getByText('Turned left.', {exact:true}).waitFor();
      assert.equal(JSON.parse(commandResult[0].output).command, 'left');
      assert.equal(JSON.parse(commandResult[0].output).status, 'completed');
      assert.equal(await page.evaluate(() => CrowMap.getContext().steering), false);
      command = 'land_here';
      await page.locator('#auto-scene').evaluate(input => { input.checked = true; });
      const landPosition = await page.evaluate(() => CrowMap.getContext().position);
      await page.locator('#chat-input').fill('Land here');
      await page.locator('#chat-send').click();
      await page.getByText('Landed here.', {exact:true}).waitFor();
      const landed = await page.evaluate(() => CrowMap.getContext());
      assert.equal(landed.mode,'landed');
      assert.equal(landed.spot.lat,landPosition.lat);
      assert.equal(landed.spot.lng,landPosition.lng);
      assert.equal(panoramaRequests,0,'Directional land here never generates an image, even with auto-scene enabled');
      await page.locator('#companion-toggle').click();
      for (const landmark of [
        {name:'Eiffel Tower, Paris',lat:48.85837,lng:2.294481,radius:420,altitude:180},
        {name:'Golden Gate Bridge, San Francisco',lat:37.8199,lng:-122.4783,radius:900,altitude:220}
      ]) {
        await page.evaluate(place => CrowMap.flyTo(place), landmark);
        await page.locator('#circle-map').click();
        const view = await page.evaluate(() => ({ state:CrowMap.getContext(), camera:testMap.center }));
        assert.equal(view.state.mode,'hovering','Reduced motion uses a still landmark view');
        assert(Math.abs((view.state.position.lat-landmark.lat)*111320+landmark.radius)<1);
        assert.equal(view.state.position.altitude,landmark.altitude);
        assert.equal(view.camera.lat,view.state.position.lat,'The embedded crow stays in the camera foreground');
        assert.equal(await page.locator('#circle-map').getAttribute('aria-pressed'),'false');
      }
      if (width === 390 && height === 844) {
        await page.emulateMedia({reducedMotion:'no-preference'});
        await page.locator('#circle-map').click();
        await page.waitForFunction(() => CrowMap.getContext().mode==='circling');
        assert.equal(await page.locator('#circle-map').getAttribute('aria-pressed'),'true');
        const initialOrbit = await page.evaluate(() => CrowMap.getContext().position);
        await page.waitForFunction(position => Math.abs(CrowMap.getContext().position.lng-position.lng)>.0001,initialOrbit);
        await page.locator('#circle-map').click();
        const pausedOrbit = await page.evaluate(() => CrowMap.getContext().position);
        assert.equal(await page.evaluate(() => CrowMap.getContext().mode),'hovering');
        await page.waitForTimeout(250);
        assert.deepEqual(await page.evaluate(() => CrowMap.getContext().position),pausedOrbit,'Stopping cancels orbit frames');
        await page.locator('#circle-map').click();
        await page.waitForFunction(() => CrowMap.getContext().mode==='circling');
        await page.locator('#free-roam').click();
        assert.equal(await page.evaluate(() => CrowMap.getContext().freeRoaming),true);
        await page.locator('#circle-map').click();
        await page.waitForFunction(() => CrowMap.getContext().mode==='circling');
        assert.equal(await page.evaluate(() => CrowMap.getContext().freeRoaming),false);
        await page.waitForFunction(() => CrowMap.getContext().mode==='hovering',null,{timeout:35000});
        assert.match(await page.locator('#status').textContent(),/Orbit complete/);
        assert.equal(await page.locator('#circle-map').getAttribute('aria-pressed'),'false');
        assert.equal(panoramaRequests,0,'Orbit never generates an image');
      }
      assert.deepEqual(errors, []);
      console.log(width + '×' + height + ': flight, carousel, joystick, keyboard, cancellation, bounded directions, command handler and attribution passed.');
    } catch (error) {
      await page.screenshot({ path: new URL(`failure-${width}x${height}.png`, output).pathname });
      console.error({ width, height, errors, loading: await page.locator('#loading').textContent() });
      throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
