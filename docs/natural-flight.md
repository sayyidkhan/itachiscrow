# Natural flight motion

The previous follow camera used the crow's exact weaving position and heading, cancelling much of its apparent sideways motion. The update follows the prepared route centre with a smoothed route heading, while the crow flies its own path.

Two overlapping spatial waves (64 m and 29 m wavelengths) create up to 4.3 m of lateral movement. Crow heading follows that path. Banking uses speed and path curvature, capped at 32°, with gradual easing. Pitch follows the altitude slope with a small wingbeat sway. The camera keeps its horizon level and ignores the small wingbeat bob.

The [right swerve](evidence/natural-flight/17-swerve-right.jpg) and [left swerve](evidence/natural-flight/17-swerve-left.jpg) were visually inspected in the real Google renderer. They are deterministic route samples, not a continuous recording. The crow visibly moves to opposite sides of the route-centred view, with Google attribution visible.

Verification on 13 September 2026 passed in Chromium 136 with working SwiftShader WebGL2 pixel readback. Measured lateral travel was −4.27 m to +4.29 m. Start/pause/resume/reset, 48 m camera framing, 50° field of view, live Places search (12 results), details and saving passed with no console errors or failed model requests. The [390×844 mobile flight capture](evidence/natural-flight/11-mobile-flight.jpg) was also visually inspected; mobile start/pause/reset passed. The [machine report](evidence/natural-flight/report.json) records the states and checks. Software rendering does not establish hardware smoothness, and no physical iPhone/Safari test was possible.

The prepared Chelsea route, native Google models, building depth, attribution and Places flow remain in use. This adds no collision avoidance or renderer dependency. No build, key or API changes are needed; the updated static files are served by the existing private Zo development preview. GPT Sites deployment remains a separate step.
