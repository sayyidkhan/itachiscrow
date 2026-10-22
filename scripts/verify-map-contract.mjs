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
  setAttribute(name, value) { (this.attributes ??= {})[name] = String(value); }
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
let now = 0, nextId = 0, maps, lastTextRequest, lastNearbyRequest, nearbyResponse, nearbyCalls = 0;
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
  static async searchNearby(request) { nearbyCalls++; lastNearbyRequest = request; return nearbyResponse ?? { places: [testPlace] }; }
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
function createCrowWindow(key = 'test') {
  const crowWindow = new EventTarget();
  crowWindow.CROW_MAPS_KEY = key;
  crowWindow.CrowMapKeys = { key, retry: () => false };
  crowWindow.CrowPlaceSearch = { async search(PlaceLibrary, options) {
    return options.locationBias ? PlaceLibrary.searchNearby(options) : PlaceLibrary.searchByText(options);
  } };
  return crowWindow;
}
const window = createCrowWindow();
const sandbox = vm.createContext({ document, window, google, URL, Event, CustomEvent: DetailEvent, AbortController,
  performance: { now: () => now }, setTimeout: schedule, clearTimeout: id => callbacks.delete(id),
  requestAnimationFrame: callback => schedule(callback, 1000 / 60), cancelAnimationFrame: id => callbacks.delete(id),
  fetch: async () => ({ ok: true, json: async () => ({}), arrayBuffer: async () => data }), location: { reload() {} }, console });
const appSource = await readFile(new URL('../dist/app.js', import.meta.url), 'utf8');
async function loadApp(context) {
  vm.runInContext(appSource, context);
  await new Promise(resolve => setImmediate(resolve));
}
await loadApp(sandbox);
const events = [];
for (const name of ['ready', 'destination', 'landing-selected', 'landed', 'context', 'flight']) {
  document.addEventListener('crow:' + name, event => events.push({ name, detail: event.detail }));
}
await window.initCrow();
maps.dispatchEvent(Object.assign(new Event('gmp-steadychange'), { isSteady: true }));
advance(500);
const api = window.CrowMap;
assert.equal(api.getContext().mapReady, true);
assert.equal(events.filter(event => event.name === 'ready').length, 1);
assert.equal(nearbyCalls, 0, 'Loading the map does not automatically search nearby');
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

