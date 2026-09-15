import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const base = process.env.CROW_TEST_URL || 'http://127.0.0.1:8806/';
const output = new URL('../_debug/voice-orb/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CROW_BROWSER_EXECUTABLE, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const styles = ['working', 'searching', 'solving', 'listening', 'connecting', 'weaving', 'composing', 'breathing', 'shaping'];
try {
  for (const [width, height] of [[320,568], [390,844], [430,932], [740,390], [390,380], [1280,844]]) {
    if (process.env.CROW_TEST_VIEWPORT && process.env.CROW_TEST_VIEWPORT !== `${width}x${height}`) continue;
    const context = await browser.newContext({ viewport: { width, height } });
    await context.route('**/config.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
    await context.route('**/api/status', route => route.fulfill({ json: { capabilities: { live: true, chat: true } } }));
    await context.route('**/live.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
      export function validateLiveAction() { throw Error('Unexpected action in orb check'); }
      export class CrowLive {
        constructor(options) { this.options=options; this.state={status:'idle',muted:false}; window.voiceHarness=this; }
        updateContext() {} cancelActions() {}
        notify() { this.options.onState(this.state); }
        start() { this.state.status='connecting'; this.notify(); }
        stop() { this.state.status='idle'; this.notify(); }
        setMuted(value) { this.state.muted=value; this.notify(); }
        resumeAudio() { this.state.playbackBlocked=false; this.notify(); }
      }
    ` }));
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(new URL('explore.html', base).href);
    await page.waitForFunction(() => document.getElementById('connection-status').textContent === 'Your guide to anywhere');
    await page.locator('#voice-launch').click();
    await page.waitForFunction(() => document.getElementById('voice-orb-status').textContent === 'Connecting');
    await page.evaluate(() => { window.voiceHarness.state.status='connected'; window.voiceHarness.notify(); });
    await page.waitForFunction(() => document.getElementById('voice-orb-status').textContent === 'Listening');
    const setState = data => page.evaluate(data => { Object.assign(window.voiceHarness.state,data); window.voiceHarness.notify(); }, data);
    const select = async value => {
      await page.locator('#voice-style-toggle').click();
      await page.locator(`[data-orb-style="${value}"]`).click();
    };
    const pixels = () => page.locator('#voice-orb-canvas').evaluate(el => el.toDataURL());
    const initial = await pixels();
    await page.waitForTimeout(120);
    assert.notEqual(await pixels(), initial, 'Active orb animates');
    const shapes = new Set();
    for (const style of styles) {
      await select(style);
      assert.equal(await page.locator('#voice-console').getAttribute('data-style'), style);
      await page.waitForTimeout(70);
      shapes.add(await pixels());
    }
    assert.equal(shapes.size, 9, 'All nine styles have distinct artwork');
    await select('auto');
    await setState({ responding: true });
    await page.waitForFunction(() => document.getElementById('voice-orb-status').textContent === 'Thinking');
    await setState({ responding: false, pendingAction: 'fly_to' });
    await page.waitForFunction(() => document.getElementById('voice-orb-status').textContent === 'On it');
    await setState({ pendingAction: null });
    await page.evaluate(() => window.voiceHarness.options.onLevel({input:0,output:.5}));
    await page.waitForFunction(() => document.getElementById('voice-orb-status').textContent === 'Crow is speaking');
    await page.waitForFunction(() => document.getElementById('voice-orb-status').textContent === 'Listening');
    await page.locator('#voice-overlay-mute').click();
    await page.waitForFunction(() => document.getElementById('voice-orb-status').textContent === 'Microphone muted');
    await page.locator('#voice-overlay-mute').click();
    await page.evaluate(() => {
      window.voiceHarness.options.onTranscript({role:'user',delta:'Take me somewhere by the water.'});
      window.voiceHarness.options.onTranscript({role:'assistant',delta:'Let’s explore Marina Bay. I can fly you along the waterfront and circle the landmarks.'});
    });
    await page.locator('#voice-style-toggle').click();
    const bounds = await page.evaluate(() => {
      const rect = id => document.getElementById(id).getBoundingClientRect().toJSON();
      return { overlay:rect('voice-overlay'), end:rect('voice-overlay-end'), orb:rect('voice-orb-canvas'), world:rect('world'), overflow:document.documentElement.scrollWidth>innerWidth };
    });
    assert(!bounds.overflow);
    assert(bounds.overlay.y >= bounds.world.y && bounds.end.bottom <= height-40, JSON.stringify(bounds));
    assert(bounds.orb.height >= 48, 'Orb remains readable');
    await page.locator('[data-orb-style="connecting"]').press('Escape');
    assert(await page.locator('#voice-orb-styles').isHidden());
    assert(await page.locator('#voice-style-toggle').evaluate(el => el === document.activeElement));
    await page.screenshot({path:new URL(`voice-${width}x${height}.png`,output).pathname});
    await page.locator('#voice-chat').click();
    const paused = await pixels();
    await page.waitForTimeout(120);
    assert.equal(await pixels(), paused, 'Hidden orb stops rendering while chat is open');
    await page.locator('#companion-toggle').click();
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.waitForTimeout(50);
    const still = await pixels();
    await page.waitForTimeout(120);
    assert.equal(await pixels(), still, 'Reduced motion keeps orb still');
    await select('weaving');
    await page.locator('#voice-overlay-end').click();
    assert(await page.locator('#voice-overlay').isHidden());
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#voice-style-toggle').textContent.includes('Helix'));
    assert(await page.locator('#voice-overlay').isHidden(), 'Restoring the visual preference never starts a call');
    if (width === 320) {
      let release;
      await context.route('**/voice-orb.js*', async route => { await new Promise(resolve => { release = resolve; }); await route.continue(); });
      await page.reload({waitUntil:'commit'});
      await page.waitForFunction(() => document.getElementById('connection-status').textContent === 'Your guide to anywhere');
      await page.locator('#voice-launch').click();
      await setState({status:'connected'});
      while (!release) await page.waitForTimeout(10);
      release();
      await page.waitForFunction(() => document.getElementById('voice-orb-status').textContent === 'Listening');
      assert(await page.locator('#voice-overlay').isVisible(), 'A delayed orb module catches up with the active call');
      await page.locator('#voice-overlay-end').click();
    }
    assert.deepEqual(errors, []);
    console.log(`${width}×${height}: nine styles, voice states, audio pulse, picker, captions, persistence, reduced motion and hidden cleanup passed.`);
    await context.close();
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  await context.route('**/config.js', route => route.fulfill({contentType:'text/javascript',body:''}));
  await page.goto(new URL('explore.html', base).href);
  const measured = await page.evaluate(async () => {
    const { CrowLive } = await import('./live.js?v=4');
    const source = new AudioContext();
    await source.resume();
    const tone = source.createOscillator();
    const destination = source.createMediaStreamDestination();
    tone.connect(destination);
    tone.start();
    let peak = 0;
    const live = new CrowLive({onLevel:levels => {peak=Math.max(peak,levels.output);}});
    live._prepareMeter();
    live._attachMeter('output',destination.stream);
    live.status='connected';
    await new Promise(resolve => setTimeout(resolve,350));
    live._clearMeter();
    tone.stop();
    destination.stream.getTracks().forEach(track => track.stop());
    await source.close();
    return peak;
  });
  assert(measured > .05, 'Real Web Audio analyser detects an existing stream without changing playback');
  console.log('Real browser audio metering passed using a local synthetic stream; no provider or microphone session was started.');
  await context.close();
} finally { await browser.close(); }
