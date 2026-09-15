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
- The `itachiscrow-dev` process service listens only on localhost port `8806` and is reached through the Garden of Zo public router. Keep `PORT: 8806`, `HOST: "127.0.0.1"` and `APP_BASE_PATH: "/crow"` in private `config.json` and preserve the router path-aware browser contract.
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
