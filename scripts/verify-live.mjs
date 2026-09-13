import test from 'node:test';
import assert from 'node:assert/strict';
import { CrowLive, validateLiveAction } from '../dist/live.js';

const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(options = {}) {
  const peers = [];
  const calls = [];
  const errors = [];
  const captions = [];
  const states = [];
  const track = Object.assign(new EventTarget(), { enabled: true, stopped: false, stop() { this.stopped = true; } });
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  const audio = { play: async () => {}, pause() { this.paused = true; }, setAttribute() {}, srcObject: null };
  class Channel extends EventTarget {
    readyState = 'open';
    sent = [];
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 'closed'; this.dispatchEvent(new Event('close')); }
    receive(data) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) })); }
  }
  class Peer extends EventTarget {
    iceGatheringState = 'complete';
    connectionState = 'new';
    constructor() { super(); peers.push(this); }
    addTrack() {}
    createDataChannel(label) { assert.equal(label, 'oai-events'); this.channel = new Channel(); return this.channel; }
    async createOffer() { return { type: 'offer', sdp: 'browser-offer' }; }
    async setLocalDescription(value) { this.localDescription = value; }
    async setRemoteDescription(value) { this.remoteDescription = value; }
    close() { this.closed = true; }
  }
  const client = new CrowLive({
    mediaDevices: { getUserMedia: async () => stream }, RTCPeerConnection: Peer, audioElement: audio,
    fetch: async (url, init) => {
      calls.push({ url, ...init, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ session: { id: 'live_mock' }, transport: { type: 'webrtc', sdp: 'server-answer' } }) };
    },
    onError: error => errors.push(error), onTranscript: value => captions.push(value), onState: state => states.push(state),
    ...options,
  });
  async function connect(context = { destination: 'Kyoto' }) {
    const starting = client.start(context);
    await tick();
    peers[0].channel.receive({ type: 'session.started', session: { id: 'live_mock' } });
    await starting;
    return peers[0].channel;
  }
  async function close() {
    const closing = client.stop();
    peers.at(-1)?.channel.receive({ type: 'session.closed', usage: { seconds: 8 }, reason: 'close_requested' });
    await closing;
  }
  return { client, connect, close, peers, calls, errors, captions, states, track, stream, audio };
}

function responseEvent(channel, event, delegationId = 'delegation_1') {
  channel.receive({ type: 'response.event', delegation_id: delegationId, event });
}

test('WebRTC uses the Live startup, captions, mute acknowledgment, context, and graceful-close protocol', async () => {
  const f = fixture();
  const channel = await f.connect({ destination: { name: 'Kyoto', location: { lat: 35, lng: 135 } }, days: 3 });
  assert.equal(f.calls[0].url, '/api/live/session');
  assert.equal(f.calls[0].body.sdp, 'browser-offer');
  assert.equal(f.calls[0].headers.Authorization, undefined);
  assert.deepEqual(f.peers[0].remoteDescription, { type: 'answer', sdp: 'server-answer' });
  assert.equal(channel.sent.some(event => event.type === 'session.start'), false);
  assert.equal(f.client.status, 'connected');
  assert.equal(channel.sent[0].type, 'session.thinking.append');
  assert.equal(channel.sent[0].delegation_id, null);
  const count = channel.sent.length;
  f.client.updateContext(f.client.context);
  assert.equal(channel.sent.length, count, 'unchanged context is not appended twice');
  const caption = { type: 'session.input_transcript.delta', event_id: 'caption_1', delta: 'Fly to Kyoto', start_ms: 100, end_ms: 500 };
  channel.receive(caption);
  channel.receive(caption);
  channel.receive({ type: 'session.output_transcript.delta', event_id: 'caption_2', delta: 'On our way.', start_ms: 450, end_ms: 900 });
  assert.equal(f.captions.length, 2);
  assert.equal(f.captions[0].role, 'user');
  assert.equal(f.captions[0].startMs, 100);
  assert.equal(f.captions[1].text, 'On our way.');
  f.client.setMuted(true);
  assert.equal(f.track.enabled, false);
  assert.equal(f.client.microphoneAccepted, false);
  const mute = channel.sent.at(-1);
  assert.equal(mute.type, 'session.input_audio.mute');
  channel.receive({ type: 'session.input_audio.muted', client_event_id: mute.event_id });
  assert.equal(f.client.microphoneAccepted, true);
  f.client.setMuted(false);
  assert.equal(f.track.enabled, true);
  assert.equal(channel.sent.at(-1).type, 'session.input_audio.unmute');
  const closing = f.client.stop();
  assert.equal(f.client.status, 'closing');
  assert.equal(f.track.enabled, false);
  assert.equal(f.track.stopped, false, 'keep the connection while final usage drains');
  assert.equal(channel.sent.at(-1).type, 'session.close');
  channel.receive({ type: 'session.closed', usage: { seconds: 18 }, reason: 'close_requested' });
  await closing;
  assert.equal(f.track.stopped, true);
  assert.equal(f.peers[0].closed, true);
  assert.equal(f.audio.srcObject, null);
  assert.equal(f.client.status, 'idle');
  assert.deepEqual(f.client.usage, { seconds: 18 });
  assert.equal(f.client.finalized, true);
  assert.equal(f.errors.length, 0);
});

