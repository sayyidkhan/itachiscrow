# Itachi’s Crow

**Scout a city before you arrive.**

Fly an animated 3D crow to a destination, land at a particular spot, and explore an AI-generated 360° view of its surroundings. Talk to a GPT-Live travel companion, discover recent Instagram hashtag photos, and turn saved places and travel preferences into a sourced itinerary.

[Earlier map demo](https://itachis-crow.promptalchemistlabs.chatgpt.site) · [Report a bug or suggest an idea](https://github.com/sayyidkhan/itachiscrow/issues)

This is a travel exploration prototype. The repository now includes a Node API server for the AI and Instagram features; the earlier hosted demo is not automatically updated by repository changes.

## Explore a destination

### Voice → landmark → personal portrait → cafés

Choose **Talk** and say “Take me to Paris”. Paris resolves to the Eiffel Tower, with an arrival viewpoint facing the landmark. Other city and landmark searches remain available. Then say “Picture me here” to create an imagined travel portrait from your reference photo, or “Find cafés and good deals nearby” to display Google café photos, ratings, original Maps links and a separate sourced offer search. The same actions are available as buttons in **Explore** and **Around you**.

Upload a JPEG, PNG or WebP under 5 MB in **Picture yourself here**. The upload stays in the current tab and is sent to the server and OpenAI only when generation is requested; it is not saved to disk by the upload endpoint. The result is labelled AI-generated and has a download link. Changing destinations or removing the photo cancels pending portrait generation and discards stale results. Generated portraits are separate from the Google map and 360° panorama.

Google café cards are independent of the AI search: they can still work if offer research fails. Promotions require a source returned by web search and an explicit unexpired validity date; otherwise the UI reports that no current promotions were verified. Venue terms and availability still need confirmation. Instagram remains an optional, separately connected Meta hashtag feed, not a substitute for verified offers.

The owner-only Zo preview may set `CROW_OWNER_PHOTO` to an absolute path outside `dist/` (for example `.private/traveller.jpg`). This enables an explicit **Use my saved preview photo** option without exposing a photo-download endpoint. The fallback is disabled unless `PUBLIC_ORIGIN` is an HTTPS `.zo.computer` origin. Keep the Zo service private and remove this setting before changing visibility or deploying to a shared host. `.private/` is excluded from Git; neither reference photos nor generated personal portraits belong in commits. Normal deployments use per-tab uploads.

New server routes: `POST /api/portrait` (multipart image edits sent to OpenAI) and `POST /api/discover` (Responses web search). Deploy `travel.js` and `travel.css` alongside the existing `dist/` files and restart the Node server, or rebuild the GPT Sites Worker bundle. Existing OpenAI and Google Places configuration is reused. Static-only hosting retains map/Studio features, but the AI flow needs the Node backend or GPT Sites Worker. The Worker supports uploaded photos; the owner's server reference is always disabled there.

1. Start the local app and allow browser location access to place the crow near you. Open **Explore**, search for a city, landmark, or address, then select a result to fly there.
2. Search for a specific landing spot, select **Pick on the map**, or choose **Land at destination**.
3. With **Generate a 360° scene when I land** enabled, landing creates a panorama. You can also use **Generate scene**. Drag to look around, scroll to zoom, use arrow keys to turn, or save the image.
4. Open **Around you**, choose **Connect Instagram**, and sign in through Facebook with the account linked to your professional Instagram profile. Choose an account if more than one is available, then load recent public hashtag photos.
5. Open **Your trip**, set 1–14 days, travel style, and interests, then choose **Plan my trip**. Saved places inform the itinerary. Read its source links or save the plan.
6. Choose **Talk** to speak with the GPT-Live guide. Ask it to fly somewhere, land at a landmark, take off, generate a panorama, or plan a trip. Microphone access starts from this action; the call has mute and end controls.

To launch from a building, land using a place’s **Land here** action, the landing search, or **Pick on the map** on its rooftop. Select **Take off ↗** or ask the guide to take off. The crow spreads its wings, eases into a climb, then moves forward after gaining rooftop clearance. The camera follows continuously from your current view and gradually pulls back. Takeoff locks the resolved rooftop elevation so crossing its edge does not drop the bird. If elevation is unavailable, the crow stays above the launch coordinates. Pause interrupts the ascent; Reset returns to the starting point. Reduced motion keeps the camera angle and zoom fixed during a shorter ascent.

Generated scenes are imaginative impressions, with the crow centered in the initial forward view. They are not live photographs or verified reconstructions of the exact surroundings. Instagram photos are recent hashtag matches and can come from outside the chosen location.

Location access requires localhost or HTTPS. If access is declined or unavailable, the app opens the Chelsea demo and explains the fallback. **Use my location** retries or brings the crow back nearby; restart returns to the session’s starting location. Coordinates stay in page memory and are used to render Google Maps. Starting nearby does not automatically generate a paid scene.

Flights over 50 km pull the camera up from the departure point, follow a curved path around the globe, then descend into the destination and approach with the crow. A route card shows the flight stage and distance. Pause or map interaction cancels the transition. The browser’s reduced-motion preference skips the sweeping camera movement.

The original Chelsea flight remains the fallback starting route. Its controls support start, pause, resume, restart, speed changes, camera height, map labels, and nearby place discovery.

On desktop, Explore opens in a full-height sidebar beside the map; closing it expands the map. On phones, the map opens first and Explore opens a drawer. Music and Crow Studio are in the top toolbar. Responsive map-page layout is defined in `dist/layout.css`; include it when deploying `dist/`.

## What is included

- **Destination flight and landing:** Google Places search, map selection, and a visual flight to the selected location.
- **A crow inside the 3D map:** separate body and articulated wing GLBs with layered feather geometry. Wingbeats, gliding, banking, swerves, and gentle vertical sway animate the flight.
- **An independent following camera:** the view follows the route without copying each wingbeat or lateral swerve; pausing lets you orbit the scene.
- **360° image generation:** a 2048×1024 equirectangular image generated from the destination and landing coordinates, displayed in an interactive panorama viewer.
- **GPT-Live voice:** browser WebRTC audio with transcripts and application tools for flying, landing, taking off, image generation, and planning. The server creates the session using its own OpenAI key.
- **Sourced travel guidance:** OpenAI Responses with web search produces an itinerary around the destination, landing spot, saved places, budget, and interests, with clickable references.
- **Instagram photos:** the official Meta hashtag API supplies recent public images and carousel photos, with links to the original posts. Missing credentials, empty results, and provider errors have explicit states.
- **Place discovery and session saves:** nearby businesses and available address, opening hours, website, and phone details. Shortlisted places remain available while the page stays open.

## Crow appearance and music

### Soundtracks

Choose **♫ Music** on the flight page or below the crow studio to play three openly licensed Kevin MacLeod recordings: **Floating Cities**, **Night Vigil** and **Asian Drums**. Select a track, play/pause, mute or adjust the volume. Each complete track loops, and music continues while the player is closed or flight is paused. Track and volume/mute preferences are saved locally; playback always requires a fresh Play gesture after navigation or reload. On devices that restrict browser volume, use the device volume buttons.

Music downloads only after Play and is served from the app’s own `audio/` directory. The player works independently of Maps and the studio renderer. Publish `music.js`, `music.css` and the complete `audio/` folder with the app. All music is CC BY 4.0 with in-player attribution; retain [the bundled credits](dist/audio/CREDITS.md) when deploying or redistributing. These are openly licensed recordings, not the Naruto soundtrack. GPT Sites requires a separate deployment to receive this change.

### Crow studio

Open `customise.html`, or choose **Customise crow** on the flight page. The default **Perched** preview shows an upright crow with folded, layered wings, a continuous sculpted head and chest, curved bill and gripping feet. Rotate and zoom it or inspect portrait/side/wing/eye views. Choose **Flight**, or enable wingbeats, to view the articulated city model. Both poses share plumage, flight-feather, upper-wing and iris colour controls. Four presets provide starting palettes. **Save my crow** stores the colours in this browser for the next city flight; **Restore original colours**, followed by Save, restores the original materials. Unsaved edits warn before leaving. The perched pose is a separate studio mesh (`models/perched.glb`), not a new city-flight animation.

The studio needs WebGL2 but no Maps key. Its Three.js viewer is separate from the city, which still uses native Google models and depth occlusion. Colours are stored locally per browser and origin; they do not sync between phones, Zo preview and production. Changes apply when the flight page is opened again.

Custom flight colours use a narrowly filtered service worker to serve recoloured GLBs at same-origin paths ending in `.glb`. It changes material colours only and passes all unrelated requests through normally, without offline caching. This requires HTTPS (or localhost), service-worker permission and the included `crow-sw.js`/`crow-design.js` files at the app root. The studio reports save/setup failures; flight falls back to the original crow with a notice if browser setup is unavailable. An existing service worker at the app scope is not replaced. GPT Sites production has not been redeployed or verified for service-worker support.

The ready-to-deploy studio bundle is committed. To rebuild it after editing `src/customise.js`, run `npm ci && npm run build:studio`. Shared colour and GLB logic is in `dist/crow-design.js`. Run `npm run verify:studio` with the same browser environment options as the flight test to check generated GLBs, browser persistence, responsive controls and customised native city flight. Evidence is written to `_debug/studio/`.


## Run locally

### Requirements

- Node.js 22.6 or newer.
- A browser and device capable of rendering Google’s 3D Maps and WebGL. Voice requires microphone permission on localhost or HTTPS.
- A Google Maps browser API key with the Maps and Places access used by the app.
- An OpenAI project API key with access to the configured models for voice, image generation, and planning.
- Optional Meta app configuration for Instagram sign-in. The map and other configured features work without Instagram.

### Setup

```bash
git clone https://github.com/sayyidkhan/itachiscrow.git
cd itachiscrow
cp dist/config.example.js dist/config.js
cp .env.example .env
```

Edit `dist/config.js` with your restricted Google Maps **browser** key:

```javascript
window.CROW_MAPS_KEY = 'YOUR_GOOGLE_MAPS_BROWSER_KEY';
```

Edit `.env` and set `OPENAI_API_KEY`. Keep OpenAI and Meta credentials only in this server-side file or your server’s environment. Both `.env` and `dist/config.js` are ignored by Git. Never place an OpenAI or Meta token in `dist/`.

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000). `npm start` runs the same server. It loads `.env`, serves `dist/`, and provides `/api/*` on the same origin. Restart it after changing server configuration. The app uses no npm runtime dependencies and needs no frontend build.

