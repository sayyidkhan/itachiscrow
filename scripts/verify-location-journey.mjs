import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Real Maps renderer and app; browser geolocation is always synthetic.
// OpenAI, Instagram, and every non-status application API request are blocked.
// Run only against a started app server with a configured Google Maps key.
const appUrl = new URL(process.env.CROW_TEST_URL || 'http://127.0.0.1:3000/');
const output = new URL('../_debug/location-journey-verification/', import.meta.url);
const singapore = { latitude: 1.28634, longitude: 103.8532, accuracy: 8 };
const paris = { name: 'Paris, France', lat: 48.8566, lng: 2.3522, address: 'Paris, France' };
const report = {
  origin: appUrl.origin, syntheticLocation: singapore, realUserLocationRequested: false,
  checks: [], failures: [], pageErrors: [], blockedProviderRequests: [], snapshots: [], journeys: [], setupDiagnostics: [],
};
const ownedContexts = [];
let browser;
const clean = value => String(value).replace(/AIza[\w-]+|sk-[\w-]+/g, 'REDACTED').replace(/([?&](?:key|token|access_token|code|session)=)[^&\s]+/gi, '$1REDACTED');
const diagnosticText = value => clean(value || '').replace(/https?:\/\/[^\s<>"']+/gi, '[URL omitted]').slice(0, 1200);
const contextOf = page => page.evaluate(() => window.CrowMap.getContext());
const closeTo = (actual, expected, tolerance = .00002) => Math.abs(actual - expected) <= tolerance;
const samePlace = (actual, expected) => Boolean(actual && closeTo(actual.lat, expected.lat) && closeTo(actual.lng, expected.lng));

async function check(name, operation) {
  try { await operation(); report.checks.push(name); console.log('PASS ' + name); }
  catch (error) { report.failures.push({ name, message: clean(error.message) }); console.error('FAIL ' + name + ': ' + clean(error.message)); }
}

async function createPage({ denied = false, reducedMotion = false } = {}) {
  const scenario = denied ? 'permission-denied' : reducedMotion ? 'reduced-motion' : 'synthetic-location';
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    geolocation: singapore,
    permissions: ['geolocation'],
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    serviceWorkers: 'block',
  });
  ownedContexts.push(context);
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === appUrl.origin && url.pathname === '/api/status') {
      // Enabled capabilities ensure a mistaken automatic paid call would be detected.
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        capabilities: { live: true, panorama: true, plan: true, instagram: true },
        openai: { configured: true, liveModel: 'gpt-live-1' },
        instagram: { configured: true, oauthAvailable: true, connection: 'connected', connectionSource: 'oauth', accounts: [], selectedAccount: { id: 'synthetic', name: 'Synthetic test account' } },
      }) });
      return;
    }
    if ((url.origin === appUrl.origin && url.pathname.startsWith('/api/')) || /(^|\.)(openai\.com|facebook\.com|instagram\.com)$/.test(url.hostname)) {
      report.blockedProviderRequests.push({ origin: url.origin, path: url.pathname, method: request.method() });
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'verification_blocked', message: 'Provider calls are disabled in location verification.' } }) });
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.on('pageerror', error => report.pageErrors.push(clean(error.message)));
  await page.addInitScript(({ mockDenied }) => {
    const evidence = { geolocationCalls: 0, microphoneCalls: 0, deny: mockDenied, contexts: [], flights: [] };
    window.__crowLocationEvidence = evidence;
    const browserGetPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { configurable: true, value(success, failure, options) {
      evidence.geolocationCalls++;
      if (evidence.deny) {
        queueMicrotask(() => failure?.({ code: 1, message: 'Synthetic test permission denial', PERMISSION_DENIED: 1 }));
        return;
      }
      // The Playwright browser context supplies the synthetic coordinates above.
      return browserGetPosition(success, failure, options);
    } });
    if (navigator.mediaDevices) Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async () => {
      evidence.microphoneCalls++;
      throw new DOMException('Microphone disabled in location verification', 'NotAllowedError');
    } });
    for (const event of ['ready', 'context', 'destination', 'landed']) {
      document.addEventListener('crow:' + event, value => {
        const detail = value.detail;
        if (!detail || evidence.contexts.length >= 1500) return;
        evidence.contexts.push({ at: performance.now(), event, mode: detail.mode, flightStage: detail.flightStage, routeDistanceMeters: detail.routeDistanceMeters, destination: detail.destination, spot: detail.spot, locationStatus: detail.locationStatus, hasUserLocation: detail.hasUserLocation });
      });
    }
    document.addEventListener('crow:flight', ({ detail }) => {
      if (!detail) return;
      evidence.lastFlight = { at: performance.now(), from: detail.from, to: detail.to, stage: detail.stage, progress: detail.progress, range: detail.range, arrived: detail.arrived, cancelled: detail.cancelled };
      if (evidence.flights.length < 2000) evidence.flights.push(evidence.lastFlight);
    });
  }, { mockDenied: denied });
  console.log(`Opening ${scenario}; waiting for the real Maps renderer…`);
  try {
    await page.goto(appUrl.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.CrowMap?.getContext().mapReady, null, { timeout: 240_000 });
    console.log(`Maps renderer ready: ${scenario}`);
  } catch (error) {
    const filename = `00-setup-failed-${scenario}.png`;
    const diagnostic = await page.evaluate(() => {
      let context = null;
      try {
        const current = window.CrowMap?.getContext();
        if (current) context = { mapReady: current.mapReady, mode: current.mode, locationStatus: current.locationStatus, locationMessage: current.locationMessage, hasUserLocation: current.hasUserLocation, flightStage: current.flightStage };
      } catch {}
      const text = selector => {
        const element = document.querySelector(selector);
        return element && element.getClientRects().length ? element.innerText?.slice(0, 1200) || '' : '';
      };
      return { context, loading: text('#loading'), status: text('#status'), hint: text('#hint'), location: text('#location-status'), geolocationCalls: window.__crowLocationEvidence?.geolocationCalls ?? null, documentState: document.readyState };
    }).catch(() => ({ context: null, loading: 'Page context unavailable during setup failure.' }));
    for (const field of ['loading', 'status', 'hint', 'location']) diagnostic[field] = diagnosticText(diagnostic[field]);
    if (diagnostic.context?.locationMessage) diagnostic.context.locationMessage = diagnosticText(diagnostic.context.locationMessage);
    try {
      await page.screenshot({ path: new URL(filename, output).pathname, timeout: 15_000 });
      diagnostic.screenshot = filename;
    } catch (screenshotError) { diagnostic.screenshotError = diagnosticText(screenshotError.message); }
    report.setupDiagnostics.push({ scenario, ...diagnostic, pose: await pose(page).catch(() => null) });
    console.error(`Maps setup failed (${scenario}): ${diagnostic.loading || diagnostic.status || 'No visible loading message'}. Evidence: ${filename}`);
    throw error;
  }
  return page;
}

