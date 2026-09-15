import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.CROW_TEST_URL || 'http://127.0.0.1:8806/';
const output = new URL('../_debug/chat-interface/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CROW_BROWSER_EXECUTABLE, args: ['--no-sandbox'] });
try {
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [740, 390], [390, 380], [1280, 844]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    const requests = [], errors = [];
    let mode = 'success', release;
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await context.route('**/api/status', route => route.fulfill({ json: { capabilities: { chat: true, live: true } } }));
    await context.route('**/api/chat', async route => {
      requests.push(route.request().postDataJSON());
      if (mode === 'pending') await new Promise(resolve => { release = resolve; });
      if (mode === 'error') return route.fulfill({ status: 503, json: { error: { message: 'The guide could not be reached. Try again.' } } });
      await route.fulfill({ json: { conversationId: 'interface-check', text: 'Start at **Esplanade**.\n\n' + 'Follow the waterfront towards Marina Bay. Stop for a view across the river.\n\n'.repeat(12), calls: [] } });
    });
    await context.addInitScript(() => {
      window.micRequests = 0;
      navigator.mediaDevices.getUserMedia = async () => { window.micRequests++; throw new DOMException('Microphone access denied', 'NotAllowedError'); };
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message.replace(/AIza[\w-]+/g, 'REDACTED')));
    try {
      await page.goto(new URL('explore.html', base).href);
      await page.waitForFunction(() => document.getElementById('connection-status').textContent === 'Your guide to anywhere');
      const input = page.locator('#chat-input'), send = page.locator('#chat-send'), toggle = page.locator('#companion-toggle');
      assert(await send.isDisabled());
      assert.equal(await page.evaluate(() => window.micRequests), 0);
      if (width <= 760) await toggle.click();
      await page.locator('[data-command]').first().click();
      assert.match(await input.inputValue(), /Gardens by the Bay/);
      assert.equal(requests.length, 0, 'Suggestions fill a draft without sending');
      await input.fill('First line');
      await input.press('Shift+Enter');
      await input.press('x');
      assert.equal(await input.inputValue(), 'First line\nx');
      await input.press('Enter');
      await page.locator('.chat-bubble.assistant').waitFor();
      assert.equal(requests[0].message, 'First line\nx');
      assert.equal(await input.inputValue(), '');
      assert(await send.isDisabled());
      assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
      await page.waitForTimeout(100);
      const bounds = await page.evaluate(() => {
        const rect = id => document.getElementById(id).getBoundingClientRect().toJSON();
        return { input: rect('chat-input'), panel: rect('companion'), world: rect('world'), log: rect('voice-transcript'), overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert(!bounds.overflow, JSON.stringify(bounds));
      assert(bounds.input.y >= 0 && bounds.input.bottom <= height, JSON.stringify(bounds));
      assert(bounds.log.height > 20, JSON.stringify(bounds));
      if (width <= 760) assert(bounds.world.bottom <= bounds.panel.top + 1, 'Map and attribution stay above the panel');
      await page.locator('#voice-transcript').evaluate(log => { log.scrollTop = 0; });
      await page.locator('#chat-latest').waitFor();
      await page.setViewportSize({ width, height: height - 10 });
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#voice-transcript').evaluate(log => log.scrollTop), 0, 'Resizing preserves reading position');
      await page.locator('#chat-latest').click();
      assert(await page.locator('#voice-transcript').evaluate(log => log.scrollHeight - log.scrollTop - log.clientHeight < 48));
      await page.setViewportSize({ width, height });
      await page.screenshot({ path: new URL(`conversation-${width}x${height}.png`, output).pathname });
      await toggle.click();
      assert(await input.isVisible());
      assert(await page.locator('#voice-toggle').isVisible());
      assert(await page.locator('#voice-transcript').isHidden());
      mode = 'pending';
      await input.fill('Another question');
      await send.click();
      await page.locator('#command-stop').waitFor();
      assert(await send.isHidden());
      assert(await page.locator('#command-status').isVisible());
      const count = await page.locator('.chat-bubble.assistant').count();
      await page.locator('#command-stop').click();
      release();
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.chat-bubble.assistant').count(), count, 'Stopped reply is discarded');
      assert(await send.isVisible());
      mode = 'error';
      await input.fill('Try again');
      await send.click();
      await page.waitForFunction(() => document.querySelector('#command-status.error')?.textContent.includes('could not be reached'));
      assert(await page.locator('#command-stop').isHidden());
      await page.locator('#voice-toggle').click();
      await page.waitForFunction(() => document.getElementById('voice-error').textContent.length > 0);
      assert.equal(await page.evaluate(() => window.micRequests), 1);
      assert(await input.isVisible());
      await input.fill('A longer draft\n'.repeat(10));
      const composerBottom = (await send.boundingBox()).y + (await send.boundingBox()).height;
      assert(composerBottom <= height, `Send remains reachable with a long draft and errors at ${width}×${height}: ${composerBottom}`);
      assert.deepEqual(errors, []);
      console.log(`${width}×${height}: draft, multiline send, long reply, scroll position, collapse, stop, errors and microphone permission passed.`);
    } finally { release?.(); await context.close(); }
  }
} finally { await browser.close(); }
