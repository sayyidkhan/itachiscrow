import { illustration } from './discovery.js?v=4';

(() => {
  const $ = id => document.getElementById(id);
  function reflect() {
    const state = window.CrowMap?.getContext();
    for (const id of ['free-roam', 'land-map', 'circle-map']) $(id).disabled = !state?.mapReady;
    $('circle-map').setAttribute('aria-pressed', String(state?.mode === 'circling'));
    $('circle-map').textContent = state?.mode === 'circling' ? 'Stop circle' : 'Circle';
    $('circle-map').setAttribute('aria-label', state?.mode === 'circling' ? 'Stop circling landmark' : `Circle ${state?.spot?.name || state?.destination?.name || 'landmark'}`);
    $('free-roam').setAttribute('aria-pressed', String(Boolean(state?.freeRoaming)));
    $('free-roam').textContent = state?.freeRoaming ? 'Follow crow' : 'Free roam';
    $('land-map').setAttribute('aria-pressed', String(Boolean(state?.landingMode)));
    $('land-map').textContent = state?.landingMode ? 'Cancel land' : 'Land here';
    $('nearby').setAttribute('aria-expanded', String(!$('nearby-panel').hidden));
  }
  $('free-roam').onclick = () => {
    try {
      if (window.CrowMap.getContext().freeRoaming) window.CrowMap.followCrow();
      else window.CrowMap.freeRoam();
    } catch (error) { $('hint').textContent = error.message; }
  };
  $('land-map').onclick = () => {
    try {
      if (window.CrowMap.getContext().landingMode) window.CrowMap.cancelLandingMode();
      else window.CrowMap.selectLandingMode();
    } catch (error) { $('hint').textContent = error.message; }
  };
  $('circle-map').onclick = async () => {
    const state = window.CrowMap.getContext();
    window.dispatchEvent(new Event('crow:remote-control'));
    window.dispatchEvent(new Event('crow:manual-control'));
    try {
      if (state.mode === 'circling') window.CrowMap.pause();
      else await window.CrowMap.circleAround(state.spot || state.destination);
    } catch (error) { $('hint').textContent = error.message; }
  };
  $('nearby-close').onclick = () => {
    $('nearby-panel').hidden = true;
    $('nearby').focus({ preventScroll: true });
  };
  function scroll(direction) {
    $('places').scrollBy({ left: direction * $('places').clientWidth * .8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  $('nearby-prev').onclick = () => scroll(-1);
  $('nearby-next').onclick = () => scroll(1);
  $('places').addEventListener('keydown', event => {
    if (event.target !== $('places') || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); scroll(event.key === 'ArrowRight' ? 1 : -1);
  });
  $('nearby-panel').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.stopPropagation(); $('nearby-close').click(); }
  });
  for (const name of ['ready', 'context', 'destination', 'landed']) document.addEventListener('crow:' + name, reflect);
  new MutationObserver(reflect).observe($('nearby-panel'), { attributes: true, attributeFilter: ['hidden'] });
  function illustrateMissingPhotos() {
    for (const art of $('places').querySelectorAll('.nearby-art')) {
      if (art.querySelector('img, svg, .discovery-art')) continue;
      const type = art.closest('.nearby-card').querySelector('small').textContent.toLowerCase();
      const theme = /park|garden/.test(type) ? 'gardens' : /museum|gallery|art/.test(type) ? 'arts' : /cafe|coffee|restaurant|food/.test(type) ? 'cafe' : 'city';
      const label = document.createElement('span');
      label.className = 'nearby-illustration-label'; label.textContent = 'Illustration';
      art.replaceChildren(illustration(theme), label);
    }
  }
  new MutationObserver(illustrateMissingPhotos).observe($('places'), { childList: true, subtree: true });
  illustrateMissingPhotos();
  reflect();
})();