async function snapshot(page, name) {
  await page.screenshot({ path: new URL(`${name}.png`, output).pathname });
  const context = await contextOf(page);
  report.snapshots.push({ name, context, pose: await pose(page) });
  console.log('Captured ' + name);
}

async function pose(page) {
  return page.evaluate(() => ({
    rendererSteady: typeof sceneSteady === 'undefined' ? null : sceneSteady,
    camera: typeof map === 'undefined' || !map ? null : {
      center: { lat: map.center.lat, lng: map.center.lng, altitude: map.center.altitude }, range: map.range, tilt: map.tilt, heading: map.heading,
    },
    crow: typeof crowParts === 'undefined' ? [] : crowParts.map(part => ({ position: { lat: part.position.lat, lng: part.position.lng, altitude: part.position.altitude }, altitudeMode: part.altitudeMode })),
  }));
}

async function settle(page) {
  // Maps streams imagery progressively and can keep isSteady false despite a
  // usable camera and visible crow. Capture that state rather than blocking the
  // interaction checks on every remaining background tile request.
  await page.waitForFunction(() => typeof sceneSteady !== 'undefined' && sceneSteady, null, { timeout: 15_000 }).catch(() => {});
}

async function assertPerchedCamera(page) {
  const actual = await pose(page);
  assert(actual.camera?.range > 0 && actual.camera.range <= 30, `The native camera must be beside the perched crow, not at the bootstrap range (got ${actual.camera?.range})`);
  assert(Math.abs(actual.camera.tilt - 72) <= 2, `The perched view must use a tilt near 72 degrees (got ${actual.camera.tilt})`);
  assert(samePlace(actual.camera.center, { lat: singapore.latitude, lng: singapore.longitude }), 'The native camera must be centered at the synthetic current location');
  assert.equal(actual.crow.length, 3, 'The native renderer must contain all three crow model parts');
  assert(actual.crow.every(part => samePlace(part.position, { lat: singapore.latitude, lng: singapore.longitude })), 'Every native crow part must be positioned at the synthetic current location');
}

