import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_DESIGN, MATERIAL_FIELDS, STORAGE_KEY, readDesign, normaliseDesign, linearColour, enableCustomModels, designToken, isDefault } from './crow-design.js';

const $ = id => document.getElementById(id);
let design = readDesign(), dirty = false, parts = [], flap = false, phase = 0, pose = 'perched';
const presets = {
  original: DEFAULT_DESIGN,
  moon: { body: '#c4ccd2', feathers: '#849aaa', coverts: '#e0e2df', eyes: '#edb951' },
  ember: { body: '#482c30', feathers: '#a74732', coverts: '#ce7851', eyes: '#ffcb48' },
  indigo: { body: '#30385c', feathers: '#565398', coverts: '#7c80b0', eyes: '#8ee8d6' },
};
const tell = (message, error = false) => { $('save-status').textContent = message; $('save-status').classList.toggle('error', error); };
function updateColours(markDirty = true) {
  for (const [key, value] of Object.entries(design)) {
    $(key).value = value;
    document.querySelector(`output[for="${key}"]`).value = value;
  }
  for (const part of parts) part.traverse(node => {
    if (!node.isMesh) return;
    const field = MATERIAL_FIELDS[node.material.name];
    if (!field) return;
    node.material.color.copy(node.userData.originalColour);
    if (design[field] !== DEFAULT_DESIGN[field]) node.material.color.setRGB(...linearColour(design[field]));
  });
  if (markDirty) { dirty = true; tell('Preview updated. Save to use these colours in flight.'); }
}
updateColours(false);
for (const key of Object.keys(DEFAULT_DESIGN)) $(key).addEventListener('input', () => { design[key] = $(key).value; updateColours(); });
document.querySelectorAll('[data-preset]').forEach(button => {
  button.disabled = true;
  button.onclick = () => { design = { ...presets[button.dataset.preset] }; updateColours(); };
});
$('restore').onclick = () => { design = { ...DEFAULT_DESIGN }; updateColours(); };
$('save').onclick = async () => {
  const snapshot = normaliseDesign(design);
  $('save').disabled = true;
  tell('Saving your crow…');
  try {
    if (!isDefault(snapshot)) {
      await enableCustomModels();
      const base = new URL(`crow-colours/${designToken(snapshot)}/`, document.baseURI);
      await Promise.all(['body', 'left-wing', 'right-wing'].map(async name => {
        const response = await fetch(new URL(name + '.glb', base), { signal: AbortSignal.timeout(15000) });
        if (!response.ok || new DataView(await response.arrayBuffer()).getUint32(0, true) !== 0x46546c67) throw Error('Could not prepare flight colours. Please try again.');
      }));
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    dirty = designToken(snapshot) !== designToken(design);
    tell(dirty ? 'Saved. Your latest preview changes still need saving.' : 'Saved ✓ Return to the map to fly with your crow.');
  } catch (error) {
    tell(error.name === 'QuotaExceededError' || error.name === 'SecurityError' ? 'Browser storage is unavailable. Allow site storage, then save again.' : error.message, true);
  } finally { $('save').disabled = false; }
};
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

async function init() {
  const container = $('viewport');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.domElement.setAttribute('aria-label', 'Rotatable 3D crow preview');
  container.append(renderer.domElement);
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); $('loading').hidden = false; $('loading').textContent = 'The 3D preview paused. Reload this page to restore it.';
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xc2d9f3, 0x615347, 1.8));
  for (const [colour, intensity, position] of [[0xffead4, 1.8, [3, 5, 4]], [0x9dbfff, 1.3, [-4, 2, -2]], [0xffffff, 1, [0, 1, -5]]]) {
    const light = new THREE.DirectionalLight(colour, intensity); light.position.set(...position); scene.add(light);
  }
  const camera = new THREE.PerspectiveCamera(38, 1, .01, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.enableDamping = true; controls.minDistance = 1.1; controls.maxDistance = 14;
  const crow = new THREE.Group();
  crow.rotation.x = -Math.PI / 2;
  scene.add(crow);
  const loader = new GLTFLoader();
  parts = await Promise.all(['body', 'left-wing', 'right-wing', 'perched'].map(async name => {
    const gltf = await loader.loadAsync(new URL(`models/${name}.glb`, document.baseURI).href);
    gltf.scene.traverse(node => { if (node.isMesh) node.userData.originalColour = node.material.color.clone(); });
    crow.add(gltf.scene); return gltf.scene;
  }));
  updateColours(false);
  const perch = new THREE.Mesh(new THREE.CylinderGeometry(.09, .11, 1.35, 16), new THREE.MeshStandardMaterial({ color: 0x64584b, roughness: .95 }));
  perch.rotation.z = Math.PI / 2; perch.position.set(0, -.075, -.21); scene.add(perch);
  let view = 'portrait';
  function setView(name) {
    view = name;
    const narrow = container.clientWidth < 550;
    controls.target.set(0, 0, 0);
    if (pose === 'perched') {
      controls.target.set(0, 1.05, .05);
      if (name === 'eyes') { controls.target.set(0, 1.86, -.30); camera.position.set(1.25, 2.08, -1.15); }
      else if (name === 'top') { controls.target.set(0, 1.08, .17); camera.position.set(3.0, 2.8, 2.0); }
      else if (name === 'side') camera.position.set(4.1, 1.7, -.15);
      else camera.position.set(narrow ? 4.6 : 3.8, 2.0, narrow ? -2.6 : -2.15);
    }
    else if (name === 'eyes') { camera.position.set(1.4, .8, -2.6); controls.target.set(0, .12, -.95); }
    else if (name === 'top') camera.position.set(0, narrow ? 10 : 8, .01);
    else if (name === 'side') camera.position.set(narrow ? 8 : 6, 1.3, -1.6);
    else camera.position.set(narrow ? 4.4 : 3.5, narrow ? 3 : 2.6, narrow ? -6.4 : -5.5);
    controls.update();
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
  }
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => setView(button.dataset.view));
  function setPose(name) {
    pose = name;
    parts.forEach((part, index) => { part.visible = name === 'perched' ? index === 3 : index < 3; });
    perch.visible = name === 'perched';
    if (name === 'perched') flap = false;
    $('wingbeats').setAttribute('aria-pressed', String(flap));
    $('wingbeats').querySelector('span').textContent = flap ? 'on' : 'off';
    document.querySelectorAll('[data-pose]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.pose === name)));
    document.body.dataset.pose = name;
    setView(view);
  }
  document.querySelectorAll('[data-pose]').forEach(button => button.onclick = () => setPose(button.dataset.pose));
  setPose('perched');
  const zoom = factor => { camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target); controls.update(); };
  $('zoom-in').onclick = () => zoom(.8); $('zoom-out').onclick = () => zoom(1.25);
  $('wingbeats').onclick = () => {
    if (pose === 'perched') setPose('flight');
    flap = !flap; $('wingbeats').setAttribute('aria-pressed', String(flap)); $('wingbeats').querySelector('span').textContent = flap ? 'on' : 'off';
  };
  let lastWidth = 0;
  const resize = () => {
    const width = container.clientWidth, height = container.clientHeight;
    renderer.setSize(width, height); camera.aspect = width / height; camera.updateProjectionMatrix();
    if ((lastWidth < 550) !== (width < 550)) setView(view);
    lastWidth = width;
  };
  new ResizeObserver(resize).observe(container); resize(); setView('portrait');
  let previous = 0;
  renderer.setAnimationLoop(time => {
    if (document.hidden) { previous = time; return; }
    if (time - previous < 1000 / 30) return;
    const dt = Math.min((time - previous) / 1000, .1); previous = time;
    if (flap) phase += dt;
    const cycle = phase % 3.8;
    const envelope = cycle < 2.6 ? Math.min(1, cycle / .25, (2.6 - cycle) / .3) : 0;
    const angle = flap ? (8 + envelope * 32 * Math.sin(phase * Math.PI * 2 * 1.6)) * Math.PI / 180 : 0;
    parts[1].rotation.y = angle; parts[2].rotation.y = -angle;
    controls.update(dt); renderer.render(scene, camera);
  });
  $('loading').hidden = true; $('colours').disabled = false; $('save').disabled = false; $('restore').disabled = false;
  document.querySelectorAll('[data-pose], [data-view], #wingbeats').forEach(button => button.disabled = false);
  document.querySelectorAll('[data-preset]').forEach(button => button.disabled = false);
  document.body.dataset.ready = 'true';
}
init().catch(() => {
  $('loading').hidden = false;
  $('loading').textContent = 'The 3D crow could not load. Check your connection and enable browser graphics, then reload.';
});
