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

Text and **Talk** share one composer below the conversation. **Enter** sends; **Shift+Enter** adds a new line. The square **Stop current action** button appears while a request is running. Scroll back to read earlier replies without being pulled to the bottom; **Latest messages** takes you back.

The three welcome choices open a second menu inside chat:

- **Take me somewhere** opens illustrated destination cards, including Golden Gate Bridge and Eiffel Tower (previously labelled Paris). **Fly here** finds the place on Google Maps and flies there without generating an image. **Circle landmark** flies there and makes one orbit, closing chat so you can watch.
- **Find a local favourite** lets you choose hidden gems, coffee and bites, arts and culture, or outdoors. Choose **Find local picks** for AI suggestions near the map's current destination, with web source links.
- **Make a day of it** offers a balanced day, food trail, or slow scenic wander. **Build my day** creates a sourced morning-to-evening itinerary. Fly to individual stops or **Save this day** as a Markdown file.

Use **Ideas** in the chat header to return to these menus after starting a conversation. Browsing preserves your draft and history. Research starts only when you request picks or refresh them; changing moods alone does not call AI. Results are reused in the current page session and reset when the destination changes. The card artwork is decorative illustration, not a photograph of the venue. Suggestions are not reservations; use the source links to confirm details.

Chat opens over the map on phones and desktops. Close it with **×** or **Escape**; your draft and conversation remain available when you reopen it. The map stays full-size. A **New** indicator appears when a reply arrives while chat is closed.

Choosing **Talk** starts voice in one compact glass panel over the map. The latest exchange sits below the orb; the circular microphone button mutes or unmutes you, and the red phone button ends the call. Open **Chat** for the full conversation without ending your call. Closing chat returns to the captions. On short phones, the panel moves beside the joystick only while steering is open. Microphone or connection errors reopen chat with an explanation. Map attribution remains clear below both overlays.

The glass voice console includes a glowing, audio-reactive orb. **Auto ◇** opens its style picker: Auto, Orbit, Globe, Prism, Wave, Nexus, Helix, Ribbon, Halo and Morph. Auto follows connection, listening, thinking, action and speaking states; choosing another style keeps that shape while the status still follows the call. Your choice stays in this browser. The orb responds to microphone and guide audio without recording or storing it; muting your microphone still lets it respond to the guide. Reduced-motion settings show a still orb. Opening Chat pauses its animation; closing Chat restores the console without ending voice. Steering and voice remain available together.

Every page uses the same **hamburger** menu: Map, Author Studio, Crow colours, Usage limits, Debug tools, Music, About, and Back to home. The current page is marked with a tick; map tools open the map when needed.

The floating map toolbar keeps flight controls available outside chat. **Lift off** unfolds the crow's wings and rises from its perch; the same button pauses an active flight. **Free roam** stops the camera following the crow so you can drag, zoom and explore. **Follow crow** brings the camera back without moving the crow. **Land here** lets you choose a rooftop, square or path on the map; tap it again or press Escape to cancel.

Choose **Steer** at the bottom left. When perched, choose **Lift off** above the joystick (or in the flight toolbar): the crow unfolds its wings, climbs, then moves forward. Steering unlocks after the animation; **Stop lift off** interrupts it. Hold and drag up to fly forward, down to reverse, and left/right to turn; diagonal movement turns while flying. Release to hover. With the joystick focused, arrow keys steer, Page Up/Page Down change height, and Space or Escape stops. The control stops on lost focus or when you switch tabs. Opening text **Chat** closes steering; choosing **Steer** closes text chat and preserves your draft and history. **Talk** remains available while steering, with voice captions and call controls over the map.

The circular **Roll** button unlocks after liftoff and makes the 3D crow do one barrel roll, returning upright while the camera stays level. Stop or another flight action cancels it. Reduced-motion settings skip the roll. The circular **1×** button cycles steering speed through **2×**, **3×**, then **1×**. It changes forward, reverse and height movement, including directional voice commands; turning speed stays steady. Speed lasts for the current page session and does not change destination journeys or landmark orbits.

Choose **Talk** and say “go forward”, “turn left”, “turn right”, “fly higher”, “fly lower”, “stop”, “free roam”, or “follow the crow”. Each directional command moves or turns for two seconds, then hovers; repeat to continue. “Land here” lands at the crow's actual position without generating an image. Named destinations such as “Fly to Marina Bay Sands” still use normal place search and flight. Voice requires microphone permission and a working voice connection; the joystick does not. Steering is visual exploration, with no building collision detection.

