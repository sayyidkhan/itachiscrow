import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const url = process.env.CROW_TEST_URL || 'http://127.0.0.1:8000/';
const output = new URL('../_debug/verification/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = process.env.CROW_CDP_URL
  ? await chromium.connectOverCDP(process.env.CROW_CDP_URL)
  : await chromium.launch({
    executablePath: process.env.CROW_BROWSER_EXECUTABLE,
    headless: true,
    args: ['--no-sandbox', ...(process.env.CROW_SOFTWARE_GL === '1'
      ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [])],
  });
const context = browser.contexts()[0] || await browser.newContext();
const page = context.pages()[0] || await context.newPage();
const cdp = await context.newCDPSession(page);
const report = { url, consoleErrors: [], modelResponses: [], modelFailures: [], snapshots: [], checks: [] };
const clean = s => s.replace(/AIza[\w-]+/g, 'REDACTED').replace(/([?&](?:key|token|session)=)[^&\s]+/g, '$1REDACTED');
page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(clean(message.text())); });
page.on('pageerror', error => report.consoleErrors.push(clean(error.message)));
context.on('response', response => {
  if (/\/models\/.*\.glb/.test(response.url())) report.modelResponses.push({ url: clean(response.url()), status: response.status(), type: response.request().resourceType() });
});
context.on('requestfailed', request => {
  if (/\/models\/.*\.glb/.test(request.url())) report.modelFailures.push(clean(request.url() + ' ' + request.failure()?.errorText));
});
const state = () => page.evaluate(() => ({ ready, playing, transitioning, progress, flightTime, bank, heading: crowHeading,
  camera: { range: map.range, fov: map.fov, tilt: map.tilt, heading: map.heading, center: { lat: map.center.lat, lng: map.center.lng, altitude: map.center.altitude } },
  parts: crowParts.map(part => ({ src: String(part.src), altitudeMode: part.altitudeMode,
    position: { lat: part.position.lat, lng: part.position.lng, altitude: part.position.altitude },
    orientation: { heading: part.orientation.heading, tilt: part.orientation.tilt, roll: part.orientation.roll } })) }));
async function capture(name) {
  const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  await writeFile(new URL(`${name}.jpg`, output), Buffer.from(shot.data, 'base64'));
  report.snapshots.push({ name, state: await state() });
  console.log('Captured ' + name);
}
async function settled() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.waitForFunction(() => sceneSteady, null, { timeout: 180000 });
}
try {
  report.graphics = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return { webgl2: false };
    gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    const result = { webgl2: true, pixel: [...pixel], error: gl.getError(), renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return result;
  });
  assert.equal(report.graphics.webgl2, true, 'A real WebGL2 context is required');
  assert.deepEqual(report.graphics.pixel, [255, 0, 0, 255]);
  console.log('WebGL2 pixel readback passed: ' + report.graphics.renderer);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof ready !== 'undefined' && ready, null, { timeout: 240000 });
  await capture('01-before-flight');
  const initial = await state();
  assert.equal(initial.parts.length, 3);
  assert(initial.parts.every(p => new URL(p.src).origin === new URL(url).origin));
  assert(initial.parts.every(p => p.src.endsWith('.glb')));
  report.checks.push('Three same-origin native models; normal startup enabled controls');

  await page.locator('#fly').click();
  await page.waitForFunction(() => playing && progress > 2, null, { timeout: 60000 });
  await capture('02-continuous-flight');
  assert(Math.abs((await state()).camera.range - 48) < 0.1, 'Follow camera must restore its 48 m range');
  assert.equal((await state()).camera.fov, 50);
  await page.locator('#fly').click();
  const paused = await state();
  assert.equal(paused.playing, false);
  await page.waitForTimeout(350);
  assert.equal((await state()).progress, paused.progress);
  await capture('03-paused');
  report.checks.push('Start advances the route; Pause freezes progress');

  for (const [name, time] of [['04-wing-down', 0.78125], ['05-wing-up', 1.09375]]) {
    await page.evaluate(time => { flightTime = time; poseCrow(progress); }, time);
    await settled();
    await capture(name);
  }

  await page.evaluate(() => {
    let best = { s: 0, curvature: 0 };
    for (let s = 50; s < total - 20; s++) {
      const curvature = angleDelta(flightBearing(s + 4), flightBearing(s - 4));
      if (Math.abs(curvature) > Math.abs(best.curvature)) best = { s, curvature };
    }
    progress = best.s; flightTime = 1.09375;
    crowHeading = flightBearing(progress);
    bank = Math.max(-32, Math.min(32, best.curvature * 1.6));
    poseCrow(progress);
    const cam = camera(progress); heading = cam.heading;
    Object.assign(map, cam);
  });
  await settled();
  await capture('06-banked-turn');
  assert(Math.abs((await state()).bank) >= 20);

  const beforeResume = (await state()).progress;
  await page.locator('#fly').click();
  await page.waitForFunction(p => playing && progress > p + 1, beforeResume, { timeout: 60000 });
  await capture('07-resumed');
  await page.locator('#restart').click();
  await page.waitForFunction(() => !playing && !transitioning && progress === 0 && flightTime === 0);
  await settled();
  await capture('08-reset');
  assert(Math.abs((await state()).camera.range - 48) < 0.1);
  assert.equal((await state()).camera.fov, 50);
  report.checks.push('Resume advances from the turn; Reset restores route start and pose');

  await page.locator('#nearby').click();
  await page.waitForFunction(() => placesLoaded || document.querySelector('#places').textContent.includes('unavailable'), null, { timeout: 60000 });
  const places = await page.locator('#places button').count();
  report.placesReturned = places;
  assert(places > 0, 'Live Places search must return results');
  await page.locator('#places button').first().click();
  await page.waitForFunction(() => document.querySelector('#details').open && !document.querySelector('#detail-content').textContent.includes('Fetching available'), null, { timeout: 60000 });
  await page.getByRole('button', { name: 'Save place', exact: true }).click();
  assert(await page.getByRole('button', { name: 'Saved this session ✓', exact: true }).isVisible());
  await capture('09-place-details');
  await page.locator('#close').click();
  await page.locator('#nearby').click();
  report.checks.push('Live Places search, details, session save and dialog close');

  await page.setViewportSize({ width: 390, height: 844 });
  await settled();
  await capture('10-mobile-before-flight');
  await page.locator('#fly').click();
  await page.waitForFunction(() => playing && progress > 1, null, { timeout: 60000 });
  await capture('11-mobile-flight');
  await page.locator('#fly').click();
  await page.locator('#restart').click();
  await settled();
  await capture('12-mobile-reset');
  assert(Math.abs((await state()).camera.range - 48) < 0.1);
  report.checks.push('390×844 Chromium viewport: start, pause, reset');
  assert.equal(report.modelFailures.length, 0);
  assert.equal(report.consoleErrors.length, 0);
  assert(report.modelResponses.some(r => r.type === 'xhr' && r.status === 200));
  report.automatedChecksPassed = true;
  report.visualReview = 'Required: inspect screenshots; automated state checks do not prove crow visibility.';
  report.realIPhoneTested = false;
} catch (error) {
  report.failure = clean(error.stack || error.message);
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  await browser.close();
  console.log('Evidence: ' + output.pathname);
}
