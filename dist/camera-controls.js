(() => {
  const $ = id => document.getElementById(id);
  const toggle = $('camera-toggle'), panel = $('camera-panel');
  function reflect() {
    toggle.disabled = !window.CrowMap?.getContext().mapReady;
    if (toggle.disabled || panel.hidden) return;
    const view = window.CrowMap.getCameraView();
    $('camera-rotation').value = view.rotation;
    $('camera-tilt').value = view.tilt;
    $('camera-zoom').value = view.zoom * 100;
    $('camera-rotation-value').value = Math.round(view.rotation) + '°';
    $('camera-tilt-value').value = Math.round(view.tilt) + '°';
    for (const button of panel.querySelectorAll('[data-camera-view]')) {
      const preset = presets[button.dataset.cameraView];
      button.setAttribute('aria-pressed', String(view.rotation === preset.rotation && view.tilt === preset.tilt));
    }
  }
  function close(focus = false) {
    panel.hidden = true;
    $('camera-fine-tune').open = false;
    panel.scrollTop = 0;
    toggle.setAttribute('aria-expanded', 'false');
    if (focus) toggle.focus({ preventScroll: true });
  }
  toggle.onclick = () => {
    if (!panel.hidden) { close(); return; }
    window.dispatchEvent(new Event('crow:camera-open'));
    if (!$('companion').hidden) $('companion-toggle').click();
    $('nearby-close').click();
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    reflect();
    panel.querySelector('[data-camera-view][aria-pressed="true"]')?.focus({ preventScroll: true });
    if (!panel.contains(document.activeElement)) panel.querySelector('[data-camera-view]').focus({ preventScroll: true });
  };
  function update(value) {
    try { window.CrowMap.setCameraView(value); }
    catch (error) { $('hint').textContent = error.message; }
    reflect();
  }
  for (const key of ['rotation', 'tilt', 'zoom']) {
    $('camera-' + key).addEventListener('input', event => update({ [key]: Number(event.target.value) / (key === 'zoom' ? 100 : 1) }));
  }
  const presets = {
    behind: { rotation: 0, tilt: 65, zoom: 1 },
    side: { rotation: 90, tilt: 65, zoom: 1 },
    top: { rotation: 0, tilt: 0, zoom: 2 }
  };
  for (const button of panel.querySelectorAll('[data-camera-view]')) button.onclick = () => update(presets[button.dataset.cameraView]);
  $('camera-reset').onclick = () => update({ reset: true });
  $('camera-close').onclick = () => close(true);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); close(true); }
  });
  document.addEventListener('pointerdown', event => {
    if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) close();
  });
  for (const name of ['crow:text-chat-open', 'crow:steering-open']) window.addEventListener(name, () => close());
  for (const name of ['ready', 'context', 'camera']) document.addEventListener('crow:' + name, reflect);
  new MutationObserver(() => { if ($('panorama-dialog').open) close(); }).observe($('panorama-dialog'), { attributes: true, attributeFilter: ['open'] });
  reflect();
})();
