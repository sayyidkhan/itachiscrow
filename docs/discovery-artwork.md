# Discovery artwork

Public UI artwork generated on 15 September 2026 with the built-in image generation tool. These six illustrations are intended for the public repository; they contain no personal reference photos. Final assets are in `dist/images/destinations/`, encoded as 768 × 512 WebP at quality 84.

## Prompt set

Each image used the following prompt, substituting its subject below:

> Use case: stylized-concept. Asset type: bundled destination-card artwork for Itachi's Crow travel app. Create one polished editorial travel illustration of {subject} Painterly gouache and finely textured digital illustration, rich natural colour, warm sunlight, atmospheric depth, sophisticated travel-magazine finish. Landscape 3:2 composition, recognisable landmark centred and fully visible with enough margin to crop to 4:3 on a small mobile card. Full bleed. No text, lettering, borders, watermarks, logos or UI.

- `gardens.webp`: Gardens by the Bay, Singapore: recognisable towering Supertrees with branching metal canopies covered in greenery, lush tropical garden paths and small conservatory domes in the distance.
- `marina.webp`: Marina Bay, Singapore: recognisable Marina Bay Sands with its three towers and boat-shaped rooftop beyond tranquil water, the Esplanade's spiky domes on the near waterfront.
- `kyoto.webp`: Kiyomizu-dera in Kyoto, Japan: recognisable sweeping Japanese temple roofs and tall wooden veranda on a wooded hillside, layered lush green foliage.
- `paris.webp`: Paris, France: recognisable Eiffel Tower above the Seine with stone embankments and elegant Parisian buildings.
- `sydney.webp`: Sydney Harbour, Australia: recognisable white tiled sails of the Sydney Opera House on its peninsula, harbour water and distant Harbour Bridge.
- `kampong.webp`: Kampong Glam, Singapore: recognisable golden dome of Sultan Mosque framed by colourful heritage shophouses and a charming pedestrian lane.

## Use

Destination cards show their corresponding landmarks. Local picks, day plans and nearby fallbacks reuse these as thematic artwork, not venue photography. Keep that distinction visible and preserve Google photo credits. Paths resolve relative to `discovery.js` so both `/crow/` on Zo and the GPT root deployment work. Missing images settle on a text fallback without repeated requests.
