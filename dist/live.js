/**
 * GPT-Live browser transport. API keys and session policy stay on the server.
 * Protocol: https://developers.openai.com/api/docs/guides/voice-webrtc?api=live
 * Tool loop: https://developers.openai.com/api/docs/guides/live-delegation
 *
 * new CrowLive({ onState, onTranscript, onError, onAction, audioElement })
 * start(context), updateContext(context), setMuted(boolean), resumeAudio(), stop()
 * Call start/resumeAudio from a user gesture. onAction must return a concise
 * JSON result and should honor its third argument's AbortSignal.
 */

const ACTIONS = Object.freeze({
  travel_to: {fields:{destination:'text',landing_spot:'text',generate_view:'boolean'}},
  circle_around:{field:'spot',limit:240},
  stop:{field:null},
  picture_me_here: { field: null },
  find_cafes: { field: 'request', limit: 1200 },
  fly_to: { field: 'destination', limit: 240 },
  land_at: {fields:{spot:'text',generate_view:'boolean'},defaults:{generate_view:true}},
  take_off: { field: null },
  generate_panorama: {fields:{regenerate:'boolean'},defaults:{regenerate:false}},
  plan_trip: { field: 'request', limit: 1200 },
});

function abortError() {
  return new DOMException('Voice connection canceled.', 'AbortError');
}

function plainError(error) {
  if (error?.name === 'NotAllowedError') return new Error('Microphone permission was denied. Allow microphone access in your browser, then try again.');
  if (error?.name === 'NotFoundError') return new Error('No microphone was found. Connect a microphone and try again.');
  return error instanceof Error ? error : new Error(String(error || 'The voice connection failed.'));
}

/** Validate model-selected tools before passing them to application code. */
export function validateLiveAction(name, rawArguments) {
  if (!Object.hasOwn(ACTIONS, name)) throw new Error(`Unsupported travel action: ${name}`);
  let args;
  try { args = typeof rawArguments === 'string' ? JSON.parse(rawArguments) : rawArguments; }
  catch { throw new Error('The assistant sent invalid action arguments. Please try the request again.'); }
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('Action arguments must be an object.');
  const { field, limit, fields, defaults={} } = ACTIONS[name];
  if(fields){
    if(Object.keys(args).some(key=>!Object.hasOwn(fields,key)))throw Error('Unexpected action arguments.');
    const clean={};
    for(const [key,type] of Object.entries(fields)){
      const value=args[key]??defaults[key];
      if(type==='boolean'){if(typeof value!=='boolean')throw Error(key+' must be true or false.');clean[key]=value;}
      else{if(typeof value!=='string'||!value.trim()||value.length>240)throw Error(key+' must name a place.');clean[key]=value.trim();}
    }
    return clean;
  }
  if (Object.keys(args).some(key => key !== field)) throw new Error('The assistant sent unexpected action arguments.');
  if (!field) return {};
  if (typeof args[field] !== 'string' || !args[field].trim() || args[field].length > limit) {
    throw new Error(`The ${field} is missing or too long.`);
  }
  return { [field]: args[field].trim() };
}

function placeLabel(value) {
  if (typeof value === 'string') return value.slice(0, 160);
  if (!value || typeof value !== 'object') return undefined;
  const name = value.name || value.displayName || value.label || value.address;
  const location = value.location || value.position || value;
  const lat = location.lat ?? location.latitude;
  const lng = location.lng ?? location.longitude;
  return [typeof name === 'string' ? name.slice(0, 160) : '',
    Number.isFinite(lat) && Number.isFinite(lng) ? `${lat.toFixed(5)},${lng.toFixed(5)}` : ''].filter(Boolean).join(' ') || undefined;
}

function contextText(context) {
  if (typeof context === 'string') return context;
  const data = context && typeof context === 'object' ? context : {};
  const facts = {
    destination: placeLabel(data.destination),
    spot: placeLabel(data.spot),
    days: typeof data.days === 'number' ? data.days : undefined,
    budget: typeof data.budget === 'string' ? data.budget.slice(0, 100) : undefined,
    interests: Array.isArray(data.interests) ? data.interests.filter(x => typeof x === 'string').slice(0, 6).map(x => x.slice(0, 50)) : undefined,
    flightState: typeof (data.flightState || data.status) === 'string' ? (data.flightState || data.status).slice(0, 60) : undefined,
  };
  return JSON.stringify(facts);
}

