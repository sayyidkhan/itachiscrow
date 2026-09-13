# Personal travel flow — 13 September 2026

Implemented on the private Zo development preview. GPT Sites production was not redeployed.

## Verified

- 35 server and voice protocol unit tests, plus the map contract suite.
- The GPT Sites Worker build and adapter test also cover multipart portrait uploads and reject the owner-only saved-photo fallback. The upstream Worker adapter commit was incorporated before pushing. No production publication was performed by this change.
- 20 browser integration checks, including Paris selection, upload/removal, portrait display/download, no-offer state, safe source rendering, mobile layout and discarding a delayed portrait after a destination change. Provider and Maps calls in this suite are mocked.
- A real OpenAI image-edit request using the owner's supplied reference produced a recognisable Paris portrait. The result was visually inspected and displayed in the desktop and mobile UI. UI review reused that response to avoid paying for duplicate generations.
- A real Responses web-search request returned 41 sources and no offers satisfying the current-date requirements. Its response was also replayed for UI review.
- Actual Google Places returned six cafés near the Eiffel Tower, including Kozy Bosquet, Le Castel Café and Terres de Café. Cards displayed names, addresses, ratings and Google Maps links. Google returned empty photo arrays, including on a separate place-details check; inline café photos could not be visually verified. Cards link to photos and reviews on Maps.
- Chromium with SwiftShader passed a WebGL2 pixel-readback test. The final Paris viewpoint visibly frames the Eiffel Tower and keeps Google attribution visible. The map centre matches the crow coordinates, with centre altitude 181.8 m, crow altitude 180 m, camera range 52 m and tilt 85°.

## Arrival correction

The first real test timed out while Google's relative-camera transition kept showing New York. It eventually rendered Paris, but the camera settled approximately 1.4 km away instead of the requested 52 m. The Eiffel Tower approach now uses a fixed absolute flight altitude and direct camera updates, keeping camera and model positions aligned. Other destinations retain their terrain-relative behaviour; rooftop landing and takeoff remain covered by the contract suite.

## Remaining limitations

- The real voice smoke test failed while gathering WebRTC network candidates, before an OpenAI session could be established. Actual speech input/output and spoken control of the complete new flow remain unverified. The voice tool declarations and browser dispatch paths are implemented; mocked protocol checks pass.
- Physical iPhone/Safari testing was unavailable. Mobile checks used a Chromium viewport.
- Instagram is not configured on this preview. It still requires the documented Meta professional-account connection and permissions.
- Offer summaries are AI research with source links, not guaranteed availability. Discount cards require a searched source URL and an explicit unexpired date; users must confirm terms with the venue.

Personal reference files and generated portraits are excluded from Git. Local test artefacts are under `_debug/travel/`. The user-facing sample portrait is at `/home/workspace/Images/itachiscrow/paris-travel-portrait.jpg`.
