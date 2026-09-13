const tracks = [
  { id: 'floating-cities', title: 'Floating Cities', mood: 'Dreamlike city drift', isrc: 'USUAN1600018' },
  { id: 'night-vigil', title: 'Night Vigil', mood: 'Somber choir & flute', isrc: 'USUAN1900047' },
  { id: 'asian-drums', title: 'Asian Drums', mood: 'Dark, restless percussion', isrc: 'USUAN1100396' },
];
const storageKey = 'crow-music-v1';
let saved;
try { saved = JSON.parse(localStorage.getItem(storageKey)); } catch {}
let selected = tracks.find(track => track.id === saved?.track) || tracks[0];
const audio = document.createElement('audio');
audio.id = 'crow-audio';
audio.preload = 'none';
audio.loop = true;
audio.volume = typeof saved?.volume === 'number' && Number.isFinite(saved.volume) ? Math.max(0, Math.min(1, saved.volume)) : 0.35;
audio.muted = saved?.muted === true;
const launcher = document.getElementById('music-open') || document.createElement('button');
launcher.id = 'music-open';
launcher.type = 'button';
launcher.textContent = '♫ Music';
launcher.setAttribute('aria-haspopup', 'dialog');
launcher.setAttribute('aria-controls', 'music-dialog');
const dialog = document.createElement('dialog');
dialog.id = 'music-dialog';
dialog.setAttribute('aria-labelledby', 'music-title');
dialog.innerHTML = `
  <div class="music-heading"><span>SOUNDTRACKS</span><button id="music-close" type="button" aria-label="Close music player">✕</button></div>
  <h2 id="music-title">Set the atmosphere.</h2>
  <p class="music-intro">A little company for your flight.</p>
  <label for="music-track">Choose a track</label>
  <select id="music-track">${tracks.map(track => `<option value="${track.id}">${track.title} · ${track.mood}</option>`).join('')}</select>
  <div class="music-actions"><button id="music-play" type="button">Play music</button><button id="music-mute" type="button" aria-pressed="false">Mute</button></div>
  <label class="music-volume-label" for="music-volume">Volume <output id="music-volume-value" for="music-volume"></output></label>
  <input id="music-volume" type="range" min="0" max="100" step="1">
  <p id="music-status" role="status">Press Play when you’re ready. Each track loops.</p>
  <p class="music-credit"><a id="music-source" target="_blank" rel="noopener"></a> by <a href="https://incompetech.com/" target="_blank" rel="noopener">Kevin MacLeod</a>.<br>Licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Original recording, unmodified.<br><a href="audio/CREDITS.md" target="_blank" rel="noopener">All music credits & downloads</a></p>
`;
document.body.append(audio, dialog);
const studioFooter = document.querySelector('.footnote');
if (studioFooter) {
  launcher.classList.add('music-studio');
  studioFooter.before(launcher);
} else (document.querySelector('.header-actions') || document.body).append(launcher);
const el = id => dialog.querySelector(`#music-${id}`);
const persist = () => {
  try { localStorage.setItem(storageKey, JSON.stringify({ track: selected.id, volume: audio.volume, muted: audio.muted })); } catch {}
};
let requested = false;
let attempt = 0;
const render = () => {
  el('play').textContent = requested ? 'Pause music' : 'Play music';
  el('mute').textContent = audio.muted ? 'Unmute' : 'Mute';
  el('mute').setAttribute('aria-pressed', String(audio.muted));
  el('volume').value = Math.round(audio.volume * 100);
  el('volume-value').textContent = `${Math.round(audio.volume * 100)}%`;
  launcher.textContent = requested ? (audio.muted ? '♫ Muted' : '♫ Playing') : '♫ Music';
};
const credit = () => {
  el('track').value = selected.id;
  el('source').textContent = selected.title;
  el('source').href = `https://incompetech.com/music/royalty-free/index.html?isrc=${selected.isrc}`;
};
const play = async () => {
  const current = ++attempt;
  requested = true;
  if (audio.dataset.track !== selected.id) {
    audio.dataset.track = selected.id;
    audio.src = new URL(`audio/${selected.id}.mp3`, import.meta.url).href;
  }
  el('status').textContent = 'Loading music…';
  render();
  try {
    await audio.play();
    if (current === attempt) el('status').textContent = `Playing ${selected.title} · looping`;
  } catch (error) {
    if (current !== attempt) return;
    requested = false;
    el('status').textContent = error.name === 'NotAllowedError' ? 'Your browser paused audio. Press Play to try again.' : 'Couldn’t load this track. Press Play to retry or choose another.';
    render();
  }
};
launcher.addEventListener('click', () => dialog.showModal());
el('close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => launcher.focus());
el('play').addEventListener('click', () => {
  if (!requested) { void play(); return; }
  ++attempt;
  requested = false;
  audio.pause();
  el('status').textContent = 'Music paused. Resume whenever you like.';
  render();
});
el('track').addEventListener('change', () => {
  const resume = requested;
  ++attempt;
  requested = false;
  audio.pause();
  audio.removeAttribute('src');
  delete audio.dataset.track;
  audio.load();
  selected = tracks.find(track => track.id === el('track').value);
  credit(); persist(); render();
  el('status').textContent = 'Press Play when you’re ready. Each track loops.';
  if (resume) void play();
});
el('mute').addEventListener('click', () => { audio.muted = !audio.muted; persist(); render(); });
el('volume').addEventListener('input', () => { audio.volume = Number(el('volume').value) / 100; persist(); render(); });
audio.addEventListener('error', () => {
  if (!audio.hasAttribute('src')) return;
  ++attempt; requested = false;
  el('status').textContent = 'Couldn’t load this track. Press Play to retry or choose another.';
  audio.removeAttribute('src'); delete audio.dataset.track;
  render();
});
audio.addEventListener('pause', () => {
  if (audio.paused && requested && !audio.error) {
    ++attempt; requested = false; render();
    el('status').textContent = 'Music paused. Press Play to resume.';
  }
});
audio.addEventListener('playing', () => {
  if (requested) el('status').textContent = `Playing ${selected.title} · looping`;
});
audio.addEventListener('waiting', () => { if (requested) el('status').textContent = 'Buffering music…'; });
credit(); render();