A Python static server can display the map, but it cannot provide the AI or Instagram endpoints. Use the Node server for the complete experience.

Browser Maps keys are visible to visitors. Apply website and API restrictions appropriate to the local and deployed addresses. Alternatively, export `CROW_MAPS_KEY` in your shell or deployment environment and run `python3 scripts/configure.py` to generate the ignored `dist/config.js` without including the key in command-line arguments. This script requires Python; the Node server does not automatically turn `.env` values into browser Maps configuration.

### Server configuration

| Variable | Purpose / default |
| --- | --- |
| `OPENAI_API_KEY` | Server-only project key enabling voice, images, and plans |
| `OPENAI_LIVE_MODEL` | `gpt-live-1` |
| `OPENAI_TEXT_MODEL` | `gpt-5.6-terra`, used for travel plans and Live Responses delegation |
| `OPENAI_IMAGE_MODEL` | `gpt-image-2.5-flare`; overrides must support 2048×1024 output |
| `PORT` | `3000` |
| `META_APP_ID` | Meta developer app ID enabling the Instagram sign-in button |
| `META_APP_SECRET` | Server-only Meta developer app secret used to exchange authorization codes |
| `INSTAGRAM_ACCESS_TOKEN` | Optional manual fallback Facebook User token; unnecessary when using sign-in |
| `INSTAGRAM_USER_ID` | Optional manual fallback Instagram professional account ID |
| `INSTAGRAM_GRAPH_VERSION` | `v25.0` |
| `PUBLIC_ORIGIN` | Exact external origin when running behind an authenticated HTTPS reverse proxy |

