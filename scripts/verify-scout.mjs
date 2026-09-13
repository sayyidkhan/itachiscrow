import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Real browser + app modules, deterministic Maps/API doubles. All external
// traffic and microphone capture are intercepted; no provider calls are made.
const output = new URL('../_debug/scout-verification/', import.meta.url);
await mkdir(output, { recursive: true });
const files = new Set(['index.html', 'style.css', 'scout.css', 'layout.css', 'scout.js', 'live.js', 'panorama.js', 'music.js', 'music.css', 'location.js']);
const server = createServer(async (request, response) => {
  const name = new URL(request.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (name === 'app.js' || name === 'config.js') { response.writeHead(200, { 'Content-Type': 'text/javascript' }); response.end('/* replaced by deterministic test Maps contract */'); return; }
  if (!files.has(name)) { response.writeHead(404); response.end(); return; }
  response.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html' });
  response.end(await readFile(new URL('../dist/' + name, import.meta.url)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const report = { checks: [], failures: [], pageErrors: [], blockedExternalRequests: [], apiRequests: [] };
let browser;
let imageUrl;
let capabilities = { live: true, panorama: true, plan: true, instagram: false };
let instagramConnection = { oauthAvailable: false, connection: 'app_not_configured', accounts: [], selectedAccount: null };
const pending = {};
function holdNext(name) {
  let started, release;
  const wait = new Promise(resolve => { started = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  pending[name] = { started, gate };
  return { wait, release };
}
async function check(name, operation) {
  try { await operation(); report.checks.push(name); console.log('PASS ' + name); }
  catch (error) { report.failures.push({ name, message: error.message }); console.error('FAIL ' + name + ': ' + error.message); }
}

try {
  browser = await chromium.launch({ executablePath: process.env.CROW_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const browserContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await browserContext.newPage();
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.addInitScript(() => {
    const state = { mapReady: true, mode: 'demo', destination: { name: 'Chelsea, New York', lat: 40.74334, lng: -73.99423 }, spot: null, savedPlaces: [] };
    const clone = () => JSON.parse(JSON.stringify(state));
    const emit = name => document.dispatchEvent(new CustomEvent('crow:' + name, { detail: clone() }));
    const places = { Kyoto: { name: 'Kyoto, Japan', lat: 35.0036, lng: 135.7782, address: 'Kyoto, Japan' }, Paris: { name: 'Paris, France', lat: 48.8566, lng: 2.3522 }, Market: { name: 'Nishiki Market', lat: 35.005, lng: 135.765, address: 'Nakagyo, Kyoto' } };
    window.__crowMock = { searches: [], flights: [], landings: [], microphoneCalls: 0,
      change(destination, spot = null) { state.destination = destination; state.spot = spot; state.mode = spot ? 'landed' : 'hovering'; emit('destination'); },
      resolveSearch: null };
    window.CrowMap = {
      getContext: clone,
      async searchDestinations(query) {
        window.__crowMock.searches.push(query);
        if (query.includes('Slow')) return new Promise(resolve => { window.__crowMock.resolveSearch = resolve; });
        return [query.includes('Market') ? places.Market : query.includes('Paris') ? places.Paris : places.Kyoto];
      },
      async flyTo(place) { window.__crowMock.flights.push(place); state.destination = place; state.spot = null; state.mode = 'hovering'; emit('destination'); return clone(); },
      async landAt(place) { window.__crowMock.landings.push(place); state.spot = place; state.mode = 'landed'; emit('landing-selected'); emit('landed'); return clone(); },
      pause() {}, selectLandingMode() {},
    };
    const voice = { sent: [], channel: null };
    window.__voiceMock = voice;
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      window.__crowMock.microphoneCalls++;
      const track = Object.assign(new EventTarget(), { enabled: true, stop() {} });
      return { getTracks: () => [track], getAudioTracks: () => [track] };
    } });
    class FakePeer extends EventTarget {
      iceGatheringState = 'complete'; connectionState = 'connected';
      addTrack() {}
      createDataChannel() {
        const channel = Object.assign(new EventTarget(), { readyState: 'open',
          send(data) { const event = JSON.parse(data); voice.sent.push(event); if (event.type === 'session.close') queueMicrotask(() => voice.emit({ type: 'session.closed', usage: { seconds: 1 } })); },
          close() { this.readyState = 'closed'; } });
        voice.channel = channel;
        voice.emit = event => channel.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(event) }));
        return channel;
      }
      async createOffer() { return { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' }; }
      async setLocalDescription(value) { this.localDescription = value; }
      async setRemoteDescription() { queueMicrotask(() => voice.emit({ type: 'session.started', session: { id: 'live_browser_mock' } })); }
      close() {}
    }
    window.RTCPeerConnection = FakePeer;
    document.addEventListener('DOMContentLoaded', () => { document.getElementById('loading').hidden = true; document.getElementById('status').textContent = 'Map test double ready'; });
  });
  const planResult = { text: '# Kyoto days\n\nVisit [Nishiki Market](https://kyoto.travel/en/see-and-do/nishiki-market.html).\n\n<script>bad()</script>',
    sources: [{ title: 'Kyoto tourism', url: 'https://kyoto.travel/en/' }, { title: 'Unsafe source', url: 'javascript:alert(1)' }] };
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'images.example.test') {
      await route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(imageUrl.split(',')[1], 'base64') }); return;
    }
    if (url.origin !== origin) { report.blockedExternalRequests.push(url.origin + url.pathname); await route.abort(); return; }
    if (!url.pathname.startsWith('/api/')) { await route.continue(); return; }
    const name = url.pathname.split('/').at(-1);
    const body = route.request().postDataJSON();
    report.apiRequests.push({ path: url.pathname, body, query: url.search });
    if (pending[name]) { const hold = pending[name]; delete pending[name]; hold.started(); await hold.gate; }
    if (name === 'select-account') {
      const account = instagramConnection.accounts.find(item => item.id === body?.accountId);
      if (!account || route.request().method() !== 'POST') {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Choose a supplied test account.' } }) }); return;
      }
      instagramConnection = { ...instagramConnection, connection: 'connected', selectedAccount: account };
      capabilities = { ...capabilities, instagram: true };
    }
    if (name === 'disconnect') {
      instagramConnection = { ...instagramConnection, connection: 'not_connected', accounts: [], selectedAccount: null };
      capabilities = { ...capabilities, instagram: false };
    }
    const result = name === 'status' ? { capabilities, instagram: instagramConnection }
      : name === 'panorama' ? { imageUrl, notice: 'AI-generated impression', generatedAt: '2026-09-13T00:00:00Z' }
      : name === 'plan' ? planResult
      : name === 'instagram' ? { posts: [{ permalink: 'https://www.instagram.com/p/crowtest/', imageUrl: 'https://images.example.test/post.png', caption: 'Morning market light', timestamp: '2026-09-13T00:00:00Z' }, { permalink: 'javascript:alert(1)', imageUrl: 'https://images.example.test/bad.png', caption: 'Rejected' }] }
      : name === 'session' ? { session: { id: 'live_browser_mock' }, transport: { type: 'webrtc', sdp: 'v=0\r\nanswer' } } : {};
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) }).catch(() => {});
  });
  await page.goto(origin, { waitUntil: 'networkidle' });
  imageUrl = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
    const paint = canvas.getContext('2d'); const gradient = paint.createLinearGradient(0, 0, 512, 0);
    gradient.addColorStop(0, '#e93032'); gradient.addColorStop(.5, '#35b8bf'); gradient.addColorStop(1, '#414dc4');
    paint.fillStyle = gradient; paint.fillRect(0, 0, 512, 256);
    for (let x = 0; x < 512; x += 32) { paint.fillStyle = '#142c3f'; paint.fillRect(x, 120, 12, 136); }
    return canvas.toDataURL('image/png');
  });
  await check('Scout initializes without automatic microphone access or a fake voice connection', async () => {
    assert.equal(await page.locator('#scout-panel').isVisible(), true);
    assert.equal(await page.locator('#generate-scene').isDisabled(), true);
    assert.equal(await page.locator('#voice-controls').isVisible(), false);
    assert.equal(await page.evaluate(() => window.__crowMock.microphoneCalls), 0);
    assert.match(await page.locator('#voice-state').textContent(), /Voice companion/);
  });
  await check('Destination search flies to the selected result', async () => {
    await page.locator('#destination-input').fill('Kyoto'); await page.locator('#destination-search').click();
    await page.locator('#destination-results button').first().click();
    await page.waitForFunction(() => document.getElementById('journey-destination').textContent === 'Kyoto, Japan');
    assert.equal(await page.evaluate(() => window.__crowMock.flights.length), 1);
  });
  await check('Landing search automatically generates exactly one panorama for the chosen spot', async () => {
    await page.locator('#spot-input').fill('Market'); await page.locator('#spot-form button').click();
    await page.locator('#spot-results button').first().click();
    await page.locator('#panorama-dialog').waitFor({ state: 'visible' });
    assert.equal(report.apiRequests.filter(item => item.path === '/api/panorama').length, 1);
    assert.equal(report.apiRequests.find(item => item.path === '/api/panorama').body.spot.name, 'Nishiki Market');
    assert.match(await page.locator('#panorama-title').textContent(), /Nishiki/);
  });
  await check('360 viewer renders in WebGL, responds to the keyboard, and cleans up on close', async () => {
    const canvas = page.locator('#panorama-view canvas'); await canvas.waitFor();
    const before = await canvas.screenshot();
    await canvas.focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    const after = await canvas.screenshot();
    assert.notDeepEqual(before, after, 'keyboard rotation must change rendered pixels');
    await page.locator('#panorama-close').click();
    await page.locator('#panorama-view canvas').waitFor({state:'detached'});
    assert.equal(await page.locator('#panorama-view canvas').count(), 0);
  });
  await page.locator('#panorama-dialog').evaluate(dialog => { if (dialog.open) dialog.close(); });
  await check('Planner renders safe clickable source links and itinerary Markdown links', async () => {
    await page.locator('#tab-plan').click(); await page.locator('#plan-days').fill('2');
    await page.locator('#generate-plan').click(); await page.locator('#download-plan').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#plan-sources a').count(), 1);
    assert.equal(await page.locator('#plan-sources a').first().getAttribute('href'), 'https://kyoto.travel/en/');
    assert.equal(await page.locator('#plan-result script').count(), 0);
    assert(await page.locator('#plan-result a[href^="https://kyoto.travel/"]').count() > 0, 'inline itinerary links must be clickable');
    assert.equal(report.apiRequests.find(item => item.path === '/api/plan').body.days, 2);
  });
  await check('Unconfigured Instagram shows an honest connection state and performs no fetch', async () => {
    await page.locator('#tab-social').click(); await page.locator('#instagram-refresh').click();
    assert.match(await page.locator('#instagram-status').textContent(), /Connect/);
    assert.equal(await page.locator('#instagram-connect').isVisible(), true);
    assert.equal(await page.locator('#instagram-connect').isDisabled(), true);
    assert.match(await page.locator('#instagram-connection').textContent(), /sign-in hasn.t been set up/i);
    assert.equal(await page.locator('#instagram-disconnect').isVisible(), false);
    assert.equal(await page.locator('input[type="password"], input[name*="token" i], input[id*="token" i], input[name*="secret" i], input[id*="secret" i]').count(), 0, 'Instagram credentials must not be collected in app inputs');
    assert.equal(report.apiRequests.some(item => item.path === '/api/instagram'), false);
  });
  await check('Live UI starts only on Talk, receives captions and map actions, mutes, and ends', async () => {
    await page.locator('#voice-toggle').click();
    await page.waitForFunction(() => document.getElementById('voice-state').textContent.includes('Listening'));
    assert.equal(await page.evaluate(() => window.__crowMock.microphoneCalls), 1);
    await page.evaluate(() => {
      window.__voiceMock.emit({ type: 'session.input_transcript.delta', delta: 'Fly to Paris', start_ms: 1, end_ms: 400 });
      for (const event of [{ type: 'response.created', response: { id: 'r1' } }, { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'flight1', name: 'fly_to', arguments: '{"destination":"Paris"}' } }, { type: 'response.completed', response: { id: 'r1', output: [] } }]) window.__voiceMock.emit({ type: 'response.event', delegation_id: 'd1', event });
    });
    await page.waitForFunction(() => window.__voiceMock.sent.some(event => event.type === 'response.create'));
    assert.match(await page.locator('#voice-transcript').textContent(), /Fly to Paris/);
    assert.match(await page.locator('#journey-destination').textContent(), /Paris/);
    await page.locator('#voice-mute').click(); assert.equal(await page.locator('#voice-mute').getAttribute('aria-pressed'), 'true');
    await page.locator('#voice-toggle').click();
    await page.waitForFunction(() => document.getElementById('voice-toggle').textContent.includes('Talk'));
    assert.equal(await page.locator('#voice-controls').isVisible(), false);
  });
  await check('Changing destination discards a delayed itinerary response', async () => {
    await page.locator('#tab-plan').click(); const held = holdNext('plan');
    await page.locator('#generate-plan').click(); await held.wait;
    await page.evaluate(() => window.__crowMock.change({ name: 'Singapore', lat: 1.29, lng: 103.85 }));
    held.release(); await page.waitForTimeout(100);
    assert.equal(await page.locator('#plan-result').textContent(), '');
    assert.equal(await page.locator('#download-plan').isVisible(), false);
    assert.equal(await page.locator('#generate-plan').isDisabled(), false);
  });
  await check('Changing destination invalidates pending landing search results', async () => {
    await page.locator('#tab-explore').click(); await page.locator('#spot-input').fill('Slow market'); await page.locator('#spot-form button').click();
    await page.waitForFunction(() => Boolean(window.__crowMock.resolveSearch));
    await page.evaluate(() => {
      window.__crowMock.change({ name: 'Tokyo', lat: 35.67, lng: 139.65 });
      window.__crowMock.resolveSearch([{ name: 'Old Singapore result', lat: 1.3, lng: 103.8 }]);
    });
    await page.waitForTimeout(75);
    assert.equal(await page.locator('#spot-results button').count(), 0);
  });
  await check('Changing location discards a delayed panorama and closes an already-open old scene', async () => {
    const held = holdNext('panorama'); await page.locator('#land-here').click(); await held.wait;
    await page.evaluate(() => window.__crowMock.change({ name: 'Osaka', lat: 34.7, lng: 135.5 }));
    held.release(); await page.waitForTimeout(100);
    assert.equal(await page.locator('#panorama-dialog').isVisible(), false);
    assert.equal(await page.locator('#reopen-scene').isVisible(), false);
    if (!(await page.locator('#scout-panel').isVisible())) await page.locator('#scout-open').click();
    await page.locator('#land-here').click(); await page.locator('#panorama-dialog').waitFor({ state: 'visible' });
    await page.evaluate(() => window.__crowMock.change({ name: 'Nara', lat: 34.68, lng: 135.8 }));
    assert.equal(await page.locator('#panorama-dialog').isVisible(), false, 'old panorama must close when its location is no longer current');
  });
  await page.locator('#panorama-dialog').evaluate(dialog => { if (dialog.open) dialog.close(); });
  capabilities = { ...capabilities, instagram: true };
  await page.reload({ waitUntil: 'networkidle' });
  await check('Instagram renders provider attribution, original links, timestamps, and rejects unsafe links', async () => {
    await page.locator('#tab-social').click(); await page.locator('#instagram-refresh').click();
    await page.locator('#instagram-posts a').first().waitFor();
    assert.equal(await page.locator('#instagram-posts a').count(), 1);
    assert.equal(await page.locator('#instagram-posts a').getAttribute('href'), 'https://www.instagram.com/p/crowtest/');
    assert.match(await page.locator('#instagram-posts small').textContent(), /Instagram/);
    assert.match(await page.locator('#instagram-status').textContent(), /1 recent posts/);
  });
  await check('Changing destination during an Instagram fetch clears stale posts and keeps Refresh usable', async () => {
    const held = holdNext('instagram'); await page.locator('#instagram-refresh').click(); await held.wait;
    await page.evaluate(() => window.__crowMock.change({ name: 'Bali', lat: -8.65, lng: 115.2 }));
    held.release(); await page.waitForTimeout(100);
    assert.equal(await page.locator('#instagram-posts a').count(), 0);
    assert.equal(await page.locator('#instagram-refresh').isDisabled(), false);
  });
  await check('Instagram OAuth return opens account selection and removes callback parameters', async () => {
    capabilities = { ...capabilities, instagram: false };
    instagramConnection = {
      oauthAvailable: true, connection: 'account_selection_required', selectedAccount: null,
      accounts: [{ id: '178400000000001', name: 'Crow Travels', username: 'crowtravels' }, { id: '178400000000002', name: 'Crow Field Notes', username: 'crowfieldnotes' }],
    };
    await page.goto(origin + '/?instagram=select_account&reason=fixture', { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.getElementById('instagram-accounts').querySelectorAll('button').length === 2);
    assert.equal(await page.locator('#panel-social').isVisible(), true);
    assert.equal(await page.locator('#instagram-connect').isDisabled(), false);
    assert.equal(await page.locator('#instagram-disconnect').isVisible(), false);
    assert.match(await page.locator('#instagram-connection').textContent(), /Choose the Instagram account/);
    assert.deepEqual(await page.locator('#instagram-accounts button').allTextContents(), ['crowtravels', 'crowfieldnotes']);
    const returnedUrl = new URL(page.url());
    assert.equal(returnedUrl.searchParams.has('instagram'), false);
    assert.equal(returnedUrl.searchParams.has('reason'), false);
    assert.equal(await page.locator('#panel-social input').count(), 1);
    assert.equal(await page.locator('#panel-social input').getAttribute('id'), 'instagram-hashtag', 'The only social input is a hashtag, never a credential');
  });
  await check('Selecting an Instagram account posts its ID, refreshes status, and loads its feed', async () => {
    const before = report.apiRequests.length;
    await page.locator('#instagram-accounts button').filter({ hasText: 'crowfieldnotes' }).click();
    await page.locator('#instagram-posts a').first().waitFor();
    assert.match(await page.locator('#instagram-connection').textContent(), /Connected as crowfieldnotes/);
    assert.equal(await page.locator('#instagram-accounts button').count(), 0);
    assert.equal(await page.locator('#instagram-connect').isVisible(), false);
    assert.equal(await page.locator('#instagram-disconnect').isVisible(), true);
    const requests = report.apiRequests.slice(before);
    assert.deepEqual(requests.slice(0, 3).map(item => item.path), ['/api/instagram/select-account', '/api/status', '/api/instagram']);
    assert.deepEqual(requests[0].body, { accountId: '178400000000002' });
    assert.equal(await page.locator('#instagram-posts a').count(), 1);
  });
  await check('Disconnecting Instagram clears posts and restores sign-in without further feed requests', async () => {
    const before = report.apiRequests.length;
    await page.locator('#instagram-disconnect').click();
    await page.locator('#instagram-connect').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#instagram-connect').isDisabled(), false);
    assert.equal(await page.locator('#instagram-disconnect').isVisible(), false);
    assert.equal(await page.locator('#instagram-posts a').count(), 0);
    assert.equal(await page.locator('#instagram-accounts button').count(), 0);
    assert.match(await page.locator('#instagram-connection').textContent(), /Sign in through Facebook/);
    const requests = report.apiRequests.slice(before);
    assert.deepEqual(requests.slice(0, 2).map(item => item.path), ['/api/instagram/disconnect', '/api/status']);
    assert.deepEqual(requests[0].body, {});
    const feeds = report.apiRequests.filter(item => item.path === '/api/instagram').length;
    await page.locator('#instagram-refresh').click();
    assert.match(await page.locator('#instagram-status').textContent(), /Connect Instagram/);
    assert.equal(report.apiRequests.filter(item => item.path === '/api/instagram').length, feeds);
  });
  await check('390px mobile viewport has no horizontal overflow and all tabs remain reachable', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#music-open').click();
    assert.equal(await page.locator('#music-dialog').isVisible(), true);
    await page.locator('#music-close').click();
    const header = await page.evaluate(() => ({ brand: document.querySelector('.brand').getBoundingClientRect().bottom, actions: document.querySelector('.header-actions').getBoundingClientRect().top, bottom: document.querySelector('.topbar').getBoundingClientRect().bottom, panel: document.getElementById('scout-panel').getBoundingClientRect().top }));
    assert(header.brand <= header.actions && header.bottom <= header.panel, 'Mobile header rows must fit above the scout panel without overlapping controls');
    for (const name of ['explore', 'social', 'plan']) {
      await page.locator('#tab-' + name).click();
      assert.equal(await page.locator('#panel-' + name).isVisible(), true);
      const bounds = await page.evaluate(() => ({ width: innerWidth, page: document.documentElement.scrollWidth, panel: document.getElementById('scout-panel').getBoundingClientRect().right }));
      assert(bounds.page <= bounds.width, `page overflow ${bounds.page - bounds.width}px`);
      assert(bounds.panel <= bounds.width);
    }
    await page.screenshot({ path: new URL('mobile.png', output).pathname, fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 }); await page.locator('#tab-explore').click();
    await page.locator('#music-open').click();
    assert.equal(await page.locator('#music-dialog').isVisible(), true);
    await page.locator('#music-close').click();
    await page.screenshot({ path: new URL('desktop.png', output).pathname, fullPage: true });
  });
  let verifiedPanorama;
  try { verifiedPanorama = await readFile(new URL('../_debug/ai-verification/panorama.jpg', import.meta.url)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (verifiedPanorama) await check('Locally generated panorama renders in the 360 viewer for visual review', async () => {
    try {
      await page.evaluate(async source => {
        const { PanoramaViewer } = await import('/panorama.js');
        const dialog = document.createElement('dialog');
        dialog.id = 'generated-panorama-review'; dialog.className = 'panorama-dialog';
        dialog.setAttribute('aria-label', 'Locally verified generated panorama');
        const header = document.createElement('div'); header.className = 'dialog-top';
        const title = document.createElement('h2'); title.textContent = 'Your crow’s point of view'; header.append(title);
        const container = document.createElement('div'); container.className = 'panorama-view';
        const footer = document.createElement('div'); footer.className = 'panorama-footer';
        const caption = document.createElement('p'); caption.textContent = 'Drag to look around · Scroll to zoom · AI-generated scene'; footer.append(caption);
        dialog.append(header, container, footer); document.body.append(dialog); dialog.showModal();
        const viewer = new PanoramaViewer(container); window.__generatedPanoramaReview = { viewer, dialog };
        await viewer.load(source);
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }, 'data:image/jpeg;base64,' + verifiedPanorama.toString('base64'));
      assert.equal(await page.locator('#generated-panorama-review canvas').count(), 1, 'The reference image must render in the interactive canvas');
      const rendered = await page.locator('#generated-panorama-review canvas').evaluate(canvas => ({ width: canvas.width, height: canvas.height }));
      assert(rendered.width > 1 && rendered.height > 1);
      await page.locator('#generated-panorama-review').screenshot({ path: new URL('real-generated-panorama.png', output).pathname });
      report.realGeneratedPanorama = { source: '_debug/ai-verification/panorama.jpg', screenshot: 'real-generated-panorama.png', visualReview: 'Inspect the 360 viewer screenshot for complete crow framing.' };
    } finally {
      await page.evaluate(() => {
        const review = window.__generatedPanoramaReview;
        review?.viewer.destroy(); review?.dialog.close(); review?.dialog.remove(); delete window.__generatedPanoramaReview;
      });
    }
  });
  await check('Browser integration has no uncaught JavaScript errors or unmocked external requests', async () => {
    assert.deepEqual(report.pageErrors, []);
    assert.deepEqual(report.blockedExternalRequests, []);
  });
} catch (error) {
  report.failures.push({ name: 'Browser harness', message: error.stack || error.message });
  console.error(error);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
}
console.log(`${report.checks.length} browser checks passed; ${report.failures.length} failed. Evidence: ${output.pathname}`);
if (report.failures.length) process.exitCode = 1;
