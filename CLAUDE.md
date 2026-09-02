# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Raspberry Pi edge gateway for **one** mine. ESP32 sensor devices POST telemetry over local Wi-Fi; the gateway persists it to SQLite, applies site-configured deterministic rules, optionally consults a local ML adapter, and pushes updates to dashboards over WebSocket. Node 22+, ESM (`"type": "module"`), no build step for the server.

## Commands

```sh
npm start                      # gateway on 0.0.0.0:3000
npm run dev                    # node --watch
npm run dev:demo               # second isolated gateway on :3001 (demo DB, preset rules)
npm test                       # node --test (test/*.test.js)
node --test test/gateway.test.js                 # single file
node --test --test-name-pattern "paginated"      # single test
npm run build:dashboard        # vite build -> dashboard/dist (server serves it if present)
npm run simulate:esp32         # 3 fake devices -> :3000, normal readings
npm run simulate:esp32:risky   # threshold-crossing readings -> :3001 demo gateway
npm install --prefix dashboard # dashboard deps live in dashboard/package.json
```

Dashboard dev with HMR: `npm run dev --prefix dashboard` (Vite on :5173, proxies `/api` and `/ws` to :3000).

## Architecture

`server.js` → `src/server.js:createGateway()` wires everything and returns `{ app, server, db, repository, mlProcessor, queue, close }`. **Every dependency is injected**, so tests build a whole gateway against a temp SQLite file with a hand-written `runtimeConfig` object — never import `config` inside a service; take it as a constructor argument.

Telemetry path (`POST /api/v1/telemetry` in `src/app.js`):

1. `validation/index.js` — shape only; `data` is free-form nested JSON (depth ≤ 8), not a fixed sensor schema.
2. `DeviceService.ingest()` — identity is always `deviceId`, never IP. Rejects unknown / inactive / bad-token devices. Writes the history row (`telemetry`) *and* replaces the one-row-per-device `device_current_telemetry` in one transaction.
3. Respond `202` immediately.
4. `JobQueue` (concurrency 1) runs `ProcessingService.process()` off the request: normalize → rules → ML → persist `processed_data` + `ml_predictions` → create alerts → `AssessmentService.rebuild()` → broadcast.

`normalizeTelemetry` flattens all nested numbers into a `numeric` map (`gas.co` → 4.2); rules address sensors by that dotted path.

Two-tier telemetry storage is deliberate: `telemetry` is append-only history, `device_current_telemetry` is the O(1) latest-value read used by `/api/v1/mine/state`. Keep both writes together.

`GET /api/v1/mine/state` is the dashboard's single source of truth (mine + devices + latest telemetry + processed data + alerts + summary). Prefer extending it over adding narrow endpoints.

## Conventions

- All `/api/v1/*` responses go through `src/utils/http.js`: `{ok:true,data}` / `{ok:false,error:{code,message}}` via `send(response, ok(...) | fail(...))`. Never `response.json()` a raw body on a versioned route.
- Repository methods map snake_case rows to camelCase views (`mapDevice`, `mapLocation`) and `JSON.parse` the JSON text columns. SQL lives only in `src/database/`.
- Dense one-line style throughout (services, routes, repository methods). Match it rather than reformatting.
- Schema changes go in the `schema` string in `src/database/db.js` — it is `CREATE TABLE IF NOT EXISTS` on every boot, so there is no migration system. Additive changes only unless you accept wiping `data/`.
- Dashboard reads/writes go through `dashboard/src/api.js`; the demo view (`DemoApp.jsx`) uses the parallel `demoApi`/`demoWebsocketUrl` pointing at port 3001. `main.jsx` picks App vs DemoApp by `/demo` path prefix. Both are served from the same `dashboard/dist` build.

## Safety boundary

Thresholds are **site configuration** (`RULES_JSON`), not built-in mine-safety limits — never hardcode or invent safety values.

ML is a real integration boundary: `LocalMLProcessor` imports `ML_MODEL_PATH` and requires `predict(input)` returning `{riskLevel, ...}`. Without a working adapter it reports unavailable and rules/collection/dashboard keep working. Do not generate synthetic predictions or fill `estimatedAffectedPeople` / `estimatedRescuePersonnel` — they stay `null` until a validated model supplies them.

## Preventive model (`models/risk-trend.js`)

The shipped adapter is the preventive half of the system. The rules engine is reactive ("CH4 is over the limit now"); the model is anticipatory ("CH4 reaches the limit in ~14 min at this rate, and O2 is falling the way it should if this is real"). It projects nothing it did not measure.

- **Trend**: least-squares fit per numeric sensor over a rolling in-memory window (`MODEL_WINDOW_SAMPLES`), projected to `MODEL_CAUTION_LEAD_SECONDS`.
- **Correlation**: `CORRELATED` holds measured Pearson r between sensor pairs (ch4↔o2 −.85, airflow↔diff_pressure .86, ch4_face↔ch4_return .99, …). Partners vote on a trend weighted by |r|; agreement raises confidence, contradiction lowers it and sets `sensorFaultSuspected`. Retune the table per mine — it is site data, not physics.
- **Tiers**: `evacuate` inside `MODEL_EVACUATE_LEAD_SECONDS`, `caution` inside `MODEL_CAUTION_LEAD_SECONDS`, else `watch`.
- Sensor names are matched by canonical base, so `gas.ch4`, `ch4_face_pct`, and `ch4_return` all resolve to `ch4`.
- Predicted factors carry `predicted: true`; `ProcessingService` raises alerts from them alongside rules findings, with a `PREDICTED_` code prefix so the 5-minute dedupe keeps them separate from live breaches.
- `MODEL_MIN_CONFIDENCE` (default 0.35) drops trends fitted through noise into `discarded` instead of alerting on them.
- Dashboards: `MineMap.jsx`, `SensorChart.jsx` and `RiskProjection.jsx` are shared by both `App` (main.jsx) and `DemoApp`. The map lays out any registered location; the projection chart renders `assessment.factors` for the most urgent device and marks elapsed windows expired.

## Dashboard visual system

- Charts are **Recharts**; do not hand-roll SVG plots alongside them.
- Colours come from `vizTheme.js` / `viz.css` and are a validated data-viz palette: six categorical slots for sensor identity (a sensor keeps the same slot on every screen — colour follows the entity, never its position in a list) and a separate reserved status palette for normal/warning/high/critical. Never use a status colour for a data series or vice versa. Re-run the validator if you change a hex.
- Rules the charts are built to: solid hairline gridlines (dashing is reserved for thresholds and projections, where it means something), no dual axes, a legend whenever a plot has two or more series and none when it has one, selective direct labels (endpoint only) rather than a value on every point, and a Table toggle on every chart so no value is reachable only by hover.
- `font-variant-numeric: tabular-nums` belongs on table rows and axis ticks only — hero figures use proportional numerals (`.num-hero`).
- Fonts are bundled through `@fontsource-variable/inter`, never a CDN: the gateway is expected to run on a mine network with no internet.
- A sensor already breaching its threshold is skipped by the model — the rules engine owns that alert — but it still sets the floor on `riskLevel`, so a live breach is never reported as calm.
