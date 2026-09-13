# Crow rendering investigation

Test date: 13 September 2026. Browser: Chromium 136, Google Maps JavaScript `3.66.4d-beta`, ANGLE/SwiftShader WebGL2. Production hosting remains GPT Sites; all source changes were developed on a private Zo preview serving `dist/` as static files.

## Confirmed causes

The original live demo rendered the city but no crow. The initial JavaScript `fetch()` returned HTTP 200 for all three pinned GitHub assets. Google's renderer subsequently issued separate credentialed XMLHttpRequests, and the browser rejected those requests:

```text
Access to XMLHttpRequest ... has been blocked by CORS policy:
The value of the 'Access-Control-Allow-Origin' header ... must not be
the wildcard '*' when the request's credentials mode is 'include'.
```

Changing only the model `src` values to the existing same-origin `/models/*.glb` files immediately made the crow visible at the original 105 m absolute altitude, 2.2 scale and 48 m camera range. No geometry repair, renderer replacement, proxy or overlay was needed to resolve the disappearance.

With the bird visible, its Y-up vertex coordinates pointed its body downward in Google's east/north/up model frame. A shared +90° X root transform now adapts the three GLBs to that frame, preserving their shoulder pivot and allowing the existing heading, pitch and independent wing-roll animation to work together. The binary mesh data is byte-for-byte unchanged in all three assets; the change is to their scene transforms.

A separate camera defect was observed during real start/resume checks: the native fly-to transition left a range of approximately 161 m and changed the field of view from 50° to about 35.7°, while the frame loop only updated center and heading. The loop now reapplies range, tilt, roll and field of view as well, keeping the intended follow view (48 m normally, 90 m in higher view, 50° field of view). Starting flight ends the fly-to animation before applying the exact follow camera; reset now immediately restores the exact starting camera and pose.

## Isolation experiments

| Experiment | Observed result |
| --- | --- |
| WebGL2 clear and pixel readback | `[255, 0, 0, 255]`, GL error 0; graphics working |
| Original pinned URLs | Preliminary fetches succeeded; renderer XHRs failed credentialed CORS; crow invisible |
| Google windmill sample at the crow's position | Also failed its renderer CORS preflight; not a successful positive control |
| Larger models and 500 m altitude | No model appeared while renderer requests remained blocked |
| Same-origin original crow files | Actual crow visible without changing position, altitude or scale |
| Same-origin URLs with `?v=4` | HTTP 200 but no rendered crow; removing the query restored it |
| Plain same-origin URLs with root transform | Bird faces forward and both wings articulate visibly |

The query-string result is specific to the renderer tested here. Production uses plain URLs ending in `.glb`. The earlier buffer-view validator hints were not the cause of the disappearance.

## Evidence and regression checks

The final browser run passed with six HTTP 200 model responses (three `fetch`, three renderer `xhr`), no model request failures and no console errors. All three regenerated GLBs passed Khronos validation with zero errors, warnings or informational hints. All recorded follow/reset cameras have a 48 m range and 50° field of view. Live Places search returned 12 results; opening details, saving a place for the session and closing the dialog passed.

The following screenshots were visually inspected after the automated run. They show actual native model rendering in Google city imagery. The wing-extreme and banked-turn frames are deterministic samples of the real pose/camera functions, not a continuous recording of the whole route; start/pause/resume/reset exercise the normal animation loop. The sampled turn retains the prior paused progress label, while the exact sampled route position is recorded in the [machine report](evidence/report.json).

