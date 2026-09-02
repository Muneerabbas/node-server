const scenario = process.env.SIMULATOR_SCENARIO || "normal";
const baseUrl = process.env.GATEWAY_URL || (["risky", "incident"].includes(scenario) ? "http://127.0.0.1:3001" : "http://127.0.0.1:3000");
const mineId = process.env.MINE_ID || (["risky", "incident"].includes(scenario) ? "MINE-DEMO" : "MINE-001");
const devices = [
  ["ESP32-001", "ENTRANCE", "Entrance", "entry"],
  ["ESP32-002", "NORTH-TUNNEL", "North Tunnel", "north"],
  ["ESP32-003", "SOUTH-TUNNEL", "South Tunnel", "south"],
];

async function request(path, options) { const response = await fetch(`${baseUrl}${path}`, options); const body = await response.json(); if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`); return body; }
async function register() { for (const [deviceId, locationId, locationName] of devices) await request("/api/v1/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, mineId, locationId, locationName, zone: locationName }) }); }
const randomNumber = (minimum, maximum, decimals = 1) => Number((minimum + Math.random() * (maximum - minimum)).toFixed(decimals));
const randomBoolean = () => Math.random() >= 0.5;

const INCIDENT_DEVICE = process.env.SIMULATOR_INCIDENT_DEVICE || "ESP32-002";
const nudge = (amount) => (Math.random() - 0.5) * amount;

// "incident" is the scenario the preventive model exists for: one zone degrades on a
// steady ramp with the coupling the correlation study measured - methane climbing while
// oxygen falls and CO rises - so the projection has a real trend to extrapolate. "risky"
// stays pure noise on purpose: it exercises the visual states and shows the model
// correctly refusing to predict from randomness.
function telemetryFor(deviceId) {
  const calm = () => ({ battery: randomNumber(72, 100), temperature: randomNumber(22, 31), humidity: randomNumber(42, 68), gas: { co: randomNumber(0, 4.5), co2: randomNumber(450, 950), ch4: randomNumber(0, 0.35) }, motion: randomBoolean() });
  if (scenario === "risky") return { battery: randomNumber(5, 100), temperature: randomNumber(22, 56), humidity: randomNumber(35, 96), gas: { co: randomNumber(0, 18), co2: randomNumber(450, 2800), ch4: randomNumber(0, 3.5) }, motion: randomBoolean() };
  if (scenario !== "incident" || deviceId !== INCIDENT_DEVICE) return calm();
  // The ramp cycles: it climbs into the alarm band, then ventilation "recovers" and it
  // restarts, so an unattended demo keeps replaying the pre-breach phase the model is
  // meant to catch instead of drifting off the top of every chart.
  // Triangle wave, not a sawtooth: the ramp climbs into the alarm band over ~34 cycles
  // then falls back over ~10 as ventilation "recovers", so an unattended demo replays the
  // pre-breach phase without a discontinuity that reads as a sensor glitch.
  const cycle = tick % 44;
  const step = cycle <= 34 ? cycle : Math.max(0, 34 - (cycle - 34) * 3.4);
  return {
    battery: Number(Math.max(20, 96 - step * 0.6 + nudge(0.6)).toFixed(1)),
    temperature: Number((26 + step * 0.22 + nudge(0.4)).toFixed(1)),
    humidity: Number((58 + step * 0.35 + nudge(1.2)).toFixed(1)),
    gas: {
      co: Number(Math.max(0, 2.2 + step * 0.85 + nudge(0.5)).toFixed(2)),
      co2: Number((620 + step * 42 + nudge(30)).toFixed(0)),
      ch4: Number(Math.max(0, 0.18 + step * 0.045 + nudge(0.02)).toFixed(3)),
      o2: Number(Math.max(16.5, 20.9 - step * 0.075 + nudge(0.04)).toFixed(2)),
    },
    motion: randomBoolean(),
  };
}

async function send(device) { const [deviceId] = device; return request("/api/v1/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, timestamp: new Date().toISOString(), data: telemetryFor(deviceId), firmwareVersion: `simulator-${scenario}-1.0` }) }); }

let tick = 0;
await register();
console.log(`Simulating ${devices.length} ESP32 devices at ${baseUrl} using ${scenario} data; press Ctrl-C to stop`);
const run = async () => { tick += 1; await Promise.all(devices.map((device) => send(device))); console.log(`telemetry cycle ${tick} accepted`); };
await run();
setInterval(() => run().catch((error) => console.error(error.message)), Number(process.env.SIMULATOR_INTERVAL_MS) || 5000);
