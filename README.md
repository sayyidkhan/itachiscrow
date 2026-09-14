# Itachi’s Crow

Explore a real 3D city with a flying crow, then imagine yourself at your destination with AI-generated travel scenes.

[Open the app](https://itachis-crow.promptalchemistlabs.chatgpt.site) · [User guide](docs/user-guide.md) · [Usage limits](docs/usage-limits.md) · [Setup and troubleshooting](docs/operations.md) · [Report an issue](https://github.com/sayyidkhan/itachiscrow/issues)

## Start exploring

1. Open the app and choose **Let’s explore**. Allow location access to start nearby, or use the Chelsea fallback.
2. Type **“Fly to the Eiffel Tower in Paris”**, or choose **Talk** and allow microphone access.
3. Ask to land and generate a view. In the scene window, switch between **Crow** and **Author** to generate pictures of yourself at that location.
4. Download the images you want to keep. Open **Author Studio** to change the reference photo and generate destination variations.

The crow stays in the map by default. Author mode creates separate images; it does not paste a face over the map or create a navigable 3D human.

## Features

| Feature | What it does |
| --- | --- |
| 3D flight | Animated crow body and wings, landing, takeoff, orbiting, and a following camera |
| Globe journeys | Pulls out to a globe view for long trips, with route names, distance, and progress |
| Chat and voice | Requests destinations, flights, generated scenes, nearby places, and travel plans |
| Author scenes | Uses a reference photo to generate several views of the author at the selected destination |
| Place discovery | Searches businesses and shows available Google details and photos |
| Travel planning | Produces an itinerary with web-search references |
| Music and crow appearance | Music player and a separate legacy crow colour studio |
| Usage protection | Persistent per-IP limits for the hosted app, plus Google key rotation |

Instagram is an optional integration requiring separate Meta configuration. It is not a general live feed of every post near a location.

## Documentation

| Document | Read it for |
| --- | --- |
| [User guide](docs/user-guide.md) | Controls, examples, Author mode, saving results, and common visitor problems |
| [Usage limits](docs/usage-limits.md) | Exact minute/hour allowances, resets, and what counts |
| [Operations](docs/operations.md) | Runtime configuration, architecture, deployment, and troubleshooting |
| [Personal assets](docs/personal-assets.md) | Images omitted from the public repository and replacement paths |
| [Crow studio](docs/crow-studio.md) | Earlier crow appearance implementation; its current route is `crow-studio.html` |
| [Rendering evidence](docs/verification.md) | Historical browser observations and device limitations |
| [Scout verification](docs/scout-verification.md) | Earlier integration evidence; not a guarantee of current provider access |

## Development

Requires Node.js 22.6+; install the pinned development dependencies with `npm ci`.

```bash
git clone https://github.com/sayyidkhan/itachiscrow.git
cd itachiscrow
npm ci
cp .env.example .env
cp dist/config.example.js dist/config.js
```

Configure credentials privately using the [operations guide](docs/operations.md). `npm run build` prepares the Sites Worker and browser assets. `npm start` runs the original Node server, but **the current map-start and place-search endpoints are Worker-only**: Node alone is not a complete preview of this version. Use the Sites Worker with its D1 binding for the full app.

For a hosted Zo or Sites deployment, configure these values as server-side secrets rather than committing them:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` | Enables chat, voice, image generation, and travel planning. Keep server-side. |
| `CROW_MAPS_KEY` | Primary Google Maps key used for the browser map and Places requests. |
| `CROW_MAPS_FALLBACK_KEY` | Optional second Google Maps key used for controlled retry and rotation. It shares the same Google project quota when both keys belong to that project. |
| `PUBLIC_ORIGIN` | Exact public base URL of the deployed app, for example `https://your-app.zo.computer`. It protects backend routes from requests made by other origins. |

The current renderer uses Google Maps JavaScript API's built-in 3D Maps support. It does **not** use the Map Tiles API, so `CROW_TILES_KEY` is not needed.

The browser source lives directly in tracked `dist/` files. Generated `dist/client/` and `dist/server/` are build output. Do not edit generated output as the source of a change.

## Limits of the experience

Google supplies the city imagery through Maps JavaScript API’s `maps3d` library. The current renderer does not use Cesium. Close-up detail, coverage, and performance depend on Google imagery and the device. Flight is visual animation, not collision-aware drone navigation.

Generated scenes can invent details and do not establish current conditions. Plans and business information need checking before travel. Download generated results before leaving; they are not a permanent photo library.

**Pushing GitHub does not redeploy GPT Sites.** Build and publish a new Sites version separately. Keep Google attribution and the [music credits](dist/audio/CREDITS.md) visible as required by the included assets and services.
