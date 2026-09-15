# Usage limits

Server-enforced per-IP limits use persistent D1 counters. Requests are charged before provider calls, including failed attempts. Retries with the second or third Google key use the same search allowance.

| Operation | Per minute | Per hour |
| --- | ---: | ---: |
| Chat API requests (including tool follow-ups) | 12 | 120 |
| Place searches | 20 | 100 |
| Map starts | 4 | 10 |
| Generated images / panoramas | 6 | 24 |
| Voice session starts | 3 | 12 |
| Research / trip plans | 3 | 20 |

Limits use fixed minute/hour windows and HTTP 429 with Retry-After. Atomic conditional UPSERT prevents concurrent over-admission. Counter identity is a daily SHA-256 hash of the connecting IP and operation; raw IPs are not stored. Expired counters are cleaned in bounded batches. Users sharing an IP share allowances. Missing database protection fails closed with HTTP 503.

Google 3D tiles, SDK place details and photo downloads still go directly from the browser to Google. A browser API key is visible, so application limits cannot impose a hard provider spending cap. Restrict keys to the site's web origin and required APIs, and configure Google project quotas. Voice limits cover session creation, not audio consumed within a granted session. IP limits reduce abuse but do not stop distributed clients.

Change thresholds in worker/usage-limits.mjs. Migrations live in drizzle; published migrations must remain immutable.

## Visitor documentation

The public page is `/usage-limits.html`, linked from the landing-page footer, the map About dialog, and Author Studio. Keep its table aligned with `usagePolicies` when changing thresholds.

Minute windows reset at the next clock minute and hour windows at the next clock hour. Requests rejected at the limit do not increment counters; admitted failed or cancelled attempts still count. Automatic map-key reloads consume another map-start allowance. Author batches consume three image requests. Existing Google map movement is not a new map start. These counters are independent of provider quotas.
