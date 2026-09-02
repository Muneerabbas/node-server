import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";
import { createGateway } from "../src/server.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function start() {
  const databasePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "mine-edge-")), "mine.db");
  const runtimeConfig = { host: "127.0.0.1", port: 0, databasePath, mine: { id: "MINE-TEST", name: "Test Mine", description: "", location: "" }, deviceOfflineTimeoutSeconds: 60, deviceAuthEnabled: false, rejectUnknownDevices: true, dashboardAuthToken: "", rateLimitWindowMs: 60_000, rateLimitMax: 1000, ml: { enabled: false, modelPath: "", timeoutMs: 100 }, enableRuleEngine: true, rules: [{ sensor: "gas.co", warning: 5, critical: 10, code: "CO_CONFIGURED" }] };
  const gateway = await createGateway({ runtimeConfig, databasePath });
  await new Promise((resolve) => gateway.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${gateway.server.address().port}`;
  return { gateway, base };
}
async function api(base, route, options) { const response = await fetch(`${base}${route}`, options); return { response, body: await response.json() }; }

test("telemetry is acknowledged, persisted, processed, and exposed in mine state", async (t) => {
  const { gateway, base } = await start(); t.after(() => gateway.close());
  const registered = await api(base, "/api/v1/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: "ESP32-TEST", mineId: "MINE-TEST", locationId: "NORTH", locationName: "North Tunnel", zone: "north" }) });
  assert.equal(registered.response.status, 201);
  const socket = new WebSocket(`${base.replace("http", "ws")}/ws`); const events = []; socket.on("message", (data) => events.push(JSON.parse(data.toString()))); await new Promise((resolve) => socket.once("open", resolve));
  const accepted = await api(base, "/api/v1/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: "ESP32-TEST", timestamp: "2026-08-31T14:10:00Z", data: { battery: 82, gas: { co: 12 }, temperature: 31.4 }, firmwareVersion: "test-1" }) });
  assert.equal(accepted.response.status, 202); assert.equal(accepted.body.received, true);
  await wait(150);
  const state = await api(base, "/api/v1/mine/state"); assert.equal(state.response.status, 200); assert.equal(state.body.data.devices[0].status, "online"); assert.equal(state.body.data.devices[0].location.name, "North Tunnel"); assert.equal(state.body.data.devices[0].telemetry.gas.co, 12); assert.equal(state.body.data.devices[0].processedData.numeric["gas.co"], 12); assert.equal(state.body.data.overall.riskLevel, "critical"); assert.ok(events.some((event) => event.type === "telemetry.updated")); assert.ok(events.some((event) => event.type === "alert.created")); socket.close();
  assert.equal(gateway.db.prepare("SELECT COUNT(*) count FROM device_current_telemetry WHERE device_id='ESP32-TEST'").get().count, 1);
});

test("malformed, unknown, and inactive devices are rejected", async (t) => {
  const { gateway, base } = await start(); t.after(() => gateway.close());
  let result = await api(base, "/api/v1/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ data: {} }) }); assert.equal(result.response.status, 400); assert.equal(result.body.error.code, "VALIDATION_ERROR");
  result = await api(base, "/api/v1/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: "NOPE", data: {} }) }); assert.equal(result.response.status, 404); assert.equal(result.body.error.code, "UNKNOWN_DEVICE");
  await api(base, "/api/v1/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: "ESP32-INACTIVE", mineId: "MINE-TEST", locationId: "ENTRY", locationName: "Entry", active: false }) });
  result = await api(base, "/api/v1/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: "ESP32-INACTIVE", data: {} }) }); assert.equal(result.response.status, 403); assert.equal(result.body.error.code, "INACTIVE_DEVICE");
});

test("history is paginated and ML reports unavailable without a real adapter", async (t) => {
  const { gateway, base } = await start(); t.after(() => gateway.close());
  await api(base, "/api/v1/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: "ESP32-HISTORY", mineId: "MINE-TEST", locationId: "ENTRY", locationName: "Entry" }) });
  for (let index = 0; index < 3; index += 1) await api(base, "/api/v1/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId: "ESP32-HISTORY", data: { temperature: index } }) });
  const history = await api(base, "/api/v1/devices/ESP32-HISTORY/history?limit=2&offset=1"); assert.equal(history.body.data.rows.length, 2); assert.equal(history.body.data.total, 3);
  const status = await api(base, "/api/v1/system/status"); assert.equal(status.body.data.ml.available, false);
});