// Each append is limited to 500 tokens. At most 420 UTF-8 bytes is a
// conservative bound without shipping a tokenizer with the browser app.
function shortContext(content) {
  let bytes = 0;
  let text = '';
  for (const character of content) {
    bytes += new TextEncoder().encode(character).length;
    if (bytes > 420) break;
    text += character;
  }
  return text;
}

function waitForIce(peer, signal, timeoutMs) {
  if (signal.aborted) return Promise.reject(abortError());
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = (error) => {
      clearTimeout(timer);
      peer.removeEventListener('icegatheringstatechange', changed);
      signal.removeEventListener('abort', aborted);
      error ? reject(error) : resolve();
    };
    const changed = () => { if (peer.iceGatheringState === 'complete') done(); };
    const aborted = () => done(abortError());
    const timer = setTimeout(() => done(new Error('The voice connection could not gather network candidates. Try another network.')), timeoutMs);
    peer.addEventListener('icegatheringstatechange', changed);
    signal.addEventListener('abort', aborted, { once: true });
    changed();
  });
}

function toolOutput(value) {
  try {
    const encoded = JSON.stringify(value ?? { status: 'completed' });
    if (encoded && encoded.length <= 12000) return encoded;
    return JSON.stringify({ status: 'completed', summary: 'The action completed. Its full result is displayed in the app.' });
  } catch {
    return JSON.stringify({ status: 'completed', summary: 'The action completed. Its result is displayed in the app.' });
  }
}

export class CrowLive {
  constructor(options = {}) {
    this.options = options;
    this.endpoint = options.endpoint || '/api/live/session';
    this.fetch = options.fetch || globalThis.fetch.bind(globalThis);
    this.status = 'idle';
    this.muted = false;
    this.microphoneAccepted = false;
    this.playbackBlocked = false;
    this.pendingAction = null;
    this.sessionId = null;
    this.context = {};
    this.usage = null;
    this.finalized = false;
    this._generation = 0;
    this._serial = 0;
    this._transcripts = { user: '', assistant: '' };
    this._responses = new Map();
    this._delegationResponses = new Map();
    this._calls = new Map();
    this._seenEvents = new Set();
    this._actionQueue = Promise.resolve();
  }

  get snapshot() {
    return { status: this.status, muted: this.muted, microphoneAccepted: this.microphoneAccepted,
      playbackBlocked: this.playbackBlocked, pendingAction: this.pendingAction,
      sessionId: this.sessionId, usage: this.usage, finalized: this.finalized };
  }

  _notify() { this.options.onState?.(this.snapshot); }
  _error(error) { this.options.onError?.(plainError(error)); }
  _id(prefix) { return `crow_${prefix}_${++this._serial}`; }
  _current(generation) { return generation === this._generation && !this._abort?.signal.aborted; }

  /** Resolves only after GPT-Live acknowledges session.started. */
  async start(context = this.context) {
    if (this.status === 'connected') return this.snapshot;
    if (this.status === 'connecting') return this._startPromise;
    if (this.status === 'closing') throw new Error('The previous voice session is still closing.');
    this.context = context;
    this.status = 'connecting';
    this.muted = false;
    this.microphoneAccepted = false;
    this.playbackBlocked = false;
    this.finalized = false;
    this.usage = null;
    this.sessionId = null;
    this._transcripts = { user: '', assistant: '' };
    this._responses.clear();
    this._delegationResponses.clear();
    this._calls.clear();
    this._seenEvents.clear();
    this._actionQueue = Promise.resolve();
    this._lastContext = null;
    this._abort = new AbortController();
    this._actionAbort = new AbortController();
    const generation = ++this._generation;
    this._startPromise = new Promise((resolve, reject) => {
      this._resolveStart = resolve;
      this._rejectStart = reject;
    });
    // A canceled microphone prompt can resolve much later; capture its own
    // generation and always stop those late tracks before returning.
    this._notify();
    this._connect(generation).catch(error => {
      if (this._current(generation)) this._fail(error);
    });
    return this._startPromise;
  }

