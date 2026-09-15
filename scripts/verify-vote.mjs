import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.CROW_TEST_URL || 'http://127.0.0.1:8806/';
const voteUrl = 'https://astra-hackathon-singapore.openai.chatgpt.site/gallery/2ea1c553-473e-4d1d-ba08-1beb4a2d9547';
const output = new URL('../_debug/vote/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CROW_BROWSER_EXECUTABLE, args: ['--no-sandbox'] });
try {
  for (const width of [320, 390, 740, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, reducedMotion: width === 320 ? 'reduce' : 'no-preference' });
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await context.route('**/api/status', route => route.fulfill({ json: { capabilities: {} } }));
    await context.route(voteUrl, route => route.fulfill({ body: 'Voting link destination' }));
    const page = await context.newPage();
    await page.clock.install();
    const event = (name, detail) => page.evaluate(({ name, detail }) => document.dispatchEvent(new CustomEvent('crow:' + name, { detail })), { name, detail });
    const flight = async () => {
      await event('destination', { mode: 'arriving' });
      await event('flight', { arrived: true, progress: 1 });
    };
    await page.goto(new URL('index.html', base).href);
    const button = page.locator('#project-vote');
    assert(await button.isVisible());
    assert.equal(await button.getAttribute('href'), voteUrl);
    assert.equal(await button.getAttribute('target'), '_blank');
    await page.screenshot({ path: new URL(`home-${width}.png`, output).pathname, fullPage: true });
    await page.goto(new URL('explore.html', base).href);
    await page.waitForFunction(() => !document.querySelector('.crow-menu-toggle').disabled);
    assert(!await button.isVisible());
    await event('flight', { arrived: true });
    assert(!await button.isVisible(), 'Stray completion does not prompt');
    await event('flight', { stage: 'cruising' });
    await event('flight', { cancelled: true });
    await event('flight', { arrived: true });
    assert(!await button.isVisible(), 'Cancelled flight does not prompt');
    await flight();
    assert(await button.isVisible(), 'First completed flight prompts, including reduced motion');
    const bounds = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
      return { brand: rect('.brand'), vote: rect('#project-vote'), menu: rect('.crow-menu-toggle'), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert(!bounds.overflow);
    assert(bounds.vote.x >= bounds.brand.right && bounds.vote.right <= bounds.menu.x);
    assert(bounds.vote.height >= 44);
    if (width === 320) assert.equal(await button.evaluate(el => getComputedStyle(el, '::after').animationName), 'none');
    await page.screenshot({ path: new URL(`map-${width}.png`, output).pathname });
    await page.getByRole('button', { name: 'More options', exact: true }).click();
    assert(await page.locator('#crow-navigation-links').isVisible());
    await page.keyboard.press('Escape');
    await page.mouse.move(1, 400);
    await page.clock.fastForward(16_000);
    assert(!await button.isVisible(), 'Prompt expires');
    await flight(); await flight(); await flight();
    assert(!await button.isVisible(), 'Cooldown suppresses rapid repeat flights');
    await page.clock.fastForward(121_000);
    await flight(); await flight();
    assert(!await button.isVisible(), 'Intermediate flights do not prompt');
    await flight();
    assert(await button.isVisible(), 'Every third flight can prompt after cooldown');
    const popupPromise = page.waitForEvent('popup');
    await button.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    assert.equal(popup.url(), voteUrl);
    await popup.close();
    await page.reload();
    await page.waitForFunction(() => !document.querySelector('.crow-menu-toggle').disabled);
    await page.clock.fastForward(121_000);
    await flight(); await flight(); await flight();
    assert(!await button.isVisible(), 'Opening voting suppresses future prompts across reloads');
    await context.close();
    console.log(`Voting checks passed at ${width}px`);
  }
} finally { await browser.close(); }
