const rank = { normal: 0, warning: 1, high: 2, critical: 3 };
const getPath = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const compare = (value, rule) => rule.operator === "lte" ? value <= rule.warning : value >= rule.warning;

export function evaluateRules(data, rules = [], enabled = true) {
  if (!enabled) return { enabled: false, riskLevel: "normal", findings: [], factors: [] };
  const findings = [];
  for (const rule of rules) {
    if (!rule || typeof rule.sensor !== "string" || !Number.isFinite(Number(rule.warning))) continue;
    const value = getPath(data, rule.sensor);
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const operator = rule.operator === "lte" ? "lte" : "gte";
    const triggered = operator === "lte" ? value <= Number(rule.warning) : value >= Number(rule.warning);
    if (!triggered) continue;
    const critical = Number.isFinite(Number(rule.critical)) && (operator === "lte" ? value <= Number(rule.critical) : value >= Number(rule.critical));
    const severity = critical ? "critical" : "warning";
    findings.push({ sensor: rule.sensor, value, severity, threshold: critical ? Number(rule.critical) : Number(rule.warning), unit: rule.unit || null, code: rule.code || `RULE_${rule.sensor.replaceAll(".", "_").toUpperCase()}` });
  }
  const riskLevel = findings.reduce((highest, item) => rank[item.severity] > rank[highest] ? item.severity : highest, "normal");
  return { enabled: true, riskLevel, findings, factors: findings.map((item) => ({ sensor: item.sensor, contribution: item.severity })) };
}

export { rank };
