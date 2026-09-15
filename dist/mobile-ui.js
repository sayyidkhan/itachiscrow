(() => {
  const $ = id => document.getElementById(id);
  const companion = $('companion');
  const input = $('chat-input');
  let voiceActive = false;
  let captions = [];
  const travel = $('travel-transition');
  const travelAnchor = document.createComment('Journey overlay');
  travel.before(travelAnchor);

  function surfaces() {
    $('chat-launcher').hidden = !companion.hidden || voiceActive;
    $('voice-overlay').hidden = !companion.hidden || !voiceActive;
    for (const id of ['chat-open', 'voice-chat']) $(id).setAttribute('aria-expanded', String(!companion.hidden));
    travel.classList.toggle('travel-contained', !companion.hidden || voiceActive);
    if (!companion.hidden) companion.querySelector('.companion-heading').after(travel);
    else if (voiceActive) $('voice-overlay').prepend(travel);
    else travelAnchor.after(travel);
  }
  function openChat() {
    window.dispatchEvent(new Event('crow:text-chat-open'));
    companion.hidden = false;
    $('chat-unread').hidden = true;
    surfaces();
    sizeInput();
    $('companion-toggle').focus({ preventScroll: true });
  }
  function closeChat(focus = true) {
    input.blur();
    companion.hidden = true;
    surfaces();
    if (focus) $(voiceActive ? 'voice-chat' : 'chat-open').focus({ preventScroll: true });
  }
  $('chat-open').onclick = openChat;
  $('voice-chat').onclick = openChat;
  $('companion-toggle').onclick = closeChat;
  companion.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); closeChat(); }
  });
  $('voice-launch').onclick = () => $('voice-toggle').click();
  window.addEventListener('crow:steering-open', () => closeChat(false));
  for (const [overlay, original] of [['end', 'voice-toggle'], ['mute', 'voice-mute'], ['audio', 'voice-audio'], ['stop', 'command-stop'], ['result', 'command-result']]) {
    $('voice-overlay-' + overlay).onclick = () => $(original).click();
  }
  window.addEventListener('crow:voice-state', event => {
    const state = event.detail;
    const wasActive = voiceActive;
    voiceActive = ['connecting', 'connected', 'closing'].includes(state.status);
    if (voiceActive && !wasActive) {
      captions = [];
      $('voice-captions').replaceChildren();
      closeChat();
      $('voice-overlay-end').focus({ preventScroll: true });
    }
    $('voice-overlay-end').disabled = state.status === 'closing';
    $('voice-overlay-end').textContent = state.status === 'closing' ? 'Ending…' : 'End call';
    $('voice-overlay-mute').hidden = state.status !== 'connected';
    $('voice-overlay-mute').textContent = state.muted ? 'Unmute mic' : 'Mute mic';
    $('voice-overlay-mute').setAttribute('aria-pressed', String(state.muted));
    $('voice-overlay-audio').hidden = !state.playbackBlocked;
    surfaces();
    if (wasActive && !voiceActive) {
      if (state.status === 'error') openChat();
      else if (companion.hidden) $('chat-open').focus({ preventScroll: true });
    }
  });
  window.addEventListener('crow:voice-caption', event => {
    if (!voiceActive) return;
    const { role, text } = event.detail;
    if (captions.at(-1)?.role === role) captions[captions.length - 1] = { role, text };
    else captions.push({ role, text });
    captions = captions.slice(-2);
    $('voice-captions').replaceChildren(...captions.map(caption => {
      const bubble = document.createElement('p');
      bubble.className = 'voice-caption ' + (caption.role === 'user' ? 'user' : 'assistant');
      const label = document.createElement('strong');
      label.textContent = caption.role === 'user' ? 'You' : 'Crow';
      const content = document.createElement('span');
      content.textContent = caption.text.slice(-600);
      bubble.append(label, content);
      return bubble;
    }));
  });
  function reflectControls() {
    $('voice-overlay-state').textContent = $('voice-state').textContent;
    $('voice-overlay-stop').hidden = $('command-stop').hidden;
    $('voice-overlay-result').hidden = $('command-result').hidden;
    $('voice-overlay-result').textContent = $('command-result').textContent;
    if ($('voice-error').textContent && companion.hidden) openChat();
  }
  const observer = new MutationObserver(reflectControls);
  for (const id of ['voice-state', 'voice-error', 'command-stop', 'command-result']) {
    observer.observe($(id), { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden'] });
  }
  window.addEventListener('crow:chat-message', event => {
    if (companion.hidden && !voiceActive && event.detail.role === 'assistant') $('chat-unread').hidden = false;
  });
  $('chat-form').addEventListener('submit', () => {
    if (matchMedia('(max-width: 760px)').matches) input.blur();
  });
  function sizeInput() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, document.body.classList.contains('compact-viewport') ? 72 : 120) + 'px';
  }
  input.addEventListener('input', sizeInput);
  function viewport() {
    const view = window.visualViewport;
    document.body.classList.toggle('compact-viewport', (view?.height || innerHeight) < 500);
    document.body.style.setProperty('--mobile-viewport-height', (view?.height || innerHeight) + 'px');
    document.body.style.setProperty('--mobile-viewport-top', (view?.offsetTop || 0) + 'px');
    sizeInput();
  }
  window.visualViewport?.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('scroll', viewport);
  window.addEventListener('resize', viewport);
  window.addEventListener('crow:open-chat', openChat);
  $('chat-open').disabled = false;
  $('voice-launch').disabled = false;
  viewport();
  surfaces();
})();