await new Promise(resolve => setImmediate(resolve));
assert.equal(nearbyCalls, 1, 'Finishing a destination flight opens nearby places automatically');
assert.equal(elements.get('nearby-panel').hidden, false);
await elements.get('nearby').onclick();
assert.equal(elements.get('nearby-panel').hidden, true);
await elements.get('nearby').onclick();
assert.equal(elements.get('nearby-panel').hidden, false);
assert.equal(nearbyCalls, 1, 'Reopening the carousel reuses the current results');
assert.equal(lastNearbyRequest.locationRestriction.center.lat, kathmandu.lat);
assert.equal(elements.get('places').children[0].children[0].children[1].textContent, 'Mountain Cafe');
const marker = maps.children.find(node => node.label === 'Mountain Cafe');
assert(marker);
await elements.get('places').children[0].children[0].onclick();
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
await new Promise(resolve => setImmediate(resolve));
assert.equal(lastNearbyRequest.locationRestriction.center.lat, 27.71725, 'Arrival searches at the landing spot, not the previous destination centre');
assert.equal(elements.get('nearby-panel').hidden, false);
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
assert.equal(parts[0].position.lat, restingPosition.lat);
assert.equal(parts[0].position.lng, restingPosition.lng);
assert.equal(parts[0].position.altitude, restingPosition.altitude + 1422, 'Switch to absolute altitude without moving the rendered perch');
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
assert.equal(maps.range, 52);
assert(takeoffSamples.filter((sample, i) => i && sample.range !== takeoffSamples[i-1].range).length > 25, 'Camera advances at display cadence during pullback');
for (let i = 1; i < takeoffSamples.length; i++) {
  assert(Math.abs(takeoffSamples[i].cameraAltitude - takeoffSamples[i-1].cameraAltitude) < .6, 'No vertical camera snaps at lift-off');
  assert(Math.abs(takeoffSamples[i].range - takeoffSamples[i-1].range) < .3, 'Camera pullback is gradual');
  assert(Math.abs(takeoffSamples[i].wing - takeoffSamples[i-1].wing) < .06, 'Wing spread eases into flight');
}
await assert.rejects(api.takeOff(), /Land on a spot/);
const beforeRoam = JSON.stringify(maps.center), beforeRoamCrow = JSON.stringify(parts[0].position);
api.freeRoam();
assert.equal(api.getContext().freeRoaming, true);
assert.equal(JSON.stringify(maps.center), beforeRoam, 'Free roam does not jump the camera');
maps.center = { lat: 28, lng: 86, altitude: 1500 };
advance(1000);
assert.equal(maps.center.lat, 28, 'The camera stays where the visitor moves it');
api.followCrow();
assert.equal(api.getContext().freeRoaming, false);
assert.equal(JSON.stringify(parts[0].position), beforeRoamCrow, 'Following the crow only moves the camera');
assert.equal(maps.center.lat, parts[0].position.lat);

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
api.freeRoam(); assert.equal((await newFlight).cancelled, true);
assert.equal(api.getContext().freeRoaming, true);
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
assert.equal(api.getContext().mode, 'landed');
assert.equal(api.getContext().spot.name, 'Esplanade, Singapore');
assert.equal(api.getContext().destination.name, 'Esplanade, Singapore');
assert.equal(api.getContext().savedPlaces[0].name, 'Mountain Cafe');
assert(parts.every(part => part.altitudeMode === 'RELATIVE_TO_MESH'));
assert(parts[1].scale.x < 1);
assert.equal(maps.range, 22);

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

