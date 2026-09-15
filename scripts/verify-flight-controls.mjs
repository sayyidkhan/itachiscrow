import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.CROW_TEST_URL || 'http://127.0.0.1:8806/';
const output = new URL('../_debug/flight-controls/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CROW_BROWSER_EXECUTABLE, args: ['--no-sandbox'] });
try {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [740, 390], [390, 380], [1280, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.CROW_MAPS_KEY1="test";' }));
    await context.route('**/api/map-session', route => route.fulfill({ json: { ok: true } }));
    await context.route('**/api/status', route => route.fulfill({ json: { capabilities: { chat: true, live: true } } }));
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
      for (const id of ['fly', 'free-roam', 'land-map', 'nearby']) {
        assert(await page.locator('#' + id).isVisible());
        assert(await page.locator('#' + id).isEnabled());
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
      await page.locator('.nearby-art svg').first().waitFor({ state: 'attached' });
      assert.equal(await page.locator('.nearby-illustration-label').first().textContent(), 'Illustration');
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
      assert.equal(await page.locator('#fly').textContent(), 'Lift off ↗');
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
      assert.deepEqual(errors, []);
      console.log(width + '×' + height + ': liftoff, free roam, follow, landing, arrival cards, attribution, scrolling, overlays, retry and stale results passed.');
    } catch (error) {
      await page.screenshot({ path: new URL(`failure-${width}x${height}.png`, output).pathname });
      console.error({ width, height, errors, loading: await page.locator('#loading').textContent() });
      throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); }
