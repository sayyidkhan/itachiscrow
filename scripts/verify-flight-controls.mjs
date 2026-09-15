import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.CROW_TEST_URL || 'http://127.0.0.1:8806/';
const output = new URL('../_debug/flight-controls/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CROW_BROWSER_EXECUTABLE, args: ['--no-sandbox'] });
try {
  for (const [width, height] of [[320, 568], [375, 667], [390, 844], [430, 932], [740, 390], [390, 380], [1280, 844]]) {
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
          return {places:Array.from({length:8},(_,i)=>({id:'place-'+i,displayName:'Waterfront place '+(i+1),primaryTypeDisplayName:'Museum',location:{lat:request.locationRestriction.center.lat+i*.0001,lng:request.locationRestriction.center.lng},async fetchFields(){},photos:i===7?[]:[{getURI:()=>new URL('images/crow-mark.svg',document.baseURI).href,authorAttributions:[{displayName:'Photo contributor',uri:'https://example.com/photographer'}]}]}))};
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
      await page.locator('#steering-toggle').click();
      assert(await page.locator('#steering-liftoff').isVisible(), 'First steering session exposes Lift off');
      assert(await page.locator('#crow-joystick').isDisabled(), 'Lift off is required before manual steering');
      await page.screenshot({path:new URL(`initial-liftoff-${width}x${height}.png`,output).pathname});
      await page.locator('#chat-open').click();
      await page.locator('#chat-input').fill('Keep this draft');
      await page.evaluate(() => {
        document.getElementById('companion').classList.add('has-conversation');
        document.dispatchEvent(new CustomEvent('crow:flight', {detail:{stage:'cruising',routeDistanceMeters:13585000,progress:.45,from:{name:'Esplanade, Singapore'},to:{name:'Golden Gate Bridge, San Francisco'}}}));
      });
      const journeyBounds = await page.evaluate(() => {
        const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
        return {travel:rect('#travel-transition'),heading:rect('.companion-heading'),body:rect('.companion-body'),input:rect('#chat-input'),panel:rect('#companion')};
      });
      assert(journeyBounds.travel.top >= journeyBounds.heading.bottom, 'Travel never covers chat heading or close button');
      assert(journeyBounds.travel.bottom <= journeyBounds.body.top, 'Travel never covers conversation');
      assert(journeyBounds.input.bottom <= journeyBounds.panel.bottom, 'Composer stays inside chat during travel');
      assert(journeyBounds.body.height > 20, 'Conversation remains readable during travel');
      await page.screenshot({path:new URL(`travel-chat-${width}x${height}.png`,output).pathname});
      await page.locator('#companion-toggle').click();
      assert(await page.locator('#travel-transition').isVisible(), 'Closing chat preserves journey progress');
      const standalone = await page.evaluate(() => ({travel:document.getElementById('travel-transition').getBoundingClientRect().toJSON(),controls:document.querySelector('.controls').getBoundingClientRect().toJSON(),chat:document.getElementById('chat-launcher').getBoundingClientRect().toJSON()}));
      assert(standalone.travel.top >= standalone.controls.bottom, 'Travel clears flight controls');
      assert(standalone.travel.bottom <= standalone.chat.top || standalone.travel.right <= standalone.chat.left, 'Travel clears chat launcher');
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('crow:voice-state',{detail:{status:'connected',muted:false}})));
      assert.equal(await page.locator('#voice-overlay > #travel-transition').count(),1, 'Voice contains journey progress');
      await page.locator('#voice-chat').click();
      assert.equal(await page.locator('#chat-input').inputValue(),'Keep this draft');
      assert.equal(await page.locator('#companion > #travel-transition').count(),1);
      await page.evaluate(() => document.dispatchEvent(new CustomEvent('crow:flight',{detail:{cancelled:true}})));
      assert(await page.locator('#travel-transition').isHidden(), 'Cancelled journey is hidden inside chat');
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('crow:voice-state',{detail:{status:'idle'}})));
      await page.locator('#chat-input').fill('');
      await page.locator('#companion-toggle').click();
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
      assert(await page.locator('#project-vote').isVisible(), 'Completed destination flight offers voting');
      await page.locator('.nearby-card').first().waitFor();
      assert.equal(await page.evaluate(() => nearbyRequests.length), 1);
      assert.equal(await page.locator('.nearby-card').count(), 8);
      assert.deepEqual(await page.evaluate(() => nearbyRequests.at(-1).locationRestriction), {center:{lat:1.2886,lng:103.851},radius:900});
      assert.equal(await page.locator('.nearby-distance').first().textContent(),'0 m away');
      assert.equal(await page.locator('.nearby-card').last().locator('.nearby-placeholder-label').textContent(),'No photo available');
      assert.equal(await page.locator('.nearby-credits a').first().getAttribute('href'), 'https://example.com/photographer');
      await page.locator('.nearby-art img').first().dispatchEvent('error');
      assert.equal(await page.locator('.nearby-card').first().locator('.nearby-placeholder-label').textContent(),'No photo available');
      assert.equal(await page.locator('.nearby-card').first().locator('img, .nearby-credits').count(),0);
      assert.equal(await page.locator('#places .discovery-art, #places img[src*="destinations/"]').count(),0,'Nearby never uses curated landmark artwork');
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
      assert.deepEqual(await page.evaluate(() => nearbyRequests.at(-1).locationRestriction.center),{lat:1.32,lng:103.88},'Nearby searches follow the latest destination');
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
        await page.waitForFunction(() => !CrowMap.getContext().steering);
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
      await page.locator('#chat-open').click();
      await page.locator('#chat-input').fill('Keep chatting while I fly');
      assert(await pad.isHidden(), 'Text chat closes steering');
      assert.equal(await page.evaluate(() => CrowMap.getContext().steering), false);
      await page.locator('#steering-toggle').click();
      assert(await page.locator('#companion').isHidden(), 'Opening steering closes text chat');
      for (const id of ['crow-joystick', 'steering-roll', 'steering-speed']) assert(await page.locator('#' + id).isVisible());
      const dockBounds = await page.evaluate(() => {
        const rect = id => document.getElementById(id).getBoundingClientRect().toJSON();
        return {pad:rect('crow-joystick'),chat:rect('companion'),roll:rect('steering-roll'),speed:rect('steering-speed'),send:rect('chat-send')};
      });
      assert(dockBounds.roll.bottom <= height - 40 && dockBounds.speed.bottom <= height - 40, 'Action buttons clear attribution');
      await page.screenshot({path:new URL(`steering-chat-${width}x${height}.png`,output).pathname});
      const rates = [];
      for (const multiplier of [1, 2, 3, 1]) {
        assert.equal(await page.locator('#steering-speed-value').textContent(), multiplier + '×');
        assert.equal(await page.evaluate(() => CrowMap.getContext().steeringSpeed), multiplier);
        await pad.focus();
        const origin = await page.evaluate(() => ({position:CrowMap.getContext().position,time:performance.now()}));
        await page.keyboard.down('ArrowUp');
        await page.waitForFunction(() => CrowMap.getContext().steering);
        await page.waitForTimeout(600);
        await page.keyboard.up('ArrowUp');
        const end = await page.evaluate(() => ({position:CrowMap.getContext().position,time:performance.now()}));
        const metres = Math.hypot((end.position.lat-origin.position.lat)*111320,(end.position.lng-origin.position.lng)*111320*Math.cos(origin.position.lat*Math.PI/180));
        rates.push(metres/((end.time-origin.time)/1000));
        if (rates.length < 4) await page.locator('#steering-speed').click();
      }
      assert(rates[1] > rates[0]*1.5 && rates[2] > rates[0]*2.3, 'Speed changes real travel distance: '+JSON.stringify(rates));
      assert(rates[3] < rates[2]*.5, 'Speed wraps back to 1×');
      await page.locator('#steering-roll').click();
      assert.equal(await page.evaluate(() => CrowMap.getContext().rolling), false, 'Reduced motion skips the roll');
      await page.emulateMedia({reducedMotion:'no-preference'});
      await page.locator('#steering-roll').click();
      await page.waitForFunction(() => document.querySelector('test-model').orientation.roll > 90);
      assert.equal(await page.evaluate(() => testMap.roll), 0, 'The crow rolls while the camera remains level');
      assert(await page.locator('#steering-roll').isDisabled(), 'Repeated rolls cannot stack');
      await page.waitForFunction(() => !CrowMap.getContext().rolling);
      assert.equal(await page.evaluate(() => document.querySelector('test-model').orientation.roll), 0, 'Roll finishes upright');
      await page.locator('#steering-roll').click();
      await page.waitForFunction(() => CrowMap.getContext().rolling);
      await page.evaluate(() => CrowMap.pause());
      assert.equal(await page.evaluate(() => document.querySelector('test-model').orientation.roll), 0, 'Stop restores upright pose');
      assert.equal(await page.evaluate(() => CrowMap.getContext().rolling), false);
      if (width === 390 && height === 844) {
        const cdp = await context.newCDPSession(page);
        const point = async selector => { const r = await page.locator(selector).boundingBox(); return {x:r.x+r.width/2,y:r.y+r.height/2}; };
        const stick = {...await point('#crow-joystick'),id:1}; stick.y-=28;
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[stick]});
        await page.waitForFunction(()=>CrowMap.getContext().steering);
        const boost = {...await point('#steering-speed'),id:2};
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[stick,boost]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[boost]});
        await page.waitForFunction(()=>CrowMap.getContext().steeringSpeed===2);
        assert(await page.evaluate(()=>CrowMap.getContext().steering),'Second-finger speed tap preserves steering');
        const roll = {...await point('#steering-roll'),id:2};
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[stick,roll]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[roll]});
        await page.waitForFunction(()=>CrowMap.getContext().rolling);
        assert(await page.evaluate(()=>CrowMap.getContext().steering),'Second-finger roll preserves steering');
        await page.waitForFunction(()=>!CrowMap.getContext().rolling);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        assert.equal(await page.evaluate(()=>CrowMap.getContext().steering),false,'Releasing touch still stops movement');
        assert.equal(await page.evaluate(()=>CrowMap.getContext().steeringSpeed),2,'A secondary touch changes speed once');
        await page.evaluate(()=>CrowMap.setSteeringSpeed(1));
        await page.evaluate(() => {
          window.originalAnimationFrame = window.requestAnimationFrame;
          window.requestAnimationFrame = callback => setTimeout(() => originalAnimationFrame(callback), 750);
        });
        await pad.focus();
        await page.keyboard.down('ArrowUp');
        await page.waitForFunction(()=>CrowMap.getContext().steering);
        await page.waitForTimeout(1800);
        assert(await page.evaluate(()=>CrowMap.getContext().steering),'Held input survives slow rendering frames');
        await page.keyboard.up('ArrowUp');
        await page.evaluate(()=>{window.requestAnimationFrame=window.originalAnimationFrame;});
        assert.equal(await page.evaluate(()=>CrowMap.getContext().steering),false,'Release stops steering even during slow frames');
      }
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.locator('#chat-open').click();
      assert.equal(await page.locator('#chat-input').inputValue(), 'Keep chatting while I fly');
      await page.locator('#chat-input').fill('');
      await page.locator('#companion-toggle').click();
      await page.locator('#steering-toggle').click();
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('crow:voice-state',{detail:{status:'connected',muted:false}})));
      assert(await pad.isVisible(), 'Voice captions preserve steering');
      await pad.focus();
      await page.keyboard.down('ArrowRight');
      await page.waitForFunction(() => CrowMap.getContext().steering);
      await page.keyboard.up('ArrowRight');
      assert(await page.locator('#voice-overlay').isVisible(), 'Steering keeps voice controls visible');
      await page.evaluate(() => {
        for (const [role, text] of [['user', 'Show me the waterfront.'], ['assistant', 'We can fly along Marina Bay and circle the landmarks.']]) {
          window.dispatchEvent(new CustomEvent('crow:voice-caption', { detail: { role, text } }));
        }
      });
      const voiceLayout = await page.evaluate(() => {
        const rect = id => document.getElementById(id).getBoundingClientRect().toJSON();
        return { voice: rect('voice-overlay'), pad: rect('crow-joystick'), end: rect('voice-overlay-end'), status: rect('voice-orb-status'), style: rect('voice-style-toggle') };
      });
      const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      assert(!overlaps(voiceLayout.voice, voiceLayout.pad), 'Voice panel leaves joystick clear');
      assert(!overlaps(voiceLayout.status, voiceLayout.style), 'Orb style button leaves the call status readable');
      assert(voiceLayout.end.bottom <= height - 40 && voiceLayout.voice.top >= 64, 'Call controls stay on screen above attribution');
      await page.screenshot({path:new URL(`steering-voice-${width}x${height}.png`,output).pathname});
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('crow:voice-state',{detail:{status:'idle'}})));
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
      assert(await pad.isDisabled());
      await page.locator('#steering-liftoff').click();
      await page.waitForFunction(() => CrowMap.getContext().mode === 'taking-off');
      assert(await pad.isDisabled(), 'Steering waits for the full liftoff animation');
      await page.locator('#steering-liftoff').click();
      await page.waitForTimeout(1400);
      assert.equal(await page.evaluate(() => CrowMap.getContext().steering), false, 'Stopping takeoff never starts steering later');
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