async function startFlight(page, target = paris) {
  // The destination UI closes Explore during travel; match that unobstructed view.
  if (await page.locator('#scout-panel').isVisible()) await page.locator('#scout-close').click();
  await page.evaluate(value => {
    const evidence = window.__crowLocationEvidence;
    evidence.contexts = [];
    evidence.flights = [];
    evidence.lastFlight = null;
    evidence.flightStartedAt = performance.now();
    evidence.flightResult = null;
    delete evidence.flightError;
    window.CrowMap.flyTo(value).then(result => {
      evidence.flightResult = result;
      evidence.flightFinishedAt = performance.now();
    }).catch(error => { evidence.flightError = error.message; });
  }, target);
}

async function waitForFlight(page) {
  await page.waitForFunction(() => window.__crowLocationEvidence.flightResult || window.__crowLocationEvidence.flightError, null, { timeout: 90_000 });
  const evidence = await page.evaluate(() => ({ result: window.__crowLocationEvidence.flightResult, error: window.__crowLocationEvidence.flightError, elapsed: window.__crowLocationEvidence.flightFinishedAt - window.__crowLocationEvidence.flightStartedAt, events: window.__crowLocationEvidence.contexts, flights: window.__crowLocationEvidence.flights }));
  assert.equal(evidence.error, undefined);
  return evidence;
}

