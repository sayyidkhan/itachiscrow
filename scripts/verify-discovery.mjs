import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.CROW_TEST_URL || 'http://127.0.0.1:8806/';
const output = new URL('../_debug/discovery/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CROW_BROWSER_EXECUTABLE, args: ['--no-sandbox'] });
const sampleImage = await readFile(new URL('../dist/images/destinations/gardens.webp', import.meta.url));
const generatedImage = await readFile(new URL('../dist/images/author-default.jpeg', import.meta.url));
const sample = { summary: 'A gentle waterfront day, with a gallery if it rains.', places: ['Morning', 'Lunch', 'Afternoon', 'Evening'].map((label, i) => ({ name: ['Esplanade', 'Local coffee stop', 'National Gallery', 'Gardens by the Bay'][i], query: ['Esplanade, Singapore', 'Coffee, Singapore', 'National Gallery, Singapore', 'Gardens by the Bay, Singapore'][i], label, description: 'Take your time by the water. Allow about 15 minutes for the next stop.', theme: ['waterfront', 'cafe', 'arts', 'gardens'][i], sourceUrl: 'https://example.com/place' })) };
try {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [740, 390], [390, 380], [1280, 844]]) {
    const context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
    const requests = [], errors = [];
    let responseMode = 'success', release;
    const photos = [], generations = [];
    let activePhotos = 0, maximumPhotos = 0;
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: 'window.CROW_MAPS_KEY1="test-browser-key";' }));
    await context.route('**/api/places/search', async route => {
      const query = route.request().postDataJSON().textQuery;
      photos.push(query); activePhotos++; maximumPhotos = Math.max(maximumPhotos, activePhotos);
      await new Promise(resolve => setTimeout(resolve, 60));
      activePhotos--;
      await route.fulfill({ json: { photoKeySlot: 'primary', places: [{ displayName: { text: query.split(',')[0] }, photos: query === 'Coffee, Singapore' ? [] : [{ name: 'places/test/photos/' + photos.length, authorAttributions: [{ displayName: 'Location photographer', uri: 'https://example.com/photographer' }] }], googleMapsUri: 'https://maps.google.com/' }] } });
    });
    await context.route('https://places.googleapis.com/v1/places/*/photos/*/media?*', route => route.fulfill({ contentType: 'image/webp', body: sampleImage }));
    await context.route('**/api/discovery/image', async route => {
      generations.push(route.request().postDataJSON().query);
      await route.fulfill({ json: { imageUrl: 'data:image/jpeg;base64,' + generatedImage.toString('base64'), synthetic: true, generatedAt: new Date().toISOString() } });
    });
    await context.route('**/api/status', route => route.fulfill({ json: { capabilities: { chat: true, live: true, plan: true } } }));
    await context.route('**/app.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
      window.mapContext = {mapReady:true,destination:{name:'Esplanade, Singapore',lat:1.2897,lng:103.8556},spot:null,savedPlaces:[]};
      window.flights=[];window.orbits=[];
      window.CrowMap={getContext:()=>window.mapContext,getCameraView:()=>({rotation:0,tilt:65,zoom:1}),pause(){},async searchDestinations(query){window.searched=query;return [{name:query,lat:1.29,lng:103.85}];},async flyTo(place){window.flights.push(place);return {};},async circleAround(place){window.orbits.push(place);return {};}};
      document.getElementById('loading').hidden=true;
    ` }));
    await context.route('**/api/recommendations', async route => {
      requests.push(route.request().postDataJSON());
      const selected = responseMode;
      if (selected === 'pending') await new Promise(resolve => { release = resolve; });
      if (selected === 'error') return route.fulfill({ status: 429, json: { error: { message: 'Research limit reached. Try again later.' } } });
      await route.fulfill({ json: selected === 'empty' ? { summary: '', places: [] } : sample }).catch(() => {});
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(new URL('explore.html', base).href);
      await page.waitForFunction(() => document.getElementById('connection-status').textContent === 'Your guide to anywhere');
      await page.locator('#chat-open').click();
      await page.locator('#chat-input').fill('Keep my draft');
      await page.locator('[data-discovery="somewhere"]').click();
      assert.equal(await page.locator('.discovery-card').count(), 7);
      await page.waitForFunction(() => document.querySelectorAll('.discovery-preview img[alt^="Photo of"]').length === 7);
      assert.equal(await page.locator('.discovery-art img').count(), 7);
      for (const picture of await page.locator('.discovery-art img').all()) {
        await picture.scrollIntoViewIfNeeded();
        await picture.evaluate(image => image.decode());
        assert(await picture.evaluate(image => image.naturalWidth >= 640));
      }
      await page.locator('#companion-content').evaluate(el => { el.scrollTop = 0; });
      assert.equal(requests.length, 0);
      assert.equal(generations.length, 0);
      assert(maximumPhotos > 1 && maximumPhotos <= 3);
      assert.equal(await page.locator('#chat-input').inputValue(), 'Keep my draft');
      await page.screenshot({ path: new URL(`destinations-${width}x${height}.png`, output).pathname });
      await page.locator('.discovery-card').first().getByRole('button', { name: 'Fly here' }).click();
      await page.waitForFunction(() => window.flights.length === 1);
      assert.match(await page.evaluate(() => window.searched), /Gardens by the Bay/);
      await page.locator('#companion').waitFor({ state: 'hidden' });
      for (const landmark of ['Eiffel Tower', 'Golden Gate Bridge']) {
        await page.locator('#chat-open').click();
        const card = page.locator('.discovery-card').filter({ has: page.getByRole('heading', { name: landmark, exact: true }) });
        await card.getByRole('button', { name: 'Circle landmark' }).click();
        await page.waitForFunction(name => window.orbits.some(place => place.name.includes(name)), landmark);
        assert.match(await page.evaluate(() => window.searched), new RegExp(landmark));
        await page.locator('#companion').waitFor({ state: 'hidden' });
      }
      await page.locator('#chat-open').click();
      await page.getByRole('button', { name: 'Local favourites', exact: true }).click();
      await page.getByRole('button', { name: 'Coffee & bites', exact: true }).click();
      await page.getByRole('button', { name: 'Find local picks' }).click();
      await page.locator('.discovery-card').first().waitFor();
      assert.equal(requests.at(-1).mode, 'local'); assert.equal(requests.at(-1).mood, 'Coffee & bites');
      assert.equal(requests.at(-1).destination.name, 'Esplanade, Singapore');
      assert.equal(await page.locator('.discovery-card-actions a').count(), 4);
      await page.waitForFunction(() => document.querySelectorAll('.discovery-preview img').length === 4);
      assert.equal(await page.locator('.discovery-photo-credit').filter({ hasText: 'AI illustration' }).count(), 1);
      assert.equal(await page.locator('.discovery-photo-credit').filter({ hasText: 'Location photographer' }).count(), 3);
      const generationCount = generations.length, recommendationCount = requests.length;
      await page.getByRole('button', { name: 'Destinations', exact: true }).click();
      await page.getByRole('button', { name: 'Local favourites', exact: true }).click();
      await page.getByRole('button', { name: 'Coffee & bites', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.discovery-preview img').length === 4);
      assert.equal(generations.length, generationCount, 'Generated previews must be reused');
      assert.equal(requests.length, recommendationCount, 'Cached recommendations must be reused');
      await page.screenshot({ path: new URL(`local-${width}x${height}.png`, output).pathname });
      await page.getByRole('button', { name: 'Day out', exact: true }).click();
      await page.getByRole('button', { name: 'Food trail', exact: true }).click();
      await page.getByRole('button', { name: 'Build my day' }).click();
      await page.locator('.discovery-timeline').waitFor();
      assert.equal(requests.at(-1).mode, 'day'); assert.equal(requests.at(-1).mood, 'Food trail');
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Save this day' }).click();
      assert.equal((await download).suggestedFilename(), 'a-day-with-crow.md');
      await page.locator('#companion-content').evaluate(el => { el.scrollTop = 0; });
      await page.screenshot({ path: new URL(`day-${width}x${height}.png`, output).pathname });
      const bounds = await page.evaluate(() => {
        const rect = id => document.getElementById(id).getBoundingClientRect().toJSON();
        return { panel: rect('companion'), map: rect('world'), send: rect('chat-send'), overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert(!bounds.overflow); assert(bounds.panel.top >= 64); assert(bounds.panel.bottom <= bounds.map.bottom - 40); assert(bounds.send.bottom <= height);
      responseMode = 'error';
      await page.getByRole('button', { name: 'Refresh picks' }).click();
      await page.getByRole('button', { name: 'Try again', exact: true }).waitFor();
      assert.match(await page.locator('#discovery-status').textContent(), /limit reached/);
      responseMode = 'empty';
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await page.getByText('No sourced picks came back', { exact: false }).waitFor();
      responseMode = 'pending';
      await page.getByRole('button', { name: 'Try again', exact: true }).click();
      await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor();
      while (!release) await page.waitForTimeout(10);
      await page.getByRole('button', { name: '← Back', exact: true }).click();
      release(); await page.waitForTimeout(80);
      assert(await page.locator('#discovery-panel').isHidden());
      assert.equal(await page.locator('#chat-input').inputValue(), 'Keep my draft');
      responseMode = 'success';
      await page.locator('[data-discovery="local"]').click();
      await page.getByRole('button', { name: 'Find local picks' }).click();
      await page.locator('.discovery-card').first().waitFor();
      await page.evaluate(() => { window.mapContext.destination = { name:'Kyoto, Japan',lat:35,lng:135 }; document.dispatchEvent(new CustomEvent('crow:context',{detail:window.mapContext})); });
      assert.equal(await page.locator('.discovery-card').count(), 0, 'Old location results are discarded');
      assert.match(await page.locator('.discovery-subtitle').textContent(), /Kyoto/);
      await page.getByRole('button', { name: 'Find local picks' }).click();
      await page.locator('.discovery-card').first().waitFor();
      assert.equal(requests.at(-1).destination.name, 'Kyoto, Japan');
      const beforeReload = requests.length;
      await page.reload();
      await page.waitForFunction(() => document.getElementById('connection-status').textContent === 'Your guide to anywhere');
      await page.locator('#chat-open').click();
      await page.locator('[data-discovery="local"]').click();
      await page.getByRole('button', { name: 'Coffee & bites', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('.discovery-preview img').length === 4);
      assert.equal(requests.length, beforeReload, 'Reload must retain session recommendations');
      assert.equal(generations.length, generationCount, 'Reload must retain generated previews');
      assert.deepEqual(errors, []);
      console.log(width + '×' + height + ': cards, flight, moods, sources, itinerary download, errors, empty results, cancellation, draft and context passed.');
    } finally { release?.(); await context.close(); }
  }
} finally { await browser.close(); }
