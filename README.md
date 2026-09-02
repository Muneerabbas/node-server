# Mine Edge Gateway

The Raspberry Pi is the local gateway for one mine. Many ESP32 devices belong to that mine; each device is registered to one physical location. The gateway stores telemetry in SQLite, applies configured deterministic rules, exposes a local HTTP API, and broadcasts updates over WebSockets.

```text
Mobile / Web dashboard
        │ HTTP + WebSocket
        ▼
Raspberry Pi: Node.js + SQLite + processing + local ML adapter
        │ local mine Wi-Fi
        ├── ESP32-001 → Entrance
        ├── ESP32-002 → North Tunnel
        └── ESP32-003 → South Tunnel
```

## Setup

```sh
cd /home/dhruvspi5/node-server
cp .env.example .env
npm install
npm install --prefix dashboard
npm run build:dashboard
npm start
```

For local simulator demonstrations, run the actual gateway and demo gateway separately, then start the simulator:

```sh
npm run dev
npm run dev:demo
npm run simulate:esp32:risky
```

The actual server binds to `0.0.0.0:3000` by default. The React inspector dashboard is available at `/dashboard/`; the separate simulator demo dashboard is available at `/demo/` and reads from the isolated demo gateway on port `3001`. The API remains available under `/api/v1/`. From another device, use the Pi address, not `localhost` on that device:

```sh
hostname -I
# then open http://<RASPBERRY_PI_IP>:3000
# dashboard: http://<RASPBERRY_PI_IP>:3000/dashboard/
# simulator demo: http://<RASPBERRY_PI_IP>:3000/demo/
```

The existing `GET /` and `GET /health` routes remain available. Install the boot service with `sudo install -m 644 node-server.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now node-server`.

## Configuration

Copy `.env.example` to `.env`. Important settings include `MINE_ID`, `DATABASE_PATH`, `DEVICE_OFFLINE_TIMEOUT_SECONDS`, `DEVICE_AUTH_ENABLED`, `DASHBOARD_AUTH_TOKEN`, `ML_MODEL_PATH`, `ML_INFERENCE_TIMEOUT_MS`, and `RULES_JSON`. `.env` and `data/` are ignored by git.

`RULES_JSON` is an array of site-configured rules, for example:

```json
[{"sensor":"gas.co","warning":5,"critical":10,"operator":"gte","unit":"ppm","code":"CO_CONFIGURED"}]
```

These values are configuration examples, not mine-safety limits. Configure them with qualified site safety personnel.

## Database

SQLite is created automatically at `DATABASE_PATH`. Tables are `mines`, `mine_locations`, `devices`, `telemetry`, `device_current_telemetry`, `processed_data`, `ml_predictions`, `alerts`, and `mine_assessments`. `telemetry` keeps a history row for every accepted POST, while `device_current_telemetry` has exactly one up-to-date row per ESP32 and is replaced on each new POST. Indexes cover mine, location, device, and time queries. WAL mode and foreign keys are enabled.

## Registering devices and sending telemetry

Register each device before it sends telemetry:

```sh
curl -X POST http://localhost:3000/api/v1/devices \
  -H 'content-type: application/json' \
  -d '{"deviceId":"ESP32-001","mineId":"MINE-001","locationId":"NORTH-TUNNEL-01","locationName":"North Tunnel","zone":"north"}'
```

Send flexible, extensible telemetry:

```sh
curl -X POST http://localhost:3000/api/v1/telemetry \
  -H 'content-type: application/json' \
  -d '{"deviceId":"ESP32-001","timestamp":"2026-08-31T14:10:00Z","data":{"battery":82,"temperature":31.4,"humidity":64,"gas":{"co":4.2,"co2":820,"ch4":0.8},"motion":false}}'
```

The response is immediate (`202`) and does not wait for processing:

```json
{"ok":true,"received":true,"deviceId":"ESP32-001","serverTime":"..."}
```

When `DEVICE_AUTH_ENABLED=true`, provide the registered token using `x-device-token` or `Authorization: Bearer ...`. Unknown and inactive devices are rejected. Device identity is always `deviceId`, never an IP address.

## Dashboard API

All new routes are versioned and return `{ "ok": true, "data": ... }` or `{ "ok": false, "error": { "code", "message" } }`.

- `GET /api/v1/mine` — mine information
- `GET /api/v1/mine/state` — primary complete dashboard state
- `GET /api/v1/locations` and `GET /api/v1/locations/:locationId`
- `GET /api/v1/locations/:locationId/history?limit=50&offset=0`
- `GET /api/v1/devices` and `GET /api/v1/devices/:deviceId`
- `POST /api/v1/devices` and `PATCH /api/v1/devices/:deviceId`
- `GET /api/v1/devices/:deviceId/history?limit=50&offset=0`
- `GET /api/v1/alerts`
- `GET /api/v1/assessment`
- `GET /api/v1/system/status`

`/api/v1/mine/state` aggregates mine, locations, devices, latest raw telemetry, processed data, rules/ML assessments, alerts, online/offline counts, and timestamps. It is the dashboard source of truth.

`GET /api/v1/devices/:deviceId` also returns `latestTelemetry` and `processedData` for a simple device detail screen.

## WebSockets

Connect to `ws://<RASPBERRY_PI_IP>:3000/ws`. If `DASHBOARD_AUTH_TOKEN` is configured, provide `x-dashboard-token` during the WebSocket handshake. Events include `telemetry.updated`, `device.status.changed`, `assessment.updated`, and `alert.created`.

## Processing and ML boundary

Telemetry follows: validate → identify registered device/mine/location → persist raw payload → acknowledge → normalize → deterministic configured rules → optional local ML adapter → persist processed output → update aggregate mine assessment → broadcast.

`MLProcessor` defines `predict(input)`. `LocalMLProcessor` loads a local JavaScript adapter from `ML_MODEL_PATH` whose module exports `predict(input)`. This is an integration boundary for a real ONNX, TensorFlow Lite, Python, or other local model adapter. No fake predictions are generated. Without a configured working adapter, ML is reported unavailable and collection/rules/dashboard continue working. The intended people/rescue estimates remain `null` until a validated model supplies them.

## Offline detection

Devices become offline after `DEVICE_OFFLINE_TIMEOUT_SECONDS` without telemetry. The status is stored and a WebSocket status event is broadcast. A later telemetry packet changes the device back to online.

## Testing and simulation

```sh
npm test
npm start
npm run simulate:esp32
```

The simulator registers three devices in Entrance, North Tunnel, and South Tunnel, then sends randomized telemetry every five seconds. For synthetic warning/critical readings used by the separate demo view, run `npm run simulate:esp32:risky` (the backend must have matching site-configured rules). Set `GATEWAY_URL` to target another Pi. Tests cover registration, validation, unknown/inactive devices, persistence, pagination, rules, dashboard state, WebSocket events, and ML-unavailable behavior.
