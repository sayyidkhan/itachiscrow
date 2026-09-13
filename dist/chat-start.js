(() => {
  const form = document.getElementById('chat-form');
  if (!form) return;
  form.onsubmit = event => {
    event.preventDefault();
    const status = document.getElementById('command-status');
    status.textContent = 'Chat is still starting. If this persists, refresh the page and send again.';
    status.classList.add('error');
  };
})();
