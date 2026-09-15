import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.CROW_TEST_URL || 'http://127.0.0.1:8806/';
const files = ['index.html', 'explore.html', 'customise.html', 'crow-studio.html', 'usage-limits.html'];
const output = new URL('../_debug/loading/', import.meta.url);
await mkdir(output, { recursive: true });
for (const file of files) {
  const html = await readFile(new URL(`../dist/${file}`, import.meta.url), 'utf8');
  assert(!/<link\b[^>]*rel="stylesheet"/.test(html.slice(html.indexOf('<body'))), `${file}: styles must precede body rendering`);
}
const browser = await chromium.launch({
  executablePath: process.env.CROW_BROWSER_EXECUTABLE,
  headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
try {
  for (const width of [390, 1280]) {
    for (const file of files) {
      const context = await browser.newContext({ viewport: { width, height: 844 } });
      let release;
      const pending = new Promise(resolve => { release = resolve; });
      await context.route('**/*', async route => {
        const request = route.request();
        if (['script', 'image'].includes(request.resourceType())) await pending;
        if (new URL(request.url()).pathname.endsWith('/config.js')) {
          await route.fulfill({ contentType: 'text/javascript', body: '' });
        } else if (request.resourceType() === 'stylesheet') {
          await new Promise(resolve => setTimeout(resolve, 250));
          await route.continue();
        } else await route.continue();
      });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message.replace(/AIza[\w-]+/g, 'REDACTED')));
      try {
        const response = await page.goto(new URL(file, base).href, { waitUntil: 'commit' });
        assert.equal(response.status(), 200);
        await page.waitForFunction(() => document.querySelector('body > header') &&
          [...document.querySelectorAll('link[rel="stylesheet"]')].every(link => link.sheet));
        const toggle = page.getByRole('button', { name: 'More options', exact: true });
        assert(await toggle.isDisabled(), `${file}: menu stays inactive until ready`);
        const header = await page.locator('body > header').boundingBox();
        const menu = await toggle.boundingBox();
        assert.equal(menu.height, 44);
        assert.equal(menu.width, 44);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        if (file === 'explore.html') {
          const state = await page.evaluate(() => ({
            headerHeight: document.querySelector('.topbar').getBoundingClientRect().height,
            chatPosition: getComputedStyle(document.querySelector('#companion')).position,
            oldControls: getComputedStyle(document.querySelector('.bottom')).display,
          }));
          assert.equal(state.headerHeight, width <= 760 ? 64 : 76);
          assert.equal(state.chatPosition, 'absolute');
          assert.equal(state.oldControls, 'block');
          for (const id of ['fly', 'free-roam', 'land-map', 'nearby']) {
            assert(await page.locator('#' + id).isHidden());
            assert(await page.locator('#' + id).isDisabled());
          }
          assert(await page.locator('#loading').isVisible());
          assert(await page.locator('#companion').isHidden());
          assert(await page.locator('#chat-open').isVisible());
          assert(await page.locator('#chat-open').isDisabled());
          const cdp = await context.newCDPSession(page);
          const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          await writeFile(new URL(`map-${width}-pending.png`, output), Buffer.from(shot.data, 'base64'));
          await cdp.detach();
        }
        release();
        await page.waitForLoadState('load');
        await page.waitForFunction(() => !document.querySelector('.crow-menu-toggle').disabled);
        assert.deepEqual(await page.locator('body > header').boundingBox(), header, `${file}: header must not shift after scripts/images load`);
        assert.deepEqual(await toggle.boundingBox(), menu, `${file}: menu must not shift after initialisation`);
        await toggle.click();
        assert(await page.locator('#crow-navigation-links').isVisible());
        await page.keyboard.press('Escape');
        assert(await page.locator('#crow-navigation-links').isHidden());
        assert.deepEqual(errors, [], `${file}: browser errors`);
        console.log(`${file} ${width}px: stable styled shell during delayed scripts, images and CSS; navigation ready afterwards.`);
      } finally {
        release();
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
