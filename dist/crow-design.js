export const STORAGE_KEY = 'itachiscrow.design.v1';
export const DEFAULT_DESIGN = Object.freeze({ body: '#4b535d', feathers: '#555f6c', coverts: '#5d6672', eyes: '#ba3d4d' });
export const MATERIAL_FIELDS = Object.freeze({
  'Satin black plumage': 'body',
  'Indigo flight feathers': 'feathers',
  'Graphite coverts': 'coverts',
  'Deep crimson iris': 'eyes',
});
export function normaliseDesign(value) {
  return Object.fromEntries(Object.entries(DEFAULT_DESIGN).map(([key, fallback]) =>
    [key, /^#[0-9a-f]{6}$/i.test(value?.[key]) ? value[key].toLowerCase() : fallback]));
}
export function readDesign() {
  try { return normaliseDesign(JSON.parse(localStorage.getItem(STORAGE_KEY))); }
  catch { return { ...DEFAULT_DESIGN }; }
}
export function designToken(design) {
  return Object.values(normaliseDesign(design)).map(value => value.slice(1)).join('-');
}
export function isDefault(design) { return designToken(design) === designToken(DEFAULT_DESIGN); }
export function linearColour(hex) {
  return [1, 3, 5].map(offset => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
}
export function recolourGLB(buffer, design) {
  const view = new DataView(buffer);
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 ||
      view.getUint32(8, true) !== buffer.byteLength || view.getUint32(16, true) !== 0x4e4f534a) throw Error('Invalid crow GLB');
  const length = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)));
  const colours = normaliseDesign(design);
  for (const material of json.materials || []) {
    const field = MATERIAL_FIELDS[material.name];
    if (field && colours[field] !== DEFAULT_DESIGN[field]) {
      material.pbrMetallicRoughness.baseColorFactor = [...linearColour(colours[field]), 1];
    }
  }
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const padded = Math.ceil(encoded.length / 4) * 4;
  const tail = new Uint8Array(buffer, 20 + length);
  const result = new Uint8Array(20 + padded + tail.length);
  result.set(new Uint8Array(buffer, 0, 20));
  const header = new DataView(result.buffer);
  header.setUint32(8, result.length, true);
  header.setUint32(12, padded, true);
  result.fill(32, 20, 20 + padded);
  result.set(encoded, 20);
  result.set(tail, 20 + padded);
  return result.buffer;
}
let workerReady;
export function enableCustomModels() {
  if (!workerReady) workerReady = (async () => {
    if (!isSecureContext || !('serviceWorker' in navigator)) throw Error('This browser cannot apply colours to city flight. Open this page directly over HTTPS.');
    const script = new URL('crow-sw.js', import.meta.url);
    const scope = new URL('./', import.meta.url).href;
    const existing = await navigator.serviceWorker.getRegistration(scope);
    if (existing?.scope === scope && (existing.active || existing.waiting || existing.installing)?.scriptURL !== script.href) {
      throw Error('This host already manages browser storage. Colour preview works, but flight colours are unavailable here.');
    }
    await navigator.serviceWorker.register(script, { scope, type: 'module', updateViaCache: 'none' });
    await new Promise((resolve, reject) => {
      const check = () => {
        if (navigator.serviceWorker.controller?.scriptURL === script.href) { cleanup(); resolve(); }
      };
      const timer = setTimeout(() => { cleanup(); reject(Error('Flight colour setup timed out. Reload and try saving again.')); }, 15000);
      const cleanup = () => { clearTimeout(timer); navigator.serviceWorker.removeEventListener('controllerchange', check); };
      navigator.serviceWorker.addEventListener('controllerchange', check);
      check();
    });
  })().catch(error => { workerReady = null; throw error; });
  return workerReady;
}
export async function flightModelBase() {
  const design = readDesign();
  if (isDefault(design)) return new URL('models/', import.meta.url);
  await enableCustomModels();
  return new URL(`crow-colours/${designToken(design)}/`, import.meta.url);
}
