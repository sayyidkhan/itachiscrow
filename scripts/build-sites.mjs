import { readFile, writeFile, mkdir, readdir, cp, rm } from 'node:fs/promises';

// Adapt the existing API handler without changing the Node development server.
let core = await readFile('server/index.mjs', 'utf8');
core = core.slice(core.indexOf('const OPENAI_BASE'), core.indexOf('export function startServer'));
const staticStart = core.indexOf('const mime =');
const handlerStart = core.indexOf('export function createHandler');
if (staticStart < 0 || handlerStart < 0) throw Error('Server structure changed; review Sites adapter.');
core = core.slice(0, staticStart) + core.slice(handlerStart);
core = core.replaceAll('env = process.env', 'env = {}')
  .replace("distDir = resolve(ROOT, 'dist')", "distDir = ''")
  .replace('await serveStatic(req, res, distDir); return;', "throw new HttpError(404, 'not_found', 'Not found.');")
  .replaceAll('Buffer.from(chunk)', 'chunk')
  .replaceAll("Buffer.concat(chunks).toString('utf8')", 'decodeChunks(chunks)')
  .replaceAll('Buffer.byteLength(body)', 'new TextEncoder().encode(body).length')
  .replaceAll('Buffer.from(cookieState)', 'new TextEncoder().encode(cookieState)')
  .replaceAll('Buffer.from(suppliedState)', 'new TextEncoder().encode(suppliedState)');
if (/\b(?:Buffer|process|resolve|serveStatic)\b/.test(core)) throw Error('Unexpected Node dependency in API adapter.');
const helpers = `
function decodeChunks(chunks) { const data = new Uint8Array(chunks.reduce((n,c)=>n+c.length,0)); let offset=0; for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;} return new TextDecoder().decode(data); }
function randomBytes(n) { const data=crypto.getRandomValues(new Uint8Array(n)); return {toString(){return Array.from(data,b=>b.toString(16).padStart(2,'0')).join('')}}; }
function timingSafeEqual(a,b) { if(a.length!==b.length)return false; let diff=0; for(let i=0;i<a.length;i++)diff|=a[i]^b[i]; return diff===0; }
`;
await mkdir('dist/server', { recursive: true });
await rm('dist/client', { recursive: true, force: true });
await mkdir('dist/client', { recursive: true });
for (const entry of await readdir('dist')) {
  if (['client','server','.openai','config.js','config.example.js'].includes(entry)) continue;
  await cp(`dist/${entry}`, `dist/client/${entry}`, { recursive: true });
}
const adapter = await readFile('worker/adapter.mjs','utf8');
await writeFile('dist/server/index.js', helpers + core + '\n' + adapter);
await mkdir('dist/.openai', { recursive: true });
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
console.log('Built Sites Worker and browser assets.');