async function locationCase(locate, key = 'test', nativeAnimationEnd = false, adjustedCamera = false, noSteady = false, rooftops = undefined) {
  const nodes = new Map();
  const isolatedDocument = Object.assign(new EventTarget(), {
    baseURI: document.baseURI, currentScript: document.currentScript, head: new Element(), body: new Element(), activeElement: null,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); }, createElement() { return new Element(); },
  });
  const isolatedWindow = Object.assign(createCrowWindow(key), { CrowLocation: { locate }, CrowRooftops: rooftops });
  const isolated = vm.createContext({ ...sandbox, document: isolatedDocument, window: isolatedWindow });
  const emitted = [];
  for (const name of ['ready', 'landed']) isolatedDocument.addEventListener('crow:' + name, event => emitted.push({ name, detail: event.detail }));
  await loadApp(isolated);
  if (key) {
    await isolatedWindow.initCrow();
    assert.equal(maps.range, 20000, 'Startup begins above the chosen perch');
    if(noSteady)advance(1500);
    else maps.dispatchEvent(Object.assign(new Event('gmp-steadychange'), { isSteady: true }));
    {
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
      if(adjustedCamera){
        assert.equal(isolatedWindow.CrowMap.getContext().mapReady,false,'A view away from the crow must not release the loader');
        advance(3000);
      }
      assert.equal(isolatedWindow.CrowMap.getContext().mapReady, true, 'Camera completion must not wait indefinitely for mesh steady');
      assert.equal(vm.runInContext('sceneSteady', isolated), false);
    }
  }
  return { api: isolatedWindow.CrowMap, window: isolatedWindow, document: isolatedDocument, sandbox: isolated, map: maps, nodes, emitted };
}
let locationCalls = 0;
const singapore = { name: 'Your location', lat: 1.2868, lng: 103.8545 };
const roofPlace={...singapore,lat:singapore.lat+.0003,perch:'rooftop',building:'Nearest building'};
let rooftopLookups=0;
const rooftopStart=await locationCase(async()=>({status:'located',place:singapore}),'test',false,false,false,{async find(){rooftopLookups++;return roofPlace;}});
assert.equal(rooftopStart.api.getContext().spot.lat,roofPlace.lat,'Startup picks the nearby roof');
assert.equal(rooftopStart.api.getContext().startLocation.lat,singapore.lat,'The real device location remains separate from the perch');
assert.equal(rooftopStart.map.initialOptions.center.lat,roofPlace.lat,'Bootstrap uses the roof from the first map frame');
assert.equal(vm.runInContext('crowParts[0].altitudeMode',rooftopStart.sandbox),'RELATIVE_TO_MESH','Google resolves the actual rooftop elevation');
rooftopStart.nodes.get('restart').onclick();
assert.equal(rooftopStart.api.getContext().position.lat,roofPlace.lat,'Reset returns to the saved rooftop');
assert.equal(rooftopLookups,1,'Reset does not repeat the footprint lookup');
await rooftopStart.api.useCurrentLocation();
assert.equal(rooftopStart.api.getContext().spot.lat,roofPlace.lat,'Current location also chooses the roof');
let releaseRoof;
rooftopStart.window.CrowRooftops.find=()=>new Promise(resolve=>{releaseRoof=resolve;});
const pendingRoof=rooftopStart.api.useCurrentLocation();
await new Promise(resolve=>setImmediate(resolve));
const rooftopInterruptedFlight=rooftopStart.api.flyTo({name:'User chosen destination',lat:48.85,lng:2.35});
releaseRoof(roofPlace);assert.equal((await pendingRoof).cancelled,true,'A late roof lookup cannot override a new flight');
assert.equal(rooftopStart.api.getContext().destination.name,'User chosen destination');rooftopStart.api.pause();await rooftopInterruptedFlight;
const fallbackRoof=await locationCase(async()=>({status:'denied',place:null}),'test',false,false,false,{async find(place){return {...place,lat:place.lat+.0003,perch:'rooftop'};}});
assert.equal(fallbackRoof.api.getContext().hasUserLocation,false);
fallbackRoof.nodes.get('restart').onclick();
assert.equal(fallbackRoof.api.getContext().position.lat,1.28972+.0003,'Denied location reset keeps the fallback rooftop');
for(const find of [async()=>{throw Error('Footprints unavailable');},async()=>({...singapore,lat:singapore.lat+1})]){
 const unavailableRoof=await locationCase(async()=>({status:'located',place:singapore}),'test',false,false,false,{find});
 assert.equal(unavailableRoof.api.getContext().position.lat,singapore.lat,'Missing or out-of-range roofs keep the original starting point');
}
const located = await locationCase(async () => { locationCalls++; return { status: 'located', place: singapore, accuracy: 12, message: 'Starting at your browser location.' }; });
assert.equal(locationCalls, 1);
assert.equal(located.api.getContext().locationStatus, 'located');
assert.equal(located.api.getContext().hasUserLocation, true);
assert.equal(located.api.getContext().mode, 'landed');
assert.equal(located.api.getContext().spot.lat, singapore.lat);
assert.equal(located.map.initialOptions.center.lat, singapore.lat, 'The initial map must never flash the fallback before locating the user');
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
const denied = await locationCase(async () => ({ status: 'denied', place: null, message: 'Location permission denied. Try the Esplanade fallback.' }));
assert.equal(denied.api.getContext().locationStatus, 'denied');
assert.equal(denied.api.getContext().hasUserLocation, false);
assert.equal(denied.api.getContext().mode, 'landed');
assert.equal(denied.api.getContext().spot.name, 'Esplanade, Singapore');
assert.equal(denied.map.initialOptions.center.lat, 1.28972);
assert.equal(denied.map.initialOptions.center.lng, 103.85528);
assert.equal(vm.runInContext('crowParts[0].position.altitude',denied.sandbox),1.2);
assert.equal(vm.runInContext('crowParts[1].scale.x<1',denied.sandbox),true);
assert.deepEqual(denied.emitted.map(event=>event.name),['ready']);
const fallbackTakeoff=denied.api.takeOff();advance(6500);
assert.equal((await fallbackTakeoff).mode,'hovering');
denied.nodes.get('fly').onclick();advance(1500);
assert.equal(denied.api.getContext().mode,'demo','The Esplanade loop remains available after takeoff');
assert.equal(vm.runInContext('playing',denied.sandbox),true);
assert.equal(vm.runInContext('crowParts.every(part=>part.altitudeMode==="ABSOLUTE")',denied.sandbox),true);
denied.nodes.get('restart').onclick();
assert.equal(denied.api.getContext().spot.name,'Esplanade, Singapore');
assert.match(denied.api.getContext().locationMessage, /denied/);
for(const status of ['unavailable','timeout']){
  const fallback = await locationCase(async()=>({status,place:null,message:'Location '+status+'.'}));
  assert.equal(fallback.api.getContext().hasUserLocation,false);
  assert.equal(fallback.api.getContext().destination.name,'Esplanade, Singapore');
  assert.equal(fallback.map.initialOptions.center.lat,1.28972);
  assert.equal(fallback.map.initialOptions.center.lng,103.85528);
  assert.match(fallback.api.getContext().locationMessage,/Starting at Esplanade, Singapore/);
}
const callsBeforeNoKey = locationCalls;
const noKey = await locationCase(() => { locationCalls++; throw Error('Location must not be requested without Maps configuration'); }, '');
assert.equal(locationCalls, callsBeforeNoKey);
assert.equal(noKey.document.head.children.length, 0);
assert.equal(noKey.api.getContext().mapReady, false);
console.log('Map contract passed: search, staged country travel, spherical/date-line routes, reduced motion, startup location, stale location prevention, location reset, saved places, rooftop takeoff, cancellation and demo fallback.');