await mkdir(output, { recursive: true });
try {
  browser = process.env.CROW_CDP_URL
    ? await chromium.connectOverCDP(process.env.CROW_CDP_URL)
    : await chromium.launch({
      executablePath: process.env.CROW_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      headless: true,
      args: ['--no-sandbox', ...(process.env.CROW_SOFTWARE_GL === '1' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [])],
    });
  const page = await createPage();
  await check('Startup lands at the synthetic current location without calling AI, Instagram, or microphone', async () => {
    await page.waitForFunction(() => window.CrowMap.getContext().hasUserLocation && window.CrowMap.getContext().mode === 'landed', null, { timeout: 30_000 });
    const initial = await contextOf(page);
    assert.equal(initial.locationStatus, 'located');
    assert(samePlace(initial.spot, { lat: singapore.latitude, lng: singapore.longitude }));
    assert(samePlace(initial.destination, { lat: singapore.latitude, lng: singapore.longitude }));
    assert.doesNotMatch(initial.destination.name, /Chelsea/i);
    assert.equal(await page.evaluate(() => window.__crowLocationEvidence.microphoneCalls), 0);
    assert.equal(report.blockedProviderRequests.length, 0, 'Startup must not even attempt provider requests');
    await settle(page);
    await snapshot(page, '01-synthetic-singapore-start');
    await assertPerchedCamera(page);
  });

  await check('Studio and music remain visible alongside current-location exploration', async () => {
    assert.equal(await page.locator('a.studio-link[href="customise.html"]').isVisible(), true);
    assert.equal(await page.locator('#music-open').isVisible(), true);
    await page.locator('#music-open').click();
    assert.equal(await page.locator('#music-dialog').isVisible(), true);
    assert.equal(await page.locator('#music-play').textContent(), 'Play music');
    await page.locator('#music-close').click();
  });

  await check('A far destination uses visible departure, globe travel, and arrival stages', async () => {
    await startFlight(page);
    await page.waitForFunction(() => window.CrowMap.getContext().flightStage === 'departing', null, { timeout: 10_000 });
    const departure = await contextOf(page);
    assert(departure.routeDistanceMeters > 9_000_000);
    assert.equal(await page.locator('#travel-transition').isVisible(), true);
    await page.waitForFunction(() => window.__crowLocationEvidence.lastFlight?.stage === 'departing' && window.__crowLocationEvidence.lastFlight.progress >= .07, null, { timeout: 10_000 });
    await snapshot(page, '02-paris-departure');
    await page.waitForFunction(() => window.CrowMap.getContext().flightStage === 'cruising', null, { timeout: 30_000 });
    await page.waitForFunction(() => window.__crowLocationEvidence.lastFlight?.stage === 'cruising' && window.__crowLocationEvidence.lastFlight.progress >= .45, null, { timeout: 20_000 });
    assert.match(await page.locator('#travel-stage').textContent(), /globe|cruis|cross|travel/i);
    await snapshot(page, '03-paris-globe-midpoint');
    await page.waitForFunction(() => window.CrowMap.getContext().flightStage === 'descending', null, { timeout: 45_000 });
    await snapshot(page, '04-paris-arrival-transition');
    const journey = await waitForFlight(page);
    const arrived = await contextOf(page);
    assert.equal(arrived.mode, 'hovering');
    assert(samePlace(arrived.destination, paris));
    assert(journey.elapsed >= 8_000, 'Intercontinental travel must have a sustained visible transition');
    const stages = [...new Set(journey.flights.map(event => event.stage))];
    for (const stage of ['departing', 'cruising', 'descending', 'approaching']) assert(stages.includes(stage), `Missing ${stage} event`);
    assert(journey.flights.some(event => event.arrived === true), 'The journey must emit an arrival event');
    assert(Math.max(...journey.flights.map(event => Number(event.range) || 0)) > 1_000_000, 'The far-flight camera must pull back to a globe-scale range');
    const first = journey.flights.find(event => event.stage === 'departing');
    const label = value => typeof value === 'string' ? value : value?.name;
    assert(label(first.from), 'The journey must identify its departure point');
    assert(samePlace(first.from, { lat: singapore.latitude, lng: singapore.longitude }), 'The journey must start at the synthetic current location');
    assert.match(label(first.to), /Paris/i);
    report.journeys.push({ scenario: 'far-flight', ...journey });
    await settle(page);
    await snapshot(page, '05-paris-arrived');
  });

  await check('Cancelling an intercontinental journey prevents a late arrival', async () => {
    await startFlight(page, { name: 'Singapore test return', lat: singapore.latitude, lng: singapore.longitude });
    await page.waitForFunction(() => window.CrowMap.getContext().flightStage === 'cruising', null, { timeout: 30_000 });
    await page.evaluate(() => window.CrowMap.pause());
    const cancelled = await waitForFlight(page);
    assert.equal(cancelled.result.cancelled, true);
    const stopped = await pose(page);
    // Wait beyond the normal far-flight duration to catch stale completion timers.
    await page.waitForTimeout(12_000);
    const later = await pose(page);
    assert(closeTo(later.camera.center.lat, stopped.camera.center.lat, .000001));
    assert(closeTo(later.camera.center.lng, stopped.camera.center.lng, .000001));
    assert(Math.abs(later.camera.range - stopped.camera.range) < .1, 'A cancelled flight must not resume moving the camera');
    assert.equal((await contextOf(page)).mode, 'hovering');
    assert.equal((await contextOf(page)).flightStage, null);
    assert.equal(await page.evaluate(() => window.__crowLocationEvidence.flights.some(event => event.arrived === true)), false, 'A cancelled journey must never emit a late arrival');
    report.journeys.push({ scenario: 'cancelled-flight', ...cancelled });
    await snapshot(page, '06-cancelled-far-flight');
  });

  await page.context().close();
  const reduced = await createPage({ reducedMotion: true });
  await check('Reduced motion reaches the destination without the long globe animation', async () => {
    await reduced.waitForFunction(() => window.CrowMap.getContext().hasUserLocation, null, { timeout: 30_000 });
    await startFlight(reduced);
    const journey = await waitForFlight(reduced);
    assert(samePlace((await contextOf(reduced)).destination, paris));
    assert(journey.elapsed < 8_000, 'Reduced motion must bypass the long flight');
    assert.equal(journey.flights.some(event => event.stage === 'cruising'), false);
    report.journeys.push({ scenario: 'reduced-motion', ...journey });
    await settle(reduced);
    await snapshot(reduced, '07-reduced-motion-arrival');
  });

  await reduced.context().close();
  const denied = await createPage({ denied: true });
  await check('Denied geolocation gives an honest fallback and supports an explicit location retry', async () => {
    await denied.waitForFunction(() => window.CrowMap.getContext().locationStatus === 'denied', null, { timeout: 30_000 });
    const fallback = await contextOf(denied);
    assert.equal(fallback.hasUserLocation, false);
    assert.equal(fallback.mode, 'demo');
    assert.match(fallback.locationMessage, /permission|denied|allow|location/i);
    assert.match(await denied.locator('#location-status').textContent(), /location|destination|again/i);
    assert.equal(await denied.locator('#use-my-location').isEnabled(), true);
    await snapshot(denied, '08-location-denied-fallback');
    await denied.evaluate(() => { window.__crowLocationEvidence.deny = false; });
    if (!(await denied.locator('#scout-panel').isVisible())) await denied.locator('#scout-open').click();
    await denied.locator('#use-my-location').click();
    await denied.waitForFunction(() => window.CrowMap.getContext().hasUserLocation && window.CrowMap.getContext().mode === 'landed', null, { timeout: 30_000 });
    assert(samePlace((await contextOf(denied)).spot, { lat: singapore.latitude, lng: singapore.longitude }));
    assert((await denied.evaluate(() => window.__crowLocationEvidence.geolocationCalls)) >= 2);
    await settle(denied);
    await snapshot(denied, '09-location-retry-success');
    await assertPerchedCamera(denied);
  });

  await check('The cinematic travel HUD fits a 390px mobile viewport without horizontal overflow', async () => {
    await denied.setViewportSize({ width: 390, height: 844 });
    await startFlight(denied);
    try {
      await denied.waitForFunction(() => window.CrowMap.getContext().flightStage === 'cruising', null, { timeout: 30_000 });
      const hud = denied.locator('#travel-transition');
      assert.equal(await hud.isVisible(), true);
      assert.equal(await denied.locator('#travel-stage').isVisible(), true);
      assert.equal(await denied.locator('#travel-progress').isVisible(), true);
      const bounds = await hud.boundingBox();
      assert(bounds && bounds.width > 0 && bounds.height > 0, 'The mobile travel HUD must have visible bounds');
      assert(bounds.x >= -1 && bounds.x + bounds.width <= 391, 'The travel HUD must fit within the mobile viewport width');
      assert(bounds.y >= -1 && bounds.y + bounds.height <= 845, 'The travel HUD must fit within the mobile viewport height');
      assert.equal(await denied.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      await snapshot(denied, '10-mobile-cinematic-flight');
    } finally { await denied.evaluate(() => window.CrowMap.pause()); }
    const journey = await waitForFlight(denied);
    assert.equal(journey.result.cancelled, true);
    report.journeys.push({ scenario: 'mobile-hud', ...journey });
  });

  await check('The entire verification avoids billable providers and uncaught page errors', async () => {
    assert.deepEqual(report.blockedProviderRequests, []);
    assert.deepEqual(report.pageErrors, []);
  });
} catch (error) {
  report.failures.push({ name: 'verification setup', message: clean(error.stack || error.message) });
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  for (const context of ownedContexts) await context.close().catch(() => {});
  await browser?.close().catch(() => {});
}
if (report.failures.length) {
  console.error(`${report.failures.length} location/journey check(s) failed. See _debug/location-journey-verification/report.json.`);
  process.exitCode = 1;
} else console.log('Location and cinematic journey checks passed. Screenshots need visual review.');
