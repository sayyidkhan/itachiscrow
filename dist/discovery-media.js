const CACHE = 'crow-discovery-images-v1';
const WEEK = 7 * 86400000;
const node = (tag, text = '', className = '') => {
  const element = document.createElement(tag);
  element.textContent = text; element.className = className;
  return element;
};
function https(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
const words = value => value.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) || [];
function matches(place, candidate) {
  const actual = words(candidate.displayName?.text || '');
  return [place.name, place.query.split(',')[0]].some(name => {
    const expected = words(name);
    return expected.length && expected.filter(word => actual.includes(word)).length / expected.length >= .8;
  });
}
async function cacheKey(query) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(query.trim().toLowerCase().replace(/\s+/g, ' ')));
  return new URL('./__generated-preview/' + Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join(''), import.meta.url).href;
}
const valid = value => value?.synthetic === true && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.imageUrl) && value.imageUrl.length < 4 * 1024 * 1024 && Date.now() - Date.parse(value.generatedAt) < WEEK;
async function readImage(query) {
  try {
    const cache = await caches.open(CACHE), key = await cacheKey(query);
    const response = await cache.match(key);
    if (!response) return null;
    const value = await response.json();
    if (valid(value)) return value;
    await cache.delete(key);
  } catch {}
  return null;
}
async function saveImage(query, value) {
  if (!valid(value)) return;
  try {
    const cache = await caches.open(CACHE), key = await cacheKey(query);
    await cache.delete(key);
    await cache.put(key, Response.json(value));
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - 24)).map(item => cache.delete(item)));
  } catch {}
}

export function createDiscoveryMedia({ request }) {
  const queue = [];
  let active = 0;
  function drain() {
    while (active < 3 && queue.length) {
      const task = queue.shift();
      if (task.signal.aborted) continue;
      active++;
      task.run().catch(() => {}).finally(() => { active--; drain(); });
    }
  }
  return function preview(place, signal, illustrationUrl = '') {
    const frame = node('div', '', 'discovery-preview');
    const art = node('div', '', 'discovery-art art-unavailable');
    const status = node('span', 'Finding location photo…');
    const credit = node('div', '', 'discovery-photo-credit');
    art.append(status); frame.append(art, credit);
    const current = () => !signal.aborted && frame.isConnected;
    async function show(value) {
      const image = node('img'); image.alt = value.synthetic ? `AI illustration of ${place.name}` : `Photo of ${place.name}`;
      image.width = 768; image.height = 512; image.decoding = 'async'; image.referrerPolicy = 'strict-origin-when-cross-origin';
      await new Promise((resolve, reject) => {
        const clean = () => { clearTimeout(timeout); signal.removeEventListener('abort', abort); image.onload = image.onerror = null; };
        const abort = () => { clean(); image.src = ''; reject(new DOMException('Cancelled', 'AbortError')); };
        const timeout = setTimeout(() => { clean(); image.src = ''; reject(Error('Photo took too long.')); }, 15000);
        signal.addEventListener('abort', abort, { once: true });
        image.onload = () => { clean(); resolve(); };
        image.onerror = () => { clean(); reject(Error('Photo unavailable.')); };
        image.src = value.imageUrl;
      });
      if (!current()) return;
      art.classList.remove('art-unavailable'); art.replaceChildren(image);
      credit.replaceChildren();
      if (value.synthetic) {
        credit.textContent = 'AI illustration · imagined view';
      } else {
        const map = node('a', 'Google Maps'); map.href = value.mapsUrl; map.target = '_blank'; map.rel = 'noopener noreferrer'; credit.append(map);
        for (const author of value.authors || []) {
          credit.append(document.createTextNode(' · '));
          const url = https(author.uri);
          const label = node(url ? 'a' : 'span', author.displayName || 'Photo contributor');
          if (url) { label.href = url; label.target = '_blank'; label.rel = 'noopener noreferrer'; }
          credit.append(label);
        }
      }
    }
    async function generate() {
      if (!current()) return;
      if (illustrationUrl && art.querySelector('img')) return;
      status.textContent = 'Creating location illustration…';
      const cached = await readImage(place.query);
      if (!current()) return;
      if (cached) { await show(cached); return; }
      const value = await request('/api/discovery/image', { query: place.query }, AbortSignal.any([signal, AbortSignal.timeout(130000)]));
      if (!current()) return;
      await show(value);
      await saveImage(place.query, value);
    }
    function retry(error) {
      if (!current()) return;
      if (art.querySelector('img')) return;
      status.textContent = 'Preview unavailable';
      const button = node('button', 'Retry image'); button.type = 'button';
      button.title = error.message;
      button.onclick = () => { art.replaceChildren(status); status.textContent = 'Finding location photo…'; queue.push({ signal, run }); drain(); };
      art.replaceChildren(status, button);
    }
    async function run() {
      try {
        if (!current()) return;
        const cached = await readImage(place.query);
        if (cached) await show(cached);
        else if (illustrationUrl) await show({ imageUrl: illustrationUrl, synthetic: true });
        if (!current()) return;
        const data = await request('/api/places/search', { textQuery: place.query }, AbortSignal.any([signal, AbortSignal.timeout(50000)]));
        if (!current()) return;
        const selected = data.places?.find(candidate => matches(place, candidate));
        const photo = selected?.photos?.find(item => /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/.test(item.name));
        const key = window.CrowMapKeys?.photoKey?.(data.photoKeySlot) || { primary: window.CROW_MAPS_KEY1 || window.CROW_MAPS_KEY, backup: window.CROW_MAPS_KEY2 || window.CROW_MAPS_FALLBACK_KEY, backup2: window.CROW_MAPS_KEY3 || window.CROW_MAPS_FALLBACK_KEY_2 }[data.photoKeySlot];
        if (photo && !key) throw Error('Location photo configuration is unavailable. Please try again.');
        if (photo && key) {
          try {
            await show({ imageUrl: `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=768&key=${encodeURIComponent(key)}`, mapsUrl: https(photo.googleMapsUri || selected.googleMapsUri) || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.query)}`, authors: photo.authorAttributions });
            return;
          } catch (error) { if (signal.aborted) return; }
        }
        await generate();
      } catch (error) { retry(error); }
    }
    queue.push({ signal, run }); queueMicrotask(drain);
    return frame;
  };
}