const adjusted = await locationCase(async()=>({status:'located',place:singapore,message:'Located.'}),'test',false,true);
assert.equal(adjusted.api.getContext().mapReady,true,'A renderer-adjusted camera near buildings must release the loader');
assert.equal(adjusted.map.range,32,'Retry an obstructed view with a steeper camera angle');
assert.equal(adjusted.map.tilt,45);
assert.deepEqual(adjusted.emitted.map(event=>event.name),['ready']);
const neverSteady=await locationCase(async()=>({status:'located',place:singapore,message:'Located.'}),'test',false,false,true);
assert.equal(neverSteady.api.getContext().mapReady,true,'A missing city steady event must not prevent initial perching');
const nativeFly=neverSteady.map.flyCameraTo;
neverSteady.map.flyCameraTo=()=>{};
vm.runInContext('ready=false;startupCameraStage="waiting";startupFramingAt=null;startupCameraAttempts=0;map.range=20000;frameInitialPerch()',neverSteady.sandbox);
advance(20000);
assert.equal(vm.runInContext('startupFailed',neverSteady.sandbox),false,'Slow native startup must not exhaust the obstructed-camera retries');
assert.equal(neverSteady.api.getContext().mapReady,false,'Ignored native requests must never expose the wide bootstrap view');
neverSteady.map.flyCameraTo=nativeFly;
advance(3500);
assert.equal(neverSteady.api.getContext().mapReady,true,'Framing resumes once the native renderer accepts camera requests');

const bridgeOrbit = {name:'Golden Gate Bridge',lat:37.8199,lng:-122.4783};
window.matchMedia = () => ({matches:true});
await api.flyTo(bridgeOrbit);
await api.circleAround(bridgeOrbit);
window.matchMedia = () => ({matches:false});
sandbox.requestAnimationFrame = callback => schedule(callback,1000);
const slowOrbit = api.circleAround(bridgeOrbit);
assert.equal(api.getContext().mode,'circling','Repeating a wide orbit does not fly back to the centre');
advance(21000);
assert.equal(api.getContext().mode,'hovering','Even at one frame per second an orbit completes in twenty seconds');
assert.equal((await slowOrbit).mode,'hovering');
const cancelledOrbit = api.circleAround(bridgeOrbit);
advance(3000);
api.pause();
const stoppedOrbit = JSON.stringify(api.getContext().position);
advance(25000);
assert.equal((await cancelledOrbit).cancelled,true);
assert.equal(JSON.stringify(api.getContext().position),stoppedOrbit,'Cancelled orbit frames never move the crow');
console.log('Landmark orbit contract passed: repeat, slow frames, completion and cancellation.');