The status endpoint reports whether credentials are configured; it does not guarantee that the provider has granted model access, permissions, or available quota. Provider calls may incur charges. No provider calls are made by the server unit tests.

### Connect Instagram

This integration uses **Instagram API with Facebook Login**. The app owner configures a Meta developer app once; travelers then use **Connect Instagram** instead of entering tokens.

1. Add Facebook Login to your Meta app and enable the Instagram API with Facebook Login. Configure the required `instagram_basic`, `pages_show_list`, and `pages_read_engagement` permissions and **Instagram Public Content Access**. Meta app review or advanced access can be required for people outside your app’s test roles.
2. In Facebook Login settings, register the exact **Valid OAuth redirect URI**: `http://localhost:3000/api/instagram/callback` for the default local URL, or `https://your-app.example/api/instagram/callback` for deployment. If you open the app at `127.0.0.1`, register that exact origin as well. Set `PUBLIC_ORIGIN` for the public HTTPS deployment.
3. Put `META_APP_ID` and `META_APP_SECRET` in the server’s `.env` or environment, then restart. Keep the app secret out of the browser.
4. In **Around you**, select **Connect Instagram** and sign in through Facebook. The signed-in user needs access to the Facebook Page connected to the Instagram professional account. If several eligible accounts are returned, the app asks which one to use.

