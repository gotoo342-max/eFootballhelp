# eFootballhelp V1.2 — player data integration

This is a responsive installable web app (PWA), not a chatbot. It adds a player database, source status, refresh, JSON import, player detail view and player comparison to the mechanics/planner modules.

## Important data limitation
There is no official public KONAMI API configured or assumed here. The app does **not** log into a KONAMI account, access private game data, or claim that community records are official/live. The external provider connection is a generic adapter: connect only a data provider whose API and data use you are authorised to access. Do not put KONAMI passwords, session cookies or account tokens into this app.

## Run locally
1. Install Node.js 18 or newer on a computer or hosting service.
2. Extract this ZIP.
3. Run `npm start`.
4. Open `http://localhost:3000`.

## Connect an external JSON provider
1. Copy `.env.example` to `.env`.
2. Set `PLAYER_DATA_API_URL` to the provider's HTTPS JSON endpoint.
3. If the provider requires an API key, set `PLAYER_DATA_API_KEY`. The key stays on the server and is never sent to the browser.
4. Set `PLAYER_DATA_ARRAY_PATH` to the property containing the array (default `players`). If the endpoint returns a plain JSON array, leave the default; the adapter accepts it directly.
5. Restart the server. Use **Refresh source** in Player database.

Supported incoming fields include:
`id/cardId/playerId`, `name/playerName/title`, `team/club`, `position/pos`, `cardType/card_type/type`, `overall/rating/ovr`, and attributes `speed`, `acceleration`, `finishing`, `dribbling`, `passing`, `physical`, `stamina` (or nested under `stats`).

The UI labels the provider connection and timestamp. A provider must supply accurate current records itself; this adapter does not scrape websites or manufacture missing values.

## Import a JSON file on Android
Open the hosted app in Chrome, go to Player database → Import JSON, and choose a file. Accepted formats:
- `[{"id":"1","name":"Example","position":"CF","overall":99}]`
- `{"players":[ ... ]}`
- `{"data":{"players":[ ... ]}}`

Imported records are stored in browser storage on that device and are labelled as locally imported, not live-verified. Keep a backup of your source JSON file.

## Hosting
Deploy the project to a Node.js host that supports Node 18+ and environment variables. Set `PLAYER_DATA_API_URL` and optional key in the host dashboard, then enable HTTPS. Do not publish `.env` or API keys. For Android installation, open the HTTPS website in Chrome and choose **Install app** or **Add to Home screen**.

## Project structure
- `server.js` — secure server-side API proxy, normalizer and 5-minute cache
- `public/index.html` — application screens
- `public/app.js` — player catalog, import, compare and planner
- `public/style.css` — responsive interface
- `public/manifest.webmanifest`, `public/sw.js` — PWA installation and offline shell

## Current status
Mechanics learning and progression planning are educational/sandbox tools. Player card records require a connected permitted provider or a JSON import. No official KONAMI live integration is included until KONAMI publishes or grants an authorised API for this use.
