import test from "node:test";
import assert from "node:assert/strict";
import { buildDisplay } from "../src/display.js";

const device = { deviceId: "ESP32-002", locationName: "North Face", locationId: "NORTH-FACE", status: "online" };
const rules = [{ sensor: "gas.ch4", warning: 0.75, critical: 1.25, unit: "%" }, { sensor: "gas.o2", warning: 19.5, critical: 18, unit: "%" }];
const telemetry = { payload: { data: { battery: 88, temperature: 31.4, gas: { ch4: 0.62, o2: 20.1, co: 12 } } } };

test("every line fits the screen width", () => {
  const view = buildDisplay({ device: { ...device, locationName: "A Very Long Underground Location Name" }, telemetry, rules,
    processed: { assessment: { riskLevel: "warning", factors: [{ predicted: true, sensor: "gas.ch4", etaSeconds: 840, tier: "caution", severity: "warning", threshold: 0.75 }] } }, mineAssessment: { riskLevel: "warning" } });
  for (const line of view.lines) assert.ok(line.length <= view.width, `"${line}" is ${line.length} chars, over ${view.width}`);
});

test("the lead time is on screen before the threshold is crossed", () => {
  const view = buildDisplay({ device, telemetry, rules,
    processed: { assessment: { riskLevel: "warning", factors: [{ predicted: true, sensor: "gas.ch4", etaSeconds: 840, tier: "caution", severity: "warning", threshold: 0.75 }] } }, mineAssessment: { riskLevel: "warning" } });
  assert.ok(view.lines.some((line) => line.includes("CH4 LIMIT 14MIN")), view.lines.join(" / "));
  assert.ok(view.lines.some((line) => line.includes("CAUTION")));
  assert.equal(view.banner, "CAUTION");
  assert.equal(view.prediction.etaSeconds, 840);
});

test("an evacuate tier outranks a caution banner", () => {
  const view = buildDisplay({ device, telemetry, rules, mineAssessment: { riskLevel: "critical" },
    processed: { assessment: { riskLevel: "critical", factors: [
      { predicted: true, sensor: "gas.o2", etaSeconds: 300, tier: "evacuate", severity: "critical", threshold: 18 },
      { predicted: true, sensor: "gas.ch4", etaSeconds: 120, tier: "evacuate", severity: "warning", threshold: 0.75 }] } } });
  assert.equal(view.banner, "EVACUATE");
  assert.equal(view.prediction.sensor, "gas.o2", "the more severe factor wins over the sooner one");
});

test("a quiet device still reports readings and no banner", () => {
  const view = buildDisplay({ device, telemetry, rules, processed: { assessment: { riskLevel: "normal", factors: [] } }, mineAssessment: { riskLevel: "normal" } });
  assert.equal(view.banner, null);
  assert.ok(view.readings.some((reading) => reading.label === "CH4" && reading.value === 0.6));
  assert.ok(view.lines.some((line) => line.includes("RISK NORMAL")));
});

test("a mine-wide critical reaches a device that is itself normal", () => {
  const view = buildDisplay({ device, telemetry, rules, processed: { assessment: { riskLevel: "normal", factors: [] } }, mineAssessment: { riskLevel: "critical" } });
  assert.ok(view.lines.some((line) => line.includes("MINE ALERT")));
});
