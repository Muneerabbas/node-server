export function normalizeTelemetry(payload) {
  const data = structuredClone(payload.data);
  const numeric = {};
  const walk = (value, prefix = "") => {
    if (typeof value === "number" && Number.isFinite(value)) numeric[prefix] = value;
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => walk(item, prefix ? `${prefix}.${key}` : key));
  };
  walk(data);
  return { ...data, numeric, sourceTimestamp: payload.timestamp };
}
