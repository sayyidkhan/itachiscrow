import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const base = process.env.CROW_TEST_URL || 'http://127.0.0.1:8806/';
const browser = await chromium.launch({ executablePath: process.env.CROW_BROWSER_EXECUTABLE, headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const files = ['index.html', 'explore.html', 'customise.html', 'crow-studio.html', 'usage-limits.html'];
const labels = ['Map', 'Author Studio', 'Crow colours', 'Usage limits', 'Debug tools', 'Music', 'About', 'Back to home'];
try {
  const context = await browser.newContext();
  await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message.replace(/AIza[\w-]+/g, 'REDACTED')));
  for (const width of [360, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const file of files) {
      const response = await page.goto(new URL(file, base).href, { waitUntil: 'load' });
      assert.equal(response.status(), 200);
      const toggle = page.getByRole('button', { name: 'More options', exact: true });
      const menu = page.locator('#crow-navigation-links');
      await toggle.click();
      assert.deepEqual(await menu.locator('a > span:first-child').allTextContents(), labels);
      assert.equal(await menu.locator('[aria-current="page"]').getAttribute('href'), file);
      const bounds = await menu.boundingBox();
      assert(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= 844);
      assert(await menu.getByText('Back to home', { exact: true }).isVisible());
      await page.keyboard.press('Escape');
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert(await toggle.evaluate(node => node === document.activeElement));
      await page.keyboard.press('ArrowDown');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), 'explore.html');
      await page.keyboard.press('End');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), 'index.html');
      await toggle.click();
      await toggle.click();
      await page.mouse.click(2, 180);
      assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      if (file === 'explore.html') {
        for (const [action, dialog, close] of [['debug', '#scout-panel', '#scout-close'], ['music', '#music-dialog', '#music-close'], ['about', '#about', '#close-about']]) {
          await toggle.click();
          await menu.locator(`[data-map-tool="${action}"]`).click();
          assert(await page.locator(dialog).isVisible());
          await page.locator(close).click();
        }
      }
    }
  }
  await page.goto(new URL('customise.html', base).href);
  await page.getByRole('button', { name: 'More options', exact: true }).click();
  await page.locator('[data-map-tool="debug"]').click();
  await page.waitForURL('**/explore.html*');
  await page.waitForFunction(() => !document.getElementById('scout-panel').hidden);
  assert.deepEqual(errors, []);
  console.log('Shared navigation passed: five pages, three widths, current-page markers, keyboard/dismissal, map tools and cross-page links.');
} finally {
  await browser.close();
}
