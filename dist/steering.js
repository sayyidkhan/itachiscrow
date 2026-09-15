(() => {
  const $ = id => document.getElementById(id);
  const pad = $('crow-joystick'), knob = $('joystick-knob'), panel = $('steering-panel');
  const keys = new Set();
  let pointer = null, vector = [0, 0, 0], session = 0, running = false, pending = false, frame = 0;
  function reset() {
    session++;
    const wasPending = pending, wasRunning = running;
    pending = false; running = false; vector = [0, 0, 0]; keys.clear();
    cancelAnimationFrame(frame);
    const captured = pointer; pointer = null;
    if (captured !== null && pad.hasPointerCapture(captured)) pad.releasePointerCapture(captured);
    knob.style.transform = '';
    if (wasPending) window.CrowMap?.pause();
    else if (wasRunning) window.CrowMap?.endSteering();
  }
  async function drive() {
    if (running || pending || !vector.some(Boolean)) return;
    const token = ++session;
    pending = true;
    window.dispatchEvent(new Event('crow:manual-control'));
    try {
      const result = await window.CrowMap.beginSteering();
      if (token !== session) return;
      pending = false;
      if (result?.cancelled) { reset(); return; }
      running = true;
      const update = () => {
        if (token !== session) return;
        if (!window.CrowMap.getContext().steering) { reset(); return; }
        window.CrowMap.steer(...vector);
        frame = requestAnimationFrame(update);
      };
      update();
    } catch (error) {
      if (token === session) { reset(); $('hint').textContent = error.message; }
    }
  }
  function move(event) {
    const rect = pad.getBoundingClientRect(), radius = rect.width * .32;
    let x = (event.clientX - rect.left - rect.width / 2) / radius;
    let y = (event.clientY - rect.top - rect.height / 2) / radius;
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) { x /= magnitude; y /= magnitude; }
    if (magnitude < .14) { x = 0; y = 0; }
    vector = [x, -y, 0];
    knob.style.transform = `translate(${x * radius}px, ${y * radius}px)`;
    if (vector.some(Boolean)) drive();
  }
  pad.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== null || pad.disabled) return;
    event.preventDefault(); reset(); pointer = event.pointerId;
    pad.setPointerCapture(pointer); pad.focus({ preventScroll: true }); move(event);
  });
  pad.addEventListener('pointermove', event => { if (event.pointerId === pointer) move(event); });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    pad.addEventListener(name, event => { if (event.pointerId === pointer) reset(); });
  }
  const keyVector = () => {
    vector = [Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')), Number(keys.has('ArrowUp')) - Number(keys.has('ArrowDown')), Number(keys.has('PageUp')) - Number(keys.has('PageDown'))];
    knob.style.transform = `translate(${vector[0] * 26}px, ${-vector[1] * 26}px)`;
    if (vector.some(Boolean)) drive(); else reset();
  };
  pad.addEventListener('keydown', event => {
    if (event.key === 'Escape' || event.key === ' ') { event.preventDefault(); reset(); return; }
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown'].includes(event.key)) return;
    event.preventDefault(); keys.add(event.key); keyVector();
  });
  pad.addEventListener('keyup', event => { if (keys.delete(event.key)) { event.preventDefault(); keyVector(); } });
  pad.addEventListener('blur', reset);
  $('steering-toggle').onclick = () => {
    reset(); panel.hidden = !panel.hidden;
    $('steering-toggle').setAttribute('aria-expanded', String(!panel.hidden));
    document.body.classList.toggle('steering-open', !panel.hidden);
    if (!panel.hidden) pad.focus({ preventScroll: true });
  };
  function reflect() {
    const ready = Boolean(window.CrowMap?.getContext().mapReady);
    pad.disabled = !ready; $('steering-toggle').disabled = !ready;
  }
  for (const name of ['ready', 'context', 'destination']) document.addEventListener('crow:' + name, reflect);
  function closePanel() {
    reset(); panel.hidden = true;
    $('steering-toggle').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('steering-open');
  }
  document.addEventListener('crow:destination', closePanel);
  document.addEventListener('crow:landed', closePanel);
  $('nearby').addEventListener('click', closePanel);
  window.addEventListener('blur', reset);
  window.addEventListener('crow:remote-control', reset);
  window.addEventListener('pagehide', reset);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  new MutationObserver(() => {
    if (!panel.getClientRects().length) reset();
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  reflect();
})();