test('collects nested completed function items and sends all results before continuing', async () => {
  const actions = [];
  const f = fixture({ onAction: async (name, args) => { actions.push({ name, args }); return { status: 'completed', summary: name }; } });
  const channel = await f.connect();
  responseEvent(channel, { type: 'response.created', response: { id: 'r1' } });
  responseEvent(channel, { type: 'response.function_call_arguments.done', arguments: '{"destination":"Wrong premature call"}' });
  responseEvent(channel, { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call1', name: 'fly_to', arguments: '{"destination":"Kyoto"}' } });
  responseEvent(channel, { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'call2', name: 'land_at', arguments: '{"spot":"Nishiki Market"}' } });
  await tick();
  assert.equal(actions.length, 0, 'wait for the complete response before running its tools');
  responseEvent(channel, { type: 'response.completed', response: { id: 'r1', output: [] } });
  responseEvent(channel, { type: 'response.completed', response: { id: 'r1', output: [] } });
  await tick();
  assert.deepEqual(actions, [{ name: 'fly_to', args: { destination: 'Kyoto' } }, { name: 'land_at', args: { spot: 'Nishiki Market' } }]);
  const results = channel.sent.filter(event => event.item?.type === 'function_call_output');
  assert.deepEqual(results.map(event => event.item.call_id), ['call1', 'call2']);
  assert.equal(channel.sent.at(-1).type, 'response.create');
  assert.deepEqual(Object.keys(channel.sent.at(-1)).sort(), ['event_id', 'type']);
  assert.equal(channel.sent.filter(event => event.type === 'response.create').length, 1);
  await f.close();
});

test('validates the tool allowlist and converts malformed arguments into recoverable tool results', async () => {
  assert.throws(() => validateLiveAction('constructor', '{}'), /Unsupported/);
  assert.throws(() => validateLiveAction('fly_to', '{"destination":"Kyoto","url":"https://example.com"}'), /unexpected/);
  assert.throws(() => validateLiveAction('land_at', '[]'), /object/);
  assert.deepEqual(validateLiveAction('generate_panorama', '{}'), {});
  assert.deepEqual(validateLiveAction('take_off', '{}'), {});
  assert.throws(() => validateLiveAction('take_off', '{"altitude":200}'), /unexpected/);
  const f = fixture({ onAction: () => assert.fail('invalid tool must not reach application code') });
  const channel = await f.connect();
  responseEvent(channel, { type: 'response.created', response: { id: 'invalid' } });
  responseEvent(channel, { type: 'response.output_item.done', item: { type: 'function_call', call_id: 'bad', name: 'fly_to', arguments: '{' } });
  responseEvent(channel, { type: 'response.completed', response: { id: 'invalid', output: [] } });
  await tick();
  assert.equal(JSON.parse(channel.sent.find(event => event.item?.call_id === 'bad').item.output).status, 'error');
  assert.equal(channel.sent.at(-1).type, 'response.create');
  await f.close();
});

test('canceling a pending microphone prompt stops the late stream and never creates a session', async () => {
  let allowMicrophone;
  const f = fixture({ mediaDevices: { getUserMedia: () => new Promise(resolve => { allowMicrophone = resolve; }) } });
  const starting = f.client.start();
  const rejected = assert.rejects(starting, { name: 'AbortError' });
  await f.client.stop();
  allowMicrophone(f.stream);
  await rejected;
  await tick();
  assert.equal(f.track.stopped, true);
  assert.equal(f.calls.length, 0);
  assert.equal(f.client.status, 'idle');
});

test('stopping a session aborts action work and discards late results and queued actions', async () => {
  let finish;
  let actionSignal;
  const actions = [];
  const f = fixture({ onAction: (name, _args, { signal }) => { actions.push(name); actionSignal = signal; return new Promise(resolve => { finish = resolve; }); } });
  const channel = await f.connect();
  responseEvent(channel, { type: 'response.created', response: { id: 'slow' } });
  for (const [id, name, args] of [['1', 'generate_panorama', '{}'], ['2', 'fly_to', '{"destination":"Paris"}']]) {
    responseEvent(channel, { type: 'response.output_item.done', item: { type: 'function_call', call_id: id, name, arguments: args } });
  }
  responseEvent(channel, { type: 'response.completed', response: { id: 'slow', output: [] } });
  await tick();
  const closing = f.client.stop();
  assert.equal(actionSignal.aborted, true);
  finish({ status: 'completed' });
  await tick();
  assert.deepEqual(actions, ['generate_panorama']);
  assert.equal(channel.sent.some(event => event.item?.type === 'function_call_output'), false);
  channel.receive({ type: 'session.closed', usage: { seconds: 2 } });
  await closing;
});

test('startup API errors are visible and release the microphone', async () => {
  const f = fixture({ fetch: async () => ({ ok: false, status: 503, json: async () => ({ error: 'Set OPENAI_API_KEY on the server.' }) }) });
  await assert.rejects(f.client.start(), /OPENAI_API_KEY/);
  assert.equal(f.track.stopped, true);
  assert.equal(f.peers[0].closed, true);
  assert.equal(f.client.status, 'error');
  assert.equal(f.errors.length, 1);
});

test('close timeout frees devices while marking final usage unconfirmed', async () => {
  const f = fixture({ closeTimeoutMs: 10 });
  await f.connect();
  await f.client.stop();
  assert.equal(f.track.stopped, true);
  assert.equal(f.client.finalized, false);
  assert.equal(f.client.status, 'idle');
  assert.match(f.errors.at(-1).message, /could not be confirmed/);
});
