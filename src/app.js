import express from "express";
import fs from "node:fs";
import path from "node:path";
import rateLimit from "express-rate-limit";
import { validateRegistration, validateTelemetry } from "./validation/index.js";
import { fail, ok, page, send } from "./utils/http.js";
import { buildDisplay } from "./display.js";

const mineView = (row) => row && ({ mineId: row.mine_id, name: row.name, description: row.description, location: row.location, createdAt: row.created_at, updatedAt: row.updated_at });
const auth = (config) => (request, response, next) => { if (!config.dashboardAuthToken || request.get("x-dashboard-token") === config.dashboardAuthToken || request.get("authorization") === `Bearer ${config.dashboardAuthToken}`) return next(); return send(response, fail("UNAUTHORIZED", "Dashboard authentication required", 401)); };

export function createApp({ config, repository, deviceService, queue, processingService, mlProcessor, broadcaster }) {
  const app = express();
  app.disable("x-powered-by");
  if (config.corsOrigin) app.use((request, response, next) => {
    const origin = request.get("origin");
    const allowed = config.corsOrigin === "*" || !origin || config.corsOrigin.split(",").map((value) => value.trim()).includes(origin);
    if (allowed) {
      response.setHeader("access-control-allow-origin", config.corsOrigin === "*" ? "*" : origin || config.corsOrigin);
      response.setHeader("access-control-allow-headers", "content-type,x-device-token,x-dashboard-token,authorization");
      response.setHeader("access-control-allow-methods", "GET,POST,PATCH,OPTIONS");
    }
    if (request.method === "OPTIONS") return response.sendStatus(204);
    return next();
  });
  app.use(express.json({ limit: "64kb", strict: true }));
  app.use(rateLimit({ windowMs: config.rateLimitWindowMs, limit: config.rateLimitMax, standardHeaders: true, legacyHeaders: false }));
  app.get("/", (_request, response) => response.json({ message: "Node.js server is running" }));
  app.get("/health", (_request, response) => response.json({ status: "ok" }));
  const dashboard = auth(config);
  const mineId = config.mine.id;

  app.post("/api/v1/telemetry", (request, response) => {
    console.log("[telemetry] request received", {
      deviceId: request.body?.deviceId || null,
      ip: request.ip,
      receivedAt: new Date().toISOString(),
    });
    try {
      const payload = validateTelemetry(request.body); const accepted = deviceService.ingest(request, payload);
      if (accepted.statusChanged) broadcaster({ type: "device.status.changed", data: { deviceId: payload.deviceId, status: "online" } });
      console.log("[telemetry] accepted", { deviceId: payload.deviceId, telemetryId: accepted.telemetryId, data: payload.data });
      queue.add(() => processingService.process(accepted.telemetryId)).then(() => console.log("[telemetry] processing complete", { deviceId: payload.deviceId, telemetryId: accepted.telemetryId })).catch((error) => console.error("[telemetry] processing failed", { deviceId: payload.deviceId, telemetryId: accepted.telemetryId, error: error.message }));
      return response.status(202).json({ ok: true, received: true, deviceId: payload.deviceId, serverTime: new Date().toISOString() });
    } catch (error) {
      console.log("[telemetry] rejected", { deviceId: request.body?.deviceId || null, code: error.code || "VALIDATION_ERROR", error: error.message });
      return send(response, fail(error.code || "VALIDATION_ERROR", error.message, error.status || 400));
    }
  });

  // Device-facing: an ESP32 polls this for what to render on its own screen. It
  // authenticates as a device (its own token), not with the dashboard token, and a
  // device may only ask about itself.
  app.get("/api/v1/devices/:deviceId/display", (request, response) => {
    const row = repository.getDeviceAny(request.params.deviceId);
    if (!row || row.mine_id !== mineId) return send(response, fail("NOT_FOUND", "Device not found", 404));
    if (!deviceService.authenticate(request, row)) return send(response, fail("UNAUTHORIZED", "Invalid device token", 401));
    const device = repository.getDevice(row.device_id, mineId);
    const view = buildDisplay({ device, telemetry: repository.latestTelemetry(device.deviceId), processed: repository.latestProcessed(device.deviceId), mineAssessment: repository.latestAssessment(mineId), rules: config.rules });
    // ?format=text keeps a JSON parser off the microcontroller entirely: the firmware
    // prints the body a line at a time.
    if (request.query.format === "text") return response.type("text/plain").send(view.lines.join("\n"));
    return send(response, ok(view));
  });

  app.get("/api/v1/mine", dashboard, (_request, response) => send(response, ok(mineView(repository.getMine(mineId)))));
  app.get("/api/v1/locations", dashboard, (_request, response) => send(response, ok(repository.listLocations(mineId))));
  app.get("/api/v1/locations/:locationId", dashboard, (request, response) => { const location = repository.getLocation(request.params.locationId, mineId); return location ? send(response, ok({ ...location, devices: repository.listDevices(mineId).filter((d) => d.locationId === location.locationId) })) : send(response, fail("NOT_FOUND", "Location not found", 404)); });
  app.get("/api/v1/locations/:locationId/history", dashboard, (request, response) => send(response, ok(repository.history(null, request.params.locationId, page(request)))));
  app.get("/api/v1/devices", dashboard, (_request, response) => send(response, ok(repository.listDevices(mineId))));
  app.post("/api/v1/devices", dashboard, (request, response) => { try { const input=validateRegistration(request.body); if(input.mineId!==mineId) return send(response,fail("INVALID_MINE","This gateway serves one configured mine",400)); repository.upsertLocation({mineId,locationId:input.locationId,name:input.locationName,zone:input.zone,description:input.description}); return send(response,ok(deviceService.register(input),201)); } catch(error) { return send(response,fail("VALIDATION_ERROR",error.message)); } });
  app.get("/api/v1/devices/:deviceId", dashboard, (request, response) => { const device=repository.getDevice(request.params.deviceId,mineId); return device ? send(response,ok({...device,latestTelemetry:repository.latestTelemetry(device.deviceId)?.payload || null,processedData:repository.latestProcessed(device.deviceId)?.normalizedData || null})) : send(response,fail("NOT_FOUND","Device not found",404)); });
  app.patch("/api/v1/devices/:deviceId", dashboard, (request, response) => { try { const input=request.body || {}; if(input.locationId) repository.upsertLocation({mineId,locationId:input.locationId,name:input.locationName || input.locationId,zone:input.zone || "",description:input.description || ""}); const device=repository.updateDevice(request.params.deviceId,mineId,{location_id:input.locationId,active:input.active===undefined?undefined:(input.active?1:0),firmware_version:input.firmwareVersion}); return device ? send(response,ok(device)) : send(response,fail("NOT_FOUND","Device not found",404)); } catch(error) { return send(response,fail("VALIDATION_ERROR",error.message)); } });
  app.get("/api/v1/devices/:deviceId/history", dashboard, (request, response) => send(response, ok(repository.history(request.params.deviceId, null, page(request)))));
  app.get("/api/v1/alerts", dashboard, (request, response) => send(response, ok(repository.listAlerts(mineId, Math.min(Number(request.query.limit) || 50, 200)))));
  app.get("/api/v1/assessment", dashboard, (_request, response) => send(response, ok(repository.latestAssessment(mineId) || { riskLevel: "normal", status: "normal", source: "none", confidence: null })));
  app.get("/api/v1/system/status", dashboard, (_request, response) => send(response, ok({ mineId, uptimeSeconds: Math.round(process.uptime()), database: "sqlite", ml: mlProcessor.status(), ruleEngine: { enabled: config.enableRuleEngine, configuredRules: config.rules.length } })));
  app.get("/api/v1/mine/state", dashboard, (_request, response) => {
    const mine=repository.getMine(mineId); const devices=repository.listDevices(mineId); const assessment=repository.latestAssessment(mineId) || {riskLevel:"normal",status:"normal",priority:"normal",confidence:null,trend:"unknown",affectedLocations:[]};
    const deviceViews=devices.map((device)=>{const telemetry=repository.latestTelemetry(device.deviceId); const processed=repository.latestProcessed(device.deviceId); return {deviceId:device.deviceId,location:{locationId:device.locationId,name:device.locationName,zone:device.zone},status:device.status,active:device.active,lastSeen:device.lastSeen,lastTelemetryAt:device.lastTelemetryAt,lastIp:device.lastIp,battery:device.battery,firmwareVersion:device.firmwareVersion,telemetry:telemetry?.payload?.data || null,processedData:processed?.normalizedData || null,assessment:processed?.assessment || {riskLevel:"normal",confidence:null}};});
    return send(response,ok({mine:mineView(mine),overall:{riskLevel:assessment.riskLevel,status:assessment.status,priority:assessment.priority},assessment,devices:deviceViews,alerts:repository.listAlerts(mineId),rules:config.rules.filter((rule)=>rule&&typeof rule.sensor==="string").map((rule)=>({sensor:rule.sensor,warning:Number(rule.warning),critical:Number.isFinite(Number(rule.critical))?Number(rule.critical):null,operator:rule.operator==="lte"?"lte":"gte",unit:rule.unit||null,code:rule.code||null})),summary:{devices:{total:devices.length,online:devices.filter(d=>d.status==="online").length,offline:devices.filter(d=>d.status!=="online").length},locations:{total:repository.listLocations(mineId).length,affected:new Set((assessment.affectedLocations||[]).map(x=>x.locationId)).size},telemetryCount:repository.telemetryCount(mineId)},lastUpdated:assessment.processedAt || assessment.createdAt || null}));
  });
  const dashboardDist = path.resolve(process.cwd(), "dashboard/dist");
  if (fs.existsSync(dashboardDist)) {
    app.use("/dashboard", express.static(dashboardDist));
    app.use("/demo", express.static(dashboardDist));
    app.get(/^\/(?:dashboard|demo)(?:\/.*)?$/, (_request, response) => response.sendFile(path.join(dashboardDist, "index.html")));
  }
  app.use((_request, response) => send(response, fail("NOT_FOUND", "Route not found", 404)));
  app.use((error, _request, response, _next) => send(response, fail("REQUEST_ERROR", error.type === "entity.too.large" ? "Request body too large" : error.message, error.type === "entity.too.large" ? 413 : 400)));
  return app;
}
