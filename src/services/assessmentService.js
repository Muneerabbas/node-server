import { rank } from "../processing/rulesEngine.js";

export class AssessmentService {
  constructor(repository, broadcaster) { this.repository = repository; this.broadcaster = broadcaster; }
  rebuild(mineId) {
    const devices = this.repository.listDevices(mineId); const affected = []; let highest = "normal"; let mlAssessment = null;
    for (const device of devices) { const processed = this.repository.latestProcessed(device.deviceId); const risk = processed?.assessment?.riskLevel || processed?.rulesResult?.riskLevel || "normal"; if (rank[risk] > rank[highest]) highest = risk; if (risk !== "normal") affected.push({ locationId: device.locationId, deviceId: device.deviceId, riskLevel: risk, confidence: processed?.assessment?.confidence ?? null }); if (processed?.assessment?.source === "ml" || processed?.assessment?.source === "combined") mlAssessment = processed.assessment; }
    const previous = this.repository.previousAssessment(mineId); const trend = previous.length < 2 ? "unknown" : rank[highest] > rank[previous[1]] ? "worsening" : rank[highest] < rank[previous[1]] ? "improving" : "stable";
    const assessment = { riskLevel: highest, status: highest === "normal" ? "normal" : "warning", priority: highest === "critical" ? "immediate" : highest === "warning" || highest === "high" ? "urgent" : "normal", affectedLocations: affected, estimatedAffectedPeople: mlAssessment?.estimatedAffectedPeople ?? null, estimatedRescuePersonnel: mlAssessment?.estimatedRescuePersonnel ?? null, confidence: mlAssessment?.confidence ?? null, trend, factors: mlAssessment?.factors || [], processedAt: new Date().toISOString() };
    this.repository.saveAssessment({ mineId, riskLevel: highest, status: assessment.status, source: mlAssessment ? "combined" : "rules", assessment });
    this.broadcaster?.({ type: "assessment.updated", data: assessment });
    return assessment;
  }
}
