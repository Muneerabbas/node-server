import "dotenv/config";
import path from "node:path";

const bool = (value, fallback) => value === undefined ? fallback : ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
const number = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
let rules = [];
try { rules = JSON.parse(process.env.RULES_JSON || "[]"); if (!Array.isArray(rules)) rules = []; } catch { console.warn("RULES_JSON is invalid; using no rules"); }

export const config = {
  host: process.env.HOST || "0.0.0.0",
  port: number(process.env.PORT, 3000),
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH || "./data/mine.db"),
  mine: { id: process.env.MINE_ID || "MINE-001", name: process.env.MINE_NAME || "Mine Alpha", description: process.env.MINE_DESCRIPTION || "", location: process.env.MINE_LOCATION || "" },
  deviceOfflineTimeoutSeconds: number(process.env.DEVICE_OFFLINE_TIMEOUT_SECONDS, 60),
  deviceAuthEnabled: bool(process.env.DEVICE_AUTH_ENABLED, false),
  rejectUnknownDevices: bool(process.env.REJECT_UNKNOWN_DEVICES, true),
  dashboardAuthToken: process.env.DASHBOARD_AUTH_TOKEN || "",
  corsOrigin: process.env.CORS_ORIGIN || "",
  rateLimitWindowMs: number(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  rateLimitMax: number(process.env.RATE_LIMIT_MAX, 240),
  ml: { enabled: bool(process.env.ML_ENABLED, true), modelPath: process.env.ML_MODEL_PATH || "", timeoutMs: number(process.env.ML_INFERENCE_TIMEOUT_MS, 5_000) },
  enableRuleEngine: bool(process.env.ENABLE_RULE_ENGINE, true),
  rules,
};
