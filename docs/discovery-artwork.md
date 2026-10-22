# Discovery artwork

Public UI artwork generated on 15 September 2026 with the built-in image generation tool, following the imagegen skill. These seven illustrations are intended for the public repository; they contain no personal reference photos. Final assets are in `dist/images/destinations/`, encoded as 768 × 512 WebP at quality 84.

## Prompt set

Each image used the following prompt, substituting its subject below:

> Use case: stylized-concept. Asset type: bundled destination-card artwork for Itachi's Crow travel app. Create one polished editorial travel illustration of {subject} Painterly gouache and finely textured digital illustration, rich natural colour, warm sunlight, atmospheric depth, sophisticated travel-magazine finish. Landscape 3:2 composition, recognisable landmark centred and fully visible with enough margin to crop to 4:3 on a small mobile card. Full bleed. No text, lettering, borders, watermarks, logos or UI.

- `gardens.webp`: Gardens by the Bay, Singapore: recognisable towering Supertrees with branching metal canopies covered in greenery, lush tropical garden paths and small conservatory domes in the distance.
- `marina.webp`: Marina Bay, Singapore: recognisable Marina Bay Sands with its three towers and boat-shaped rooftop beyond tranquil water, the Esplanade's spiky domes on the near waterfront.
- `kyoto.webp`: Kiyomizu-dera in Kyoto, Japan: recognisable sweeping Japanese temple roofs and tall wooden veranda on a wooded hillside, layered lush green foliage.
- `paris.webp`: Paris, France: recognisable Eiffel Tower above the Seine with stone embankments and elegant Parisian buildings.
- `sydney.webp`: Sydney Harbour, Australia: recognisable white tiled sails of the Sydney Opera House on its peninsula, harbour water and distant Harbour Bridge.
- `kampong.webp`: Kampong Glam, Singapore: recognisable golden dome of Sultan Mosque framed by colourful heritage shophouses and a charming pedestrian lane.
- `golden-gate.webp`: Golden Gate Bridge, San Francisco: recognisable international-orange suspension towers, long sweeping suspension cables and bridge deck spanning blue Pacific water between coastal headlands, atmospheric light mist in distance.

## Use

The landing page reuses six of these bundled illustrations in feature previews, with decorative HTML/CSS layers for flight, voice, panorama, photo reference, nearby discovery and a day plan. These are illustrative previews, not live map captures or actual provider results. The Author Studio preview uses the approved public default portrait. Layout lives in `dist/home.css`; feature images are lazy-loaded with reserved space and require no provider requests.

Discovery result cards now use `dist/discovery-media.js` to resolve a photo for each named place through the existing protected Google Places search. A conservative name match rejects unrelated results. Contributor credits and a Google Maps link accompany each photo. When a matching place has no usable photo, the app requests a location-specific AI illustration, visibly labelled as an imagined view. Search/quota failures show a retry control instead of silently spending the image allowance. Curated destination cards display their existing exact-landmark illustrations immediately while checking for a real photo, and retain those if none exists. The bundled artwork also remains on the landing page and discovery introduction; it is never substituted for a different venue in a result card.

Cards render immediately; a shared queue loads up to three previews concurrently. Changing the menu or location cancels stale work. Generated previews use the existing image model at low quality and the existing image allowance. They are cached for seven days, capped at 24 entries in browser Cache Storage and in Zo's private `.zo-data/discovery-images/` directory. Concurrent identical server generation requests share one provider call; failures are not cached. The Sites adapter uses its Cache API when available, with the same expiry and an in-memory fallback. Google photos, photo names, URLs and metadata are never put in these caches, per [Google's photo policy](https://developers.google.com/maps/documentation/javascript/place-photos).

Recommendation text is cached separately in sessionStorage for six hours, up to 12 location/mode/mood combinations, using coordinates rounded to three decimals in cache keys. Refresh picks explicitly requests new recommendations. This cache survives page reloads within the same tab, contains no photo data and expires independently of image previews. Browser storage failure does not prevent discovery. Tests cover progressive photos and credits, labelled AI fallback, bounded concurrency, cache reuse across menus/reloads, cancellation and the existing travel flows.
