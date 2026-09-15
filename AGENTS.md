# Itachi's Crow — environment guide

This repository is developed in two environments. Keep their responsibilities separate so a local fix does not accidentally replace the live deployment or expose credentials.

## Shared rules

- Treat GitHub `main` as the portable source of record. Pull before work and push completed, verified changes back to `main`.
- Use Node.js 22.6 or later. Run `npm ci`, then run the relevant checks; use `npm test` and `npm run build` before a handoff when practical.
- Never commit `.env`, private root `config.json`, real API keys, browser configuration containing a key, user uploads, generated private images, or provider tokens. Commit only blank `config.example.json`.
- The active map implementation uses Google Maps JavaScript API's native `maps3d` renderer and Places API (New). Do not reintroduce Cesium, the Map Tiles API, or `CROW_TILES_KEY`.
- Keep Google attribution visible. The crow must remain a real embedded 3D model, not a static image overlay.
- Record the commit SHA, checks run, and any external configuration required in each handoff.

## Zo Computer: portable development and browser verification

Use Zo for normal code changes, browser/WebGL2 investigation, and GitHub commits.

1. Clone or pull `main` from `https://github.com/sayyidkhan/itachiscrow.git`.
2. Run `npm ci`. On first setup only, copy `.env.example` to `.env` and `config.example.json` to private `config.json`; preserve existing values.
3. Keep OpenAI and Maps keys and the origin in `.env` or the Zo service environment:
   - `OPENAI_API_KEY`
   - `CROW_MAPS_KEY1`
   - `CROW_MAPS_KEY2` (optional)
   - `CROW_MAPS_KEY3` and further numbered keys (optional)
   - `PUBLIC_ORIGIN` set to Zo's exact public HTTPS URL when using a deployed preview.
   Put Instagram credentials, model names, port, host, base path and storage paths in private `config.json` (permissions `600`). Keep `OPENAI_API_KEY` out of JSON and supply it at runtime; JSON validation rejects it. Keep `.env` permissions `600` too. Restart after changes. Legacy environment overrides remain supported.
4. Do not add `CROW_TILES_KEY`.
5. Verify actual rendering in a WebGL2-capable browser when changing map/crow behaviour. A successful model download is not proof that the crow is visible.
6. Commit and push verified changes to `main` with a clear message.

### Routed Zo development deployment

- The Zo checkout lives at `Github/itachiscrow`.
- The public development route is `https://public-apps-sayyidkhan.zocomputer.io/crow`; its exact permitted `PUBLIC_ORIGIN` is `https://public-apps-sayyidkhan.zocomputer.io`.
- The `itachiscrow` process service (`svc_Kqp2wQoGh7g`, formerly `itachiscrow-dev`) listens only on localhost port `8806` and is reached through the Garden of Zo public router. Keep `PORT: 8806`, `HOST: "127.0.0.1"` and `APP_BASE_PATH: "/crow"` in private `config.json` and preserve the router path-aware browser contract.
- The public route declaration is in `Start/garden-of-zo/zo-router/public.routes.json`. Do not recreate a direct public HTTP service for this app.
- Public page navigation is shared through `dist/navigation.js` and `dist/navigation.css`; keep the same menu across all five pages. Location denial, timeout or unavailable data defaults to Esplanade, Singapore; a valid device location still takes precedence.
- The shared crow emblem is `dist/images/crow-mark.svg`, styled by `dist/brand.css` for page headers, the landing-page guide and the chat avatar. All five pages declare SVG, PNG and ICO favicons plus an Apple touch icon; derive these raster variants from the same SVG when changing the emblem. Keep explicit image dimensions so loading cannot shift the header.
- Keep every page stylesheet in the document head and reserve the navigation button in HTML so delayed scripts cannot expose an unfinished layout. `npm run verify:loading` checks all five pages during delayed downloads; set `CROW_TEST_URL` and `CROW_BROWSER_EXECUTABLE` for the target preview and browser.
- Map-only glass styling is in `dist/map-glass.css`, loaded after the shared styles. Use its surface variables for the header, chat, voice captions and controls; preserve the opaque fallback for reduced transparency/high contrast and keep blur off the map itself.
- Chat layout lives in `dist/conversation.css` and `dist/mobile.css`; `dist/mobile-ui.js` manages the on-demand chat overlay and voice captions using `crow:voice-state` / `crow:voice-caption` events from `dist/scout.js`. Keep the map full-size and leave its bottom attribution strip clear. Closing chat preserves drafts/history and must not end a voice call. `npm run verify:chat-interface` checks text, microphone denial and simulated voice controls across six viewports, using the same preview/browser environment variables; it does not establish live provider audio connectivity.
- Starter choices and the chat header's Ideas button open the in-chat browser in `dist/discovery.js` / `dist/discovery.css`. Local and day menus call shared `/api/recommendations` only on explicit generation/refresh, use the research allowance, and discard results when map context changes. Keep sources, illustrated cards, cancellation and named-place resolution through the existing map action. `npm run verify:discovery` exercises these flows with mocked providers.
- Discovery artwork lives in `dist/images/destinations/` as public, bundled WebP illustrations. Keep their module-relative paths compatible with both `/crow/` and GPT's root deployment. Local/day/nearby reuse is thematic artwork, not venue photography; preserve that distinction and Google photo credits. Artwork provenance and generation prompts are in `docs/discovery-artwork.md`.
- Destination cards expose **Circle landmark** through the shared `circle_around` action; the toolbar's **Circle** orbits the current destination/landing spot. Preserve one-turn completion, cancellation, still views for reduced motion and the embedded crow in the camera foreground. Eiffel Tower and Golden Gate Bridge have wider orbit profiles in `circleAround`; repeated orbits must not fly back to the landmark centre.
- The map toolbar and arrival carousel use `dist/flight-controls.js` / `dist/flight-controls.css` with existing flight state in `dist/app.js`. Keep Lift off, Free roam / Follow crow, Land here and Nearby available outside Debug. Arrival and completed landing open Google nearby places centred on `landingSpot || destination`; stale responses and a closed pending carousel must stay suppressed. Preserve photo contributor credits and map attribution. `npm run verify:flight-controls` tests the real browser app against a simulated Maps provider across six viewports; live WebGL verification is separate.
- Keep the flight toolbar compact with equal-width icon-and-label buttons. The idle hint is empty; action guidance and errors use a readable glass status surface. Flight and steering controls stay hidden while the map is loading or unavailable. Run browser checks against the configured public `/crow/` URL: the localhost origin is rejected for module requests by this deployment's origin protection.
- Direct steering uses `dist/steering.js` / `dist/steering.css` and the shared manual-flight engine in `dist/app.js`. Joystick input must stop on release, cancellation, blur, hidden tabs and new commands; keep its pointer capture local and keyboard shortcuts scoped to the focused joystick. The allowlisted `navigate` action is shared by text and voice, with two-second directional movements and no image generation for `land_here`. Preserve cancellation during takeoff and protect Google attribution. `verify:flight-controls` also checks steering and the shared command handler; `npm test` covers voice action validation and duplicate suppression.

