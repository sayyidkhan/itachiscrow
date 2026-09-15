# Using Itachi’s Crow

[Back to README](../README.md) · [Open the app](https://itachis-crow.promptalchemistlabs.chatgpt.site) · [Usage limits](usage-limits.md)

## Fly somewhere

Open **Let’s explore**. Location permission is optional: if unavailable, the app starts at its Esplanade, Singapore fallback. Starting the map does not automatically generate an AI picture.

Open **Chat** or choose **Talk** from the floating controls on the map. Text works without microphone permission. Try:

- “Fly to Osaka and land at Shinsaibashi.”
- “Circle around the Eiffel Tower in Paris.”
- “Land here without an image.”
- “Find cafés nearby.”
- “Plan three days here focused on food.”

Text and **Talk** share one composer below the conversation. Tap a starter suggestion to edit it before sending, or write your own message. **Enter** sends; **Shift+Enter** adds a new line. The square **Stop current action** button appears while a request is running. Scroll back to read earlier replies without being pulled to the bottom; **Latest messages** takes you back.

Chat opens over the map on phones and desktops. Close it with **×** or **Escape**; your draft and conversation remain available when you reopen it. The map stays full-size. A **New** indicator appears when a reply arrives while chat is closed.

Choosing **Talk** starts voice and switches to floating captions over the map, with **Mute mic** and **End call** controls. Captions show the latest exchange; open **Chat** for the full conversation without ending your call. Closing chat returns to the captions. Microphone or connection errors reopen chat with an explanation. Map attribution remains clear below both overlays.

Every page uses the same **•••** menu: Map, Author Studio, Crow colours, Usage limits, Debug tools, Music, About, and Back to home. The current page is marked with a tick; map tools open the map when needed.

The guide reports progress and failures. **Stop current action** cancels pending work. Dragging the map pauses the flight so you can inspect the surroundings. Open **Debug** for manual destination, landing, flight, discovery, and planning controls.

Long journeys show a globe transition and route card. A device’s reduced-motion preference shortens or skips sweeping camera movement. This is a visual exploration route, not walking directions or collision avoidance.

## Crow mode and Author mode

The 3D map always begins with the crow. Your reference portrait should not cover the map.

After landing and generating a scene, use the scene window’s **Crow / Author** switch. Crow shows the generated crow scene. Author uses the reference portrait and current scene as image-generation context to create three variations of you at that destination. Each variation is a separate image request and uses the image allowance.

Switch back to Crow to return to the scene. Leaving the dialog or changing modes cancels pending Author generation; an already admitted provider request can still count toward usage. Download finished images you want to keep.

Author pictures are generated 2D scenes. They are not live photographs or a 3D avatar, and likeness and location details may vary.

## Change your reference photo

Open **Author Studio** in the map toolbar and tap **Change photo**. Select a clear reference photo, check its preview, then choose a destination and scene direction. **Use default** restores the approved Sayyid Khan portrait included with the app.

Supported portrait uploads are JPEG, PNG, or WebP up to 5 MB. Studio resizes the photo in your browser and keeps the selection for the current tab, including reloads and returning to the map. Author scenes and the map’s initial portrait reference use this selection. Choosing a photo does not upload it; the reference is sent to the backend and image provider when you request generation. It does not replace the public default or another visitor’s photo. Do not treat tab-held images or results as a permanent gallery.

The separate crow colour editor is at **`/crow-studio.html`**. Colour preferences belong to the current browser and site origin; they do not automatically follow you to another device.

## Explore a generated view

Drag a panorama to look around and scroll to zoom. Use **Save image** to download it. AI scenes may have seams, distorted geometry, or invented surroundings; the Google map and generated scene are different views.

Nearby place cards show whatever details Google returns. Follow their original links to confirm hours and availability. Saved places and plans are session state. Instagram needs an eligible connected account and separate owner setup; hashtag matches are not proof a post was taken at the exact location.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Usage limit message | Wait for the displayed retry time. Repeated reloads consume map-start allowance. People on shared Wi-Fi may share limits. |
| Map loads but a destination search fails | The map and place search are separate requests. Report the exact message; seeing a map does not prove search quota is available. |
| Empty or black map | Try a WebGL-capable browser/device and reopen once. If it persists, report device, browser, destination, and the displayed error. |
| Crow hidden by a building | Pause and orbit the camera, or try a higher view. Report persistent missing-model behaviour. |
| Voice fails | Allow the microphone and use HTTPS. Try typed chat while the owner checks voice access. |
| Author image fails | Check the reference format and size, then wait if limited. A configured key does not guarantee image-model access or quota. |

For owner diagnostics, see [Operations](operations.md). Avoid including API keys or reference photos in public bug reports.
