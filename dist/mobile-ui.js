(() => {
  const mobile = matchMedia('(max-width: 760px)');
  const companion = document.getElementById('companion');
  const toggle = document.getElementById('companion-toggle');
  const navigation = document.querySelector('.header-actions');
  const menu = document.createElement('button');
  menu.id = 'mobile-menu';
  menu.type = 'button';
  menu.textContent = '•••';
  menu.setAttribute('aria-label', 'More options');
  menu.setAttribute('aria-expanded', 'false');
  navigation.id = 'explorer-options';
  menu.setAttribute('aria-controls', navigation.id);
  navigation.before(menu);
  toggle.setAttribute('aria-controls', 'companion-content');
  companion.querySelector('.companion-body').id = 'companion-content';

  function closeMenu() {
    document.body.classList.remove('mobile-menu-open');
    menu.setAttribute('aria-expanded', 'false');
  }
  menu.onclick = () => {
    const open = document.body.classList.toggle('mobile-menu-open');
    menu.setAttribute('aria-expanded', String(open));
  };
  navigation.addEventListener('click', event => {
    if (event.target.closest('button, a')) closeMenu();
  });
  document.addEventListener('pointerdown', event => {
    if (!navigation.contains(event.target) && !menu.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('mobile-menu-open')) {
      closeMenu();
      menu.focus();
    }
  });

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
  new ResizeObserver(() => {
    document.body.style.setProperty('--mobile-dock-height', `${companion.getBoundingClientRect().height}px`);
  }).observe(companion);
  function viewport() {
    const view = window.visualViewport;
    document.body.style.setProperty('--mobile-viewport-height', `${view?.height || innerHeight}px`);
    document.body.style.setProperty('--mobile-viewport-top', `${view?.offsetTop || 0}px`);
  }
  window.visualViewport?.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('scroll', viewport);
  window.addEventListener('resize', viewport);
  mobile.addEventListener('change', () => { closeMenu(); updateToggle(); });
  viewport();
  updateToggle();
})();