- Author scene batches in `dist/scene-author.js` start three portrait requests concurrently, with independent errors/timeouts and progressive results. Preserve successful images across batches, snapshot comments per batch, retry only unfinished slots and discard cancelled/stale results. `npm run verify:scene-author` checks the real scene dialog with mocked provider responses across six viewports. It does not verify provider image quality.

### Zo limitation

Zo does not have access to the existing ChatGPT Sites project or its production secrets/D1 binding. A plain `npm start` Node preview is not a full preview of the current app: map-session and server Places-search routes require the Worker/D1 setup. Do not mistake those missing routes for a Google quota failure.

To test the full map flow in Zo, provision an equivalent Worker/D1 deployment in Zo's own account and configure its own secrets. Do not reuse or attempt to access the ChatGPT Sites project identifier.

## ChatGPT Work / Codex: live Sites ownership and production publishing

Use ChatGPT Work/Codex to operate the existing public Sites deployment at `https://itachis-crow.promptalchemistlabs.chatgpt.site`.

1. Pull the intended GitHub `main` commit into the Sites source checkout before making a production change.
2. Preserve the existing Sites project, access policy, runtime secrets, D1 declaration, and public URL.
3. Configure production secrets only through the Sites environment:
   - `OPENAI_API_KEY`
   - `CROW_MAPS_KEY1`
   - `CROW_MAPS_KEY2` (optional)
   - `CROW_MAPS_KEY3` and further numbered keys (optional)
   - `PUBLIC_ORIGIN` set to `https://itachis-crow.promptalchemistlabs.chatgpt.site`
4. Rebuild, save a version from the exact source commit, deploy it, and confirm deployment success. A normal build uses the blank `config.example.json` and existing runtime secrets. To adopt private JSON configuration in GPT, explicitly build with `npm run build -- --config /private/config.json` using GPT's own values; this embeds credentials in server output only. Never use Zo's private config for GPT or commit the generated server bundle.
5. A GitHub push never auto-deploys this Site. Production deployment is a separate explicit ChatGPT Work/Codex step.

## Configuration notes

- `PUBLIC_ORIGIN` is the exact public origin permitted to call protected backend routes. It must match the environment where the Worker is deployed.
- Browser Google Maps keys are visible by design and must be restricted by website/API in Google Cloud. Keep the OpenAI key server-side.
- A second Google key in the same Google Cloud project does not create a separate quota pool.
