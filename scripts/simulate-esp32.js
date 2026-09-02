const scenario = process.env.SIMULATOR_SCENARIO || "normal";
const baseUrl = process.env.GATEWAY_URL || (scenario === "risky" ? "http://127.0.0.1:3001" : "http://127.0.0.1:3000");
const mineId = process.env.MINE_ID || (scenario === "risky" ? "MINE-DEMO" : "MINE-001");
const devices = [
  ["ESP32-001", "ENTRANCE", "Entrance", "entry"],
  ["ESP32-002", "NORTH-TUNNEL", "North Tunnel", "north"],
  ["ESP32-003", "SOUTH-TUNNEL", "South Tunnel", "south"],
];

async function request(path, options) { const response = await fetch(`${baseUrl}${path}`, options); const body = await response.json(); if (!response.ok) throw new Error(`${response.status}: ${JSON.stringify(body)}`); return body; }
async function register() { for (const [deviceId, locationId, locationName] of devices) await request("/api/v1/devices", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, mineId, locationId, locationName, zone: locationName }) }); }
const randomNumber = (minimum, maximum, decimals = 1) => Number((minimum + Math.random() * (maximum - minimum)).toFixed(decimals));
const randomBoolean = () => Math.random() >= 0.5;

function telemetryFor() {
  if (scenario !== "risky") return { battery: randomNumber(72, 100), temperature: randomNumber(22, 31), humidity: randomNumber(42, 68), gas: { co: randomNumber(0, 4.5), co2: randomNumber(450, 950), ch4: randomNumber(0, 0.35) }, motion: randomBoolean() };
  return { battery: randomNumber(5, 100), temperature: randomNumber(22, 56), humidity: randomNumber(35, 96), gas: { co: randomNumber(0, 18), co2: randomNumber(450, 2800), ch4: randomNumber(0, 3.5) }, motion: randomBoolean() };
}

async function send(device) { const [deviceId] = device; return request("/api/v1/telemetry", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceId, timestamp: new Date().toISOString(), data: telemetryFor(), firmwareVersion: `simulator-${scenario}-1.0` }) }); }

await register();
let tick = 0;
console.log(`Simulating ${devices.length} ESP32 devices at ${baseUrl} using ${scenario} data; press Ctrl-C to stop`);
const run = async () => { tick += 1; await Promise.all(devices.map((device) => send(device))); console.log(`telemetry cycle ${tick} accepted`); };
await run();
setInterval(() => run().catch((error) => console.error(error.message)), Number(process.env.SIMULATOR_INTERVAL_MS) || 5000);
