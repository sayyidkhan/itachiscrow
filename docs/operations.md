# Setup, deployment, and troubleshooting

[Back to README](../README.md) · [User guide](user-guide.md) · [Usage limits](usage-limits.md)

This describes the current Sites Worker implementation. Historical verification documents record earlier observations, not proof that every provider or device works today.

## Runtime configuration

| Setting | Where / purpose |
| --- | --- |
| `OPENAI_API_KEY` | Private server credential in `.env` or a runtime secret binding for chat, voice, images and research |
| `config.json` → `OPENAI_TEXT_MODEL`, `OPENAI_LIVE_MODEL`, `OPENAI_IMAGE_MODEL` | Model settings; defaults are documented in `config.example.json` |
| `CROW_MAPS_KEY1` | Primary Google key; served to the browser through `/config.js` on Sites |
| `CROW_MAPS_KEY2` | Optional second Google key, used for rotation and retry |
| `CROW_MAPS_KEY3` | Optional third Google key, used for rotation and retry |
| `PUBLIC_ORIGIN` | Exact published HTTPS origin, without a path; protected Worker requests must match it |
| `DB` | Sites-managed D1 binding declared in `.openai/hosting.json`; required for protected routes |
| `config.json` → Meta/Instagram settings | Optional Instagram credentials and API version |
| `config.json` → `PORT`, `HOST`, `APP_BASE_PATH`, `CROW_USAGE_DB`, `CROW_OWNER_PHOTO` | Local server and storage settings; ignored by the Worker where not applicable |

### Private configuration

Keep `OPENAI_API_KEY`, `CROW_MAPS_KEY1`, `CROW_MAPS_KEY2`, further numbered keys and `PUBLIC_ORIGIN` in `.env` or the service environment. Copy `config.example.json` to root `config.json` for everything else. Both files are private (permissions `600`), ignored by Git and must stay outside `dist/`. JSON configuration is never served over HTTP. Restart the Zo service after editing either file.

