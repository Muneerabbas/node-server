// Preventive risk model for the Mine Edge Gateway.
//
// It invents nothing. Every sensor the device actually reports is fitted with a
// least-squares line over a rolling window, projected forward, and compared against
// the same site-configured thresholds the rules engine uses. The rules engine says
// "CH4 is over the limit now"; this says "CH4 reaches the limit in ~11 minutes at
// the current rate, and O2 is falling the way it should if this is real".
//
// The correlation table below is measured structure, not a guess: strongly paired
// sensors vote on each other, so a trend backed by its physically coupled partners
// is trusted more than one sensor drifting alone. Estimated affected people and
// rescue personnel stay null - nothing here is validated to produce them.

const WINDOW_SAMPLES = Number(process.env.MODEL_WINDOW_SAMPLES) || 12;
const CAUTION_LEAD_SECONDS = Number(process.env.MODEL_CAUTION_LEAD_SECONDS) || 1440;   // 24 min
const EVACUATE_LEAD_SECONDS = Number(process.env.MODEL_EVACUATE_LEAD_SECONDS) || 600;  // 10 min
const HORIZON_SECONDS = Number(process.env.MODEL_HORIZON_SECONDS) || CAUTION_LEAD_SECONDS;
const MIN_SAMPLES = 3;
const MIN_PARTNER_FIT = 0.3;
// A line fitted through noise is not a prediction. Below this confidence the trend
// is reported as unusable rather than alerted on; the rules engine still owns
// anything actually breaching a threshold right now.
const MIN_CONFIDENCE = Number(process.env.MODEL_MIN_CONFIDENCE) || 0.35;
const rank = { normal: 0, warning: 1, high: 2, critical: 3 };

// Pearson r between sensor pairs, from the site correlation study. Only pairs
// strong enough to act on are listed; baro correlates with nothing and votes on
// nothing. Retune these against your own mine's data before trusting them.
const CORRELATED = {
  ch4: [["o2", -0.85], ["dust", 0.71], ["co", 0.69], ["vibration", 0.67], ["humidity", 0.62], ["temp", 0.60]],
  co: [["ch4", 0.69], ["o2", -0.62], ["vibration", 0.56]],
  o2: [["ch4", -0.85], ["co", -0.62], ["dust", -0.58]],
  airflow: [["diff_pressure", 0.86]],
  diff_pressure: [["airflow", 0.86]],
  dust: [["ch4", 0.71], ["temp", 0.66], ["humidity", 0.65], ["vibration", 0.65], ["o2", -0.58]],
  vibration: [["temp", 0.81], ["humidity", 0.72], ["ch4", 0.67], ["dust", 0.65]],
  temp: [["vibration", 0.81], ["humidity", 0.71], ["dust", 0.66], ["ch4", 0.60]],
  humidity: [["vibration", 0.72], ["temp", 0.71], ["dust", 0.65], ["ch4", 0.62]],
  baro: [],
};
const ALIAS = { temperature: "temp", methane: "ch4", oxygen: "o2", carbonmonoxide: "co", pressure: "diff_pressure" };
const UNIT_SUFFIX = /_(pct|percent|ppm|pa|kpa|mgm3|ms|c|f)$/;
const PLACE_SUFFIX = /_(face|return|intake|exhaust|inbye|outbye|\d+)$/;

// gas.ch4_face_pct and ch4_return both reduce to "ch4" - which is exactly why the
// r=.99 pair ends up voting on each other for free.
function canonical(sensor) {
  let base = sensor.split(".").pop().toLowerCase().replace(UNIT_SUFFIX, "").replace(PLACE_SUFFIX, "").replace(UNIT_SUFFIX, "");
  return ALIAS[base.replaceAll("_", "")] || ALIAS[base] || base;
}

// ponytail: in-memory window, lost on restart and not shared between processes.
// Backfill from the telemetry table if cold starts need to predict immediately.
const history = new Map();

const crosses = (value, threshold, operator) => operator === "lte" ? value <= threshold : value >= threshold;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const usableRules = (rules) => (rules || []).filter((rule) => rule && typeof rule.sensor === "string" && Number.isFinite(Number(rule.warning)));

function record(deviceId, seconds, numeric) {
  const samples = history.get(deviceId)?.filter((sample) => sample.seconds !== seconds) || [];
  samples.push({ seconds, numeric });
  const trimmed = samples.sort((a, b) => a.seconds - b.seconds).slice(-WINDOW_SAMPLES);
  history.set(deviceId, trimmed);
  return trimmed;
}

// Least-squares slope plus the r2 that says how much to trust it.
function fit(samples, sensor) {
  const points = samples.map((sample) => [sample.seconds, sample.numeric[sensor]]).filter(([, value]) => Number.isFinite(value));
  if (points.length < MIN_SAMPLES) return null;
  const meanSeconds = points.reduce((sum, [seconds]) => sum + seconds, 0) / points.length;
  const meanValue = points.reduce((sum, [, value]) => sum + value, 0) / points.length;
  let covariance = 0; let secondsVariance = 0; let valueVariance = 0;
  for (const [seconds, value] of points) { covariance += (seconds - meanSeconds) * (value - meanValue); secondsVariance += (seconds - meanSeconds) ** 2; valueVariance += (value - meanValue) ** 2; }
  if (secondsVariance === 0) return null;
  const slope = covariance / secondsVariance;
  const r2 = valueVariance === 0 ? 1 : clamp((covariance ** 2) / (secondsVariance * valueVariance), 0, 1);
  return { slope, r2, value: points.at(-1)[1], samples: points.length };
}

