import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Contract tests use a deterministic animation clock and a Maps API double.
// Real renderer/model verification remains in verify-browser.mjs.
class Element extends EventTarget {
  constructor() {
    super(); this.children = []; this.style = {}; this.hidden = false; this.open = false;
    const classes = new Set();
    this.classList = { add: name => classes.add(name), remove: name => classes.delete(name),
      toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); } };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  querySelector() { return new Element(); }
  remove() { this.removed = true; }
  close() { this.open = false; }
  showModal() { this.open = true; }
}
class DetailEvent extends Event {
  constructor(name, options) { super(name); this.detail = options?.detail; }
}
const elements = new Map();
const document = Object.assign(new EventTarget(), {
  baseURI: 'https://crow.example/', currentScript: { src: 'https://crow.example/app.js' },
  head: new Element(), body: new Element(), activeElement: null,
  getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
  createElement() { return new Element(); },
});
let now = 0, nextId = 0, maps, lastTextRequest, lastNearbyRequest, nearbyResponse;
const callbacks = new Map(), cameraCalls = [];
const schedule = (callback, delay = 0) => { const id = ++nextId; callbacks.set(id, { at: now + delay, callback }); return id; };
function advance(ms) {
  const end = now + ms;
  for (;;) {
    const next = [...callbacks].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    callbacks.delete(next[0]); now = next[1].at; next[1].callback(now);
  }
  now = end;
}
const testPlace = { id: 'place-1', displayName: 'Mountain Cafe', formattedAddress: 'Mountain Road',
  location: { lat: () => 27.71, lng: () => 85.32 }, async fetchFields() {} };
class Place {
  static async searchByText(request) { lastTextRequest = request; return { places: [testPlace] }; }
  static async searchNearby(request) { lastNearbyRequest = request; return nearbyResponse ?? { places: [testPlace] }; }
}
class Map3DElement extends Element {
  constructor(options) { super(); Object.assign(this, options); maps = this; }
  flyCameraTo(options) {
    cameraCalls.push(options); Object.assign(this, options.endCamera);
    if (options.endCamera.altitudeMode === 'RELATIVE_TO_MESH') this.center = { ...this.center, altitude: this.center.altitude + 1422 };
  }
  stopCameraAnimation() {}
}
class Model3DElement extends Element { constructor(options) { super(); Object.assign(this, options); } }
const google = { maps: { async importLibrary(name) {
  return name === 'places' ? { Place } : { Map3DElement, Model3DElement, Marker3DInteractiveElement: Model3DElement };
} } };
const data = new ArrayBuffer(12); new DataView(data).setUint32(0, 0x46546c67, true);
const window = new EventTarget(); window.CROW_MAPS_KEY = 'test';
const sandbox = vm.createContext({ document, window, google, URL, Event, CustomEvent: DetailEvent, AbortController,
  performance: { now: () => now }, setTimeout: schedule, clearTimeout: id => callbacks.delete(id),
  requestAnimationFrame: callback => schedule(callback, 1000 / 60), cancelAnimationFrame: id => callbacks.delete(id),
  fetch: async () => ({ ok: true, arrayBuffer: async () => data }), location: { reload() {} }, console });
vm.runInContext(await readFile(new URL('../dist/app.js', import.meta.url), 'utf8'), sandbox);
const events = [];
for (const name of ['ready', 'destination', 'landing-selected', 'landed', 'context']) {
  document.addEventListener('crow:' + name, event => events.push({ name, detail: event.detail }));
}
await window.initCrow();
maps.dispatchEvent(Object.assign(new Event('gmp-steadychange'), { isSteady: true }));
const api = window.CrowMap;
assert.equal(api.getContext().mapReady, true);
assert.equal(events.filter(event => event.name === 'ready').length, 1);
const results = await api.searchDestinations('  Kathmandu  ');
assert.equal(lastTextRequest.textQuery, 'Kathmandu');
assert.equal(results[0].lat, 27.71);
assert.equal(results[0].name, 'Mountain Cafe');
assert.equal(results[0].address, 'Mountain Road');
await assert.rejects(api.searchDestinations('x'), /city, landmark/);
await assert.rejects(api.flyTo({ name: 'Invalid', lat: NaN, lng: 0 }), /valid map coordinates/);

const kathmandu = { name: 'Kathmandu', lat: 27.7172, lng: 85.324 };
const arrival = api.flyTo(kathmandu);
assert.equal(api.getContext().mode, 'arriving');
advance(5000);
assert.equal((await arrival).mode, 'hovering');
assert.equal(api.getContext().destination.name, 'Kathmandu');
assert.equal(cameraCalls.at(-1).endCamera.altitudeMode, 'RELATIVE_TO_MESH');
assert(Math.abs(cameraCalls.at(-1).endCamera.center.lat - kathmandu.lat) < 1e-6);

await elements.get('nearby').onclick();
assert.equal(lastNearbyRequest.locationRestriction.center.lat, kathmandu.lat);
assert.equal(elements.get('places').children[0].textContent, 'Mountain Cafe');
const marker = maps.children.find(node => node.label === 'Mountain Cafe');
assert(marker);
await elements.get('places').children[0].onclick();
const actionButtons = elements.get('detail-content').children.flatMap(node => node.children);
actionButtons.find(node => node.textContent === 'Save place').onclick();
assert.equal(api.getContext().savedPlaces[0].name, 'Mountain Cafe');
assert(actionButtons.find(node => node.textContent === 'Land here ↘'));

