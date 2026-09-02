// What an ESP32 shows on its own small screen.
//
// The firmware side of a mine node is an 8-bit-ish loop driving a 128x64 OLED, so
// the gateway does the deciding and the formatting here and the device just prints
// `lines`. Structured fields are alongside for a device with a richer display.
// The point of putting this on the device at all is the lead time: the person at the
// face sees "CH4 LIMIT 14MIN" without looking at a dashboard they cannot reach.

const WIDTH = 21; // characters per line on a 128x64 SSD1306 at 6x8 font
const fit = (text) => String(text).slice(0, WIDTH);
const SHORT = { "gas.ch4": "CH4", "gas.co": "CO", "gas.co2": "CO2", "gas.o2": "O2", temperature: "T", humidity: "RH", battery: "BAT", airflow: "AIR" };
const label = (sensor) => SHORT[sensor] || sensor.split(".").pop().slice(0, 4).toUpperCase();
const shortUnit = (unit) => unit === "ppm" ? "" : unit === "°C" ? "C" : unit || "";
const round = (value) => Math.abs(value) >= 100 ? Math.round(value) : Number(value.toFixed(1));
const flatten = (data, prefix = "", into = {}) => {
  for (const [key, value] of Object.entries(data || {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "number" && Number.isFinite(value)) into[path] = value;
    else if (value && typeof value === "object") flatten(value, path, into);
  }
  return into;
};

export function buildDisplay({ device, telemetry, processed, mineAssessment, rules = [], now = new Date() }) {
  const numeric = flatten(telemetry?.payload?.data);
  const assessment = processed?.assessment || {};
  const risk = assessment.riskLevel || "normal";
  const mineRisk = mineAssessment?.riskLevel || "normal";

  // The soonest predicted breach is the one worth a person's attention.
  const rank = { normal: 0, warning: 1, high: 2, critical: 3 };
  const predicted = (assessment.factors || []).filter((factor) => factor.predicted && Number.isFinite(factor.etaSeconds))
    .sort((a, b) => rank[b.severity] - rank[a.severity] || a.etaSeconds - b.etaSeconds)[0] || null;
  const breached = (processed?.rulesResult?.findings || []).filter((finding) => ["warning", "critical"].includes(finding.severity))
    .sort((a, b) => rank[b.severity] - rank[a.severity])[0] || null;

  // Readings the site actually configured rules for lead; anything else fills the gap.
  const watched = rules.map((rule) => rule.sensor).filter((sensor) => Number.isFinite(numeric[sensor]));
  const shown = [...new Set([...watched, ...Object.keys(numeric)])].slice(0, 6);
  const readings = shown.map((sensor) => {
    const rule = rules.find((item) => item.sensor === sensor);
    return { sensor, label: label(sensor), value: round(numeric[sensor]), unit: rule?.unit || null, limit: rule ? Number(rule.warning) : null };
  });

  const pairs = readings.map((reading) => `${reading.label} ${reading.value}${shortUnit(reading.unit)}`);
  const lines = [fit((device.locationName || device.locationId || device.deviceId).toUpperCase())];
  lines.push(fit(`${device.status === "online" ? "" : "OFFLINE "}RISK ${risk.toUpperCase()}`));
  for (let index = 0; index < pairs.length; index += 2) lines.push(fit(pairs.slice(index, index + 2).join("  ")));
  if (breached) lines.push(fit(`! ${label(breached.sensor)} OVER LIMIT`));
  if (predicted) {
    const minutes = Math.max(1, Math.round(predicted.etaSeconds / 60));
    lines.push(fit(`! ${label(predicted.sensor)} LIMIT ${minutes}MIN`));
    lines.push(fit(predicted.tier === "evacuate" ? "** EVACUATE **" : "* CAUTION *"));
  }
  if (mineRisk === "critical" && risk !== "critical") lines.push(fit("MINE ALERT: CRITICAL"));

  return {
    deviceId: device.deviceId,
    location: device.locationName || device.locationId,
    status: device.status,
    risk,
    mineRisk,
    // A device with no screen still uses this: banner is the one thing to act on.
    banner: predicted ? (predicted.tier === "evacuate" ? "EVACUATE" : "CAUTION") : breached ? "OVER LIMIT" : null,
    prediction: predicted && { sensor: predicted.sensor, etaSeconds: predicted.etaSeconds, tier: predicted.tier, threshold: predicted.threshold, unit: predicted.unit, confidence: predicted.confidence },
    readings,
    lines,
    width: WIDTH,
    serverTime: now.toISOString(),
  };
}
