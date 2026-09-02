const idPattern = /^[A-Za-z0-9._:-]{1,80}$/;
const text = (value, name, required = true) => {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || (required && !value.trim()) || value.length > 160 || !idPattern.test(value)) throw new Error(`${name} is invalid`);
  return value.trim();
};
const display = (value, name, required = true) => {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || (required && !value.trim()) || value.length > 160) throw new Error(`${name} is invalid`);
  return value.trim();
};

export function validateTelemetry(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Telemetry body must be an object");
  const deviceId = text(body.deviceId, "deviceId");
  const timestamp = body.timestamp === undefined ? new Date().toISOString() : body.timestamp;
  if (typeof timestamp !== "string" || Number.isNaN(Date.parse(timestamp))) throw new Error("timestamp is invalid");
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) throw new Error("data must be an object");
  const check = (value, depth = 0) => {
    if (depth > 8) throw new Error("data is too deeply nested");
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("sensor values must be finite numbers");
    if (typeof value === "string" && value.length > 500) throw new Error("sensor text is too long");
    if (value && typeof value === "object") Object.values(value).forEach((item) => check(item, depth + 1));
  };
  check(body.data);
  const firmwareVersion = body.firmwareVersion === undefined ? undefined : text(body.firmwareVersion, "firmwareVersion", false);
  return { deviceId, timestamp: new Date(timestamp).toISOString(), data: body.data, firmwareVersion };
}

export function validateRegistration(body) {
  if (!body || typeof body !== "object") throw new Error("Device body must be an object");
  const deviceId = text(body.deviceId, "deviceId");
  const mineId = text(body.mineId, "mineId");
  const locationId = text(body.locationId, "locationId");
  const name = display(body.locationName || body.name || locationId, "locationName");
  const zone = body.zone === undefined ? "" : display(body.zone, "zone", false) || "";
  const authToken = body.authToken === undefined ? undefined : text(body.authToken, "authToken", false);
  const description = body.description === undefined ? "" : display(body.description, "description", false) || "";
  const firmwareVersion = body.firmwareVersion === undefined ? undefined : display(body.firmwareVersion, "firmwareVersion", false);
  return { deviceId, mineId, locationId, locationName: name, zone, description, firmwareVersion, authToken, active: body.active !== false };
}