  async _connect(generation) {
    const RTC = this.options.RTCPeerConnection || globalThis.RTCPeerConnection;
    const mediaDevices = this.options.mediaDevices || globalThis.navigator?.mediaDevices;
    if (!RTC || !mediaDevices?.getUserMedia) throw new Error('Voice needs a supported browser on HTTPS or localhost.');
    const signal = this._abort.signal;
    this._startupTimer = setTimeout(() => {
      if (this._current(generation) && this.status === 'connecting') this._fail(new Error('GPT-Live took too long to connect. Please try again.'));
    }, this.options.connectionTimeoutMs || 45000);
    const microphone = await mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    if (!this._current(generation)) { microphone.getTracks().forEach(track => track.stop()); return; }
    this._microphone = microphone;
    this._audio = this.options.audioElement || this.options.createAudio?.() || document.createElement('audio');
    this._audio.autoplay = true;
    this._audio.setAttribute?.('playsinline', '');
    const peer = new RTC();
    this._peer = peer;
    peer.addEventListener('track', event => {
      if (!this._current(generation)) return;
      const Stream = this.options.MediaStream || globalThis.MediaStream;
      this._audio.srcObject = event.streams?.[0] || new Stream([event.track]);
      this.resumeAudio().catch(() => {});
    });
    peer.addEventListener('connectionstatechange', () => {
      if (!this._current(generation)) return;
      clearTimeout(this._disconnectTimer);
      if (peer.connectionState === 'failed') this._fail(new Error('The voice connection was lost. Start voice again to reconnect.'));
      if (peer.connectionState === 'disconnected') {
        this._disconnectTimer = setTimeout(() => {
          if (this._current(generation) && peer.connectionState === 'disconnected') this._fail(new Error('The voice connection was interrupted. Start voice again to reconnect.'));
        }, 8000);
      }
    });
    for (const track of microphone.getAudioTracks()) {
      track.enabled = !this.muted;
      peer.addTrack(track, microphone);
      track.addEventListener?.('ended', () => {
        if (this._current(generation) && this.status !== 'closing') this._fail(new Error('Microphone access ended. Start voice again when your microphone is available.'));
      });
    }
    const channel = peer.createDataChannel('oai-events');
    this._channel = channel;
    channel.addEventListener('message', ({ data }) => {
      if (!this._current(generation)) return;
      try { this._receive(JSON.parse(data), generation); }
      catch (error) { this._error(error); }
    });
    channel.addEventListener('close', () => {
      if (this._current(generation) && !this.finalized) this._fail(new Error('Voice disconnected before final session usage was received.'));
    });
    channel.addEventListener('error', () => {
      if (this._current(generation)) this._fail(new Error('The voice event connection failed. Please reconnect.'));
    });
    const offer = await peer.createOffer();
    if (!this._current(generation)) return;
    await peer.setLocalDescription(offer);
    await waitForIce(peer, signal, this.options.iceTimeoutMs || 10000);
    if (!this._current(generation)) return;
    const sdp = peer.localDescription?.sdp;
    if (!sdp) throw new Error('Your browser could not create the voice connection.');
    const response = await this.fetch(this.endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sdp, context: this.context }), signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : result.error?.message || `Voice session unavailable (${response.status}).`);
    if (!this._current(generation)) return;
    if (typeof result.session?.id !== 'string' || typeof result.transport?.sdp !== 'string' || result.transport.type !== 'webrtc') {
      throw new Error('The server returned an invalid GPT-Live connection.');
    }
    this.sessionId = result.session.id;
    await peer.setRemoteDescription({ type: 'answer', sdp: result.transport.sdp });
    // HTTP created the session. Never send Realtime or session.start events.
  }

  _send(event) {
    if (this.status !== 'connected' || this._channel?.readyState !== 'open') return false;
    this._channel.send(JSON.stringify({ event_id: this._id('event'), ...event }));
    return true;
  }

  _receive(event, generation) {
    if (!event || typeof event.type !== 'string') return;
    if (event.event_id) {
      if (this._seenEvents.has(event.event_id)) return;
      this._seenEvents.add(event.event_id);
      if (this._seenEvents.size > 5000) this._seenEvents.delete(this._seenEvents.values().next().value);
    }
    if (event.type === 'session.started') {
      if (this.status !== 'connecting') return;
      clearTimeout(this._startupTimer);
      this.sessionId = event.session?.id || this.sessionId;
      this.status = 'connected';
      this.microphoneAccepted = true;
      this._notify();
      this.updateContext(this.context);
      if (this.muted) this.setMuted(true);
      this._resolveStart?.(this.snapshot);
      this._resolveStart = this._rejectStart = null;
      return;
    }
    if (event.type === 'session.closed') {
      this.finalized = true;
      this.usage = event.usage || this.usage;
      this.closeReason = event.reason;
      const wasConnecting = this.status === 'connecting';
      this._rejectStart?.(new Error('GPT-Live ended before the voice connection was ready.'));
      this._cleanup();
      this.status = wasConnecting ? 'error' : 'idle';
      this._notify();
      this._resolveStop?.(this.snapshot);
      this._resolveStop = null;
      return;
    }
    if (event.type === 'error') {
      const error = new Error(event.error?.message || 'GPT-Live rejected a request.');
      if (this.status === 'connecting') { this._fail(error); return; }
      if (event.error?.client_event_id === this._muteEvent) {
        this.microphoneAccepted = false;
        this._notify();
      }
      this._error(error);
      return;
    }
    if (event.type === 'session.usage.updated') { this.usage = event.usage; this._notify(); return; }
    if (event.type === 'session.input_audio.muted' || event.type === 'session.input_audio.unmuted') {
      if (event.client_event_id === this._muteEvent) { this.microphoneAccepted = true; this._notify(); }
      return;
    }
    if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') {
      if (typeof event.delta !== 'string') return;
      const role = event.type === 'session.input_transcript.delta' ? 'user' : 'assistant';
      this._transcripts[role] = (this._transcripts[role] + event.delta).slice(-16000);
      this.options.onTranscript?.({ role, delta: event.delta, text: this._transcripts[role],
        startMs: event.start_ms, endMs: event.end_ms, id: event.event_id || this._id('caption') });
      return;
    }
    if (event.type === 'response.event') this._responseEvent(event, generation);
  }

  _responseEvent(envelope, generation) {
    const event = envelope.event;
    if (!event || typeof event.type !== 'string') return;
    const delegationId = envelope.delegation_id || 'session';
    if (event.type === 'response.created') {
      const id = event.response?.id;
      if (typeof id !== 'string') return;
      this._delegationResponses.set(delegationId, id);
      if (!this._responses.has(id)) this._responses.set(id, { id, calls: [], continued: false });
    }
    const responseId = event.response?.id || event.response_id || this._delegationResponses.get(delegationId);
    const response = this._responses.get(responseId);
    if (event.type === 'response.output_item.done' && event.item?.type === 'function_call') {
      // Arguments-done and terminal output snapshots are intentionally ignored.
      if (!response || typeof event.item.call_id !== 'string') return;
      if (!response.calls.some(call => call.call_id === event.item.call_id)) response.calls.push(event.item);
    }
    if (event.type === 'response.completed' && response && !response.continued && response.calls.length) {
      response.continued = true;
      if(response.calls.some(call=>call.name==='stop'))this.cancelActions();
      response.actionSignal=this._actionAbort.signal;
      this._actionQueue = this._actionQueue.then(() => this._completeActions(response, generation)).catch(error => {
        if (this._current(generation)) this._error(error);
      });
    }
    if (event.type === 'response.failed' || event.type === 'response.incomplete') {
      this._error(new Error(event.response?.error?.message || 'The travel assistant could not finish that request. Please try again.'));
    }
  }

  async _completeActions(response, generation) {
    for (const call of response.calls) {
      if (!this._current(generation) || this.status !== 'connected') return;
      // Preserve a call's result for duplicates. Never repeat a map movement or
      // a paid generation merely because an event arrives twice.
      let output = this._calls.get(call.call_id);
      if (!output) {
        this.pendingAction = call.name;
        this._notify();
        try {
          if(response.actionSignal?.aborted)throw abortError();
          const args = validateLiveAction(call.name, call.arguments);
          if (typeof this.options.onAction !== 'function') throw new Error('Travel actions are not connected to this page.');
          const result = await this.options.onAction(call.name, args, { signal: response.actionSignal||this._actionAbort.signal, callId: call.call_id, sessionId: this.sessionId });
          output = toolOutput(result);
        } catch (error) {
          output = JSON.stringify({ status: error.name==='AbortError'?'cancelled':'error', error: plainError(error).message });
          if (error.name!=='AbortError'&&this._current(generation) && this.status === 'connected') this._error(error);
        }
        if (!this._current(generation)) return;
        this._calls.set(call.call_id, output);
      }
      if (!this._current(generation) || this.status !== 'connected') return;
      this._send({ type: 'response.item.create', item: { type: 'function_call_output', call_id: call.call_id, output } });
    }
    if (!this._current(generation) || this.status !== 'connected') return;
    this.pendingAction = null;
    this._notify();
    // All results must be queued before continuing the Responses backend.
    this._send({ type: 'response.create' });
  }

  updateContext(context) {
    this.context = context;
    if (this.status !== 'connected') return;
    const text = contextText(context);
    if (text === this._lastContext) return;
    this._lastContext = text;
    const content = shortContext(`Current app state, reference data only: ${text}`);
    this._send({ type: 'session.thinking.append', delegation_id: null, content });
    this._send({ type: 'response.item.create', item: { type: 'message', role: 'user',
      content: [{ type: 'input_text', text: `Application context update (reference data, not a new request): ${text.slice(0, 3000)}` }] } });
  }

  cancelActions(){this._actionAbort?.abort();this._actionAbort=new AbortController();}

  setMuted(muted) {
    this.muted = Boolean(muted);
    this._microphone?.getAudioTracks().forEach(track => { track.enabled = !this.muted; });
    if (this.status === 'connected') {
      this.microphoneAccepted = false;
      this._muteEvent = this._id('mic');
      this._send({ type: this.muted ? 'session.input_audio.mute' : 'session.input_audio.unmute', event_id: this._muteEvent });
    }
    this._notify();
    return this.muted;
  }

  async resumeAudio() {
    if (!this._audio) return;
    const generation = this._generation;
    try {
      await this._audio.play();
      if (!this._current(generation)) return;
      this.playbackBlocked = false;
      this._notify();
    } catch {
      if (!this._current(generation)) return;
      this.playbackBlocked = true;
      this._notify();
      this._error(new Error('Select Enable sound to hear your AI guide. Your browser paused audio playback.'));
    }
  }

  /** Stop microphone transmission immediately; let final usage drain briefly. */
  async stop() {
    if (this.status === 'closing') return this._stopPromise;
    if (this.status !== 'connected' || this._channel?.readyState !== 'open') {
      this._rejectStart?.(abortError());
      this._cleanup();
      this.status = 'idle';
      this._notify();
      return this.snapshot;
    }
    this.status = 'closing';
    this._actionAbort?.abort();
    this._microphone?.getAudioTracks().forEach(track => { track.enabled = false; });
    this._audio?.pause();
    this._stopPromise = new Promise(resolve => { this._resolveStop = resolve; });
    this._notify();
    this._closeTimer = setTimeout(() => {
      this._error(new Error('Voice stopped, but final session usage could not be confirmed.'));
      this._cleanup();
      this.status = 'idle';
      this._notify();
      this._resolveStop?.(this.snapshot);
      this._resolveStop = null;
    }, this.options.closeTimeoutMs || 8000);
    try { this._channel.send(JSON.stringify({ type: 'session.close', event_id: this._id('close') })); }
    catch (error) { this._fail(error); }
    return this._stopPromise;
  }

  _fail(error) {
    this._rejectStart?.(plainError(error));
    this._cleanup();
    this.status = 'error';
    this._notify();
    this._error(error);
    this._resolveStop?.(this.snapshot);
    this._resolveStop = null;
  }

  _cleanup() {
    ++this._generation;
    this._abort?.abort();
    this._actionAbort?.abort();
    clearTimeout(this._startupTimer);
    clearTimeout(this._disconnectTimer);
    clearTimeout(this._closeTimer);
    this._microphone?.getTracks().forEach(track => track.stop());
    this._channel?.close();
    this._peer?.close();
    if (this._audio) { this._audio.pause(); this._audio.srcObject = null; }
    this._microphone = this._channel = this._peer = this._audio = null;
    this.pendingAction = null;
    this.microphoneAccepted = false;
    this._resolveStart = this._rejectStart = null;
  }
}

export default CrowLive;
