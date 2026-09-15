(() => {
  function install() {
    const host = document.querySelector('[data-crow-navigation]');
    if (!host) return;
    const current = location.pathname.split('/').pop() || 'index.html';
    const pages = [['explore.html', 'Map'], ['customise.html', 'Author Studio'], ['crow-studio.html', 'Crow colours'], ['usage-limits.html', 'Usage limits']];
    const tools = [['debug', 'Debug tools', 'scout-open'], ['music', 'Music', 'music-open'], ['about', 'About', 'info']];
    const link = (file, label, extra = '') => `<a href="${file}" ${extra}${file === current ? ' aria-current="page"' : ''}><span>${label}</span><span aria-hidden="true">${file === current ? '✓' : file === 'index.html' ? '←' : '↗'}</span></a>`;
    host.classList.add('crow-navigation');
    host.innerHTML = `<button class="crow-menu-toggle" type="button" aria-label="More options" aria-expanded="false" aria-controls="crow-navigation-links">•••</button><nav id="crow-navigation-links" aria-label="Main navigation" hidden>${pages.map(([file, label]) => link(file, label)).join('')}<div class="crow-menu-tools">${tools.map(([action, label]) => link(`explore.html#${action}`, label, `data-map-tool="${action}"`)).join('')}</div>${link('index.html', 'Back to home', 'class="crow-menu-home"')}</nav>`;
    const toggle = host.querySelector('button');
    const navigation = host.querySelector('nav');
    const scene = document.getElementById('scene-open');
    if (scene) navigation.querySelector('.crow-menu-tools').append(scene);
    function close(focus = false) {
      navigation.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (focus) toggle.focus();
    }
    function activate(action) {
      const id = tools.find(([name]) => name === action)?.[2];
      const target = id && document.getElementById(id);
      if (!target) return false;
      target.click();
      return true;
    }
    toggle.onclick = () => {
      navigation.hidden = !navigation.hidden;
      toggle.setAttribute('aria-expanded', String(!navigation.hidden));
    };
    navigation.addEventListener('click', event => {
      const target = event.target.closest('a, button');
      if (!target) return;
      close(Boolean(target.dataset.mapTool));
      if (target.dataset.mapTool && activate(target.dataset.mapTool)) event.preventDefault();
    });
    document.addEventListener('pointerdown', event => { if (!host.contains(event.target)) close(); });
    document.addEventListener('focusin', event => { if (!host.contains(event.target)) close(); });
    host.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !navigation.hidden) { event.preventDefault(); close(true); }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      navigation.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      const items = [...navigation.querySelectorAll('a, button')].filter(item => !item.hidden);
      const index = items.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
      items[next].focus();
    });
    function openLinkedTool() {
      if (current === 'explore.html' && activate(location.hash.slice(1))) history.replaceState(null, '', location.pathname + location.search);
    }
    window.addEventListener('hashchange', openLinkedTool);
    window.addEventListener('pageshow', () => close());
    openLinkedTool();
  }
  if (document.readyState !== 'complete') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