The server exchanges the authorization code and keeps the User token in an isolated browser session. The browser receives only an opaque HttpOnly cookie. Sessions expire when the token expires or after eight hours, whichever comes first, and are lost when the server restarts. **Disconnect Instagram** clears that browser’s connection. OAuth state expires after ten minutes and cannot be reused. Public deployment uses Secure cookies and HTTPS.

The optional `INSTAGRAM_ACCESS_TOKEN` and `INSTAGRAM_USER_ID` variables retain a manually configured server account as a fallback. Leave them blank for sign-in-only behavior. Disconnecting an OAuth session does not disable this independently configured fallback.

The server first resolves the hashtag through `ig_hashtag_search`, then reads its `recent_media` edge. Meta returns public posts published within the last 24 hours and limits queries to 30 unique hashtags in a rolling 7-day period. Results may not be chronological. Hashtag media does not expose usernames, so cards attribute content to Instagram and link directly to each original post. Only image posts and available carousel images are displayed. This is not an exact GPS feed or continuous live stream, and the app does not scrape Instagram.

See Meta’s [server-side login flow](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow/), [Instagram account discovery](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started/), [hashtag search requirements](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag-search/), and [recent media fields and limits](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-hashtag/recent-media/).

## How it works

| Component | Implementation |
| --- | --- |
| Interface and flight logic | HTML, CSS, and vanilla JavaScript |
| City rendering | Google Maps JavaScript API, `maps3d` library |
| Crow rendering | Native `Model3DElement` objects with GLB assets |
| Place search and details | Google Places library |
| 360° viewer | WebGL equirectangular panorama viewer |
| API server | Node built-ins; bounded requests, origin checks, provider timeouts, and sanitized errors |
| Live voice | `POST /v1/live/sessions`, WebRTC audio, and Responses delegation |
| Images | OpenAI Image API, 2048×1024 JPEG, medium quality |
| Travel planning | OpenAI Responses API with web search and source citations |
| Instagram | Facebook Login code exchange, isolated browser sessions, and Meta Graph API hashtag search |
| Crow asset generation | Python, NumPy, trimesh, and Matplotlib |

The app positions the crow’s three model parts at geographic coordinates and updates their transforms during flight. Animation updates are capped at 24 per second. The renderer’s steady-state event gates the original flight controls, and Places loads when needed.

The map city imagery comes from Google. The generated panorama is a separate view built from the selected location context; it does not replace Google’s map imagery. The prompt requests a seamless full-sphere scene, but AI output may still contain perspective or seam artifacts.

The renderer loads GLBs from the app’s own `models/` directory. Deploy all three assets together. Google makes credentialed model requests: a successful ordinary download from a wildcard-CORS host does not prove that its native renderer can load the model.

