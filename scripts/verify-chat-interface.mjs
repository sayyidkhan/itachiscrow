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
      assert(await page.locator('#companion').isHidden());
      const mapBefore = await page.locator('#world').boundingBox();
      await page.locator('#chat-open').click();
      assert(await send.isDisabled());
      assert.equal(await page.evaluate(() => window.micRequests), 0);
      await page.locator('[data-discovery="somewhere"]').click();
      assert.equal(await page.locator('.discovery-card').count(), 7);
      assert.equal(await input.inputValue(), '');
      assert.equal(requests.length, 0, 'Browsing destination ideas does not send chat');
      await page.getByRole('button', {name:'← Back',exact:true}).click();
      await input.fill('First line');
      await input.press('Shift+Enter');
      await input.press('x');
      assert.equal(await input.inputValue(), 'First line\nx');
      await input.press('Enter');
      await page.locator('.chat-bubble.assistant').waitFor();
      assert.equal(requests[0].message, 'First line\nx');
      assert.equal(await input.inputValue(), '');
      assert(await send.isDisabled());
      assert.equal(await page.locator('#chat-open').getAttribute('aria-expanded'), 'true');
      await page.waitForTimeout(100);
      const bounds = await page.evaluate(() => {
        const rect = id => document.getElementById(id).getBoundingClientRect().toJSON();
        return { input: rect('chat-input'), panel: rect('companion'), world: rect('world'), log: rect('voice-transcript'), overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert(!bounds.overflow, JSON.stringify(bounds));
      assert(bounds.input.y >= 0 && bounds.input.bottom <= height, JSON.stringify(bounds));
      assert(bounds.log.height > 20, JSON.stringify(bounds));
      assert.deepEqual(await page.locator('#world').boundingBox(), mapBefore, 'Opening chat never resizes the map');
      assert(bounds.panel.bottom <= bounds.world.bottom - 40, 'Attribution strip stays clear below the overlay');
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
      assert(await input.isHidden());
      assert(await page.locator('#voice-launch').isVisible());
      assert(await page.locator('#voice-transcript').isHidden());
      await page.locator('#chat-open').click();
      assert.equal(await page.locator('.chat-bubble.assistant').count(), 1, 'History survives closing chat');
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
      release = undefined;
      await input.fill('Reply while I explore');
      await send.click();
      while (!release) await page.waitForTimeout(10);
      await toggle.click();
      release();
      await page.locator('#chat-unread').waitFor();
      assert(await page.locator('#companion').isHidden(), 'Incoming replies do not reopen chat');
      await page.locator('#chat-open').click();
      assert(await page.locator('#chat-unread').isHidden());
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
      await toggle.click();
      await page.locator('#chat-open').click();
      assert.equal(await input.inputValue(), 'A longer draft\n'.repeat(10), 'Closing preserves the draft');
      await input.press('Escape');
      assert(await input.isHidden());
      assert(await page.locator('#chat-open').evaluate(el => el === document.activeElement));
      assert.deepEqual(errors, []);
      await context.route('**/live.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
        export function validateLiveAction() { throw new Error('Unexpected action in voice interface check'); }
        export class CrowLive {
          constructor(options) { this.options = options; this.state = {status:'idle', muted:false}; window.voiceHarness = this; }
          updateContext() {}
          cancelActions() { this.state.pendingAction = false; this.notify(); }
          notify() { this.options.onState(this.state); }
          async start() { window.micRequests++; this.state.status='connecting'; this.notify(); this.state.status='connected'; this.notify(); }
          stop() { this.state.status='idle'; this.notify(); }
          setMuted(value) { this.state.muted=value; this.notify(); }
          resumeAudio() { this.state.playbackBlocked=false; this.notify(); }
          caption(role, delta) { this.options.onTranscript({role,delta}); }
          fail() { this.state.status='error'; this.notify(); this.options.onError(new Error('Voice connection lost.')); }
        }
      ` }));
      await page.reload();
      await page.waitForFunction(() => document.getElementById('connection-status').textContent === 'Your guide to anywhere');
      assert.equal(await page.evaluate(() => window.micRequests), 0);
      const voiceMap = await page.locator('#world').boundingBox();
      await page.locator('#voice-launch').click();
      await page.locator('#voice-overlay').waitFor();
      assert(await page.locator('#companion').isHidden());
      await page.evaluate(() => {
        window.voiceHarness.caption('user', 'Tell me about this waterfront.');
        window.voiceHarness.caption('assistant', 'You’re at Esplanade, overlooking Marina Bay.');
      });
      assert.equal(await page.locator('.voice-caption').count(), 2);
      assert.match(await page.locator('.voice-caption.assistant').innerText(), /Marina Bay/);
      assert.deepEqual(await page.locator('#world').boundingBox(), voiceMap);
      const hud = await page.locator('#voice-overlay').boundingBox();
      assert(hud.y >= voiceMap.y && hud.y + hud.height <= height - 40, 'Voice overlay stays inside map and clear of attribution');
      assert.equal(await page.locator('#voice-captions').evaluate(el => getComputedStyle(el).pointerEvents), 'none', 'Captions let map gestures through');
      await page.screenshot({ path: new URL(`voice-${width}x${height}.png`, output).pathname });
      await page.locator('#voice-overlay-mute').click();
      assert.equal(await page.locator('#voice-overlay-mute').getAttribute('aria-pressed'), 'true');
      await page.locator('#voice-chat').click();
      assert(await page.locator('#voice-overlay').isHidden());
      assert.equal(await page.locator('.chat-bubble').count(), 2);
      assert.equal(await page.evaluate(() => window.voiceHarness.state.status), 'connected');
      await toggle.click();
      await page.evaluate(() => { window.voiceHarness.state.pendingAction=true; window.voiceHarness.state.playbackBlocked=true; window.voiceHarness.notify(); });
      await page.locator('#voice-overlay-stop').click();
      assert.equal(await page.evaluate(() => window.voiceHarness.state.pendingAction), false);
      await page.locator('#voice-overlay-audio').click();
      assert(await page.locator('#voice-overlay-audio').isHidden());
      await page.locator('#voice-overlay-end').click();
      assert(await page.locator('#voice-overlay').isHidden());
      assert(await page.locator('#chat-launcher').isVisible());
      await page.locator('#voice-launch').click();
      assert.equal(await page.locator('.voice-caption').count(), 0, 'New calls clear old captions');
      await page.evaluate(() => window.voiceHarness.fail());
      assert(await page.locator('#companion').isVisible());
      assert.match(await page.locator('#voice-error').textContent(), /connection lost/);
      assert.deepEqual(errors, []);
      console.log(`${width}×${height}: overlay, draft/history, text, cancellation, permission denial, voice captions, mute/end, reconnect and attribution clearance passed.`);
    } finally { release?.(); await context.close(); }
  }
} finally { await browser.close(); }