api.selectLandingMode();
assert.equal(api.getContext().landingMode, true);
maps.dispatchEvent(Object.assign(new Event('gmp-click'), { position: { lat: 27.71725, lng: 85.3241, altitude: 1422 } }));
assert.equal(api.getContext().landingMode, false);
assert.equal(api.getContext().mode, 'landing');
assert.equal(events.filter(event => event.name === 'landed').length, 0);
advance(5500);
assert.equal(api.getContext().mode, 'landed');
assert.equal(api.getContext().spot.lat, 27.71725);
assert.equal(api.getContext().spot.altitude, 1422);
assert.equal(events.filter(event => event.name === 'landed').length, 1);
const parts = vm.runInContext('crowParts', sandbox);
assert(parts.every(part => part.altitudeMode === 'RELATIVE_TO_MESH'));
assert(Math.abs(parts[0].position.altitude - 1.2) < 1e-6);
assert(parts[1].scale.x < 1);

const rooftop = { ...api.getContext().spot };
const restingPosition = { ...parts[0].position }, foldedWidth = parts[1].scale.x;
const destinationBeforeTakeoff = JSON.stringify(api.getContext().destination);
const destinationEvents = events.filter(event => event.name === 'destination').length;
const takeoff = api.takeOff();
assert.equal(api.getContext().mode, 'taking-off');
assert.equal(api.getContext().spot, null);
assert.equal(JSON.stringify(parts[0].position), JSON.stringify(restingPosition), 'Takeoff must begin at the exact landed position');
assert(Math.abs(parts[1].scale.x - foldedWidth) < 1e-6);
advance(1200);
assert(parts[0].position.altitude > restingPosition.altitude);
assert(parts[1].scale.x > foldedWidth, 'Wings unfold during the lift');
assert.equal(parts[0].position.lat, restingPosition.lat);
assert.equal(parts[0].position.lng, restingPosition.lng);
advance(1800);
assert(parts[0].position.altitude > 45, 'Gain rooftop clearance before moving forward');
assert.equal(parts[0].position.lat, restingPosition.lat);
assert.equal(parts[0].position.lng, restingPosition.lng);
advance(2300);
assert.equal((await takeoff).mode, 'hovering');
assert.equal(parts[0].altitudeMode, 'ABSOLUTE', 'Forward departure keeps a fixed elevation over the roof edge');
assert(Math.abs(parts[0].position.altitude - 1472) < 1e-6);
assert.notEqual(parts[0].position.lat, restingPosition.lat);
assert.equal(parts[1].scale.x, 2.2);
assert.equal(JSON.stringify(api.getContext().destination), destinationBeforeTakeoff);
assert.equal(events.filter(event => event.name === 'destination').length, destinationEvents);
await assert.rejects(api.takeOff(), /Land on a spot/);

const cancelledLanding = api.landAt({ name: 'Other square', lat: 27.718, lng: 85.323 });
advance(1800); api.pause(); advance(5500);
assert.equal((await cancelledLanding).cancelled, true);
assert.equal(api.getContext().spot, null);
assert.equal(events.filter(event => event.name === 'landed').length, 1);

const returnToRoof = api.landAt(rooftop); advance(5500); await returnToRoof;
const cancelledTakeoff = api.takeOff(); advance(1200); api.pause();
const pausedTakeoffPosition = JSON.stringify(parts[0].position); advance(6000);
assert.equal((await cancelledTakeoff).cancelled, true);
assert.equal(api.getContext().mode, 'hovering');
assert.equal(JSON.stringify(parts[0].position), pausedTakeoffPosition, 'Cancelled takeoff must freeze the crow');
const landForButton = api.landAt(rooftop); advance(5500); await landForButton;
elements.get('fly').onclick();
assert.equal(api.getContext().mode, 'taking-off', 'The landed flight control must take off instead of teleporting');
assert.equal(JSON.stringify(api.getContext().destination), destinationBeforeTakeoff);
api.pause();

let resolveNearby;
nearbyResponse = new Promise(resolve => { resolveNearby = resolve; });
vm.runInContext('placesLoaded=false', sandbox);
const pendingNearby = elements.get('nearby').onclick();
await Promise.resolve();
const newFlight = api.flyTo({ name: 'Singapore', lat: 1.29, lng: 103.85 });
assert.equal(marker.removed, true);
resolveNearby({ places: [testPlace] });
await pendingNearby;
assert.equal(elements.get('places').children.length, 0, 'Stale results from the last destination must not reappear');
api.pause(); assert.equal((await newFlight).cancelled, true);

const parisFlight=api.flyTo({name:'Eiffel Tower, Paris, France',lat:48.85837,lng:2.294481});
advance(5000);await parisFlight;
assert.equal(maps.range,52);
assert.equal(maps.tilt,85);
assert.equal(parts[0].altitudeMode,'ABSOLUTE');
assert.equal(maps.center.lat,parts[0].position.lat);
assert.equal(maps.center.lng,parts[0].position.lng);
assert(Math.abs(maps.center.altitude-parts[0].position.altitude-1.8)<1e-6);
assert(parts[0].position.lat<48.85837,'The crow approaches from a viewpoint facing the tower');

elements.get('restart').onclick();
assert.equal(api.getContext().mode, 'demo');
assert.equal(api.getContext().spot, null);
assert.equal(api.getContext().destination.name, 'Chelsea, New York');
assert.equal(api.getContext().savedPlaces[0].name, 'Mountain Cafe');
assert(parts.every(part => part.altitudeMode === 'ABSOLUTE' && part.scale === 2.2));
assert.equal(maps.range, 48);
console.log('Map contract passed: destination search, terrain-relative arrival, nearby cache, saved context, click landing, wing fold, continuous rooftop takeoff, departure elevation, cancellation, stale responses, demo reset.');
