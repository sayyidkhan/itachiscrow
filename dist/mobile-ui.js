(() => {
  const mobile = matchMedia('(max-width: 760px)');
  const companion = document.getElementById('companion');
  const toggle = document.getElementById('companion-toggle');
  toggle.setAttribute('aria-controls', 'companion-content');
  companion.querySelector('.companion-body').id = 'companion-content';

  function updateToggle() {
    const expanded = mobile.matches ? companion.classList.contains('mobile-expanded') : !companion.classList.contains('compact');
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', expanded ? 'Collapse conversation' : 'Expand conversation');
    toggle.textContent = expanded ? '−' : '+';
  }
  toggle.onclick = () => {
    companion.classList.toggle(mobile.matches ? 'mobile-expanded' : 'compact');
    updateToggle();
  };
  document.getElementById('chat-form').addEventListener('submit', () => {
    if (!mobile.matches) return;
    companion.classList.add('mobile-expanded');
    document.getElementById('chat-input').blur();
    updateToggle();
  });
  window.addEventListener('crow:chat-message', event => {
    if (event.detail.role !== 'user') return;
    if (mobile.matches) companion.classList.add('mobile-expanded');
    else companion.classList.remove('compact');
    updateToggle();
  });
  const input = document.getElementById('chat-input');
  function sizeInput() {
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  }
  input.addEventListener('input', sizeInput);
  sizeInput();
  new ResizeObserver(() => {
    document.body.style.setProperty('--mobile-dock-height', `${companion.getBoundingClientRect().height}px`);
  }).observe(companion);
  function viewport() {
    const view = window.visualViewport;
    document.body.classList.toggle('compact-viewport', (view?.height || innerHeight) < 500);
    document.body.style.setProperty('--mobile-viewport-height', `${view?.height || innerHeight}px`);
    document.body.style.setProperty('--mobile-viewport-top', `${view?.offsetTop || 0}px`);
  }
  window.visualViewport?.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('scroll', viewport);
  window.addEventListener('resize', viewport);
  mobile.addEventListener('change', updateToggle);
  viewport();
  updateToggle();
})();
