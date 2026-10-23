const commands = ['adjust', 'set', 'behind', 'side', 'front', 'above', 'find_crow', 'reset', 'status'];
const bounds = { rotation: [-180, 180], tilt: [-85, 85], zoom: [.1, 10] };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const wrap = value => ((value + 180) % 360 + 360) % 360 - 180;

export function validateCameraAction(args) {
  if (Object.keys(args).some(key => !['command', 'rotation', 'tilt', 'zoom'].includes(key))) throw Error('Unexpected camera arguments.');
  if (!commands.includes(args.command)) throw Error('Unsupported camera control.');
  const clean = { command: args.command };
  for (const [key, [min, max]] of Object.entries(bounds)) {
    const value = args[key] ?? null;
    if (value !== null && (!Number.isFinite(value) || value < min || value > max)) throw Error('Choose a valid camera ' + key + '.');
    if (args.command === 'set' && value !== null && ((key === 'tilt' && value < 0) || (key === 'zoom' && (value < .4 || value > 4)))) throw Error('Choose a valid camera ' + key + '.');
    if (!['adjust', 'set'].includes(args.command) && value !== null) throw Error('Camera presets do not accept adjustments.');
    clean[key] = value;
  }
  if (['adjust', 'set'].includes(args.command) && Object.keys(bounds).every(key => clean[key] === null)) throw Error('Choose a camera adjustment.');
  return clean;
}

export function controlCamera(map, raw) {
  const args = validateCameraAction(raw);
  if (!map?.getContext().mapReady) throw Error('Wait for the map to finish loading.');
  const view = map.getCameraView();
  if (args.command === 'find_crow') map.followCrow({ preserveView: true });
  else if (args.command !== 'status') {
    let next;
    if (args.command === 'adjust') next = {
      rotation: wrap(view.rotation + (args.rotation ?? 0)),
      tilt: clamp(view.tilt + (args.tilt ?? 0), 0, 85),
      zoom: clamp(view.zoom * (args.zoom ?? 1), .4, 4),
    };
    else if (args.command === 'set') next = Object.fromEntries(Object.keys(bounds).filter(key => args[key] !== null).map(key => [key, args[key]]));
    else next = {
      behind: { rotation: 0, tilt: 65 },
      side: { rotation: 90, tilt: 65 },
      front: { rotation: -180, tilt: 65 },
      above: { rotation: view.rotation, tilt: 0 },
      reset: { rotation: 0, tilt: 65, zoom: 1 },
    }[args.command];
    map.setCameraView(next, { animate: true });
  }
  return {
    status: args.command === 'status' ? 'current' : 'completed', command: args.command,
    camera: map.getCameraView(), freeRoaming: map.getContext().freeRoaming,
    ...(args.command === 'find_crow' ? { summary: 'Recentering on the crow while keeping the currently rendered angle and zoom.' } : {}),
  };
}
