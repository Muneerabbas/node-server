const json = (value, fallback = null) => { try { return value == null ? fallback : JSON.parse(value); } catch { return fallback; } };
const mapLocation = (row) => row && ({ locationId: row.location_id, mineId: row.mine_id, name: row.name, zone: row.zone, description: row.description, createdAt: row.created_at, updatedAt: row.updated_at });
const mapDevice = (row) => row && ({ deviceId: row.device_id, mineId: row.mine_id, locationId: row.location_id, locationName: row.location_name, zone: row.zone, status: row.status, active: Boolean(row.active), lastSeen: row.last_seen, lastTelemetryAt: row.last_telemetry_at, lastIp: row.last_ip, battery: row.battery, firmwareVersion: row.firmware_version, createdAt: row.created_at, updatedAt: row.updated_at });

export class Repository {
  constructor(db) { this.db = db; }
  getMine(mineId) { return this.db.prepare("SELECT * FROM mines WHERE mine_id=?").get(mineId); }
  listLocations(mineId) { return this.db.prepare("SELECT * FROM mine_locations WHERE mine_id=? ORDER BY name").all(mineId).map(mapLocation); }
  getLocation(locationId, mineId) { return mapLocation(this.db.prepare("SELECT * FROM mine_locations WHERE location_id=? AND mine_id=?").get(locationId, mineId)); }
  upsertLocation({ mineId, locationId, name, zone = "", description = "" }) {
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO mine_locations(location_id,mine_id,name,zone,description,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(location_id) DO UPDATE SET name=excluded.name,zone=excluded.zone,description=excluded.description,updated_at=excluded.updated_at`).run(locationId,mineId,name,zone,description,now,now);
    return this.getLocation(locationId, mineId);
  }
  listDevices(mineId) { return this.db.prepare("SELECT d.*, l.name location_name, l.zone FROM devices d LEFT JOIN mine_locations l ON l.location_id=d.location_id AND l.mine_id=d.mine_id WHERE d.mine_id=? ORDER BY d.device_id").all(mineId).map(mapDevice); }
  getDevice(deviceId, mineId) { return mapDevice(this.db.prepare("SELECT d.*, l.name location_name, l.zone FROM devices d LEFT JOIN mine_locations l ON l.location_id=d.location_id AND l.mine_id=d.mine_id WHERE d.device_id=? AND d.mine_id=?").get(deviceId,mineId)); }
  getDeviceAny(deviceId) { return this.db.prepare("SELECT * FROM devices WHERE device_id=?").get(deviceId); }
  registerDevice({ deviceId, mineId, locationId, authTokenHash = null, firmwareVersion = null, active = true }) {
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO devices(device_id,mine_id,location_id,status,firmware_version,auth_token_hash,active,created_at,updated_at) VALUES(?,?,?,'offline',?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET mine_id=excluded.mine_id,location_id=excluded.location_id,firmware_version=COALESCE(excluded.firmware_version,devices.firmware_version),auth_token_hash=COALESCE(excluded.auth_token_hash,devices.auth_token_hash),active=excluded.active,updated_at=excluded.updated_at`).run(deviceId,mineId,locationId,firmwareVersion,authTokenHash,active ? 1 : 0,now,now);
    return this.getDevice(deviceId, mineId);
  }
  updateDevice(deviceId, mineId, fields) {
    const sets = []; const values = [];
    for (const [key, value] of Object.entries(fields)) { if (value !== undefined) { sets.push(`${key}=?`); values.push(value); } }
    if (sets.length) { values.push(deviceId, mineId); this.db.prepare(`UPDATE devices SET ${sets.join(",")}, updated_at=? WHERE device_id=? AND mine_id=?`).run(...values.slice(0, -2), new Date().toISOString(), ...values.slice(-2)); }
    return this.getDevice(deviceId, mineId);
  }
  touchDevice(deviceId, { timestamp, ip, battery, firmwareVersion }) {
    const now = new Date().toISOString();
    this.db.prepare("UPDATE devices SET status='online',last_seen=?,last_telemetry_at=?,last_ip=?,battery=COALESCE(?,battery),firmware_version=COALESCE(?,firmware_version),updated_at=? WHERE device_id=?").run(now,timestamp,ip || null,battery ?? null,firmwareVersion || null,now,deviceId);
  }
  markOffline(cutoff) { return this.db.prepare("UPDATE devices SET status='offline',updated_at=? WHERE status='online' AND (last_seen IS NULL OR last_seen < ?)").run(new Date().toISOString(),cutoff).changes; }
  insertTelemetry({ deviceId,mineId,locationId,timestamp,receivedAt,payload }) {
    const save = this.db.transaction(() => {
      const payloadJson = JSON.stringify(payload);
      const id = this.db.prepare("INSERT INTO telemetry(device_id,mine_id,location_id,timestamp,received_at,payload) VALUES(?,?,?,?,?,?)").run(deviceId,mineId,locationId,timestamp,receivedAt,payloadJson).lastInsertRowid;
      this.db.prepare("INSERT INTO device_current_telemetry(device_id,mine_id,location_id,timestamp,received_at,payload,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(device_id) DO UPDATE SET mine_id=excluded.mine_id,location_id=excluded.location_id,timestamp=excluded.timestamp,received_at=excluded.received_at,payload=excluded.payload,updated_at=excluded.updated_at").run(deviceId,mineId,locationId,timestamp,receivedAt,payloadJson,receivedAt);
      return id;
    });
    return save();
  }
  getTelemetry(id) { const row = this.db.prepare("SELECT * FROM telemetry WHERE id=?").get(id); return row && {...row, payload: json(row.payload,{})}; }
  latestTelemetry(deviceId) { const row=this.db.prepare("SELECT device_id,mine_id,location_id,timestamp,received_at,payload,updated_at FROM device_current_telemetry WHERE device_id=?").get(deviceId); return row && {...row,payload:json(row.payload,{})}; }
  telemetryCount(mineId) { return this.db.prepare("SELECT COUNT(*) count FROM telemetry WHERE mine_id=?").get(mineId).count; }
  insertProcessed({ telemetryId,deviceId,mineId,locationId,normalizedData,rulesResult,assessment }) { const now=new Date().toISOString(); this.db.prepare("INSERT INTO processed_data(telemetry_id,device_id,mine_id,location_id,normalized_data,rules_result,assessment,processed_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(telemetry_id) DO UPDATE SET normalized_data=excluded.normalized_data,rules_result=excluded.rules_result,assessment=excluded.assessment,processed_at=excluded.processed_at").run(telemetryId,deviceId,mineId,locationId,JSON.stringify(normalizedData),JSON.stringify(rulesResult),assessment ? JSON.stringify(assessment) : null,now); }
  latestProcessed(deviceId) { const row=this.db.prepare("SELECT * FROM processed_data WHERE device_id=? ORDER BY processed_at DESC LIMIT 1").get(deviceId); return row && {normalizedData:json(row.normalized_data,{}),rulesResult:json(row.rules_result,{}),assessment:json(row.assessment),processedAt:row.processed_at}; }
  history(deviceId, locationId, {limit,offset}) { const where=deviceId ? "device_id=?" : "location_id=?"; const value=deviceId || locationId; const rows=this.db.prepare(`SELECT id,device_id,mine_id,location_id,timestamp,received_at,payload FROM telemetry WHERE ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`).all(value,limit,offset).map(row=>({...row,payload:json(row.payload,{})})); const total=this.db.prepare(`SELECT COUNT(*) count FROM telemetry WHERE ${where}`).get(value).count; return {rows,total,limit,offset}; }
  insertMl({telemetryId,mineId,locationId,deviceId,available,modelPath,prediction,error,modelVersion}) { this.db.prepare("INSERT INTO ml_predictions(telemetry_id,mine_id,location_id,device_id,available,model_path,model_version,prediction,error,processed_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(telemetryId,mineId,locationId,deviceId,available?1:0,modelPath||null,modelVersion||null,prediction?JSON.stringify(prediction):null,error||null,new Date().toISOString()); }
  latestMl(mineId) { const row=this.db.prepare("SELECT * FROM ml_predictions WHERE mine_id=? ORDER BY processed_at DESC LIMIT 1").get(mineId); return row && {...row,available:Boolean(row.available),prediction:json(row.prediction),processedAt:row.processed_at}; }
  createAlert({mineId,locationId,deviceId,severity,code,message,details={}}) { const recent=this.db.prepare("SELECT id FROM alerts WHERE mine_id=? AND device_id IS ? AND code=? AND active=1 AND created_at > datetime('now','-5 minutes') LIMIT 1").get(mineId,deviceId||null,code); if(recent) return recent.id; return this.db.prepare("INSERT INTO alerts(mine_id,location_id,device_id,severity,code,message,details,created_at) VALUES(?,?,?,?,?,?,?,?)").run(mineId,locationId||null,deviceId||null,severity,code,message,JSON.stringify(details),new Date().toISOString()).lastInsertRowid; }
  listAlerts(mineId, limit=50) { return this.db.prepare("SELECT * FROM alerts WHERE mine_id=? ORDER BY created_at DESC LIMIT ?").all(mineId,limit).map(row=>({...row,active:Boolean(row.active),details:json(row.details,{})})); }
  saveAssessment({mineId,riskLevel,status,source,assessment}) { this.db.prepare("INSERT INTO mine_assessments(mine_id,risk_level,status,source,assessment,created_at) VALUES(?,?,?,?,?,?)").run(mineId,riskLevel,status,source,JSON.stringify(assessment),new Date().toISOString()); }
  latestAssessment(mineId) { const row=this.db.prepare("SELECT * FROM mine_assessments WHERE mine_id=? ORDER BY created_at DESC LIMIT 1").get(mineId); return row && {...json(row.assessment,{}),riskLevel:row.risk_level,status:row.status,source:row.source,createdAt:row.created_at}; }
  previousAssessment(mineId) { return this.db.prepare("SELECT risk_level FROM mine_assessments WHERE mine_id=? ORDER BY created_at DESC LIMIT 2").all(mineId).map(x=>x.risk_level); }
  close() { this.db.close(); }
}
