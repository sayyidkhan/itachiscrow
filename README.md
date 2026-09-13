# Itachi’s Crow

Explore Chelsea, New York through a flying 3D crow inside Google’s photorealistic city map.

Live demo: https://itachis-crow.promptalchemistlabs.chatgpt.site

## Features

- Original three-part GLB crow with articulated wings, layered feathers and banking turns.
- Prepared Chelsea flight route with gentle swerves and a following camera.
- Pause, orbit the map, resume, restart, change speed and camera height.
- Discover nearby businesses and inspect available Google Places details.

## Run locally

1. Copy `dist/config.example.js` to `dist/config.js` and add a Google Maps browser API key with access to 3D Maps and Places.
2. Run `python3 -m http.server 8000 --directory dist` from this repository.
3. Open http://localhost:8000.

The key is excluded from this repository. Browser keys are visible to visitors; configure website and API restrictions in Google Cloud.

## Source

`dist/` contains the deployable static site, including the three crow GLBs in `dist/models/`. `scripts/build_crow.py` generates the original models using Python, numpy, trimesh and matplotlib; the committed GLBs are ready to use without running that script.

## Hosting and scope

The live application is hosted on GPT Sites. This GitHub copy is a source export, not an automatic deployment pipeline. The prototype uses a prepared route; building collision avoidance, AI itineraries and social feeds are not implemented. Google imagery and place data depend on coverage and API access.

Exported from Sites source commit `cebef75b960610f945f18e1a58216c5a37333e80`, with the browser key moved into local configuration.
