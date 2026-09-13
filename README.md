# Itachi’s Crow

**Scout a city before you arrive.**

A browser-based travel exploration prototype that lets you follow an animated 3D crow through a real city, look around the neighbourhood, and investigate nearby businesses.

[Launch the live demo](https://itachis-crow.promptalchemistlabs.chatgpt.site) · [Report a bug or suggest an idea](https://github.com/sayyidkhan/itachiscrow/issues)

> **Status:** Hackathon prototype · **Demo location:** Chelsea, New York · **Hosting:** GPT Sites

## The idea

Choosing somewhere to visit involves more than knowing its address. What does the neighbourhood look like? What is nearby? Does the area fit the experience you want?

Itachi’s Crow explores a more visual way to answer those questions: fly through the city with a crow as your guide, pause when something catches your attention, and inspect places along the way.

The longer-term vision is an AI travel scout that adapts exploration to your interests and helps turn discoveries into an itinerary. The current release implements the 3D flight and place-discovery foundation.

## Try the experience

1. Open the [live demo](https://itachis-crow.promptalchemistlabs.chatgpt.site) and let the city load.
2. Select **Start flight** to follow the crow around the prepared Chelsea loop.
3. Pause or drag the map to explore from another angle.
4. Select **Places**, or a supported business label, to investigate a location.
5. Save places during your session, then resume the flight.

| Control | What it does |
| --- | --- |
| Start / Pause / Resume | Follow the crow or pause to explore |
| Restart ↺ | Return to the beginning of the route |
| Speed | Switch between 0.5×, 1× and 1.5× |
| Higher / Lower view | Change the camera viewpoint |
| Place labels | Show or hide the map’s labels |
| Places | Find nearby businesses and open their details |

## What works today

- **A crow inside the 3D map:** three GLB model parts form a smooth, sculpted body and articulated wings. Swept wings have layered coverts, curved asymmetric flight feathers and separated fingertips; a tapered tail, curved beak and subtle crimson eyes complete the silhouette.
- **Animated flight:** wingbeats, gliding phases and overlapping swerves up to 4.3 metres either side of the prepared route. The crow points along its own path and banks according to its speed and turn curvature, with gentle vertical sway.
- **A following camera:** the view follows the route centre independently of the crow's swerves and wingbeat bob, so lateral movement stays visible without shaking the view; pausing lets you orbit the scene.
- **Place discovery:** nearby business search and available details such as address, opening hours, website and phone number.
- **Session saves:** shortlist places while the page remains open.
- **Responsive controls:** a layout designed for phones and desktop browsers; secondary panels hide during flight.

## How it works

The app loads Google’s 3D map, places the crow’s model parts at geographic coordinates, and updates their positions and rotations during flight. A moving camera follows the route. Flight updates are capped at 24 per second, and controls wait for the renderer’s steady-state event before enabling. The Places library loads when business information is requested.

| Component | Implementation |
| --- | --- |
| Interface and flight logic | HTML, CSS and vanilla JavaScript |
| City rendering | Google Maps JavaScript API, `maps3d` library |
| Crow rendering | Native `Model3DElement` objects with GLB assets |
| Business information | Google Places library |
| Asset generation | Python, NumPy, trimesh and Matplotlib |
| Live hosting | GPT Sites |

The renderer loads the crow GLBs from the application's own `models/` directory. Deploy the three assets together with the HTML and JavaScript. Google makes credentialed model requests: a successful ordinary download from a wildcard-CORS host does not prove the renderer can load that URL.

The supplied city imagery is rendered by Google. The app does not generate a new city replica, and the current release does not call an AI model for recommendations.

## Run locally

### Requirements

- Git and Python 3.
- A browser and device capable of rendering Google’s 3D Maps.
- Internet access and a Google Maps browser API key with access to the 3D Maps and Places features used by the app.

### Setup

```bash
git clone https://github.com/sayyidkhan/itachiscrow.git
cd itachiscrow
```

Copy `dist/config.example.js` to `dist/config.js`, then edit the new file:

```javascript
window.CROW_MAPS_KEY = 'YOUR_GOOGLE_MAPS_BROWSER_KEY';
```

Start a local server from the repository root:

```bash
python3 -m http.server 8000 --directory dist
```

Open [localhost:8000](http://localhost:8000).

`dist/config.js` is ignored by Git. Browser API keys are visible to visitors; use website and API restrictions appropriate to your local and deployed addresses. Available features depend on the key’s permissions and quota.

Alternatively, set `CROW_MAPS_KEY` through your environment's secret configuration and run `python3 scripts/configure.py` to generate the same ignored configuration without putting the key in command-line arguments.

No npm build, Unreal Engine or Blender installation is needed to run the app.

## Repository guide

| Path | Purpose |
| --- | --- |
| `dist/index.html` | Map container, controls and place-detail dialogs |
| `dist/style.css` | Responsive interface styling |
| `dist/app.js` | Map setup, flight animation and place discovery |
| `dist/config.example.js` | Template for the local browser-key configuration |
| `dist/models/` | Ready-to-use body and wing GLB assets |
| `scripts/build_crow.py` | Source for generating the crow geometry |

### Regenerate the crow assets — optional

The GLBs are already committed. Rebuilding with the pinned development dependencies requires Python 3.12 or newer (tested with Python 3.14.5):

```bash
python3 -m pip install -r scripts/requirements.txt
python3 scripts/build_crow.py
```

This overwrites the three GLBs in `dist/models/` and produces `_debug/crow-geometry.png` for offline geometry inspection. Mesh vertices use glTF Y-up coordinates; a shared root transform adapts them to Google's east/north/up model axes, allowing heading, pitch and wing roll to work together.

### Browser verification

The application has no npm runtime dependencies. Optional development checks use Node.js and a Chromium installation:

```bash
npm ci
npm run verify:models
CROW_BROWSER_EXECUTABLE=/path/to/chromium CROW_TEST_URL=http://127.0.0.1:8000/ npm run verify:browser
```

Set `CROW_SOFTWARE_GL=1` to use Chromium's SwiftShader WebGL2 renderer on a server without a GPU. Alternatively, set `CROW_CDP_URL` to attach to an existing Chromium debugging endpoint. The test first renders and reads back a WebGL2 pixel, then exercises the real map, model requests, flight controls, Places and a 390×844 viewport. It writes screenshots and a redacted report under `_debug/verification/`. Wing extremes and the banked-turn snapshot use deterministic poses in the real native renderer; control checks run the actual animation loop. Inspect the screenshots: state assertions alone do not prove visibility. Mobile viewport coverage is not physical iPhone testing.

## Current limitations

- Flight follows one prepared Chelsea route. It does not provide free-flight steering, arbitrary destination routing or building collision avoidance.
- The crow is a custom stylized model; its animation is driven by separate model-part rotations.
- Saved places are held in memory and reset when the page reloads.
- Google imagery may be dated or less detailed close to buildings. Place fields may be missing or restricted.
- Photos, reviews, Instagram content, local news and AI itineraries are not included.
- See [rendering verification](docs/verification.md) for browser evidence and device limitations.

## Roadmap

These are proposed directions, not available features:

- [ ] Select additional cities and neighbourhoods.
- [ ] Scout destinations and routes on demand.
- [ ] Add AI guidance based on interests, time and travel preferences.
- [ ] Introduce switchable “eyes” for food, culture and other perspectives.
- [ ] Surface relevant local news and permitted social content with source links.
- [ ] Turn saved discoveries into an editable itinerary.
- [ ] Improve flight animation, navigation and device performance.

## Deployment

The public demo runs on **GPT Sites**. This repository contains an export of the application source; GitHub commits do not automatically redeploy the live site.

Publish `dist/index.html`, `dist/app.js`, `dist/style.css`, your environment-specific `dist/config.js`, and all three `dist/models/*.glb` files together. Keep model URLs on the same origin as the app; do not restore the pinned GitHub raw URLs. Use plain URLs ending in `.glb`: adding `?v=4` reproduced an invisible model even with HTTP 200 responses in the tested renderer. The preliminary download revalidates cached assets. No renderer replacement, server API, new Google API, or npm production build is required. A local Python/Zo preview is a development convenience only.

The initial export came from Sites source commit `cebef75b960610f945f18e1a58216c5a37333e80`, with the browser key moved into local configuration.
