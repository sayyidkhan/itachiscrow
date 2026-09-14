# Itachi's Crow — environment guide

This repository is developed in two environments. Keep their responsibilities separate so a local fix does not accidentally replace the live deployment or expose credentials.

## Shared rules

- Treat GitHub `main` as the portable source of record. Pull before work and push completed, verified changes back to `main`.
- Use Node.js 22.6 or later. Run `npm ci`, then run the relevant checks; use `npm test` and `npm run build` before a handoff when practical.
- Never commit `.env`, real API keys, browser configuration containing a key, user uploads, generated private images, or provider tokens.
- The active map implementation uses Google Maps JavaScript API's native `maps3d` renderer and Places API (New). Do not reintroduce Cesium, the Map Tiles API, or `CROW_TILES_KEY`.
- Keep Google attribution visible. The crow must remain a real embedded 3D model, not a static image overlay.
- Record the commit SHA, checks run, and any external configuration required in each handoff.

## Zo Computer: portable development and browser verification

Use Zo for normal code changes, browser/WebGL2 investigation, and GitHub commits.

1. Clone or pull `main` from `https://github.com/sayyidkhan/itachiscrow.git`.
2. Run `npm ci` and copy `.env.example` to `.env` for local-only configuration.
3. Add secrets only in Zo's secret/environment settings:
   - `OPENAI_API_KEY`
   - `CROW_MAPS_KEY`
   - `CROW_MAPS_FALLBACK_KEY` (optional)
   - `PUBLIC_ORIGIN` set to Zo's exact public HTTPS URL when using a deployed preview.
4. Do not add `CROW_TILES_KEY`.
5. Verify actual rendering in a WebGL2-capable browser when changing map/crow behaviour. A successful model download is not proof that the crow is visible.
6. Commit and push verified changes to `main` with a clear message.

### Routed Zo development deployment

- The Zo checkout lives at `Github/itachiscrow`.
- The public development route is `https://public-apps-sayyidkhan.zocomputer.io/crow`; its exact permitted `PUBLIC_ORIGIN` is `https://public-apps-sayyidkhan.zocomputer.io`.
- The `itachiscrow-dev` process service listens only on localhost port `8806` and is reached through the Garden of Zo public router. Keep `APP_BASE_PATH=/crow` and preserve the router path-aware browser contract.
- The public route declaration is in `Start/garden-of-zo/zo-router/public.routes.json`. Do not recreate a direct public HTTP service for this app.

### Zo limitation

Zo does not have access to the existing ChatGPT Sites project or its production secrets/D1 binding. A plain `npm start` Node preview is not a full preview of the current app: map-session and server Places-search routes require the Worker/D1 setup. Do not mistake those missing routes for a Google quota failure.

To test the full map flow in Zo, provision an equivalent Worker/D1 deployment in Zo's own account and configure its own secrets. Do not reuse or attempt to access the ChatGPT Sites project identifier.

## ChatGPT Work / Codex: live Sites ownership and production publishing

Use ChatGPT Work/Codex to operate the existing public Sites deployment at `https://itachis-crow.promptalchemistlabs.chatgpt.site`.

1. Pull the intended GitHub `main` commit into the Sites source checkout before making a production change.
2. Preserve the existing Sites project, access policy, runtime secrets, D1 declaration, and public URL.
3. Configure production secrets only through the Sites environment:
   - `OPENAI_API_KEY`
   - `CROW_MAPS_KEY`
   - `CROW_MAPS_FALLBACK_KEY` (optional)
   - `PUBLIC_ORIGIN` set to `https://itachis-crow.promptalchemistlabs.chatgpt.site`
4. Rebuild, save a version from the exact source commit, deploy it, and confirm deployment success.
5. A GitHub push never auto-deploys this Site. Production deployment is a separate explicit ChatGPT Work/Codex step.

## Configuration notes

- `PUBLIC_ORIGIN` is the exact public origin permitted to call protected backend routes. It must match the environment where the Worker is deployed.
- Browser Google Maps keys are visible by design and must be restricted by website/API in Google Cloud. Keep the OpenAI key server-side.
- A second Google key in the same Google Cloud project does not create a separate quota pool.
