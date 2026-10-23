import test from 'node:test';
import assert from 'node:assert/strict';
import { controlCamera } from '../dist/camera-actions.js';
import { validateLiveAction } from '../dist/live.js';

function fixture() {
  let view = { rotation: 170, tilt: 65, zoom: 1 };
  const writes = [], follows = [];
  const map = {
    getContext: () => ({ mapReady: true, freeRoaming: true }),
    getCameraView: () => ({ ...view }),
    setCameraView(next, options) { writes.push({ next, options }); Object.assign(view, next); },
    followCrow(options) { follows.push(options); },
  };
  return { map, writes, follows };
}

test('camera commands wrap rotation, clamp relative tilt/zoom and keep subsequent adjustments relative', () => {
  const f = fixture();
  assert.deepEqual(controlCamera(f.map, { command: 'adjust', rotation: 30, tilt: 70, zoom: .1 }).camera, { rotation: -160, tilt: 85, zoom: .4 });
  assert.deepEqual(controlCamera(f.map, { command: 'adjust', rotation: -30, tilt: -85, zoom: 10 }).camera, { rotation: 170, tilt: 0, zoom: 4 });
  assert(f.writes.every(write => write.options.animate));
});

test('camera presets preserve zoom and find crow preserves the actual rendered view', () => {
  const f = fixture();
  controlCamera(f.map, { command: 'set', zoom: 2 });
  for (const [command, rotation, tilt] of [['behind', 0, 65], ['side', 90, 65], ['front', -180, 65], ['above', -180, 0]]) {
    assert.deepEqual(controlCamera(f.map, { command }).camera, { rotation, tilt, zoom: 2 });
  }
  const writes = f.writes.length;
  assert.equal(controlCamera(f.map, { command: 'status' }).status, 'current');
  assert.match(controlCamera(f.map, { command: 'find_crow' }).summary, /currently rendered angle and zoom/);
  assert.deepEqual(f.follows, [{ preserveView: true }]);
  assert.equal(f.writes.length, writes, 'Status and find crow never reapply target preferences');
  assert.deepEqual(controlCamera(f.map, { command: 'reset' }).camera, { rotation: 0, tilt: 65, zoom: 1 });
});

test('chat and voice reject malformed camera tools before modifying the map', () => {
  const f = fixture();
  for (const args of [
    { command: 'constructor' }, { command: 'adjust' }, { command: 'set', tilt: -1 },
    { command: 'set', zoom: .2 }, { command: 'adjust', rotation: 181 },
    { command: 'adjust', tilt: '30' }, { command: 'adjust', zoom: Infinity },
    { command: 'above', rotation: 20 }, { command: 'status', url: 'https://example.com' },
  ]) {
    assert.throws(() => validateLiveAction('camera', args), /camera|Camera/);
    assert.throws(() => controlCamera(f.map, args));
  }
  assert.equal(f.writes.length, 0);
  assert.deepEqual(validateLiveAction('camera', '{"command":"adjust","rotation":-30,"tilt":null,"zoom":null}'), { command: 'adjust', rotation: -30, tilt: null, zoom: null });
  assert.throws(() => controlCamera({ getContext: () => ({ mapReady: false }) }, { command: 'above' }), /loading/);
});
