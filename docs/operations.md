# Setup, deployment, and troubleshooting

[Back to README](../README.md) · [User guide](user-guide.md) · [Usage limits](usage-limits.md)

This describes the current Sites Worker implementation. Historical verification documents record earlier observations, not proof that every provider or device works today.

## Runtime configuration

| Setting | Where / purpose |
| --- | --- |
| `OPENAI_API_KEY` | Server secret for chat, voice, images, and research; never put in browser assets |
| `OPENAI_TEXT_MODEL`, `OPENAI_LIVE_MODEL`, `OPENAI_IMAGE_MODEL` | Optional model overrides; inspect `.env.example` and `server/index.mjs` for configured defaults and request compatibility |
| `CROW_MAPS_KEY` | Primary Google key; served to the browser through `/config.js` on Sites |
| `CROW_MAPS_FALLBACK_KEY` | Optional second Google key, used for rotation and retry |
| `PUBLIC_ORIGIN` | Exact published HTTPS origin, without a path; protected Worker requests must match it |
| `DB` | Sites-managed D1 binding declared in `.openai/hosting.json`; required for protected routes |
| Meta settings in `.env.example` | Optional Instagram integration; not required for flight or Author scenes |

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
| `worker/adapter.mjs` | Worker request adapter, map-session endpoint, Places proxy, runtime configuration |
| `worker/usage-limits.mjs` | Durable admission counters and route policies |
| `db/schema.ts`, `drizzle/` | Database schema and published migration history |
| `scripts/build-sites.mjs` | Builds the browser and Worker deployment output |

## Local development caveat

`npm start` serves the original Node implementation on port 3000 and loads `.env`. It does not implement the new `/api/map-session` and `/api/places/search` routes. The current browser calls both, so a plain Node or Python static server is not a complete map preview. Do not diagnose its missing endpoints as provider quota failures.

Use a Sites Worker environment with `ASSETS`, `DB`, and the runtime settings for the full flow. Local Node configuration still requires the ignored `dist/config.js`; `.env` alone does not generate that file. Never commit a filled `.env` or config containing secrets.

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

Map startup alternates configured keys across browser loads and allows one fallback reload on supported startup failures. Places searches rotate on the server and can retry the other key for selected provider failures. A Places retry shares one app search allowance; a map reload needs another map-start admission.

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
