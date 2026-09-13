import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../dist/location.js', import.meta.url), 'utf8');

function browser({ secure = true, supported = true, getPosition } = {}) {
  const timers = new Map();
  const requests = [];
  let clock = 0, nextTimer = 0;
  const environment = {
    isSecureContext: secure,
    navigator: supported ? { geolocation: { getCurrentPosition(success, failure, options) {
      requests.push({ success, failure, options });
      getPosition?.(success, failure, options);
    } } } : {},
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  environment.window = environment;
  vm.runInNewContext(source, environment);
  return { locate: environment.CrowLocation.locate, requests, timers,
    advance(milliseconds) {
      clock += milliseconds;
      for (const [id, timer] of timers) if (timer.at <= clock) { timers.delete(id); timer.callback(); }
    } };
}
const position = (latitude = 1.3, longitude = 103.8, accuracy = 24) => ({ coords: { latitude, longitude, accuracy } });
const json = value => JSON.parse(JSON.stringify(value));

test('loading the helper does not request location; explicit calls use native options and valid coordinates', async () => {
  const b = browser();
  assert.equal(b.requests.length, 0);
  assert.equal(b.timers.size, 0);
  const request = b.locate();
  assert.equal(b.requests.length, 1);
  assert.deepEqual(json(b.requests[0].options), { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 });
  b.requests[0].success(position());
  const result = await request;
  assert.equal(result.status, 'located');
  assert.deepEqual(json(result.place), { name: 'Your location', lat: 1.3, lng: 103.8 });
  assert.equal(result.accuracy, 24);
  assert.equal(b.timers.size, 0);
});

test('native denial and unavailable errors resolve clear fallback states without throwing', async () => {
  for (const [code, status] of [[1, 'denied'], [2, 'unavailable'], [3, 'timeout'], [99, 'unavailable']]) {
    const b = browser({ getPosition: (_success, failure) => failure({ code, message: 'private browser details' }) });
    const result = await b.locate();
    assert.equal(result.status, status);
    assert.equal(result.place, null);
    assert.match(result.message, /destination/);
    assert(!result.message.includes('private browser details'));
    assert.equal(b.timers.size, 0);
  }
});

test('watchdog resolves timeout if the browser never calls either callback', async () => {
  const b = browser();
  const request = b.locate();
  let completed = false;
  request.then(() => { completed = true; });
  b.advance(8000);
  await Promise.resolve();
  assert.equal(completed, false);
  b.advance(1000);
  const result = await request;
  assert.equal(result.status, 'timeout');
  assert.equal(result.place, null);
  assert.equal(b.timers.size, 0);
});

test('insecure contexts and unsupported browsers fall back without requesting location', async () => {
  for (const options of [{ secure: false }, { supported: false }]) {
    const b = browser(options);
    const result = await b.locate();
    assert.equal(result.status, 'unavailable');
    assert.equal(result.place, null);
    assert.equal(b.requests.length, 0);
    assert.equal(b.timers.size, 0);
  }
});

test('invalid coordinates and accuracy never become map destinations', async () => {
  for (const bad of [null, position(NaN), position(Infinity), position(91), position(-91), position(1, 181), position(1, -181), position('1'), position(1, 2, -1), position(1, 2, Infinity)]) {
    const b = browser({ getPosition: success => success(bad) });
    const result = await b.locate();
    assert.equal(result.status, 'unavailable');
    assert.equal(result.place, null);
    assert.equal(b.timers.size, 0);
  }
  const edge = browser({ getPosition: success => success(position(-90, 180, 0)) });
  assert.equal((await edge.locate()).status, 'located');
});

test('late callbacks cannot replace a settled result or interfere with a retry', async () => {
  const b = browser();
  const first = b.locate();
  const old = b.requests[0];
  b.advance(9000);
  const timedOut = await first;
  const before = JSON.stringify(timedOut);
  const second = b.locate();
  old.success(position());
  old.failure({ code: 1 });
  assert.equal(JSON.stringify(timedOut), before);
  assert.equal(b.timers.size, 1, 'late callbacks must not clear the retry watchdog');
  b.requests[1].success(position(35, 135, 50));
  assert.equal((await second).place.lat, 35);
  assert.equal(timedOut.status, 'timeout');
});

test('concurrent requests share one permission prompt, and explicit retries work after synchronous callbacks', async () => {
  const b = browser();
  const first = b.locate();
  assert.equal(b.locate(), first);
  assert.equal(b.requests.length, 1);
  b.requests[0].success(position());
  await first;
  const next = b.locate();
  assert.equal(b.requests.length, 2);
  b.requests[1].failure({ code: 1 });
  await next;
  const synchronous = browser({ getPosition: success => success(position()) });
  await synchronous.locate();
  await synchronous.locate();
  assert.equal(synchronous.requests.length, 2);
});

test('synchronous permission failures become denial without leaving a timer', async () => {
  const b = browser({ getPosition: () => { throw Object.assign(new Error('blocked'), { name: 'SecurityError' }); } });
  assert.equal((await b.locate()).status, 'denied');
  assert.equal(b.timers.size, 0);
});