sandbox.requestAnimationFrame = callback => schedule(callback, 20);
const travelRates = [];
const steeringCameraCalls = cameraCalls.length;
let flightSurface;
for (const multiplier of [1, 2, 3]) {
  api.setSteeringSpeed(multiplier);
  await api.beginSteering();
  vm.runInContext('crowHeading=0', sandbox);
  const initialPosition = api.getContext().position;
  const renderedAltitude = vm.runInContext('crowParts[0].position.altitude', sandbox);
  flightSurface = renderedAltitude - initialPosition.altitude;
  for (let i=0;i<10;i++) { api.steer(0,1); advance(100); }
  assert.equal(vm.runInContext('crowParts[0].altitudeMode', sandbox), 'ABSOLUTE');
  assert.equal(vm.runInContext('crowParts[0].position.altitude', sandbox), renderedAltitude, 'Crossing rooftops keeps flight elevation constant');
  travelRates.push((api.getContext().position.lat-initialPosition.lat)*111320);
  api.endSteering();
}
assert(travelRates[0] > 30 && travelRates[0] < 35, 'Speed eases up from rest');
for (let i=1;i<3;i++) assert(Math.abs(travelRates[i]/travelRates[0]-(i+1))<.001,'Speed multiplier preserves proportional distance');
assert.equal(cameraCalls.length, steeringCameraCalls, 'Steering never restarts native camera animations');
assert(Math.abs(vm.runInContext('map.center.altitude', sandbox)-api.getContext().position.altitude-flightSurface-1.8)<.001, 'Camera and crow share one elevation reference');
assert.throws(()=>api.setSteeringSpeed(4),/1×, 2× or 3×/);
api.setSteeringSpeed(1);
await api.beginSteering();
const rollingFlight=api.roll();
for (let i=0;i<7;i++) { api.steer(0,1); advance(100); }
assert.equal(api.getContext().steering,true,'Rolling does not cancel active steering');
assert(Math.abs(vm.runInContext('crowParts[0].orientation.roll',sandbox)-180)<1);
assert.equal(cameraCalls.at(-1).endCamera.roll,0,'Only the crow rotates');
for (let i=0;i<8;i++) { api.steer(0,1); advance(100); }
assert.equal((await rollingFlight).rolling,false);
assert.equal(vm.runInContext('crowParts[0].orientation.roll',sandbox),0);
const stoppedRoll=api.roll();advance(100);api.pause();advance(2000);
assert.equal((await stoppedRoll).cancelled,true);
assert.equal(vm.runInContext('crowParts[0].orientation.roll',sandbox),0);
sandbox.requestAnimationFrame = callback => schedule(callback,1000);
const slowRoll=api.roll();advance(2000);
assert.equal((await slowRoll).rolling,false,'Slow rendering cannot stretch a roll indefinitely');
window.matchMedia=()=>({matches:true});
assert.equal((await api.roll()).reducedMotion,true);
assert.equal(api.getContext().rolling,false);
console.log('Steering contract passed: 1×/2×/3× distance, simultaneous roll, level camera, cancellation, slow frames and reduced motion.');
window.matchMedia=()=>({matches:false});
const slowLanding=api.landAt({name:'Test rooftop',...api.getContext().position});advance(7000);await slowLanding;
const slowTakeoff=api.takeOff();advance(7000);
assert.equal(api.getContext().mode,'hovering','A low frame rate must not stretch the liftoff animation');
assert.equal((await slowTakeoff).mode,'hovering');
const airborneAltitude = parts[0].position.altitude, airborneCamera = vm.runInContext('map.range',sandbox);
sandbox.requestAnimationFrame = callback => schedule(callback,20);
await api.beginSteering();
api.steer(0,1);advance(200);api.endSteering();
assert.equal(parts[0].position.altitude, airborneAltitude, 'Steering starts at the exact airborne elevation');
assert.equal(vm.runInContext('map.range',sandbox), airborneCamera, 'Steering continues the takeoff camera without a zoom jump');
console.log('Liftoff contract passed at one frame per second.');

