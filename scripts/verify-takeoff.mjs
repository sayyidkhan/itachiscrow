import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const output = new URL('../_debug/takeoff/', import.meta.url);
const appUrl = new URL(process.env.CROW_TEST_URL || 'http://127.0.0.1:8806/');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CROW_BROWSER_EXECUTABLE,
  headless: true,
  args: ['--no-sandbox', ...(process.env.CROW_SOFTWARE_GL === '1' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [])],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, geolocation: { latitude: 1.2904, longitude: 103.8377 }, permissions: ['geolocation'] });
const page = await context.newPage();
const report = { errors: [], models: [], checks: [], captures: [] };
const clean = value => String(value).replace(/AIza[\w-]+|sk-[\w-]+/g, 'REDACTED').replace(/([?&](?:key|token|session)=)[^&\s]+/gi, '$1REDACTED');
page.on('pageerror', error => report.errors.push(clean(error.message)));
page.on('response', response => { if (/\/models\/.*\.glb$/.test(response.url())) report.models.push({ status: response.status(), type: response.request().resourceType() }); });
await context.route('**/api/**', route => new URL(route.request().url()).origin === appUrl.origin
  ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ capabilities: {}, openai: { configured: false }, instagram: { configured: false } }) })
  : route.continue());
const state = () => page.evaluate(() => ({ ready, mode: scoutMode, position: scoutPosition, base: scoutAltitudeBase, range: map.range, camera: { lat: map.center.lat, lng: map.center.lng, altitude: map.center.altitude }, parts: crowParts.map(p => ({ altitudeMode: p.altitudeMode, altitude: p.position.altitude })) }));
async function capture(name) {
  await page.screenshot({ path: new URL(name + '.jpg', output).pathname, type: 'jpeg', quality: 88, timeout: 20000 });
  report.captures.push({ name, state: await state().catch(() => null) });
  console.log('Captured ' + name);
}
async function launch() {
  await page.evaluate(() => {
    window.takeoffSamples = [];
    window.takeoffDone = null;
    window.takeoffCameraCalls = 0;
    const fly = map.flyCameraTo.bind(map);
    map.flyCameraTo = (...args) => { window.takeoffCameraCalls++; return fly(...args); };
    const sample = () => {
      window.takeoffSamples.push({ time: performance.now(), altitude: crowParts[0].position.altitude, mode: crowParts[0].altitudeMode, range: map.range, cameraAltitude: map.center.altitude });
      if (!window.takeoffDone) requestAnimationFrame(sample);
    };
    window.CrowMap.takeOff().then(result => { window.takeoffDone = result; map.flyCameraTo = fly; });
    requestAnimationFrame(sample);
  });
}
try {
  report.graphics = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const pixel = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const extension = gl.getExtension('WEBGL_debug_renderer_info');
    return { pixel: [...pixel], renderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  assert.deepEqual(report.graphics?.pixel, [255, 0, 0, 255]);
  console.log('WebGL2 pixel readback passed');
  await page.goto(appUrl.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.CrowMap?.getContext().mapReady || (typeof startupFailed !== 'undefined' && startupFailed), null, { timeout: 240000 });
  assert.equal(await page.evaluate(() => window.CrowMap?.getContext().mapReady), true, 'Google Maps must finish loading before takeoff verification');
  await page.locator('#auto-scene').uncheck();
  await capture('01-perched');
  await launch();
  await page.waitForFunction(() => scoutMode === 'taking-off' && scoutPosition.altitude > 14, null, { timeout: 60000 });
  await capture('02-lift');
  await page.waitForFunction(() => window.takeoffDone, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await capture('03-airborne');
  report.desktop = await page.evaluate(() => ({ samples: window.takeoffSamples, cameraCalls: window.takeoffCameraCalls, result: window.takeoffDone }));
  assert.equal(report.desktop.result.mode, 'hovering');
  assert.equal(report.desktop.cameraCalls, 0);
  assert(report.desktop.samples.every(p => p.mode === 'ABSOLUTE'));
  assert.equal((await state()).range, 42);
  report.checks.push('Desktop native takeoff: one absolute roof height, no restarted camera animations, completed at 42 m framing');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#restart').click();
  await page.waitForTimeout(2000);
  await capture('04-mobile-perched');
  await launch();
  await page.waitForFunction(() => scoutMode === 'taking-off' && scoutPosition.altitude > 12, null, { timeout: 60000 });
  await page.locator('#fly').click();
  const paused = await state();
  await page.waitForTimeout(500);
  assert.deepEqual((await state()).position, paused.position);
  await capture('05-mobile-paused');
  await page.locator('#restart').click();
  await page.waitForTimeout(1500);
  await launch();
  await page.waitForFunction(() => window.takeoffDone, null, { timeout: 60000 });
  await page.waitForTimeout(3000);
  await capture('06-mobile-airborne');
  assert.equal((await state()).mode, 'hovering');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  report.checks.push('Mobile viewport: takeoff, pause freezes position, reset and second takeoff, no horizontal overflow');
  assert.deepEqual(report.errors, []);
  assert(report.models.length >= 6 && report.models.every(p => p.status === 200));
} catch (error) {
  report.failure = clean(error.message);
  await capture('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ checks: report.checks, failure: report.failure, errors: report.errors }));
  await browser.close();
}
