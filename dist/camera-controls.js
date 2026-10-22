(() => {
  const $ = id => document.getElementById(id);
  const toggle = $('camera-toggle'), panel = $('camera-panel'), pad = $('camera-pad');
  let pointer = null, shown = false;
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const wrap = angle => ((angle + 180) % 360 + 360) % 360 - 180;
  function release() {
    const id = pointer?.id;
    pointer = null;
    pad.classList.remove('dragging');
    if (id !== undefined && pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
  }
  function reflect() {
    const ready = Boolean(window.CrowMap?.getContext().mapReady);
    toggle.disabled = !ready;
    if (!ready) { release(); panel.hidden = true; }
    else if (!shown) { shown = true; panel.hidden = false; }
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (!ready) return;
    const view = window.CrowMap.getCameraView();
    $('camera-zoom-in').disabled = view.zoom <= .4;
    $('camera-zoom-out').disabled = view.zoom >= 4;
  }
  function close(focus = false) {
    release(); panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (focus) toggle.focus({ preventScroll: true });
  }
  function update(value) {
    try { window.CrowMap.setCameraView(value, { animate: true }); }
    catch (error) { $('hint').textContent = error.message; }
    reflect();
  }
  function nudge(rotation = 0, tilt = 0) {
    const view = window.CrowMap.getCameraView();
    update({ rotation: wrap(view.rotation + rotation), tilt: clamp(view.tilt + tilt, 0, 85) });
  }
  function zoom(factor) {
    update({ zoom: clamp(window.CrowMap.getCameraView().zoom * factor, .4, 4) });
  }
  function findCrow() {
    try {
      window.CrowMap.followCrow({ preserveView: true });
    } catch (error) { $('hint').textContent = error.message; }
  }
  toggle.onclick = () => {
    if (!panel.hidden) { close(); return; }
    if (!$('companion').hidden) $('companion-toggle').click();
    $('nearby-close').click();
    panel.hidden = false;
    reflect(); pad.focus({ preventScroll: true });
  };
  pad.addEventListener('pointerdown', event => {
    if (pointer || event.button !== 0) return;
    event.preventDefault();
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, view: window.CrowMap.getCameraView(), moved: false };
    pad.setPointerCapture(event.pointerId);
    pad.classList.add('dragging');
    if (!window.CrowMap.getContext().steering) pad.focus({ preventScroll: true });
  });
  pad.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer?.id) return;
    const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
    if (!pointer.moved && Math.hypot(dx, dy) < 4) return;
    pointer.moved = true;
    update({ rotation: wrap(pointer.view.rotation + dx * .7), tilt: clamp(pointer.view.tilt + dy * .5, 0, 85) });
  });
  pad.addEventListener('pointerup', event => {
    if (event.pointerId !== pointer?.id) return;
    const moved = pointer.moved, rect = pad.getBoundingClientRect();
    release();
    if (moved) return;
    const x = (event.clientX - rect.left) / rect.width - .5, y = (event.clientY - rect.top) / rect.height - .5;
    if (Math.max(Math.abs(x), Math.abs(y)) < .18) return;
    if (Math.abs(x) > Math.abs(y)) nudge(Math.sign(x) * 15);
    else nudge(0, Math.sign(y) * 10);
  });
  for (const name of ['pointercancel', 'lostpointercapture', 'blur']) pad.addEventListener(name, release);
  pad.addEventListener('keydown', event => {
    const actions = { ArrowLeft: () => nudge(-15), ArrowRight: () => nudge(15), ArrowUp: () => nudge(0, -10), ArrowDown: () => nudge(0, 10), '+': () => zoom(1 / 1.2), '=': () => zoom(1 / 1.2), '-': () => zoom(1.2), Home: findCrow };
    if (!actions[event.key]) return;
    event.preventDefault(); event.stopPropagation(); actions[event.key]();
  });
  $('camera-zoom-in').onclick = () => zoom(1 / 1.2);
  $('camera-zoom-out').onclick = () => zoom(1.2);
  for (const id of ['camera-zoom-in', 'camera-zoom-out']) {
    const button = $(id);
    let actionPointer = null, suppressClickUntil = 0;
    button.addEventListener('pointerdown', event => {
      if (button.disabled || !window.CrowMap.getContext().steering) return;
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
  $('camera-reset').onclick = findCrow;
  $('camera-close').onclick = () => close(true);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(true); }
  });
  window.addEventListener('blur', release);
  window.addEventListener('pagehide', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  window.addEventListener('crow:text-chat-open', () => close());
  for (const name of ['ready', 'context', 'camera']) document.addEventListener('crow:' + name, reflect);
  new MutationObserver(() => { if ($('panorama-dialog').open) close(); }).observe($('panorama-dialog'), { attributes: true, attributeFilter: ['open'] });
  reflect();
})();