If upgrading from the JSON-based OpenAI configuration, move the existing `OPENAI_API_KEY` value to `.env` (or the deployment's runtime secrets) and remove that property from `config.json` before restarting or building. The loader rejects OpenAI keys in JSON, including explicitly selected build configs, so they cannot be embedded in the Worker bundle.

Zo loads template defaults, then `config.json`, then `.env`, then process environment overrides. Older environment-based settings remain accepted for deployment compatibility. Never overwrite an existing config with the blank example during setup.

The normal `npm run build` uses only `config.example.json`, so Zo's private config cannot accidentally enter a GPT handoff. In the GPT deployment environment, `npm run build -- --config /private/config.json` explicitly embeds that environment's config into the **server bundle only**. That bundle then contains credentials: keep it private and do not commit it or serve it as a browser asset. Runtime secret bindings override embedded config and remain compatible with the existing GPT deployment. JSON configuration is never copied to `dist/client/`; do not commit credentials to `config.example.json`.

The active city renderer is **Maps JavaScript API (`maps3d`)**. Place search uses **Places API (New)** through the Worker. Map Tiles API and Cesium are not used by this reverted renderer. Preserve appropriate website/API restrictions for browser calls; the server Places request must also be permitted by the credential’s restrictions. Do not remove restrictions blindly to diagnose a failure.

Browser Google keys are visible by design. OpenAI and Meta secrets stay server-side. Keys in the same Google project can share project quota; rotating keys is not a new allowance or a hard spending cap.

## Source map

| Path | Responsibility |
| --- | --- |
| `dist/app.js`, `dist/explore.html` | Map, crow transforms, camera, flight controls |
| `dist/chat.js`, `dist/live.js`, `dist/travel.js` | Conversation, voice, application actions, result flows |
| `dist/map-keys.js`, `dist/place-search.js` | Browser key selection and server place-search client |
| `dist/author.js`, `dist/customise.html` | Author Studio |
| `dist/scene-author.js`, `dist/scene-author.css` | Crow/Author scene switch and generated variations |
| `dist/crow-studio.html`, `src/customise.js` | Legacy crow appearance editor and bundled viewer source |
| `server/index.mjs` | Original Node API implementation and provider validation |
| `server/config-file.mjs`, `config.example.json` | Private JSON configuration loading and blank template |
| `worker/adapter.mjs` | Worker request adapter, map-session endpoint, Places proxy, runtime configuration |
| `worker/usage-limits.mjs` | Durable admission counters and route policies |
| `db/schema.ts`, `drizzle/` | Database schema and published migration history |
| `scripts/build-sites.mjs` | Builds the browser and Worker deployment output |

## Local development caveat

`npm start` serves the original Node implementation, loading `config.json` and `.env` (port 3000 by default). It does not implement the new `/api/map-session` and `/api/places/search` routes. The current browser calls both, so a plain Node or Python static server is not a complete map preview. Do not diagnose its missing endpoints as provider quota failures.

Use a Sites Worker environment with `ASSETS`, `DB`, and the runtime settings for the full flow. Local Node configuration still requires the ignored `dist/config.js`; `.env` alone does not generate that file. Never commit a filled `.env` or config containing secrets.

## Zo development runtime

`npm run start:zo` is the closest portable equivalent to the Sites Worker/D1 runtime. It serves the same browser assets, emits `/config.js`, applies the same protected route groups and limits, and stores the usage counters in SQLite at `.zo-data/usage.sqlite` by default. Set `CROW_USAGE_DB` in `config.json`; relative paths resolve from the project root. This database is runtime state and is ignored by Git.

For a public Zo preview, set `PUBLIC_ORIGIN` to that service’s exact HTTPS origin. The runtime rejects protected requests from other origins. It logs only redacted Places diagnostics: route, provider-reached flag, HTTP status, and error category; it never logs query payloads or credentials. A normal `npm start` preview intentionally remains the original Node server, while `start:zo` is for close Worker/D1-equivalent development.

### Garden of Zo route

The active Zo development deployment is the public router route `https://public-apps-sayyidkhan.zocomputer.io/crow`. Its backend is an internal process on port `8806`; the router strips `/crow` before proxying and supplies the route prefix to the runtime. Keep `PUBLIC_ORIGIN=https://public-apps-sayyidkhan.zocomputer.io` in the environment. In private `config.json`, set `PORT` to `8806`, `HOST` to `127.0.0.1` and `APP_BASE_PATH` to `/crow`. Do not use a direct `*.zocomputer.io` service URL for Itachi’s Crow.

## Publish an update

1. Start from the intended GitHub branch and preserve unrelated changes.
2. Restore approved personal assets if needed; see [the asset note](personal-assets.md). Include all GLBs and music credits.
3. Run `npm ci` when dependencies need installation, then `npm run build`.
4. Preserve `.openai/hosting.json` and its existing project ID and `DB` declaration. Include generated migration files in the Sites package. Published migrations must not be rewritten.
5. Push the exact source to the Site’s source repository, save a version, and deploy that version through Sites with the existing runtime secrets.
6. Check deployment status. Record the source commit and version so a later rollback targets the right build.

GitHub and Sites source are separate repositories. A GitHub push alone does not publish the app. Documentation-only GitHub edits do not require a new production build.

## Limits and rotation

The Worker admits protected requests before calling providers using atomic D1 counters. See [Usage limits](usage-limits.md) for thresholds and reset behaviour. It returns 429 and `Retry-After` when full, 503 if usage protection is unavailable, and 403 for an origin mismatch.

Map startup rotates across all distinct configured keys across browser loads. Supported startup failures try each remaining key once (at most one attempt per distinct key). Places searches rotate their starting key on the server using the admitted per-IP hourly search count and can retry each remaining key once for selected provider failures. All Places attempts share one app search allowance; each map reload needs another map-start admission. Place photos use the credential that served their search result.

Add `CROW_MAPS_KEY4`, `CROW_MAPS_KEY5`, and so on to extend the rotation. Numbered keys are sorted numerically, blanks and duplicates are skipped, and gaps are allowed. Places retries share a 45-second deadline. The older primary/fallback names remain accepted only when the corresponding numbered variable is absent.

Configure numbered keys separately in each deployment's secrets. Zo's managed service environment does not transfer to GPT Sites through GitHub.

Direct Google imagery, SDK place details, and photos are outside the app counters. Voice admission limits session creation, not audio duration. Provider quotas and billing controls remain separate.

## Diagnose before retrying

| Symptom | Check |
| --- | --- |
| HTTP 429 from the app | Operation group and `Retry-After`; shared IP usage; current D1 limits |
| HTTP 503 usage protection unavailable | `DB` binding and migration application; do not disable the limiter to mask it |
| HTTP 403 before provider call | Browser Origin versus `PUBLIC_ORIGIN` |
| Google search failure while map works | Places response category, API enablement, credential restrictions, and project quota separately from Maps |
| OpenAI could not be reached | Server network, status category, timeout, and model/key configuration; a status flag only establishes configuration |
| No crow despite a map | Same-origin GLB responses, MIME type, native model loading, camera position, and building occlusion |
| Author results missing | Reference image loading, upload validation, image permission/quota, and cancelled requests |

Capture status codes, route, time, and a redacted error. Do not log full keys, uploaded portraits, or raw provider authorization headers.

## Verification scope

`npm test` and `node --test worker/adapter.test.mjs` exercise existing mocked checks. They do not establish live quota, image likeness, voice connectivity, D1 deployment, or a visible crow. Browser scripts in `scripts/verify-*.mjs` require the appropriate browser and configuration; some use real Google calls. `verify:live-api` is explicitly opt-in and can incur provider charges.

For rendering changes inspect actual captures on the target device. A successful GLB download alone is not proof the model is visible. For documentation changes, check links and statements against source rather than making paid provider calls.

Instagram OAuth and conversational state retain inherited in-memory behaviour. Multi-instance persistence is not solved merely by adding D1 rate counters; Instagram needs separate setup and a suitable session strategy before reliable multi-instance use.
