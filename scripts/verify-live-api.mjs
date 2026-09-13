import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Opt-in paid integration smoke: actual GPT-Live + synthesized speech only.
// Does not access the user's microphone, browser profile, image/plan APIs, or keys.
if (process.env.CROW_VERIFY_LIVE_API !== '1') {
  console.log('Skipped paid Live API smoke. Set CROW_VERIFY_LIVE_API=1 to opt in.');
  process.exit(0);
}
const run = promisify(execFile);
const output = new URL('../_debug/live-api-verification/', import.meta.url);
await mkdir(output, { recursive: true });
const url = new URL(process.env.CROW_TEST_URL || 'http://127.0.0.1:3000/explore.html');
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw Error('This smoke test only runs against a local app server.');
const report = { syntheticInput: true, realMicrophoneAccess: false, checks: [], errors: [] };
const audioPath = process.env.CROW_TEST_SPEECH_WAV || new URL('synthetic-input.wav', output).pathname;
if (!process.env.CROW_TEST_SPEECH_WAV) {
  const aiff = new URL('synthetic-input.aiff', output).pathname;
  await run('/usr/bin/say', ['-o', aiff, 'Hello crow. Please say hello back in one short sentence.']);
  await run('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', aiff, audioPath]);
}
const speech = await readFile(audioPath);
const statusResponse = await fetch(new URL('/api/status', url));
const status = await statusResponse.json();
assert(status.capabilities?.live, 'The local server must have GPT-Live configured.');
report.model = status.openai?.liveModel || 'gpt-live-1';
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CROW_BROWSER_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
  const browserContext = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const page = await browserContext.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  await page.route('**/_crow-live-test.wav', route => route.fulfill({ contentType: 'audio/wav', body: speech }));
  await page.route('**/api/{panorama,plan,instagram}**', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"This voice smoke test does not call other paid services."}' }));
  await page.route('**/_crow-live-test.html', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html>
    <html><head><meta charset="utf-8"><title>GPT-Live synthetic voice verification</title></head>
    <body style="font:16px system-ui;background:#0d2125;color:#d9eeea;padding:40px"><h1>GPT-Live voice verification</h1>
    <p>Synthesized speech only. No microphone recording.</p><button id="start">Start test</button><button id="stop">End test</button>
    <audio id="speaker" controls autoplay></audio><pre id="state">Preparing…</pre><pre id="captions"></pre>
    <script type="module">
    import { CrowLive } from '/live.js';
    const result = window.__test = { events: [], captions: [], errors: [], states: [], peers: [], micRequests: 0 };
    const NativePeer = window.RTCPeerConnection;
    class ObservedPeer extends NativePeer {
      constructor(...args) { super(...args); result.peers.push(this); }
      createDataChannel(...args) {
        const channel = super.createDataChannel(...args);
        channel.addEventListener('message', ({data}) => {
          try { const event = JSON.parse(data); result.events.push({ type: event.type, client_event_id: event.client_event_id, usage: event.usage, reason: event.reason }); } catch {}
        });
        return channel;
      }
    }
    const audio = new AudioContext({ sampleRate: 48000 });
    const destination = audio.createMediaStreamDestination();
    const encoded = await fetch('/_crow-live-test.wav').then(response => response.arrayBuffer());
    const buffer = await audio.decodeAudioData(encoded);
    const source = audio.createBufferSource(); source.buffer = buffer; source.connect(destination);
    // The client receives only this synthesized stream; native getUserMedia is
    // never invoked. A WebAudio stream carries valid browser WebRTC audio.
    const client = window.__client = new CrowLive({
      RTCPeerConnection: ObservedPeer,
      mediaDevices: { async getUserMedia() { result.micRequests++; await audio.resume(); return destination.stream; } },
      audioElement: document.getElementById('speaker'),
      onState(state) { result.states.push(state); result.state = state; document.getElementById('state').textContent = JSON.stringify(state,null,2); },
      onError(error) { result.errors.push(error.message); },
      onTranscript(event) { result.captions.push(event); document.getElementById('captions').textContent += event.role + ': ' + event.delta + '\\n'; },
      onAction() { return { status: 'unavailable', summary: 'This test checks voice only. Please greet the traveler briefly.' }; },
    });
    document.getElementById('start').onclick = async () => {
      try { await client.start({ destination: { name: 'Chelsea, New York', lat: 40.74334, lng: -73.99423 }, flightState: 'hovering' });
        result.speechStarted = true; source.start(audio.currentTime + .75);
      } catch (error) { result.errors.push(error.message); }
    };
    document.getElementById('stop').onclick = () => client.stop();
    result.ready = true;
    </script></body></html>` }));
  await page.goto(new URL('/_crow-live-test.html', url).href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__test?.ready);
  assert.equal(await page.evaluate(() => window.__test.micRequests), 0);
  await page.locator('#start').click();
  await page.waitForFunction(() => window.__test.state?.status === 'connected' || window.__test.state?.status === 'error', null, { timeout: 60000 });
  const connected = await page.evaluate(() => ({ status: window.__test.state.status, errors: window.__test.errors }));
  assert.equal(connected.status, 'connected', connected.errors.join('; '));
  report.checks.push('Actual gpt-live-1 session.started received over WebRTC');
  console.log('GPT-Live connected; sending synthesized hello.');
  await page.waitForFunction(() => window.__test.captions.some(event => event.role === 'user' && event.delta.trim()) && window.__test.captions.some(event => event.role === 'assistant' && event.delta.trim()), null, { timeout: 45000 });
  report.captions = await page.evaluate(() => window.__test.captions.map(({ role, delta, startMs, endMs }) => ({ role, delta, startMs, endMs })));
  report.checks.push('Synthetic speech transcribed and assistant spoken transcript returned');
  await page.waitForFunction(async () => {
    const stats = await window.__test.peers[0].getStats();
    return [...stats.values()].some(item => item.type === 'inbound-rtp' && (item.kind === 'audio' || item.mediaType === 'audio') && item.bytesReceived > 0 && item.totalAudioEnergy > 0);
  }, null, { timeout: 15000 });
  report.audio = await page.evaluate(async () => {
    const stats = await window.__test.peers[0].getStats();
    return [...stats.values()].filter(item => item.type === 'inbound-rtp' && (item.kind === 'audio' || item.mediaType === 'audio')).map(item => ({ bytesReceived: item.bytesReceived, packetsReceived: item.packetsReceived, totalAudioEnergy: item.totalAudioEnergy, totalSamplesReceived: item.totalSamplesReceived }));
  });
  assert(report.audio.some(item => item.bytesReceived > 0 && item.totalAudioEnergy > 0), 'Assistant RTP audio must contain audible energy.');
  report.checks.push('Generated assistant audio received with nonzero RTP bytes and audio energy');
  await page.evaluate(() => window.__client.setMuted(true));
  await page.waitForFunction(() => window.__test.events.some(event => event.type === 'session.input_audio.muted'), null, { timeout: 10000 });
  await page.evaluate(() => window.__client.setMuted(false));
  await page.waitForFunction(() => window.__test.events.some(event => event.type === 'session.input_audio.unmuted'), null, { timeout: 10000 });
  report.checks.push('Actual Live mute and unmute acknowledgments received');
  await page.screenshot({ path: new URL('voice-connected.png', output).pathname });
  await page.locator('#stop').click();
  await page.waitForFunction(() => window.__test.state.status === 'idle' || window.__test.state.status === 'error', null, { timeout: 15000 });
  report.finalState = await page.evaluate(() => window.__test.state);
  report.events = await page.evaluate(() => window.__test.events);
  report.errors.push(...await page.evaluate(() => window.__test.errors));
  assert.equal(report.finalState.finalized, true, 'session.closed must finalize the voice session');
  assert.equal(report.finalState.status, 'idle');
  report.checks.push('session.closed finalized usage and released the connection');
  assert.deepEqual(report.errors, []);
  console.log('PASS actual GPT-Live synthetic input, spoken output, audio, mute/unmute, and graceful close.');
} catch (error) {
  report.failure = error.stack || error.message;
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  if (browser) {
    for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.evaluate(async () => {
        if (window.__client) await window.__client.stop();
      }).catch(() => {});
      if (!report.events) report.events = await page.evaluate(() => window.__test?.events).catch(() => []);
      if (!report.captions) report.captions = await page.evaluate(() => window.__test?.captions).catch(() => []);
      const errors = await page.evaluate(() => window.__test?.errors || []).catch(() => []);
      for (const error of errors) if (!report.errors.includes(error)) report.errors.push(error);
    }
    await browser.close();
  }
  await writeFile(new URL('report.json', output), JSON.stringify(report, null, 2));
  console.log('Voice evidence: ' + output.pathname);
}
