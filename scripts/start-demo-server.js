process.env.PORT ||= "3001";
process.env.DATABASE_PATH ||= "./data/demo-mine.db";
process.env.MINE_ID ||= "MINE-DEMO";
process.env.MINE_NAME ||= "Mine Edge Simulator Lab";
process.env.CORS_ORIGIN ||= "*";
process.env.RATE_LIMIT_MAX ||= "10000";
process.env.RULES_JSON ||= JSON.stringify([
  { sensor: "gas.co", warning: 5, critical: 10, operator: "gte", unit: "ppm", code: "DEMO_CO" },
  { sensor: "gas.co2", warning: 1400, critical: 2000, operator: "gte", unit: "ppm", code: "DEMO_CO2" },
  { sensor: "gas.ch4", warning: 1, critical: 2, operator: "gte", unit: "%LEL", code: "DEMO_CH4" },
  { sensor: "temperature", warning: 36, critical: 44, operator: "gte", unit: "C", code: "DEMO_TEMP" },
  { sensor: "battery", warning: 25, critical: 10, operator: "lte", unit: "%", code: "DEMO_BATTERY" },
]);

await import("../server.js");
