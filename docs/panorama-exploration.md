# Explore inside a generated panorama

Tap a spot in the 360° scene, inspect its marked preview, and choose **Explore this spot**. Dragging still rotates the view; keyboard users can turn with the arrow keys and press Enter to select the centre.

Confirmation sends the current panorama and a marked snapshot of the selected perspective to the existing image model through `POST /api/panorama/explore`. It uses OpenAI image edits to create a new 2048×1024 panorama with visual continuity. This is an imagined continuation, not a resolved real-world location, and does not move the Google map. The next generated panorama becomes the reference for another hop.

A slow zoom towards the selected point, animated rings and a waiting message remain visible during generation. Reduced motion disables the animations. Cancel, closing the viewer or changing map destinations aborts the browser request and discards late results. Failed requests preserve the previous scene for retry. A server cancellation cannot guarantee that an already accepted provider generation incurs no usage.

Deploy `panorama-journey.js`, `panorama-journey.css`, the updated viewer/scout/index files and the updated backend together. Restart the Node server or rebuild the GPT Sites Worker. No new API key or dependency is needed. Reference images are passed in memory; they are not saved by the endpoint. Bodies are limited to 22 MB, and the endpoint retains the existing origin, rate and concurrency checks.

Verification: `npm test`, `npm run verify:scout`, and `npm run build && node --test worker/adapter.test.mjs`. Browser coverage includes drag versus tap, confirmation without an API request, the two reference images, loading, success, failure, cancellation, mobile touch, and reduced motion. Synthetic browser fixtures do not establish generated-image quality or physical iPhone behaviour.

API reference: [OpenAI image generation and edits](https://developers.openai.com/api/docs/guides/image-generation).

## Verified on 13 September 2026

47 unit tests, map contract checks, 25 browser checks and the GPT Sites Worker build/adapter check passed. A live preview test generated a Golden Gate panorama, selected a marked point near the bridge, confirmed it, and received/rendered a second panorama from the real image-edits endpoint. Both API requests returned HTTP 200 and the browser recorded no uncaught errors. Screenshots and images are under `_debug/panorama-journey-live/`; synthetic interaction screenshots are under `_debug/scout-verification/`. Google map rendering was stubbed for this image-viewer test. Physical iPhone/Safari testing was unavailable.