| Check | Screenshot |
| --- | --- |
| Original disappearance with the city visible | [Before the fix](evidence/00-original-missing.png) |
| Crow visible before starting | [Before flight](evidence/01-before-flight.jpg) |
| Moving along the route with a following camera | [Continuous flight](evidence/02-continuous-flight.jpg) |
| Pause freezes the route and leaves the crow visible | [Paused](evidence/03-paused.jpg) |
| Articulated wingbeat extremes | [Wings lowered](evidence/04-wing-down.jpg), [wings raised](evidence/05-wing-up.jpg) |
| Crow banks at a prepared-route turn | [Sampled banked turn](evidence/06-banked-turn.jpg) |
| Resume returns to the bird | [Resumed](evidence/07-resumed.jpg) |
| Reset restores starting pose and framing | [Reset](evidence/08-reset.jpg) |
| Live business details and session saving | [Place details](evidence/09-place-details.jpg) |
| 390×844 viewport before flight | [Mobile before flight](evidence/10-mobile-before-flight.jpg) |
| 390×844 viewport during flight | [Mobile flight](evidence/11-mobile-flight.jpg) |
| 390×844 viewport after pause/reset | [Mobile reset](evidence/12-mobile-reset.jpg) |
| Crow above a real building roof | [Above roof](evidence/14-above-roof.jpg) |
| Same camera and horizontal model position, crow hidden below roof | [Occluded by roof](evidence/15-occluded-by-roof.jpg) |
| Clicking a native Google business label opens the existing details flow | [Smithfield Hall NYC](evidence/16-native-place-click.jpg) |

For the controlled depth test, a real map click sampled a roof at latitude `40.74474623900293`, longitude `-73.99385240630164`, altitude `58.186015785370266` m. The camera remained fixed looking straight down. At the same latitude/longitude the crow rendered at `98.18601578537027` m, then disappeared behind the roof at `50.186015785370266` m. Only native model position changed; neither visibility, source, scale nor CSS was changed. Because both positions project to the same screen centre, this distinguishes building occlusion from the bird leaving the camera frame. [Above state](evidence/above.json) and [occluded state](evidence/occluded.json) record the settings. The normal route was restored afterwards.

Clicking the actual Google business icon for Smithfield Hall NYC opened the app's existing details dialog and returned its address, phone number and hours. This supplements the live Places-search test; the map click path was not replaced with a synthetic event.

The automated script deliberately reports visual review as required: HTTP status, valid GLBs and JavaScript state assertions cannot prove a visible bird. The screenshot review above is the additional visual verification.

## Reproduce

Configure `dist/config.js` following `config.example.js`, or set `CROW_MAPS_KEY` through your secret manager and run `python3 scripts/configure.py`. The key must permit the preview origin and the existing Maps/Places features. Credentials are excluded from Git and from diagnostic output.

```bash
python3 -m http.server 8000 --directory dist
```

In another terminal, with an installed Chromium executable:

```bash
npm ci
npm run verify:models
CROW_BROWSER_EXECUTABLE=/path/to/chromium CROW_SOFTWARE_GL=1 npm run verify:browser
```

Browser evidence is generated under `_debug/verification/`. Run without `CROW_SOFTWARE_GL` for hardware graphics. The default test URL is `http://127.0.0.1:8000/`; override it with `CROW_TEST_URL`. `CROW_CDP_URL` can attach to an existing browser instead of launching one.

## Deployment and limits

Deploy the complete `dist/` directory to GPT Sites, including the updated GLBs and environment-specific ignored configuration. No new Google API, production npm dependency, server endpoint or Zo service is required. The local Zo service is only a development preview; neither a GitHub push nor this PR redeploys GPT Sites.

SwiftShader proves real WebGL2 rendering but does not establish hardware frame rate. Initial city loading and camera transitions are slow in this software renderer. A 390×844 Chromium viewport checks mobile layout, not Safari/iOS compatibility. No physical iPhone was available for testing. The prepared route still has no collision-avoidance simulation; Google city geometry provides visual occlusion.

Reference documentation consulted: [native Google models](https://developers.google.com/maps/documentation/javascript/3d/models), [model properties](https://developers.google.com/maps/documentation/javascript/reference/3d-map-draw), and [camera properties and animation events](https://developers.google.com/maps/documentation/javascript/reference/3d-map).
