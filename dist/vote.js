(() => {
  const button = document.getElementById('project-vote');
  if (!button) return;
  const storageKey = 'crow:vote-prompt:v1';
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(storageKey)); } catch {}
  let flights = Number.isSafeInteger(saved?.flights) && saved.flights >= 0 ? saved.flights : 0;
  let lastShown = Number.isFinite(saved?.lastShown) ? saved.lastShown : 0;
  let opened = saved?.opened === true;
  let activeFlight = false;
  let timer;
  function save() {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ flights, lastShown, opened })); } catch {}
  }
  function hide() {
    clearTimeout(timer);
    button.classList.remove('vote-shimmer');
    button.hidden = true;
  }
  button.addEventListener('click', () => {
    opened = true;
    save();
    setTimeout(hide, 0);
  });
  if (!document.body.classList.contains('explorer')) return;
  document.addEventListener('crow:destination', ({ detail }) => {
    if (detail?.mode === 'arriving') {
      activeFlight = true;
      hide();
    }
  });
  document.addEventListener('crow:flight', ({ detail }) => {
    if (detail?.cancelled) {
      activeFlight = false;
      hide();
      return;
    }
    if (detail?.stage && !detail.arrived) {
      activeFlight = true;
      hide();
      return;
    }
    if (!detail?.arrived || !activeFlight) return;
    activeFlight = false;
    flights++;
    const now = Date.now();
    const show = !opened && (flights - 1) % 3 === 0 && (!lastShown || now - lastShown >= 120_000) && !document.hidden;
    if (show) {
      lastShown = now;
      button.hidden = false;
      button.classList.add('vote-shimmer');
      timer = setTimeout(() => {
        if (!button.matches(':hover, :focus-within')) hide();
      }, 15_000);
    }
    save();
  });
  for (const event of ['pointerleave', 'blur']) button.addEventListener(event, () => {
    if (Date.now() - lastShown >= 15_000) hide();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  window.addEventListener('pagehide', hide);
})();