Arriving at a destination or completing a landing opens a nearby-place carousel with sights, parks, museums, cafés and restaurants returned by Google. Swipe the cards, use the arrows, or focus the carousel and press the arrow keys. Photos include contributor credits when available. Select a card to view details, save it for the session, or land there. **×** closes the carousel; **Nearby** reopens it without repeating a successful search. A new destination or landing spot clears old results. On smaller screens, chat and voice captions temporarily cover the carousel; closing them reveals it again.

Choose **Circle** in the map toolbar to orbit the current landmark or selected landing spot. **Stop circle**, Pause, free roam or steering interrupts it. Eiffel Tower and Golden Gate Bridge use wider paths; the camera faces the landmark with the 3D crow in the foreground. A completed orbit opens nearby places. With reduced motion enabled, Circle shows a still landmark view. Text and voice also accept “Circle around the Golden Gate Bridge” or “Circle around the Eiffel Tower”.

The guide reports progress and failures. **Stop current action** cancels pending work. Dragging the map also enters free roam. Open **Debug tools** for additional manual destination, flight, discovery, and planning controls.

Long journeys show a globe transition and route card. With chat open, the route and progress sit below its heading; in voice mode they sit above the captions. Closing chat keeps the journey visible on the map. A device’s reduced-motion preference shortens or skips sweeping camera movement. This is a visual exploration route, not walking directions or collision avoidance.

## Vote for the project

Choose **Vote for our project** on the homepage to open the hackathon gallery in a new tab. On the map, a gold **Vote** button appears beside **hamburger** after the first completed destination flight, then every third flight with at least two minutes between prompts. It shines twice and disappears after 15 seconds, staying available while hovered or focused. Reduced-motion settings disable the shimmer. Opening the voting link stops map prompts for the rest of that tab’s session; it does not cast a vote automatically.

## Crow mode and Author mode

The 3D map always begins with the crow. Your reference portrait should not cover the map.

After landing and generating a scene, use the scene window’s **Crow / Author** switch. Crow shows the generated crow scene. Author uses the reference portrait and current scene as image-generation context to create three variations of you at that destination concurrently. Three animated cards show progress, and each finished image appears immediately. Select a card to preview and save it. Each variation is a separate image request and uses the image allowance.

Add optional comments under **Shape your next variations**, then choose **Generate 3 more** for another concurrent batch. Try a closer portrait, a different outfit or a candid pose. Your reference identity and location stay consistent; previous results remain in the dialog. If an image fails, retry its card individually or choose **Retry unfinished**. Successful images are not regenerated. Comments apply to new batches; retries use the original direction.

Switch back to Crow to return to the scene. **Stop**, leaving the dialog or changing modes cancels pending Author generation; an already admitted provider request can still count toward usage. Reopening retains finished images and comments for the same scene, and unfinished requests resume only when you choose retry. A new scene clears the previous gallery. Download finished images you want to keep.

Author pictures are generated 2D scenes. They are not live photographs or a 3D avatar, and likeness and location details may vary.

## Change your reference photo

Open **Author Studio** in the map toolbar and tap **Change photo**. Select a clear reference photo, check its preview, then choose a destination and scene direction. **Use default** restores the approved Sayyid Khan portrait included with the app.

Supported portrait uploads are JPEG, PNG, or WebP up to 5 MB. Studio resizes the photo in your browser and keeps the selection for the current tab, including reloads and returning to the map. Author scenes and the map’s initial portrait reference use this selection. Choosing a photo does not upload it; the reference is sent to the backend and image provider when you request generation. It does not replace the public default or another visitor’s photo. Do not treat tab-held images or results as a permanent gallery.

The separate crow colour editor is at **`/crow-studio.html`**. Colour preferences belong to the current browser and site origin; they do not automatically follow you to another device.

## Explore a generated view

Drag a panorama to look around and scroll to zoom. Use **Save image** to download it. AI scenes may have seams, distorted geometry, or invented surroundings; the Google map and generated scene are different views.

Nearby place cards show Google results around the current destination or landing spot, with distance from that stop. They use photos of those venues when available; missing or failed photos show “No photo available”, never an illustration of another destination. Follow their original links to confirm hours and availability. Saved places and plans are session state. Instagram needs an eligible connected account and separate owner setup; hashtag matches are not proof a post was taken at the exact location.

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
