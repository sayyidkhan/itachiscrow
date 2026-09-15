import { MODE_DRAWS, resolvePreset } from 'thinking-orbs/engine';

const styles = ['working', 'searching', 'solving', 'listening', 'connecting', 'weaving', 'composing', 'breathing', 'shaping'];
const labels = ['Orbit', 'Globe', 'Prism', 'Wave', 'Nexus', 'Helix', 'Ribbon', 'Halo', 'Morph'];
const overlay = document.getElementById('voice-overlay');
const consoleEl = document.getElementById('voice-console');
const canvas = document.getElementById('voice-orb-canvas');
const picker = document.getElementById('voice-orb-styles');
const toggle = document.getElementById('voice-style-toggle');
const status = document.getElementById('voice-orb-status');
const hint = document.getElementById('voice-orb-hint');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let selection = 'auto';
try { selection = localStorage.getItem('crow.voice-orb') || 'auto'; } catch {}
if (selection !== 'auto' && !styles.includes(selection)) selection = 'auto';
let state = { status: 'idle' }, input = 0, output = 0, lastAudio = 0;
let frame = 0, lastFrame = 0, clock = 0, level = 0, preset;
const context = canvas.getContext('2d');
const ratio = Math.min(devicePixelRatio || 1, 2);
canvas.width = canvas.height = 128 * ratio;

function paint(target, style, time, strength = 0) {
  const ctx = target.getContext('2d');
  if (!ctx) return;
  const size = target.width;
  const resolved = target === canvas ? preset : resolvePreset(style, 64);
  ctx.setTransform(size / 64, 0, 0, size / 64, 0, 0);
  ctx.clearRect(0, 0, 64, 64);
  ctx.save();
  ctx.translate(32, 32);
  ctx.scale(1 + strength * .09, 1 + strength * .09);
  ctx.translate(-32, -32);
  MODE_DRAWS[resolved.mode](ctx, 64, time * resolved.speed, true, resolved.opts);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-in';
  const ink = ctx.createLinearGradient(5, 2, 56, 60);
  ink.addColorStop(0, '#e6fcff');
  ink.addColorStop(.45, '#8be8fa');
  ink.addColorStop(1, '#aa9fff');
  ctx.fillStyle = ink;
  ctx.fillRect(0, 0, 64, 64);
  ctx.globalCompositeOperation = 'source-over';
}

function phase() {
  if (state.status === 'connecting') return ['connecting', 'Connecting', 'Opening your voice channel'];
  if (state.status === 'closing') return ['breathing', 'Ending call', 'Closing your voice channel'];
  if (state.playbackBlocked) return ['breathing', 'Sound paused', 'Choose Enable audio below'];
  if (output > .018) return ['composing', 'Crow is speaking', 'You can interrupt or ask a question'];
  if (state.pendingAction) return ['working', 'On it', 'Your guide is working on your request'];
  if (!state.muted && input > .025) return ['listening', 'I’m listening', 'Go ahead. I’m right here.'];
  if (state.responding) return ['solving', 'Thinking', 'Putting the details together'];
  if (state.muted) return ['breathing', 'Microphone muted', 'You can still hear your guide'];
  return ['listening', 'Listening', 'Where shall we go next?'];
}

function refresh() {
  const [automatic, title, subtitle] = phase();
  const style = selection === 'auto' ? automatic : selection;
  if (consoleEl.dataset.style !== style) {
    preset = resolvePreset(style, 64);
    consoleEl.dataset.style = style;
  }
  consoleEl.dataset.phase = automatic;
  if (status.textContent !== title) status.textContent = title;
  if (hint.textContent !== subtitle) hint.textContent = subtitle;
  if (reduced.matches && context) paint(canvas, style, 1.8);
}

function visible() { return !document.hidden && !overlay.hidden && ['connecting', 'connected', 'closing'].includes(state.status); }
function draw(now) {
  frame = 0;
  if (!visible() || reduced.matches || !context) return;
  if (now - lastFrame >= 33) {
    clock += Math.min((now - lastFrame) / 1000, .05) * (1 + level * .7);
    lastFrame = now;
    if (now - lastAudio > 450) input = output = 0;
    level += (Math.min(1, Math.max(state.muted ? 0 : input, output) * 3) - level) * .2;
    refresh();
    consoleEl.style.setProperty('--voice-energy', level.toFixed(3));
    paint(canvas, consoleEl.dataset.style, clock, level);
  }
  frame = requestAnimationFrame(draw);
}
function sync() {
  cancelAnimationFrame(frame);
  frame = 0;
  refresh();
  if (visible() && !reduced.matches && context) {
    lastFrame = performance.now();
    frame = requestAnimationFrame(draw);
  }
}

for (const [index, value] of ['auto', ...styles].entries()) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.orbStyle = value;
  button.setAttribute('aria-pressed', String(selection === value));
  const preview = document.createElement('canvas');
  preview.width = preview.height = 64;
  preview.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = index ? labels[index - 1] : 'Auto';
  button.append(preview, label);
  paint(preview, value === 'auto' ? 'connecting' : value, 1.8);
  button.onclick = () => {
    selection = value;
    try { localStorage.setItem('crow.voice-orb', value); } catch {}
    for (const item of picker.children) item.setAttribute('aria-pressed', String(item === button));
    toggle.textContent = (index ? labels[index - 1] : 'Auto') + ' ◇';
    picker.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus({ preventScroll: true });
    sync();
  };
  picker.append(button);
}
toggle.textContent = (selection === 'auto' ? 'Auto' : labels[styles.indexOf(selection)]) + ' ◇';
toggle.onclick = () => {
  picker.hidden = !picker.hidden;
  toggle.setAttribute('aria-expanded', String(!picker.hidden));
  if (!picker.hidden) picker.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
};
consoleEl.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !picker.hidden) {
    event.stopPropagation();
    picker.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus({ preventScroll: true });
  }
});
window.addEventListener('crow:voice-state', event => {
  state = event.detail;
  if (state.status !== 'connected') input = output = 0;
  if (!['connecting', 'connected'].includes(state.status)) {
    picker.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }
  sync();
});
window.addEventListener('crow:voice-level', event => {
  input = Number(event.detail.input) || 0;
  output = Number(event.detail.output) || 0;
  lastAudio = performance.now();
  if (reduced.matches) refresh();
});
new MutationObserver(sync).observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
document.addEventListener('visibilitychange', sync);
reduced.addEventListener('change', sync);
window.addEventListener('pagehide', () => cancelAnimationFrame(frame));
window.addEventListener('pageshow', sync);
window.dispatchEvent(new Event('crow:voice-state-request'));
sync();
