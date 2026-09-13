# Travel scout verification

Verified locally on 13 September 2026 with Node 25.8.1 and Chrome on macOS / Apple M2. Credentials were loaded from ignored local configuration; none are included in the repository.

## Actual provider checks

- **GPT-Live:** a real `gpt-live-1` WebRTC session transcribed synthesized speech and replied “Hi there.” The browser received audio packets with nonzero audio energy. Mute and unmute were acknowledged, then the session closed cleanly with final usage of 15 seconds. The test never requested the user's microphone. Evidence: `_debug/live-api-verification/report.json`.
- **Images:** the local `/api/panorama` endpoint returned a 2048×1024 generated JPEG from `gpt-image-2.5-flare` for Madison Square Park. The source image and its interactive 360° rendering were visually inspected; the crow is visible in the initial view. Evidence: `_debug/ai-verification/panorama.jpg` and `_debug/scout-verification/real-generated-panorama.png`.
- **Travel planning:** `/api/plan` returned an itinerary from `gpt-5.6-terra` with web sources. Evidence: `_debug/ai-verification/plan.json`.
- **Google Maps:** the original Chelsea flight and mobile controls passed real rendering checks. The new journey flew to Singapore, searched for the Fullerton Hotel, landed on its rendered rooftop, rose vertically while unfolding its wings, then departed forward. Rooftop and airborne screenshots were visually inspected. Evidence: `_debug/journey-verification/`.

The real voice check initially found that trimming the offer removed its terminal CRLF and made OpenAI reject the SDP. The server now preserves the browser's offer exactly, with a regression assertion covering that line ending.

## Automated checks

- `npm test`: 25 backend and seven voice tests, plus the map contract checks. These cover input validation, upstream cancellation, citation handling, credential boundaries, OAuth state/replay/isolation/expiry, map search, landing, continuous rooftop takeoff, and cancellation.
- `npm run verify:models`: all three GLBs validate without errors or warnings.
- `npm run verify:scout`: 18 browser checks when the optional locally generated panorama fixture is present, otherwise 17. Covers safe source links, WebGL interaction/cleanup, live controls, stale response rejection, Instagram sign-in/account selection/disconnect, and mobile layout. Providers are mocked.
- `npm run verify:browser` and `npm run verify:journey`: real Maps browser checks, requiring the local browser key and Chromium.
- `CROW_VERIFY_LIVE_API=1 npm run verify:live-api`: the opt-in real voice test described above.

## Remaining integration setup

Instagram OAuth and photo retrieval are implemented and tested with mocked Meta responses. Real Meta sign-in and photos have not been exercised: the app owner must configure `META_APP_ID`, `META_APP_SECRET`, the callback URI, and the required Meta access. Users can then connect eligible professional Instagram accounts through Facebook Login. Hashtag photos are recent public posts, not verified images of the exact landing coordinates.

Generated surroundings remain AI impressions. Mobile checks use a browser viewport rather than a physical phone. The changes run locally; the earlier hosted demo has not been redeployed.

## Integration with the current main branch

The merge retains Crow Studio, the perched and redesigned flight models, saved colour handling, and music alongside destination flight and the optional API features. README, application startup, navigation and dependency conflicts were combined. The Node server serves MP3 audio with its audio MIME type. Music remains reachable with the scout panel open, and the mobile header fits above it.

Verified on the merged files: clean dependency installation, Studio bundle rebuild, 32 backend/voice tests and map contract checks, all four GLB validations, and 17 browser checks with mocked Maps and provider responses. Browser checks include opening Music with the scout panel visible on desktop and mobile and detecting mobile header overlap. Desktop and 390×844 screenshots were inspected. No real AI-provider, real Maps rendering or physical iPhone tests were run for this merge. Production hosting and service configuration were not changed.
