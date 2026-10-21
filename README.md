# WatchNav — Tizen navigation for Galaxy Watch 3, pushed from iPhone

Turn-by-turn navigation on the watch, destination sent from your iPhone via a
free relay service. Fully free stack: OpenStreetMap tiles, OSRM public router,
Nominatim geocoder, zero-dependency Python relay.

## How it works

```
 iPhone Shortcut (share sheet / tap)
        │  POST /route  {code, name, lat, lon} or {code, query}
        ▼
   Relay service (Python, any free host)
        ▲  GET /route?code=…&since=…   (poll every 15 s)
        │
 Galaxy Watch 3 — WatchNav .tpk (Tizen web app)
        │  GPS → OSRM route → tile map + turn-by-turn + vibration
        ▼
```

## Components

| Path | What |
|---|---|
| `relay-service/server.py` | Push/poll relay. `python3 server.py` (`PORT`, `STATE_FILE`, `ROUTE_TTL_SEC` envs). |
| `watch-app/` | Tizen web app source. Edit `js/config.js`, then package (see docs). |
| `docs/` | Setup guides. |

## Quick start

1. **Deploy the relay** — free options:
   - [Render](https://render.com) free web service: new Web Service → run `python3 server.py`, set `PORT=10000` (or whatever Render assigns; it provides `PORT`).
   - A home PC/Mac running `python3 server.py` + Tailscale Funnel, or any VPS.
   - Get your URL, e.g. `https://watchnav.onrender.com`.

2. **Pair** — open `https://<relay>/pair` to mint a 6-digit code (or pick any
   6 digits). Put the relay URL + code in `watch-app/js/config.js`.

3. **iPhone Shortcut** — see `docs/iphone-shortcut.md`. Share a Maps pin or run
   the shortcut, it POSTs the destination to the relay.

4. **Package & install the watch app** — see `docs/packaging.md`. Requires
   Tizen Studio CLI and free Samsung certificates (steps included).

5. Open WatchNav on the watch → send a destination from the iPhone → the watch
   buzzes and shows "Navigate to X?" → tap the banner → navigation starts.

## Data sources & fair use

- OSRM demo server (`router.project-osrm.org`): free, no key, no SLA — fine for
  personal use. For heavy use, self-host OSRM or use a free API-key tier
  (OpenRouteService, GraphHopper) — swap the URL in `js/app.js`.
- OSM tile server: light personal use only. CARTO Voyager tiles (commented
  alternative in `config.js`) are a good free fallback.
- Nominatim: 1 req/s max — only used when you push a place name instead of
  coordinates.
