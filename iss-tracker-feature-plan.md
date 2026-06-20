# ISS Live Tracker — Feature Plan ✓ Complete (2026-06-19)

## Goal
Add a live-updating ISS (International Space Station) tracker to the site: a world map showing the station's current position, updating in near real-time.

**Route:** `/projects/iss`

---

## 1. Architecture

```
┌─────────────────┐         ┌──────────────────────┐         ┌────────────────────┐
│   Browser/UI     │ ──poll──▶│  AWS Lambda Function  │ ──fetch──▶│  Open Notify API    │
│  (Map + Marker)  │◀──JSON──│  (Amplify Function)   │◀──JSON───│  iss-now.json       │
└─────────────────┘         └──────────────────────┘         └────────────────────┘
```

A backend proxy is required because:
- The site is served over HTTPS (AWS Amplify)
- Open Notify only serves over plain HTTP
- Browsers block mixed HTTP/HTTPS content

The Lambda function fetches from Open Notify and re-serves it over HTTPS to the browser.

---

## 2. Data Source

| Purpose | Endpoint | Notes |
|---|---|---|
| Current ISS position | `http://api.open-notify.org/iss-now.json` | Returns lat/long + timestamp. Poll every 5s. |

"Next pass over you" is deferred to a future version.

---

## 3. Frontend

- **Map:** Leaflet.js with OpenStreetMap tiles — free, no API key required
- **ISS marker:** Custom icon, position interpolated smoothly between polls
- **Info panel:** Current latitude, longitude, altitude (~408 km), speed (~27,600 km/h)
- **Trail (optional):** Fading line of last N positions showing recent ground track

---

## 4. Backend — AWS Lambda via Amplify Functions

A single Lambda function proxies the Open Notify API and caches the response for ~3 seconds to avoid hammering the upstream if multiple users are active.

**Route:** `GET /api/iss-position`

**Response:**
```json
{
  "latitude": 45.123,
  "longitude": -93.456,
  "timestamp": 1718800000,
  "stale": false
}
```

If Open Notify is unreachable, return the last cached position with `"stale": true` so the UI can show a "data may be delayed" notice instead of breaking.

### Lambda setup (step-by-step)
1. Install the Amplify CLI: `npm install -g @aws-amplify/cli`
2. Initialize Amplify in the project: `amplify init`
3. Add a function: `amplify add function` → choose Lambda, name it `issPosition`
4. Write the fetch + cache logic in the generated handler
5. Add an API route: `amplify add api` → REST → attach to the `issPosition` function
6. Deploy: `amplify push`
7. Use the deployed API URL as the poll target in the frontend

---

## 5. Build Steps

1. **Static map** — Render Leaflet map on the page, no live data. Confirm it loads.
2. **Single fetch** — Call the Lambda endpoint once on load, place an ISS marker at the returned coordinates.
3. **Polling loop** — Add 5-second interval refetching, update marker position.
4. **Smooth animation** — Interpolate marker movement between polls so it glides rather than snaps.
5. **Error/stale states** — Show a "data may be delayed" notice when `stale: true`.
6. **Info panel** — Display lat, long, altitude, and speed alongside the map.
7. **Polish (optional)** — Ground track trail, mobile layout check.

---

## 6. Deferred / Stretch Goals

- "Next pass over your location" using browser geolocation
- Moon phase + APOD panels alongside the tracker
- Push notifications for upcoming visible passes
- Historical ground track playback