The OpenAI integration follows the official [GPT-Live WebRTC flow](https://developers.openai.com/api/docs/guides/voice-webrtc), [Live delegation and tools](https://developers.openai.com/api/docs/guides/live-delegation), [image generation guide](https://developers.openai.com/api/docs/guides/image-generation), and [Responses web search guide](https://developers.openai.com/api/docs/guides/tools-web-search).

## Repository guide

| Path | Purpose |
| --- | --- |
| `dist/index.html`, `dist/style.css` | Map, flight controls, and place-detail dialogs |
| `dist/app.js` | Maps setup, flight animation, destination and landing controls |
| `dist/location.js` | Browser location permission, validation, and bounded retries |
| `dist/scout.js`, `dist/scout.css` | Travel scout, Instagram, panorama, and trip-planning UI |
| `dist/live.js` | GPT-Live WebRTC client and application tool handling |
| `dist/panorama.js` | Interactive 360° viewer |
| `dist/config.example.js` | Google Maps browser-key configuration template |
| `dist/models/` | Ready-to-use body and wing GLB assets |
| `server/index.mjs` | Static server and AI/Instagram endpoints |
| `server/server.test.mjs` | Mocked provider and server boundary tests |
| `.env.example` | Server configuration template with no credentials |
| `scripts/build_crow.py` | Crow geometry generator |

### Regenerate the crow assets — optional

The GLBs are already committed. Rebuilding with the pinned development dependencies requires Python 3.12 or newer (previously tested with Python 3.14.5):

```bash
python3 -m pip install -r scripts/requirements.txt
python3 scripts/build_crow.py
```

This overwrites the three flight GLBs and the studio's `perched.glb` in `dist/models/`, and produces `_debug/crow-geometry.png` for offline flight-geometry inspection. Mesh vertices use glTF Y-up coordinates; a shared root transform adapts them to Google's east/north/up model axes, allowing heading, pitch and wing roll to work together.

### Verification

```bash
npm ci
npm test
npm run verify:models
npm run verify:scout
CROW_BROWSER_EXECUTABLE=/path/to/chromium CROW_TEST_URL=http://127.0.0.1:3000/ npm run verify:browser
CROW_BROWSER_EXECUTABLE=/path/to/chromium npm run verify:journey
CROW_BROWSER_EXECUTABLE=/path/to/chromium npm run verify:location
CROW_BROWSER_EXECUTABLE=/path/to/chromium CROW_TEST_URL=http://127.0.0.1:3000/ node scripts/verify-takeoff.mjs
```

`npm test` covers server request validation, provider contracts, secrets handling, cancellation, citations, Instagram normalization and OAuth sessions, and static-file boundaries using mocked providers. OAuth tests cover state validation/replay, browser isolation, account selection, expiry, disconnect, and Secure production cookies. Browser checks require a suitable Chromium executable or debugging connection; the full map check also requires configured Google Maps access. Mocked checks do not establish that external accounts have access to the configured models or Meta permissions.

For the full map check, set `CROW_SOFTWARE_GL=1` to use Chromium’s SwiftShader WebGL2 renderer on a machine without a GPU, or set `CROW_CDP_URL` to attach to an existing Chromium debugging endpoint. It renders and reads back a WebGL2 pixel, then exercises the real map, model requests, flight controls, Places, and a 390×844 viewport. Screenshots and a redacted report are written under `_debug/verification/`. Inspect the screenshots: state assertions alone do not prove visibility. Mobile viewport coverage is not physical iPhone testing.

`verify:journey` checks a real flight to Singapore, rooftop landing at the Fullerton Hotel, continuous takeoff, and mobile layout without calling image or planning APIs. `verify:scout` uses mocked providers to check the interface, live controls, source links, request cancellation, panoramas, and Instagram sign-in/account selection.

`scripts/verify-takeoff.mjs` checks WebGL2 pixel readback, then uses the real Google renderer with a synthetic Singapore starting location. It captures desktop and mobile takeoff, pause and reset under `_debug/takeoff/`, records camera samples and GLB responses, and stubs application APIs to prevent AI calls. `CROW_SOFTWARE_GL=1` enables SwiftShader. Inspect the captures separately from the assertions; this is not physical iPhone or Safari testing.

`verify:location` uses synthetic browser coordinates with the real 3D renderer to check location startup, a Singapore–Paris flight, cancellation, reduced motion, and permission fallback/retry. It intercepts AI requests and saves screenshots and its report under `_debug/location-journey-verification/`.

An optional **paid** voice test exercises the real GPT-Live service using synthesized speech, without accessing your microphone or normal browser profile:

```bash
CROW_VERIFY_LIVE_API=1 npm run verify:live-api
```

On macOS it builds its speech fixture with `say` and `afconvert`. Elsewhere, supply `CROW_TEST_SPEECH_WAV=/path/to/speech.wav` and `CROW_BROWSER_EXECUTABLE`. Without the opt-in variable the test skips. See [the new feature verification record](docs/scout-verification.md) for observed results and remaining integration setup.

## Limitations

- Flight is a visual route through the map. Building collision avoidance and real-world drone navigation are not simulated.
- The crow is a custom stylized model animated by separate model-part rotations.
- Saved places, generated scenes, and plans are session state. Download the artifacts you want to keep before reloading.
- Google imagery can be dated or less detailed close to buildings, and Places fields can be missing or restricted. Map coverage and performance vary by location and device.
- Generated panoramas may invent details and cannot establish current weather, crowds, access, or exact physical surroundings.
- Itinerary prices and transfer times can be estimates. Check current hours, transport, and reservation availability using the linked sources. No bookings are made.
- Voice needs browser microphone permission, a usable WebRTC connection, and OpenAI model access. Instagram sign-in requires the app owner’s Meta app setup, required permissions, and an eligible professional account linked to a Facebook Page.
- See [rendering verification](docs/verification.md) for earlier browser evidence and device limitations.

## Deployment

The complete application needs **API endpoints and browser assets on the same origin**. A static-only upload of `dist/` will not enable GPT-Live, image generation, travel planning, or Instagram. GPT Sites uses the Worker adapter described below; GitHub commits do not redeploy it.

Run `npm start` with server-side environment variables. The server binds to loopback by default. For public access, put it behind an authenticated HTTPS reverse proxy and set `PUBLIC_ORIGIN` to the exact browser origin. The proxy can preserve the external `Host` or connect over loopback using the server's own local hostname and listening port, as Zo does. When supplied on a local proxy request, `X-Forwarded-Host` must match `PUBLIC_ORIGIN`. Browser origin checks, secure cookies and OAuth redirects still use the configured external origin. Its origin checks and local rate limits do not authenticate users; protect access to the billable endpoints at the proxy or add application authentication before exposing them publicly.

Keep `.env` and provider credentials outside published browser assets. Publish or serve the full `dist/` directory with its environment-specific Maps configuration and all four `models/*.glb` assets, including the studio's perched crow, plus the music and studio bundles. Keep model URLs on the same origin and use plain URLs ending in `.glb`: adding `?v=4` reproduced an invisible model despite HTTP 200 in the earlier tested renderer.

Instagram login state and sessions are currently held in memory. A deployment with multiple Node workers needs sticky sessions or a shared protected session store. Register the deployed callback URL in Meta before enabling sign-in.

The initial export came from Sites source commit `cebef75b960610f945f18e1a58216c5a37333e80`, with the browser Maps key moved into local configuration.

### GPT Sites deployment

`npm run build` prepares `dist/server/index.js` and `dist/client/` for the existing GPT Site. `scripts/build-sites.mjs` adapts the Node API handler to Web Requests and Responses, preserving request validation, provider calls, origin checks, and local rate limits. `worker/adapter.mjs` serves the browser Maps configuration from `CROW_MAPS_KEY`; the OpenAI key stays in the hosted `OPENAI_API_KEY` secret. The original `npm start` development flow remains available.

Set `PUBLIC_ORIGIN` to the exact published origin. Publish through GPT Sites after changing source or runtime secrets. Run `npm run build && node --test worker/adapter.test.mjs` to check the adapter with mocked providers. These checks do not verify real provider quota, voice audio, or GPU rendering.

Local builds can run without the platform-provided `.openai/hosting.json`; publication still needs the GPT Sites hosting configuration. When it is present, the build copies it into the output.

Instagram credentials are optional and have not been configured on GPT Sites. The inherited in-memory Instagram OAuth sessions and local rate limits are per Worker isolate, not durable or global; reliable multi-isolate Instagram login requires a shared session store before enabling it.