const beforeCamera = JSON.stringify(api.getContext().position), beforeCameraHeading = api.getContext().heading;
const viewMap = vm.runInContext('map', sandbox), originalRange = viewMap.range;
api.setCameraView({ rotation: 90, tilt: 47, zoom: 2 });
assert.equal(JSON.stringify(api.getContext().position), beforeCamera, 'Camera controls never move the crow');
assert.equal(api.getContext().heading, beforeCameraHeading, 'Rotating the camera never turns the crow');
assert.equal(viewMap.range, originalRange * 2);
assert.equal(viewMap.tilt, 47);
api.setCameraView({ rotation: 90, tilt: 47, zoom: 2 });
assert.equal(viewMap.range, originalRange * 2, 'Repeated settings never accumulate zoom');
for (const invalid of [{rotation:181},{tilt:86},{zoom:0},{tilt:NaN},{rotation:0,zoom:Infinity}]) assert.throws(() => api.setCameraView(invalid), /valid camera/);
assert.equal(api.getCameraView().rotation, 90, 'Invalid settings leave the entire preference unchanged');
await api.beginSteering();
for (let i=0;i<5;i++) { api.steer(1,1); advance(100); }
assert.equal(viewMap.heading, (api.getContext().heading + 90) % 360);
assert.equal(viewMap.tilt, 47);
assert.equal(viewMap.range, 104);
api.endSteering();
api.freeRoam();
viewMap.center = {lat:1.2,lng:103.7,altitude:250};
api.setCameraView({ rotation: -45, zoom: 1.5 });
assert.equal(JSON.stringify(viewMap.center), JSON.stringify({lat:1.2,lng:103.7,altitude:250}), 'Free roam adjustments preserve the explored centre');
api.followCrow();
assert.equal(viewMap.center.lat, api.getContext().position.lat);
assert.equal(viewMap.heading, (api.getContext().heading - 45 + 360) % 360);
window.matchMedia=()=>({matches:true});
await api.circleAround(bridgeOrbit);
assert.equal(viewMap.tilt, 47, 'Orbit retains chosen tilt');
assert.equal(viewMap.range, 78, 'Orbit applies distance preference exactly once');
api.setCameraView({ rotation: 0 });
assert.equal(viewMap.heading, api.getContext().heading, 'Behind view restores the crow heading after a completed orbit');
api.setCameraView({ rotation: -45 });
const adjustedLanding = api.landAt({name:'Camera test rooftop',...api.getContext().position}); advance(7000); await adjustedLanding;
assert.equal(viewMap.tilt, 47, 'Landing retains chosen tilt');
assert.equal(viewMap.range, 33);
window.matchMedia=()=>({matches:false});
const adjustedTakeoff = api.takeOff(); advance(7000); await adjustedTakeoff;
assert.equal(viewMap.heading, (api.getContext().heading - 45 + 360) % 360);
assert.equal(viewMap.tilt, 47, 'Takeoff ends at the chosen angle');
assert.equal(viewMap.range, 78);
api.setCameraView({reset:true});
assert.equal(viewMap.range, 52);
assert.equal(viewMap.tilt, 65);
assert.equal(viewMap.heading, api.getContext().heading);
console.log('Camera contract passed: stationary crow, validation, steering persistence, free roam centre, follow, orbit, landing, takeoff and reset.');