// Do the physically coupled sensors agree that this is a real event? Each partner
// votes with the weight of its correlation: agreeing partners raise confidence,
// contradicting ones pull it down and hint at a faulty sensor rather than an event.
function corroborate(samples, sensor, slope, index) {
  const base = canonical(sensor);
  const partners = [
    ...(index[base] || []).filter((key) => key !== sensor).map((key) => [key, 0.99]),
    ...(CORRELATED[base] || []).flatMap(([partnerBase, r]) => (index[partnerBase] || []).slice(0, 1).map((key) => [key, r])),
  ];
  const agreeing = []; const contradicting = []; let weighted = 0; let total = 0;
  for (const [key, r] of partners) {
    const partner = fit(samples, key);
    if (!partner || partner.r2 < MIN_PARTNER_FIT || partner.slope === 0) continue;
    const agrees = Math.sign(partner.slope) === Math.sign(r * slope);
    total += Math.abs(r); weighted += Math.abs(r) * (agrees ? 1 : -1);
    (agrees ? agreeing : contradicting).push({ sensor: key, r, ratePerMinute: Number((partner.slope * 60).toFixed(4)) });
  }
  return { score: total ? Number((weighted / total).toFixed(3)) : 0, votes: agreeing.length + contradicting.length, agreeing, contradicting };
}

const tierFor = (etaSeconds) => etaSeconds <= EVACUATE_LEAD_SECONDS ? "evacuate" : etaSeconds <= CAUTION_LEAD_SECONDS ? "caution" : "watch";

export function predict(input) {
  const telemetry = input?.telemetry || {};
  const numeric = telemetry.normalizedData?.numeric || {};
  const rules = usableRules(input?.rules);
  const parsed = Date.parse(telemetry.timestamp || telemetry.received_at || "");
  const seconds = (Number.isNaN(parsed) ? Date.now() : parsed) / 1000;
  const samples = record(telemetry.device_id || "unknown", seconds, numeric);

  const index = {};
  for (const key of Object.keys(numeric)) (index[canonical(key)] ||= []).push(key);

  let riskLevel = "normal";
  const factors = []; const discarded = [];

  for (const rule of rules) {
    const operator = rule.operator === "lte" ? "lte" : "gte";
    const warning = Number(rule.warning);
    const critical = Number.isFinite(Number(rule.critical)) ? Number(rule.critical) : null;
    const value = numeric[rule.sensor];

    // The current reading still sets the floor, so a live breach is never reported as calm.
    if (Number.isFinite(value)) {
      const nowSeverity = critical !== null && crosses(value, critical, operator) ? "critical" : crosses(value, warning, operator) ? "warning" : "normal";
      if (rank[nowSeverity] > rank[riskLevel]) riskLevel = nowSeverity;
      if (nowSeverity !== "normal") continue; // already breached; the rules engine owns that alert
    }

    const trend = fit(samples, rule.sensor);
    if (!trend || trend.slope === 0) continue;
    const projected = trend.value + trend.slope * HORIZON_SECONDS;
    const severity = critical !== null && crosses(projected, critical, operator) ? "critical" : crosses(projected, warning, operator) ? "warning" : "normal";
    if (severity === "normal") continue;

    const threshold = severity === "critical" ? critical : warning;
    const etaSeconds = Math.round((threshold - trend.value) / trend.slope);
    if (!Number.isFinite(etaSeconds) || etaSeconds < 0) continue;

    const support = corroborate(samples, rule.sensor, trend.slope, index);
    const fitConfidence = trend.r2 * (0.5 + 0.5 * Math.min(trend.samples / WINDOW_SAMPLES, 1));
    const confidence = Number(clamp(fitConfidence * (1 + 0.3 * support.score), 0, 1).toFixed(3));
    if (confidence < MIN_CONFIDENCE) { discarded.push({ sensor: rule.sensor, confidence, reason: "trend too noisy to project" }); continue; }
    factors.push({
      sensor: rule.sensor, value: trend.value, projected: Number(projected.toFixed(3)), threshold,
      severity, predicted: true, etaSeconds, tier: tierFor(etaSeconds), horizonSeconds: HORIZON_SECONDS,
      ratePerMinute: Number((trend.slope * 60).toFixed(4)), samples: trend.samples,
      confidence,
      corroboration: support,
      sensorFaultSuspected: support.votes > 0 && support.score <= -0.5,
      unit: rule.unit || null, contribution: severity,
      code: `PREDICTED_${(rule.code || rule.sensor).replaceAll(".", "_").toUpperCase()}`,
    });
    if (rank[severity] > rank[riskLevel]) riskLevel = severity;
  }

  const leading = factors.slice().sort((a, b) => rank[b.severity] - rank[a.severity] || a.etaSeconds - b.etaSeconds)[0];
  return {
    riskLevel,
    confidence: leading?.confidence ?? null,
    factors,
    model: "trend-projection+correlation",
    leadTimeSeconds: leading?.etaSeconds ?? null,
    tier: leading?.tier ?? "normal",
    horizonSeconds: HORIZON_SECONDS,
    windowSamples: samples.length,
    discarded,
    estimatedAffectedPeople: null,
    estimatedRescuePersonnel: null,
  };
}

export default { predict };
