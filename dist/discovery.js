const make = (tag, text = '', className = '') => {
  const element = document.createElement(tag);
  element.textContent = text;
  element.className = className;
  return element;
};
const scenes = {
  gardens: '<path d="M0 96Q65 70 130 98T260 94V160H0" fill="#467e69"/><path d="M74 128V66m-19-9 19 20 22-24m70 77V45m-29-6 29 25 31-30" stroke="#dbb6a6" stroke-width="6"/><ellipse cx="74" cy="51" rx="33" ry="12" fill="#8fcbaa"/><ellipse cx="166" cy="32" rx="42" ry="14" fill="#b0d8a7"/><path d="M0 142Q100 107 260 135" fill="none" stroke="#c6dca9" stroke-width="10"/>',
  waterfront: '<path d="M0 106H260V160H0" fill="#558e94"/><path d="M50 104Q54 59 104 76Q126 48 151 104Z" fill="#dbe9cb"/><path d="m123 104 24-49 22 49m-10 0 31-68 23 68" fill="#f1e6c6"/><path d="M24 127h70m45-8h95m-171 26h110" stroke="#c4e6d5" stroke-width="2"/>',
  temple: '<path d="M0 110 52 44 121 112 181 58 260 118V160H0" fill="#668f81"/><path d="M83 144V72h91v72" fill="#dbc7a3"/><path d="m64 82 65-34 65 34Zm-8 35 73-36 75 36Z" fill="#733e47"/><path d="M119 145v-28h22v28" fill="#70464a"/><path d="M27 160v-63m-15-5h31" stroke="#d79583" stroke-width="6"/>',
  city: '<path d="M26 135V78h35v57m13 0V54h37v81m12 0V85h32v50m14 0V43h34v92m13 0V68h30v67" fill="#9ab8b0"/><path d="M184 43V23M0 142h260" stroke="#d6d9b4" stroke-width="3"/><path d="M84 67v9m13-9v9m84-17v10m11-10v10m-8 14v10M38 91v10m12-10v10" stroke="#ffe8af" stroke-width="4"/>',
  cafe: '<path d="M38 144V58h184v86" fill="#d5b494"/><path d="M29 58h202l-15-25H44Z" fill="#bd7771"/><path d="M67 34 61 58m37-24-2 24m36-24v24m33-24 3 24m29-24 5 24" stroke="#f4d5b4" stroke-width="13"/><path d="M57 80h63v44H57m84 20V78h60v66" fill="#385f63"/><path d="M73 94h25v17H73m25-15q12 0 7 11h-7" stroke="#f2e1ba" fill="none" stroke-width="3"/>',
  arts: '<path d="M42 139V73h176v66" fill="#c4cfc5"/><path d="m28 73 102-42 103 42Z" fill="#e9d9b8"/><path d="M61 83v46m37-46v46m38-46v46m38-46v46m30-46v46" stroke="#698987" stroke-width="9"/><path d="M28 145h205" stroke="#e9d9b8" stroke-width="10"/>'
};
function illustration(theme) {
  const art = make('div', '', 'discovery-art ' + theme);
  art.innerHTML = `<svg viewBox="0 0 260 160" fill="none" aria-hidden="true"><path fill="currentColor" d="M0 0h260v160H0z"/><circle cx="211" cy="35" r="21" fill="#f2d5a2"/><path d="M20 35h40m-15 8h33" stroke="#e0eddd" stroke-width="3" stroke-linecap="round" opacity=".5"/>${scenes[theme] || scenes.city}</svg>`;
  return art;
}
const destinations = [
  { name: 'Gardens by the Bay', query: 'Gardens by the Bay, Singapore', label: 'Singapore · Green escape', description: 'Supertrees and a garden from tomorrow.', theme: 'gardens' },
  { name: 'Marina Bay', query: 'Esplanade, Singapore', label: 'Singapore · Waterfront', description: 'Follow the water, take in the skyline.', theme: 'city' },
  { name: 'Kyoto', query: 'Kiyomizu-dera, Kyoto, Japan', label: 'Japan · Slow wander', description: 'Temple rooftops above a sea of green.', theme: 'temple' },
  { name: 'Paris', query: 'Eiffel Tower, Paris, France', label: 'France · City icon', description: 'A different perspective on the classics.', theme: 'arts' },
  { name: 'Sydney Harbour', query: 'Sydney Opera House, Sydney, Australia', label: 'Australia · By the sea', description: 'Sculptural sails and wide-open water.', theme: 'waterfront' },
  { name: 'Kampong Glam', query: 'Sultan Mosque, Kampong Glam, Singapore', label: 'Singapore · Culture trail', description: 'Colourful lanes, shophouses and stories.', theme: 'cafe' }
];
const moods = { local: ['Hidden gems', 'Coffee & bites', 'Arts & culture', 'Outdoors'], day: ['A little of everything', 'Food trail', 'Slow & scenic'] };
const titles = { somewhere: 'A little further afield', local: 'Find your kind of local', day: 'A day worth wandering' };

