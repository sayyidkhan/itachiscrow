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
  constructor(options) { super(); Object.assign(this, options); this.initialOptions = options; maps = this; }
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
for (const name of ['ready', 'destination', 'landing-selected', 'landed', 'context', 'flight']) {
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
const sourcePose = JSON.stringify(vm.runInContext('crowParts[0].position', sandbox));
const sourceCamera = JSON.stringify(maps.center);
const arrival = api.flyTo(kathmandu);
assert.equal(api.getContext().mode, 'arriving');
assert.equal(JSON.stringify(vm.runInContext('crowParts[0].position', sandbox)), sourcePose, 'Do not move the crow before pulling the camera away');
assert.equal(JSON.stringify(maps.center), sourceCamera, 'A long journey begins at the current camera');
advance(1000);
assert.equal(api.getContext().flightStage, 'departing');
assert(maps.range > 52);
advance(3000);
assert.equal(api.getContext().flightStage, 'cruising');
assert(maps.range > 50000);
advance(12000);
assert.equal((await arrival).mode, 'hovering');
assert.equal(api.getContext().flightStage, null);
assert(api.getContext().routeDistanceMeters > 50000);
assert.deepEqual([...new Set(events.filter(event => event.name === 'flight').map(event => event.detail.stage))], ['departing', 'cruising', 'descending', 'approaching', null]);
assert(events.filter(event => event.name === 'flight').every(event => event.detail.range <= 12000000), 'Globe framing stays within the intended camera range cap');
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
const cameraBeforeTakeoff = JSON.stringify({center:maps.center,range:maps.range,tilt:maps.tilt,heading:maps.heading});
const callsBeforeTakeoff = cameraCalls.length;
const takeoff = api.takeOff();
assert.equal(api.getContext().mode, 'taking-off');
assert.equal(api.getContext().spot, null);
assert.equal(JSON.stringify(parts[0].position), JSON.stringify(restingPosition), 'Takeoff must begin at the exact landed position');
assert(Math.abs(parts[1].scale.x - foldedWidth) < 1e-6);
assert.equal(JSON.stringify({center:maps.center,range:maps.range,tilt:maps.tilt,heading:maps.heading}), cameraBeforeTakeoff, 'No pre-launch camera jump');
const takeoffSamples = [];
for (let frame = 0; frame < 72; frame++) {
  advance(1000 / 60);
  takeoffSamples.push({ altitude: parts[0].position.altitude, cameraAltitude: maps.center.altitude, range: maps.range, wing: parts[1].scale.x });
}
assert(parts[0].position.altitude > 1422 + restingPosition.altitude);
assert(parts[1].scale.x > foldedWidth, 'Wings unfold during the lift');
assert.equal(parts[0].position.lat, restingPosition.lat);
assert.equal(parts[0].position.lng, restingPosition.lng);
for (let frame = 0; frame < 108; frame++) {
  advance(1000 / 60);
  takeoffSamples.push({ altitude: parts[0].position.altitude, cameraAltitude: maps.center.altitude, range: maps.range, wing: parts[1].scale.x });
}
assert(parts[0].position.altitude > 1450, 'Gain rooftop clearance before moving forward');
assert.equal(parts[0].position.lat, restingPosition.lat);
assert.equal(parts[0].position.lng, restingPosition.lng);
for (let frame = 0; frame < 180; frame++) {
  advance(1000 / 60);
  takeoffSamples.push({ altitude: parts[0].position.altitude, cameraAltitude: maps.center.altitude, range: maps.range, wing: parts[1].scale.x });
  assert.equal(parts[0].altitudeMode, 'ABSOLUTE', 'Keep one rooftop height throughout the departure');
  if (parts[0].position.lat !== restingPosition.lat) assert(parts[0].position.altitude > 1465, 'Clear the rooftop before crossing its edge');
}
assert.equal((await takeoff).mode, 'hovering');
assert.equal(parts[0].altitudeMode, 'ABSOLUTE', 'Forward departure keeps a fixed elevation over the roof edge');
assert(Math.abs(parts[0].position.altitude - 1472) < 1e-6);
assert.notEqual(parts[0].position.lat, restingPosition.lat);
assert.equal(parts[1].scale.x, 2.2);
assert.equal(JSON.stringify(api.getContext().destination), destinationBeforeTakeoff);
assert.equal(events.filter(event => event.name === 'destination').length, destinationEvents);
assert.equal(cameraCalls.length, callsBeforeTakeoff, 'Takeoff must not restart native camera animations each frame');
assert.equal(maps.range, 42);
assert(takeoffSamples.filter((sample, i) => i && sample.range !== takeoffSamples[i-1].range).length > 25, 'Camera advances at display cadence during pullback');
for (let i = 1; i < takeoffSamples.length; i++) {
  assert(Math.abs(takeoffSamples[i].cameraAltitude - takeoffSamples[i-1].cameraAltitude) < .6, 'No vertical camera snaps at lift-off');
  assert(Math.abs(takeoffSamples[i].range - takeoffSamples[i-1].range) < .3, 'Camera pullback is gradual');
  assert(Math.abs(takeoffSamples[i].wing - takeoffSamples[i-1].wing) < .06, 'Wing spread eases into flight');
}
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
advance(4000); assert.equal(api.getContext().flightStage, 'cruising');
api.pause(); assert.equal((await newFlight).cancelled, true);
const cancelledCamera = JSON.stringify(maps.center); advance(13000);
assert.equal(JSON.stringify(maps.center), cancelledCamera, 'Cancelled country travel must freeze the camera and never arrive later');
assert.equal(api.getContext().flightStage, null);
assert.equal(events.filter(event => event.name === 'flight').at(-1).detail.cancelled, true);

const parisFlight=api.flyTo({name:'Eiffel Tower, Paris, France',lat:48.85837,lng:2.294481});
advance(16000);await parisFlight;
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

const arcMidpoint = vm.runInContext('sphericalPoint({lat:10,lng:179},{lat:10,lng:-179},.5)', sandbox);
assert(Math.abs(arcMidpoint.lng) > 179, 'Date-line travel must follow the short route');
for (const t of [0, .25, .5, .75, 1]) {
  const point = vm.runInContext(`sphericalPoint({lat:0,lng:0},{lat:0,lng:180},${t})`, sandbox);
  assert(Number.isFinite(point.lat) && Number.isFinite(point.lng), 'Antipodal routes must remain finite');
}
window.matchMedia = () => ({ matches: true });
const cameraCount = cameraCalls.length;
const reduced = await api.flyTo({ name: 'Tokyo', lat: 35.67, lng: 139.65 });
assert.equal(reduced.mode, 'hovering');
assert.equal(reduced.flightStage, null);
assert.equal(cameraCalls.length, cameraCount + 1);
assert.equal(cameraCalls.at(-1).durationMillis, 0, 'Reduced motion skips globe sweeps');
const reducedLanding = api.landAt(rooftop); advance(5500); await reducedLanding;
const reducedCamera = { range: maps.range, tilt: maps.tilt, heading: maps.heading };
const reducedTakeoff = api.takeOff(); advance(1500);
assert.equal((await reducedTakeoff).mode, 'hovering');
assert.deepEqual({ range: maps.range, tilt: maps.tilt, heading: maps.heading }, reducedCamera, 'Reduced-motion takeoff keeps the view angle and zoom');
delete window.matchMedia;

const unknownLanding = api.landAt(rooftop); advance(5500); await unknownLanding;
vm.runInContext('landedSurfaceAltitude=null;map.center={lat:0,lng:0,altitude:0}', sandbox);
const unknownTakeoff = api.takeOff(); advance(6500);
assert.equal((await unknownTakeoff).mode, 'hovering');
assert.equal(parts[0].position.lat, rooftop.lat);
assert(Math.abs(parts[0].position.lng - rooftop.lng) < 1e-10);
assert.equal(parts[0].altitudeMode, 'RELATIVE_TO_MESH', 'Without a resolved rooftop height, stay over the same roof');

async function locationCase(locate, key = 'test', nativeAnimationEnd = false, adjustedCamera = false) {
  const nodes = new Map();
  const isolatedDocument = Object.assign(new EventTarget(), {
    baseURI: document.baseURI, currentScript: document.currentScript, head: new Element(), body: new Element(), activeElement: null,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); }, createElement() { return new Element(); },
  });
  const isolatedWindow = Object.assign(new EventTarget(), { CROW_MAPS_KEY: key, CrowLocation: { locate } });
  const isolated = vm.createContext({ ...sandbox, document: isolatedDocument, window: isolatedWindow });
  const emitted = [];
  for (const name of ['ready', 'landed']) isolatedDocument.addEventListener('crow:' + name, event => emitted.push({ name, detail: event.detail }));
  vm.runInContext(await readFile(new URL('../dist/app.js', import.meta.url), 'utf8'), isolated);
  if (key) {
    await isolatedWindow.initCrow();
    const usesLocation = isolatedWindow.CrowMap.getContext().hasUserLocation;
    if (usesLocation) assert.equal(maps.range, 20000, 'Location startup must await the native initial scene before framing');
    maps.dispatchEvent(Object.assign(new Event('gmp-steadychange'), { isSteady: true }));
    if (usesLocation) {
      assert.equal(isolatedWindow.CrowMap.getContext().mapReady, false, 'The initial 20km scene is not ready for the user');
      advance(20);
      assert.equal(maps.range, 22);
      assert.equal(maps.tilt, 72);
      if(adjustedCamera){maps.range=131.75;maps.center={...maps.center,lat:maps.center.lat-.00054,lng:maps.center.lng+.00077};}
      assert.equal(isolatedWindow.CrowMap.getContext().mapReady, false, 'The close camera must finish or remain stable before ready');
      maps.dispatchEvent(Object.assign(new Event('gmp-steadychange'), { isSteady: false }));
      if (nativeAnimationEnd) maps.dispatchEvent(new Event('gmp-animationend'));
      else {
        advance(250);
        assert.equal(isolatedWindow.CrowMap.getContext().mapReady, false, 'Do not accept an unsettled close camera');
        advance(200);
      }
      assert.equal(isolatedWindow.CrowMap.getContext().mapReady, true, 'Camera completion must not wait indefinitely for mesh steady');
      assert.equal(vm.runInContext('sceneSteady', isolated), false);
    }
  }
  return { api: isolatedWindow.CrowMap, window: isolatedWindow, document: isolatedDocument, sandbox: isolated, map: maps, nodes, emitted };
}
let locationCalls = 0;
const singapore = { name: 'Your location', lat: 1.2868, lng: 103.8545 };
const located = await locationCase(async () => { locationCalls++; return { status: 'located', place: singapore, accuracy: 12, message: 'Starting at your browser location.' }; });
assert.equal(locationCalls, 1);
assert.equal(located.api.getContext().locationStatus, 'located');
assert.equal(located.api.getContext().hasUserLocation, true);
assert.equal(located.api.getContext().mode, 'landed');
assert.equal(located.api.getContext().spot.lat, singapore.lat);
assert.equal(located.map.initialOptions.center.lat, singapore.lat, 'The initial map must never flash Chelsea before locating the user');
assert.equal(located.map.initialOptions.center.lng, singapore.lng);
assert.equal(located.map.range, 22, 'Ready means the crow is framed nearby, never the bootstrap 20km camera');
assert.equal(located.map.tilt, 72);
assert.equal(vm.runInContext('crowParts[0].position.altitude', located.sandbox), 1.2);
assert.equal(vm.runInContext('crowParts[0].altitudeMode', located.sandbox), 'RELATIVE_TO_MESH');
assert.deepEqual(located.emitted.map(event => event.name), ['ready'], 'Located startup does not auto-generate a panorama');
let finishLocation;
located.window.CrowLocation.locate = () => new Promise(resolve => { finishLocation = resolve; });
const staleLocation = located.api.useCurrentLocation();
assert.equal(located.api.getContext().locationStatus, 'locating');
const chosenDestination = located.api.flyTo({ name: 'Paris', lat: 48.8566, lng: 2.3522 });
finishLocation({ status: 'located', place: { name: 'Late location', lat: 2, lng: 104 }, message: 'Located.' });
assert.equal((await staleLocation).cancelled, true);
assert.equal(located.api.getContext().destination.name, 'Paris');
located.api.pause(); await chosenDestination;
located.nodes.get('restart').onclick();
assert.equal(located.api.getContext().spot.lat, singapore.lat, 'Reset returns to the saved starting location');
const resetPending = located.api.useCurrentLocation();
located.nodes.get('restart').onclick();
finishLocation({ status: 'located', place: { name: 'Stale after reset', lat: 3, lng: 105 }, message: 'Located.' });
assert.equal((await resetPending).cancelled, true);
assert.equal(located.api.getContext().spot.lat, singapore.lat);
const pausePending = located.api.useCurrentLocation(); located.api.pause();
finishLocation({ status: 'located', place: { name: 'Stale after pause', lat: 4, lng: 106 }, message: 'Located.' });
assert.equal((await pausePending).cancelled, true, 'Pause cancels pending location placement as well as active flight');
assert.equal(located.api.getContext().spot.lat, singapore.lat);
const responses = [];
located.window.CrowLocation.locate = () => new Promise(resolve => responses.push(resolve));
const older = located.api.useCurrentLocation(), newer = located.api.useCurrentLocation();
responses[1]({ status: 'located', place: { name: 'Your location', lat: 35.67, lng: 139.65 }, message: 'Location refreshed.' });
await newer;
responses[0]({ status: 'located', place: singapore, message: 'Older result.' });
assert.equal((await older).cancelled, true);
assert.equal(located.api.getContext().spot.lat, 35.67, 'Only the last location request may reposition the crow');
assert.deepEqual(located.emitted.map(event => event.name), ['ready']);
const animationEnded = await locationCase(async () => ({ status: 'located', place: singapore, message: 'Located.' }), 'test', true);
assert.equal(animationEnded.api.getContext().mapReady, true, 'Native animation completion also confirms the close camera');
const denied = await locationCase(async () => ({ status: 'denied', place: null, message: 'Location permission denied. Try the Chelsea demo.' }));
assert.equal(denied.api.getContext().locationStatus, 'denied');
assert.equal(denied.api.getContext().hasUserLocation, false);
assert.equal(denied.api.getContext().mode, 'demo');
assert.match(denied.api.getContext().locationMessage, /denied/);
const callsBeforeNoKey = locationCalls;
const noKey = await locationCase(() => { locationCalls++; throw Error('Location must not be requested without Maps configuration'); }, '');
assert.equal(locationCalls, callsBeforeNoKey);
assert.equal(noKey.document.head.children.length, 0);
assert.equal(noKey.api.getContext().mapReady, false);
console.log('Map contract passed: search, staged country travel, spherical/date-line routes, reduced motion, startup location, stale location prevention, location reset, saved places, rooftop takeoff, cancellation and demo fallback.');

const adjusted = await locationCase(async()=>({status:'located',place:singapore,message:'Located.'}),'test',false,true);
assert.equal(adjusted.api.getContext().mapReady,true,'A renderer-adjusted camera near buildings must release the loader');
assert.equal(adjusted.map.range,131.75,'Do not force the renderer back to the impossible exact requested camera');
assert.deepEqual(adjusted.emitted.map(event=>event.name),['ready']);