sandbox.requestAnimationFrame=callback=>schedule(callback,1000/60);
api.setCameraView({rotation:179,tilt:47,zoom:1});
const lookStart={heading:viewMap.heading,range:viewMap.range},lookPose=JSON.stringify(api.getContext().position),lookCalls=cameraCalls.length;
api.setCameraView({rotation:-166,tilt:67,zoom:2},{animate:true});
assert.equal(viewMap.heading,lookStart.heading,'Look input does not jump before the next frame');
assert.equal(api.getCameraView().rotation,-166,'Rapid inputs accumulate against the requested angle');
const lookSamples=[];
for(let i=0;i<30;i++){
 advance(1000/60);
 lookSamples.push({turn:((viewMap.heading-lookStart.heading+540)%360)-180,tilt:viewMap.tilt,range:viewMap.range});
}
assert(lookSamples[0].turn>0&&lookSamples[0].turn<6,'The first frame eases into the shortest turn across 180 degrees');
assert(lookSamples.filter((sample,i)=>i&&sample.turn!==lookSamples[i-1].turn).length>12,'A tap advances across many display frames');
for(let i=1;i<lookSamples.length;i++){
 assert(lookSamples[i].turn>=lookSamples[i-1].turn&&lookSamples[i].turn<=15,'Turn never reverses or overshoots');
 assert(lookSamples[i].tilt>=lookSamples[i-1].tilt&&lookSamples[i].tilt<=67,'Tilt never reverses or overshoots');
 assert(lookSamples[i].range>=lookSamples[i-1].range&&lookSamples[i].range<=lookStart.range*2+.0001,'Zoom never reverses or overshoots');
}
assert(Math.abs(lookSamples.at(-1).turn-15)<1e-8);
assert.equal(viewMap.tilt,67);
assert(Math.abs(viewMap.range-lookStart.range*2)<1e-8);
assert.equal(cameraCalls.length,lookCalls,'Smooth look never restarts native camera animations');
assert.equal(JSON.stringify(api.getContext().position),lookPose,'Smooth look does not move the crow');
api.setCameraView({rotation:0,tilt:40,zoom:1});
api.setCameraView({rotation:90},{animate:true});advance(50);
const retargetHeading=viewMap.heading;
api.setCameraView({rotation:-30},{animate:true});
assert.equal(viewMap.heading,retargetHeading,'Changing direction starts at the current rendered view');
advance(700);
assert(Math.abs(((viewMap.heading-api.getContext().heading+540)%360)-180+30)<1e-8);
api.freeRoam();
const smoothCentre={lat:1.23,lng:103.78,altitude:180};viewMap.center=smoothCentre;
api.setCameraView({rotation:70,tilt:55,zoom:1.5},{animate:true});advance(700);
assert.equal(JSON.stringify(viewMap.center),JSON.stringify(smoothCentre),'Smoothed free roam keeps its explored centre');
api.followCrow();
api.setCameraView({rotation:0,tilt:40,zoom:1});
await api.beginSteering();
api.setCameraView({rotation:90,tilt:60,zoom:2},{animate:true});
const steeringLooks=[];
for(let i=0;i<40;i++){
 api.steer(1,0);advance(1000/60);
 steeringLooks.push(((viewMap.heading-api.getContext().heading+540)%360)-180);
}
assert(steeringLooks[0]>0&&steeringLooks[0]<30,'Steering uses the eased angle instead of jumping to the requested angle');
assert(Math.abs(steeringLooks.at(-1)-90)<1e-8,'Steering and look settle on the same camera angle');
assert.equal(viewMap.tilt,60);assert.equal(viewMap.range,104);
api.endSteering();
api.setCameraView({rotation:-90},{animate:true});advance(30);api.freeRoam();
const interruptedLook=JSON.stringify({heading:viewMap.heading,range:viewMap.range,center:viewMap.center});advance(700);
assert.equal(JSON.stringify({heading:viewMap.heading,range:viewMap.range,center:viewMap.center}),interruptedLook,'New flight actions cancel pending look frames');
const frozenRotation=api.getCameraView().rotation;
api.setCameraView({rotation:frozenRotation+15},{animate:true});advance(700);
assert(Math.abs(((viewMap.heading-JSON.parse(interruptedLook).heading+540)%360)-180-15)<1e-8,'The next input continues from the cancelled rendered angle');
api.setCameraView({rotation:frozenRotation},{animate:true});advance(30);
window.dispatchEvent(new Event('blur'));
const blurredHeading=viewMap.heading,blurredView=api.getCameraView().rotation;
advance(700);assert.equal(viewMap.heading,blurredHeading,'Blur cancels pending motion');
api.setCameraView({rotation:blurredView+15},{animate:true});advance(700);
assert(Math.abs(((viewMap.heading-blurredHeading+540)%360)-180-15)<1e-8,'Resuming after blur keeps the rendered angle aligned with the controls');
sandbox.requestAnimationFrame=callback=>schedule(callback,500);
api.setCameraView({rotation:0,tilt:30,zoom:1});
api.setCameraView({tilt:80},{animate:true});advance(500);
assert(viewMap.tilt>30&&viewMap.tilt<60,'A delayed display frame cannot snap straight to the target');
advance(10000);
assert.equal(viewMap.tilt,80,'Slow rendering still reaches the exact target');
sandbox.requestAnimationFrame=callback=>schedule(callback,1000/60);
window.matchMedia=()=>({matches:true});
api.setCameraView({rotation:20,tilt:30,zoom:1},{animate:true});
assert.equal(viewMap.tilt,30,'Reduced motion applies look immediately');
assert.equal(vm.runInContext('cameraMotion',sandbox),null);
window.matchMedia=()=>({matches:false});
api.setCameraView({reset:true});
console.log('Smooth look contract passed: display cadence, shortest turn, monotonic tilt/zoom, retargeting, free roam, simultaneous steering, slow frames, interruption and reduced motion.');

