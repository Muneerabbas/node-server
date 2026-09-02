import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "../config/index.js";

const schema = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS mines (id INTEGER PRIMARY KEY AUTOINCREMENT, mine_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', location TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mine_locations (id INTEGER PRIMARY KEY AUTOINCREMENT, location_id TEXT NOT NULL UNIQUE, mine_id TEXT NOT NULL REFERENCES mines(mine_id) ON DELETE CASCADE, name TEXT NOT NULL, zone TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(mine_id, location_id));
CREATE TABLE IF NOT EXISTS devices (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL UNIQUE, mine_id TEXT NOT NULL REFERENCES mines(mine_id) ON DELETE CASCADE, location_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'offline', last_seen TEXT, last_telemetry_at TEXT, last_ip TEXT, battery REAL, firmware_version TEXT, auth_token_hash TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, FOREIGN KEY(mine_id, location_id) REFERENCES mine_locations(mine_id, location_id));
CREATE TABLE IF NOT EXISTS telemetry (id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL REFERENCES devices(device_id), mine_id TEXT NOT NULL REFERENCES mines(mine_id), location_id TEXT NOT NULL, timestamp TEXT NOT NULL, received_at TEXT NOT NULL, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS device_current_telemetry (device_id TEXT PRIMARY KEY REFERENCES devices(device_id) ON DELETE CASCADE, mine_id TEXT NOT NULL, location_id TEXT NOT NULL, timestamp TEXT NOT NULL, received_at TEXT NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS processed_data (id INTEGER PRIMARY KEY AUTOINCREMENT, telemetry_id INTEGER NOT NULL UNIQUE REFERENCES telemetry(id) ON DELETE CASCADE, device_id TEXT NOT NULL, mine_id TEXT NOT NULL, location_id TEXT NOT NULL, normalized_data TEXT NOT NULL, rules_result TEXT NOT NULL, assessment TEXT, processed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ml_predictions (id INTEGER PRIMARY KEY AUTOINCREMENT, telemetry_id INTEGER REFERENCES telemetry(id) ON DELETE SET NULL, mine_id TEXT NOT NULL, location_id TEXT, device_id TEXT, available INTEGER NOT NULL, model_path TEXT, model_version TEXT, prediction TEXT, error TEXT, processed_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, mine_id TEXT NOT NULL, location_id TEXT, device_id TEXT, severity TEXT NOT NULL, code TEXT NOT NULL, message TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, resolved_at TEXT);
CREATE TABLE IF NOT EXISTS mine_assessments (id INTEGER PRIMARY KEY AUTOINCREMENT, mine_id TEXT NOT NULL, risk_level TEXT NOT NULL, status TEXT NOT NULL, source TEXT NOT NULL, assessment TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_locations_mine ON mine_locations(mine_id);
CREATE INDEX IF NOT EXISTS idx_devices_mine_location ON devices(mine_id, location_id);
CREATE INDEX IF NOT EXISTS idx_devices_status_seen ON devices(status, last_seen);
CREATE INDEX IF NOT EXISTS idx_telemetry_mine_time ON telemetry(mine_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_location_time ON telemetry(location_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_device_time ON telemetry(device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_current_telemetry_mine_location ON device_current_telemetry(mine_id, location_id);
CREATE INDEX IF NOT EXISTS idx_processed_device_time ON processed_data(device_id, processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ml_mine_time ON ml_predictions(mine_id, processed_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_mine_created ON alerts(mine_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assessments_mine_created ON mine_assessments(mine_id, created_at DESC);
`;

export function createDatabase(databasePath = config.databasePath, mineConfig = config.mine) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(schema);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO mines (mine_id, name, description, location, created_at, updated_at) VALUES (@mineId, @name, @description, @location, @now, @now) ON CONFLICT(mine_id) DO UPDATE SET name=@name, description=@description, location=@location, updated_at=@now`).run({ mineId: mineConfig.id, name: mineConfig.name, description: mineConfig.description, location: mineConfig.location, now });
  return db;
}