export function createDiscovery({ getContext, request, onFly }) {
  const $ = id => document.getElementById(id);
  const panel = $('discovery-panel');
  const companion = $('companion');
  const cache = new Map();
  let mode = null, mood = '', job = null, origin = null, opener = null, flying = false;
  const location = () => ({ ...(getContext().spot || getContext().destination) });
  const keyFor = place => JSON.stringify([mode, mood, place.name, place.lat, place.lng]);
  const cancel = () => { job?.abort(); job = null; panel.removeAttribute('aria-busy'); };
  function back() {
    cancel(); mode = null;
    panel.hidden = true;
    companion.classList.remove('browsing-ideas');
    (opener?.getClientRects().length ? opener : $('discovery-open')).focus({ preventScroll: true });
  }
  function button(label, action, className = '') {
    const element = make('button', label, className);
    element.type = 'button'; element.onclick = action;
    return element;
  }
  function header() {
    origin = keyFor(location());
    panel.replaceChildren();
    const top = make('div', '', 'discovery-top');
    top.append(button('← Back', back), make('span', mode === 'somewhere' ? 'THE CROW’S SHORTLIST' : 'LET CURIOSITY LEAD', 'discovery-eyebrow'));
    const title = make('h2', titles[mode]); title.tabIndex = -1;
    panel.append(top, title, make('p', mode === 'somewhere' ? 'Pick a postcard. Your crow will take you there.' : `Around ${location().name}`, 'discovery-subtitle'));
    const tabs = make('div', '', 'discovery-tabs'); tabs.setAttribute('aria-label', 'Explore ideas');
    for (const [value, label] of [['somewhere', 'Destinations'], ['local', 'Local favourites'], ['day', 'Day out']]) {
      const tab = button(label, () => open(value)); tab.setAttribute('aria-pressed', String(value === mode)); tabs.append(tab);
    }
    panel.append(tabs);
    if (mode !== 'somewhere') {
      const filters = make('div', '', 'discovery-moods'); filters.setAttribute('aria-label', 'Choose a mood');
      for (const value of moods[mode]) {
        const filter = button(value, () => { cancel(); mood = value; origin = null; header(); showStart(); });
        filter.setAttribute('aria-pressed', String(value === mood)); filters.append(filter);
      }
      panel.append(filters);
    }
    const status = make('p', '', 'discovery-status'); status.id = 'discovery-status'; status.setAttribute('role', 'status');
    const content = make('div'); content.id = 'discovery-results';
    panel.append(status, content);
    $('companion-content').scrollTop = 0;
    if (!companion.hidden) title.focus({ preventScroll: true });
  }
  function showStart() {
    if (mode === 'somewhere') { render({ places: destinations }); return; }
    const cached = cache.get(keyFor(location()));
    if (cached) { origin = keyFor(location()); render(cached); return; }
    const prompt = make('div', '', 'discovery-start');
    prompt.append(illustration(mode === 'day' ? 'waterfront' : mood === 'Coffee & bites' ? 'cafe' : 'gardens'), make('h3', mode === 'day' ? 'From first coffee to last light.' : 'Good places. A little less obvious.'), make('p', mode === 'day' ? 'Four stops, time to wander, and something delicious along the way. Choose your pace above.' : 'Your crow will look for places nearby that fit your mood, with web sources to explore.'));
    prompt.append(button(mode === 'day' ? 'Build my day ↗' : 'Find local picks ↗', () => load(), 'discovery-primary'));
    $('discovery-results').replaceChildren(prompt);
  }
  async function load() {
    cancel();
    const controller = new AbortController(); job = controller;
    const requestedMode = mode, requestedMood = mood, destination = location(), key = keyFor(destination);
    origin = key;
    panel.setAttribute('aria-busy', 'true');
    $('discovery-status').textContent = mode === 'day' ? 'Putting your day together and checking sources…' : 'Looking for places worth a detour…';
    const loading = make('div', '', 'discovery-skeleton');
    for (let i = 0; i < 4; i++) loading.append(make('div'));
    $('discovery-results').replaceChildren(loading, button('Cancel', () => { cancel(); $('discovery-status').textContent = 'Search cancelled.'; showStart(); }));
    const timeout = setTimeout(() => controller.abort(), 85000);
    try {
      const data = await request('/api/recommendations', { destination, mode: requestedMode, mood: requestedMood }, controller.signal);
      if (job !== controller || controller.signal.aborted) return;
      if (keyFor(location()) !== key) { $('discovery-status').textContent = 'Your location changed. Find picks around your new destination.'; showStart(); return; }
      if (!Array.isArray(data.places)) throw Error('The guide returned an incomplete result. Please try again.');
      if (cache.size >= 12) cache.delete(cache.keys().next().value);
      cache.set(key, data); render(data);
    } catch (error) {
      if (job !== controller) return;
      $('discovery-status').textContent = controller.signal.aborted ? 'The search took too long. Please try again.' : error.message;
      $('discovery-results').replaceChildren(button('Try again', () => load(), 'discovery-primary'));
    } finally { clearTimeout(timeout); if (job === controller) { job = null; panel.removeAttribute('aria-busy'); } }
  }
  function render(data) {
    const content = $('discovery-results'); content.replaceChildren();
    $('discovery-status').textContent = '';
    if (data.summary) content.append(make('p', data.summary, 'discovery-summary'));
    if (!data.places.length) {
      content.append(make('p', 'No sourced picks came back this time. Try another mood or search again.'), button('Try again', () => load(), 'discovery-primary'));
      return;
    }
    const cards = make('div', '', mode === 'day' ? 'discovery-timeline' : 'discovery-grid');
    for (const [index, place] of data.places.entries()) {
      const card = make('article', '', 'discovery-card');
      card.append(illustration(place.theme));
      const body = make('div', '', 'discovery-card-body');
      body.append(make('span', `${mode === 'day' ? String(index + 1).padStart(2, '0') + ' · ' : ''}${place.label}`, 'discovery-label'), make('h3', place.name), make('p', place.description));
      const actions = make('div', '', 'discovery-card-actions');
      const go = button('Fly here ↗', async () => {
        if (flying) return;
        flying = true; go.disabled = true; go.textContent = 'Finding place…';
        try {
          const arrived = await onFly(place.query);
          if (arrived?.status === 'cancelled') return;
          if (arrived?.status === 'error') throw Error(arrived.error || 'The flight could not start.');
          if (!companion.hidden) $('companion-toggle').click();
        } catch (error) { $('command-status').textContent = error.message; $('command-status').classList.add('error'); }
        finally { flying = false; go.disabled = false; go.textContent = 'Fly here ↗'; }
      });
      actions.append(go);
      if (place.sourceUrl) {
        try {
          const url = new URL(place.sourceUrl);
          if (url.protocol === 'https:' && !url.username && !url.password) { const source = make('a', 'Source ↗'); source.href = url.href; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.setAttribute('aria-label', `Source for ${place.name}`); actions.append(source); }
        } catch {}
      }
      body.append(actions); card.append(body); cards.append(card);
    }
    content.append(cards, make('p', mode === 'somewhere' ? 'Illustrated destination ideas · choose any place to explore.' : 'AI suggestions with web sources · illustrations, not venue photos. Check opening hours before visiting.', 'discovery-footnote'));
    if (mode !== 'somewhere') {
      const actions = make('div', '', 'discovery-footer');
      actions.append(button('Refresh picks', () => load()));
      if (mode === 'day') actions.append(button('Save this day ↓', () => {
        const text = `# A day around ${data.destination?.name || location().name}\n\n${data.summary}\n\n` + data.places.map(place => `## ${place.label} — ${place.name}\n\n${place.description}\n\n${place.query}\n\nSource: ${place.sourceUrl}`).join('\n\n') + '\n\nAI suggestions; confirm details before visiting.\n';
        const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
        const link = make('a'); link.href = url; link.download = 'a-day-with-crow.md'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }));
      content.append(actions);
    }
    $('companion-content').scrollTop = 0;
  }
  function open(value, trigger) {
    cancel(); opener = trigger || opener || $('discovery-open');
    mode = value; mood = moods[mode]?.[0] || ''; origin = null;
    panel.hidden = false; companion.classList.add('browsing-ideas'); header(); showStart();
  }
  for (const trigger of document.querySelectorAll('[data-discovery]')) trigger.onclick = () => open(trigger.dataset.discovery, trigger);
  $('discovery-open').onclick = () => open('somewhere', $('discovery-open'));
  $('chat-form').addEventListener('submit', () => { if ($('chat-input').value.trim() && !companion.classList.contains('busy')) back(); }, { capture: true });
  window.addEventListener('crow:chat-message', () => { if (mode && !panel.hidden) $('discovery-open').textContent = 'Ideas'; });
  window.addEventListener('pagehide', cancel);
  return { updateContext() {
    if (!mode || mode === 'somewhere') return;
    if (origin && keyFor(location()) !== origin) { cancel(); origin = null; header(); showStart(); }
  } };
}
