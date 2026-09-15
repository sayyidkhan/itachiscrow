(() => {
  const $ = id => document.getElementById(id);
  const pad = $('crow-joystick'), knob = $('joystick-knob'), panel = $('steering-panel');
  const keys = new Set();
  let pointer = null, vector = [0, 0, 0], session = 0, running = false, pending = false, frame = 0, rollPending = false;
  function reset() {
    session++;
    const wasPending = pending, wasRunning = running;
    pending = false; running = false; vector = [0, 0, 0]; keys.clear();
    clearInterval(frame);
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
      };
      update();
      if (token === session && running) frame = setInterval(update, 100);
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
    reset(); if (rollPending) window.CrowMap?.pause(); panel.hidden = !panel.hidden;
    $('steering-toggle').setAttribute('aria-expanded', String(!panel.hidden));
    document.body.classList.toggle('steering-open', !panel.hidden);
    if (!panel.hidden) {
      window.dispatchEvent(new Event('crow:steering-open'));
      (pad.disabled ? $('steering-liftoff') : pad).focus({ preventScroll: true });
    }
  };
  function reflect() {
    const state = window.CrowMap?.getContext(), ready = Boolean(state?.mapReady);
    const perched = state?.mode === 'landed', takingOff = state?.mode === 'taking-off';
    pad.disabled = !ready || perched || takingOff; $('steering-toggle').disabled = !ready;
    $('steering-liftoff').hidden = !perched && !takingOff;
    $('steering-liftoff').disabled = !ready;
    $('steering-liftoff').textContent = takingOff ? 'Stop lift off' : 'Lift off';
    $('steering-help').textContent = perched ? 'Lift off to start steering' : takingOff ? 'Spreading wings and climbing…' : 'Drag to steer · Release to hover';
    $('steering-roll').disabled = !ready || perched || takingOff || rollPending || state.rolling;
    $('steering-speed').disabled = !ready;
    const speed = state?.steeringSpeed || 1;
    $('steering-speed-value').textContent = speed + '×';
    $('steering-speed').dataset.speed = speed;
    $('steering-speed').setAttribute('aria-label', `Flight speed ${speed}×. Change to ${speed % 3 + 1}×`);
  }
  for (const id of ['steering-roll', 'steering-speed']) {
    const button = $(id);
    let actionPointer = null, suppressClickUntil = 0;
    button.addEventListener('pointerdown', event => {
      if (pointer === null || button.disabled) return;
      event.preventDefault(); actionPointer = event.pointerId;
      button.setPointerCapture(actionPointer);
    });
    button.addEventListener('pointerup', event => {
      if (event.pointerId !== actionPointer) return;
      event.preventDefault(); actionPointer = null;
      const rect = button.getBoundingClientRect();
      suppressClickUntil = performance.now() + 500;
      if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) button.click();
    });
    for (const name of ['pointercancel', 'lostpointercapture']) button.addEventListener(name, () => { actionPointer = null; });
    button.addEventListener('click', event => {
      if (event.isTrusted && performance.now() < suppressClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
    }, true);
  }
  $('steering-speed').onclick = () => window.CrowMap.setSteeringSpeed(window.CrowMap.getContext().steeringSpeed % 3 + 1);
  $('steering-liftoff').onclick = async () => {
    const stopping = window.CrowMap.getContext().mode === 'taking-off';
    window.dispatchEvent(new Event('crow:manual-control'));
    try {
      if (stopping) window.CrowMap.pause();
      else await window.CrowMap.takeOff();
    } catch (error) { $('hint').textContent = error.message; }
  };
  $('steering-roll').onclick = async () => {
    rollPending = true; reflect();
    if (!running) window.dispatchEvent(new Event('crow:manual-control'));
    try { await window.CrowMap.roll(); }
    catch (error) { $('hint').textContent = error.message; }
    finally { rollPending = false; reflect(); }
  };
  for (const name of ['ready', 'context', 'destination']) document.addEventListener('crow:' + name, reflect);
  function closePanel() {
    reset(); panel.hidden = true;
    if (rollPending) window.CrowMap?.pause();
    $('steering-toggle').setAttribute('aria-expanded', 'false');
    document.body.classList.remove('steering-open');
  }
  document.addEventListener('crow:destination', closePanel);
  window.addEventListener('crow:text-chat-open', closePanel);
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
