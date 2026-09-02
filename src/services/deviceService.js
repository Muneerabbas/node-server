import crypto from "node:crypto";

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const tokenFrom = (request) => request.get("x-device-token") || (request.get("authorization") || "").replace(/^Bearer\s+/i, "");

export class DeviceService {
  constructor(repository, config) { this.repository = repository; this.config = config; }
  authenticate(request, device) {
    if (!this.config.deviceAuthEnabled) return true;
    const token = tokenFrom(request); if (!token || !device?.auth_token_hash) return false;
    return crypto.timingSafeEqual(Buffer.from(hash(token)), Buffer.from(device.auth_token_hash));
  }
  register(input) { return this.repository.registerDevice({ ...input, authTokenHash: input.authToken ? hash(input.authToken) : null }); }
  ingest(request, payload) {
    const device = this.repository.getDeviceAny(payload.deviceId);
    if (!device && this.config.rejectUnknownDevices) { const error = new Error("Unknown device"); error.code = "UNKNOWN_DEVICE"; error.status = 404; throw error; }
    if (!device) { const error = new Error("Device must be registered before telemetry is accepted"); error.code = "UNKNOWN_DEVICE"; error.status = 404; throw error; }
    if (!device.active) { const error = new Error("Device is inactive"); error.code = "INACTIVE_DEVICE"; error.status = 403; throw error; }
    if (!this.authenticate(request, device)) { const error = new Error("Invalid device token"); error.code = "UNAUTHORIZED"; error.status = 401; throw error; }
    const now = new Date().toISOString(); const before = device.status;
    this.repository.touchDevice(device.device_id, { timestamp: payload.timestamp, ip: request.ip, battery: payload.data.battery, firmwareVersion: payload.firmwareVersion });
    const telemetryId = this.repository.insertTelemetry({ deviceId: device.device_id, mineId: device.mine_id, locationId: device.location_id, timestamp: payload.timestamp, receivedAt: now, payload });
    return { device, telemetryId, statusChanged: before !== "online" };
  }
}
