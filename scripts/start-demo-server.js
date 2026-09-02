process.env.PORT ||= "3001";
process.env.DATABASE_PATH ||= "./data/demo-mine.db";
process.env.MINE_ID ||= "MINE-DEMO";
process.env.MINE_NAME ||= "Mine Edge Simulator Lab";
process.env.CORS_ORIGIN ||= "*";
process.env.ML_MODEL_PATH ||= "./models/risk-trend.js";
// The simulator runs on a compressed timescale, so the demo lead times are compressed to match.
process.env.MODEL_CAUTION_LEAD_SECONDS ||= "180";
process.env.MODEL_EVACUATE_LEAD_SECONDS ||= "60";
process.env.RATE_LIMIT_MAX ||= "10000";
process.env.RULES_JSON ||= JSON.stringify([
  { sensor: "gas.co", warning: 5, critical: 10, operator: "gte", unit: "ppm", code: "DEMO_CO" },
  { sensor: "gas.co2", warning: 1400, critical: 2000, operator: "gte", unit: "ppm", code: "DEMO_CO2" },
  { sensor: "gas.ch4", warning: 1, critical: 2, operator: "gte", unit: "%LEL", code: "DEMO_CH4" },
  { sensor: "gas.o2", warning: 19.5, critical: 18, operator: "lte", unit: "%", code: "DEMO_O2" },
  { sensor: "temperature", warning: 36, critical: 44, operator: "gte", unit: "C", code: "DEMO_TEMP" },
  { sensor: "battery", warning: 25, critical: 10, operator: "lte", unit: "%", code: "DEMO_BATTERY" },
]);

await import("../server.js");
