export class ProcessingService {
  constructor({ repository, rulesEngine, mlProcessor, assessmentService, config, broadcaster }) { Object.assign(this, { repository, rulesEngine, mlProcessor, assessmentService, config, broadcaster }); }
  async process(telemetryId) {
    const telemetry = this.repository.getTelemetry(telemetryId); if (!telemetry) return;
    const normalizedData = this.rulesEngine.normalize(telemetry.payload);
    const rulesResult = this.rulesEngine.evaluate(normalizedData, this.config.rules, this.config.enableRuleEngine);
    let ml = null; let mlError = null;
    if (this.config.ml.enabled) { try { ml = await this.mlProcessor.predict({ mine: this.repository.getMine(telemetry.mine_id), locations: this.repository.listLocations(telemetry.mine_id), devices: this.repository.listDevices(telemetry.mine_id), rules: this.config.rules, telemetry: { ...telemetry, normalizedData } }); } catch (error) { mlError = error.message; } }
    const assessment = ml ? { ...ml, source: "ml", processedAt: new Date().toISOString() } : { riskLevel: rulesResult.riskLevel, confidence: null, factors: rulesResult.factors, source: "rules", processedAt: new Date().toISOString() };
    this.repository.insertProcessed({ telemetryId, deviceId: telemetry.device_id, mineId: telemetry.mine_id, locationId: telemetry.location_id, normalizedData, rulesResult, assessment });
    this.repository.insertMl({ telemetryId, mineId: telemetry.mine_id, locationId: telemetry.location_id, deviceId: telemetry.device_id, available: Boolean(ml), modelPath: this.config.ml.modelPath, prediction: ml, error: mlError });
    const findings = [...rulesResult.findings, ...(ml?.factors || []).filter((factor) => factor.predicted)];
    for (const finding of findings) if (["warning", "critical"].includes(finding.severity)) { const id = this.repository.createAlert({ mineId: telemetry.mine_id, locationId: telemetry.location_id, deviceId: telemetry.device_id, severity: finding.severity, code: finding.code, message: finding.predicted ? `${finding.tier === "evacuate" ? "Evacuate" : "Caution"}: ${finding.sensor} is trending toward its configured ${finding.severity} threshold in about ${Math.round(finding.etaSeconds / 60)} min` : `${finding.sensor} crossed its configured ${finding.severity} threshold`, details: finding }); if (id) this.broadcaster?.({ type: "alert.created", data: { id, ...finding, deviceId: telemetry.device_id, locationId: telemetry.location_id } }); }
    const result = this.assessmentService.rebuild(telemetry.mine_id);
    this.broadcaster?.({ type: "telemetry.updated", data: { deviceId: telemetry.device_id, locationId: telemetry.location_id, assessment: result } });
    return { normalizedData, rulesResult, assessment: result };
  }
}
