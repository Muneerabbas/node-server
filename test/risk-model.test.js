import test from "node:test";
import assert from "node:assert/strict";
import { predict } from "../models/risk-trend.js";

const rules = [{ sensor: "gas.co", warning: 5, critical: 10, operator: "gte", unit: "ppm", code: "CO" }, { sensor: "battery", warning: 25, critical: 10, operator: "lte", unit: "%", code: "BATTERY" }];
const feed = (deviceId, values, sensor = "gas.co", stepSeconds = 30) => {
  let result;
  values.forEach((value, index) => {
    result = predict({ rules, telemetry: { device_id: deviceId, timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index * stepSeconds)).toISOString(), normalizedData: { numeric: { [sensor]: value } } } });
  });
  return result;
};

test("a rising sensor is flagged before it crosses the configured threshold", () => {
  const result = feed("RISING", [1, 1.6, 2.2, 2.8]);
  const factor = result.factors.find((item) => item.sensor === "gas.co");
  assert.ok(factor, "expected a predicted factor for gas.co");
  assert.ok(factor.value < 5, "the current reading is still below the warning threshold");
  assert.equal(factor.predicted, true);
  assert.equal(result.riskLevel, "critical", "over a 24 min horizon this rate clears the critical threshold too");
  assert.ok(factor.etaSeconds > 0 && factor.etaSeconds <= 1440);
  assert.equal(factor.tier, "evacuate");
  assert.ok(result.confidence > 0.5, "a clean straight-line rise should fit confidently");
});

test("a steady sensor well under the threshold predicts nothing", () => {
  const result = feed("STEADY", [1, 1.05, 0.98, 1.02]);
  assert.equal(result.riskLevel, "normal");
  assert.deepEqual(result.factors, []);
});

test("a live breach still reports its own severity and is left to the rules engine", () => {
  const result = feed("BREACHED", [8, 9, 10, 12]);
  assert.equal(result.riskLevel, "critical");
  assert.equal(result.factors.length, 0);
});

test("draining batteries are projected downward against an lte rule", () => {
  const result = feed("DRAINING", [60, 52, 44, 36], "battery");
  const factor = result.factors.find((item) => item.sensor === "battery");
  assert.ok(factor && factor.value > 25, "battery is still above its warning threshold");
  assert.equal(factor.severity, "critical");
  assert.ok(factor.ratePerMinute < 0);
});

test("estimates stay null until a validated model supplies them", () => {
  const result = feed("NULLS", [1, 2, 3, 4]);
  assert.equal(result.estimatedAffectedPeople, null);
  assert.equal(result.estimatedRescuePersonnel, null);
});

test("correlated sensors moving as the study says raise confidence", () => {
  const rising = [0.30, 0.35, 0.40, 0.45]; // below the 0.75 warning limit throughout, as on the lead-time chart
  const withSupport = rising.map((ch4, index) => ({ "gas.ch4": ch4, "gas.o2": 20.9 - index * 0.4, "gas.co": 2 + index * 0.8 }));
  const step = 120;
  const alone = rising.map((ch4) => ({ "gas.ch4": ch4 }));
  const run = (deviceId, frames) => { let result; frames.forEach((frame, index) => { result = predict({ rules: [{ sensor: "gas.ch4", warning: 0.75, critical: 1.25, operator: "gte", unit: "%", code: "CH4" }], telemetry: { device_id: deviceId, timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index * step)).toISOString(), normalizedData: { numeric: frame } } }); }); return result; };
  const supported = run("SUPPORTED", withSupport);
  const unsupported = run("ALONE", alone);
  const factor = supported.factors[0];
  assert.ok(factor.corroboration.agreeing.some((vote) => vote.sensor === "gas.o2"), "falling O2 should back a rising CH4");
  assert.ok(factor.confidence > unsupported.factors[0].confidence, "corroborated trends must outrank a lone sensor");
  assert.equal(factor.sensorFaultSuspected, false);
  assert.equal(factor.tier, "caution", "roughly the 24-to-10 minute caution band from the lead-time chart");
});

test("a sensor its correlated partners contradict is flagged as a suspected fault", () => {
  const frames = [0, 1, 2, 3].map((index) => ({ "gas.ch4": 1.0 + index * 0.6, "gas.o2": 20.0 + index * 0.4, "gas.co": 4 - index * 0.8 }));
  let result;
  frames.forEach((frame, index) => { result = predict({ rules: [{ sensor: "gas.ch4", warning: 5, critical: 10, operator: "gte", code: "CH4" }], telemetry: { device_id: "CONTRADICTED", timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index * 30)).toISOString(), normalizedData: { numeric: frame } } }); });
  const factor = result.factors[0];
  assert.ok(factor.corroboration.score < 0, "O2 rising alongside CH4 contradicts the measured -0.85 coupling");
  assert.equal(factor.sensorFaultSuspected, true);
});

test("redundant CH4 sensors vote on each other", () => {
  let result;
  [0, 1, 2, 3].forEach((index) => { result = predict({ rules: [{ sensor: "ch4_face_pct", warning: 0.75, critical: 1.25, operator: "gte", code: "CH4_FACE" }], telemetry: { device_id: "PAIRED", timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, index * 30)).toISOString(), normalizedData: { numeric: { ch4_face_pct: 0.2 + index * 0.1, ch4_return_pct: 0.19 + index * 0.1 } } } }); });
  assert.ok(result.factors[0].corroboration.agreeing.some((vote) => vote.sensor === "ch4_return_pct"));
});
