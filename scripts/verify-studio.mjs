import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { validateBytes } from 'gltf-validator';
import { DEFAULT_DESIGN, STORAGE_KEY, normaliseDesign, recolourGLB, linearColour } from '../dist/crow-design.js';

const output = new URL('../_debug/studio/', import.meta.url);
await mkdir(output, { recursive: true });
const sample = { body: '#c4ccd2', feathers: '#849aaa', coverts: '#e0e2df', eyes: '#edb951' };
const parse = buffer => JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, new DataView(buffer).getUint32(12, true))));
for (const name of ['body', 'left-wing', 'right-wing', 'perched']) {
  const file = await readFile(new URL(`../dist/models/${name}.glb`, import.meta.url));
  const original = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  const changed = recolourGLB(original, sample);
  const result = await validateBytes(new Uint8Array(changed));
  assert.equal(result.issues.numErrors, 0); assert.equal(result.issues.numWarnings, 0);
  const tail = buffer => new Uint8Array(buffer, 20 + new DataView(buffer).getUint32(12, true));
  assert.deepEqual(tail(original), tail(changed), 'Colour edits must preserve the complete geometry buffer');
  assert.deepEqual(parse(recolourGLB(original, DEFAULT_DESIGN)).materials, parse(original).materials, 'Reset must preserve original materials exactly');
  const material = parse(changed).materials.find(item => item.name === 'Satin black plumage');
  assert.deepEqual(material.pbrMetallicRoughness.baseColorFactor, [...linearColour(sample.body), 1]);
}
assert.deepEqual(normaliseDesign({ eyes: 'javascript:alert(1)', body: null }), DEFAULT_DESIGN);
console.log('Recoloured GLBs validate; geometry is unchanged; reset and invalid input checks pass.');

const browser = await chromium.launch({
  executablePath: process.env.CROW_BROWSER_EXECUTABLE,
  headless: true,
  args: ['--no-sandbox', ...(process.env.CROW_SOFTWARE_GL === '1' ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [])],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const url = process.env.CROW_TEST_URL || 'http://127.0.0.1:8806/';
const errors = [];
const models = [];
page.on('pageerror', error => errors.push(error.message.replace(/AIza[\w-]+/g, 'REDACTED')));
page.on('response', response => { if (response.url().includes('/crow-colours/')) models.push({ status: response.status(), type: response.request().resourceType(), worker: response.fromServiceWorker() }); });
const capture = async name => {
  const session = await context.newCDPSession(page);
  const shot = await session.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
  await writeFile(new URL(name + '.jpg', output), Buffer.from(shot.data, 'base64'));
  await session.detach(); console.log('Captured ' + name);
};
try {
  await page.goto(new URL('customise.html', url).href);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  const graphics = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return null;
    gl.clearColor(1, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const pixel = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    gl.getExtension('WEBGL_lose_context')?.loseContext(); return [...pixel];
  });
  assert.deepEqual(graphics, [255, 0, 0, 255]);
  assert.equal(await page.locator('body').getAttribute('data-pose'), 'perched');
  await capture('01-original');
  await page.locator('[data-preset="moon"]').click();
  await page.waitForTimeout(300);
  await capture('02-moonstone');
  await page.locator('[data-view="eyes"]').click();
  await page.waitForTimeout(300);
  await capture('03-eyes');
  await page.locator('#eyes').evaluate(input => { input.value = '#00ff88'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal(await page.locator('output[for="eyes"]').textContent(), '#00ff88');
  await capture('04-green-eyes');
  await page.locator('[data-view="portrait"]').click();
  await page.locator('#wingbeats').click();
  assert.equal(await page.locator('#wingbeats').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('body').getAttribute('data-pose'), 'flight');
  await page.waitForTimeout(550);
  await capture('05-wingbeat');
  await page.locator('#wingbeats').click();
  await page.locator('[data-pose="perched"]').click();
  assert.equal(await page.locator('#wingbeats').getAttribute('aria-pressed'), 'false');
  assert.equal(await page.locator('#eyes').inputValue(), '#00ff88');
  await page.locator('#save').click();
  await page.waitForFunction(() => document.getElementById('save-status').textContent.startsWith('Saved ✓'), null, { timeout: 30000 });
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).eyes, STORAGE_KEY), '#00ff88');
  await page.reload();
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  assert.equal(await page.locator('#eyes').inputValue(), '#00ff88');
  assert.equal(await page.locator('#body').inputValue(), sample.body);
  assert.equal(await page.locator('body').getAttribute('data-pose'), 'perched');
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 130, box.y + box.height / 2 + 40, { steps: 8 }); await page.mouse.up();
  await page.locator('#zoom-in').click();
  await capture('06-orbit-zoom');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-view="portrait"]').click();
  await page.waitForTimeout(300);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await capture('07-mobile');
  await page.locator('#save').scrollIntoViewIfNeeded();
  await capture('08-mobile-controls');
  console.log('Studio controls, colour save/reload, orbit, zoom and mobile layout pass. Testing native map…');
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(url);
  console.log('Waiting for Google’s city renderer to settle.');
  await page.waitForFunction(() => typeof ready !== 'undefined' && ready, null, { timeout: 240000 });
  const sources = await page.evaluate(() => crowParts.map(part => String(part.src)));
  assert(sources.every(source => source.includes('/crow-colours/') && source.endsWith('.glb')));
  await capture('09-coloured-city');
  await page.locator('#fly').click();
  await page.waitForFunction(() => playing && progress > 2, null, { timeout: 60000 });
  await page.locator('#fly').click();
  const progress = await page.evaluate(() => progress);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => progress), progress);
  await capture('10-coloured-flight-paused');
  await page.locator('#fly').click();
  await page.waitForFunction(value => playing && progress > value + 1, progress, { timeout: 60000 });
  await page.locator('#restart').click();
  await page.waitForFunction(() => !playing && progress === 0);
  await capture('11-coloured-reset');
  await page.locator('.studio-link').click();
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  await page.locator('#restore').click();
  await page.locator('#save').click();
  await page.waitForFunction(() => document.getElementById('save-status').textContent.startsWith('Saved ✓'));
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY), DEFAULT_DESIGN);
  assert.deepEqual(errors, []);
  await writeFile(new URL('report.json', output), JSON.stringify({ graphics, errors, sources, models, checks: ['GLB validation', 'Geometry preserved', 'Original materials restored exactly', 'Four independent colour fields', 'Eye colour save/reload', 'Orbit and zoom', 'Wingbeat toggle', '390px responsive viewport', 'Native coloured city model URLs', 'Start/pause/resume/reset', 'Restore original design'] }, null, 2));
  console.log('Studio and native flight verification passed.');
} catch (error) {
  await capture('failure').catch(() => {});
  console.log(await page.evaluate(() => ({ text: document.body.innerText, state: typeof ready === 'undefined' ? null : { ready, sceneSteady, modelsMounted, startupFailed } })).catch(() => 'Page unavailable'));
  throw error;
} finally { await browser.close(); }
