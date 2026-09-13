import { recolourGLB, DEFAULT_DESIGN } from './crow-design.js';

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const prefix = new URL('crow-colours/', self.registration.scope).href;
  if (!event.request.url.startsWith(prefix) || event.request.method !== 'GET') return;
  const match = event.request.url.slice(prefix.length).match(/^([a-f0-9]{6}(?:-[a-f0-9]{6}){3})\/(body|left-wing|right-wing)\.glb$/);
  if (!match) { event.respondWith(new Response('Unknown crow design', { status: 404 })); return; }
  event.respondWith((async () => {
    const source = await fetch(new URL(`models/${match[2]}.glb`, self.registration.scope), { cache: 'no-cache' });
    if (!source.ok) return source;
    const colours = match[1].split('-');
    const design = Object.fromEntries(Object.keys(DEFAULT_DESIGN).map((key, index) => [key, '#' + colours[index]]));
    return new Response(recolourGLB(await source.arrayBuffer(), design), {
      headers: { 'Content-Type': 'model/gltf-binary', 'Cache-Control': 'no-store' },
    });
  })().catch(() => new Response('Crow colour generation failed', { status: 503 })));
});