api.freeRoam();
Object.assign(viewMap,{heading:311,tilt:38,range:78,center:{lat:1.3,lng:103.8,altitude:200}});
const findPose=JSON.stringify(api.getContext().position),findHeading=api.getContext().heading;
for(let i=0;i<2;i++){
 api.followCrow({preserveView:true});
 assert.equal(viewMap.heading,311,'Find crow keeps the actual free-roam heading');
 assert.equal(viewMap.tilt,38,'Find crow keeps the actual free-roam tilt');
 assert.equal(viewMap.range,78,'Repeated Find crow keeps the actual zoom');
 assert.equal(viewMap.center.lat,api.getContext().position.lat);
 assert.equal(viewMap.center.lng,api.getContext().position.lng);
 assert.equal(JSON.stringify(api.getContext().position),findPose,'Find crow never moves the crow');
 assert.equal(api.getContext().heading,findHeading,'Find crow never turns the crow');
 assert.equal(api.getContext().freeRoaming,false);
 assert.equal(cameraCalls.at(-1).durationMillis,900,'Find crow keeps the smooth return');
}
await api.beginSteering();api.steer(0,1);advance(100);
assert(Math.abs(viewMap.heading-311)<1e-8,'Steering retains the recovered camera angle');
assert.equal(viewMap.tilt,38);assert.equal(viewMap.range,78);
api.endSteering();
api.setCameraView({rotation:-90,tilt:60},{animate:true});advance(50);
const midFind={heading:viewMap.heading,tilt:viewMap.tilt,range:viewMap.range};
api.followCrow({preserveView:true});advance(700);
assert.equal(viewMap.heading,midFind.heading,'Find crow during a turn keeps the angle visible at the click');
assert.equal(viewMap.tilt,midFind.tilt);assert.equal(viewMap.range,midFind.range);
assert.equal(vm.runInContext('cameraMotion',sandbox),null,'Stale look frames cannot override Find crow');
api.setCameraView({reset:true});
console.log('Find crow contract passed: actual free-roam angle and zoom, repeated return, fixed crow, smooth return, steering persistence and interruption.');
