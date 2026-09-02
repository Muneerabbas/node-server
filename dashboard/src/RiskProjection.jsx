import React, { useState } from "react";
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from "recharts";
import { GRID, AXIS, INK, SERIES, seriesColor, statusColor, relativeMinutes, tidy, clockTime, axisTick, paddedDomain, plural } from "./vizTheme.js";
import "./viz.css";

const valueAt = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);
const rank = { normal: 0, warning: 1, high: 2, critical: 3 };
const asMinutes = (seconds) => Math.max(1, Math.round(seconds / 60));

export const leadingFactor = (device) => (device?.assessment?.factors || [])
  .filter((factor) => factor.predicted && Number.isFinite(factor.etaSeconds))
  .sort((a, b) => rank[b.severity] - rank[a.severity] || a.etaSeconds - b.etaSeconds)[0];

// The device the control room should be looking at: worst severity, soonest arrival.
export const mostUrgent = (devices = []) => devices
  .map((device) => ({ device, factor: leadingFactor(device) }))
  .filter((entry) => entry.factor)
  .sort((a, b) => rank[b.factor.severity] - rank[a.factor.severity] || a.factor.etaSeconds - b.factor.etaSeconds)[0]?.device;

// With no trend heading anywhere, the chart still has a job: show whichever sensor
// currently sits closest to its configured limit. Proximity is the fraction of the
// way to the warning threshold, so a "gte" rule and an "lte" rule compare fairly.
export function nearestToLimit(device, rules = []) {
  const data = device?.telemetry || device?.processedData;
  if (!data) return null;
  const value = (path) => path.split(".").reduce((item, key) => item?.[key], data);
  return rules
    .map((rule) => {
      const current = value(rule.sensor);
      if (!Number.isFinite(current)) return null;
      const warning = Number(rule.warning);
      if (!Number.isFinite(warning) || warning === 0) return null;
      const proximity = rule.operator === "lte" ? warning / current : current / warning;
      return Number.isFinite(proximity) ? { ...rule, value: current, proximity } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.proximity - a.proximity)[0] || null;
}

function ProjectionTooltip({ active, payload, label, unit, color }) {
  if (!active || !payload?.length) return null;
  return <div className="viz-tip">
    <div className="viz-tip-time">{relativeMinutes(label)} {label < 0 ? "ago" : "ahead"}</div>
    {payload.filter((entry) => Number.isFinite(entry.value)).map((entry) => <div className="viz-tip-row" key={entry.dataKey}>
      <i style={{ background: entry.dataKey === "projected" ? "transparent" : color, border: entry.dataKey === "projected" ? `2px dashed ${color}` : "none" }} />
      <span>{entry.dataKey === "projected" ? "Projected" : "Measured"}</span> {tidy(entry.value)} {unit}
    </div>)}
  </div>;
}

export default function RiskProjection({ device, history = [], rules = [] }) {
  const [showTable, setShowTable] = useState(false);
  const factor = leadingFactor(device);
  // No prediction is not "no chart": fall back to whichever sensor sits closest to a
  // configured limit, so the card keeps showing the trend that matters instead of
  // vanishing every time conditions are calm.
  const watch = factor ? null : nearestToLimit(device, rules);
  const subject = factor || watch;

  const now = Date.now();
  const past = subject ? history
    .map((row) => ({ m: (Date.parse(row.timestamp) - now) / 60000, measured: valueAt(row.payload?.data, subject.sensor), t: row.timestamp }))
    .filter((point) => Number.isFinite(point.measured) && Number.isFinite(point.m))
    .sort((a, b) => a.m - b.m) : [];

  const threshold = factor ? factor.threshold : watch?.warning;
  const severity = factor ? factor.severity : "warning";
  const unit = subject?.unit;
  const color = statusColor(severity);
  const measuredColor = subject ? seriesColor(subject.sensor) : SERIES[0];

  const etaMinutes = factor ? factor.etaSeconds / 60 : 0;
  const anchor = past.at(-1)?.m ?? 0;
  const breachAt = anchor + etaMinutes;
  // A projection is only a countdown while the device is still reporting. Once the
  // predicted breach time has passed with no new telemetry the window elapsed
  // unconfirmed - say so rather than showing a lead time that already ran out.
  const stale = Boolean(factor) && breachAt < 0;
  const tail = factor ? Math.max(breachAt + etaMinutes * 0.35 + 1, 0.6) : 0.25;
  const left = Math.min(past[0]?.m ?? -1, factor ? -etaMinutes * 0.6 : -1);
  const endValue = factor ? factor.value + factor.ratePerMinute * (tail - anchor) : null;

  const rows = past.map((point) => ({ ...point }));
  if (factor) {
    if (rows.length) rows[rows.length - 1].projected = factor.value; else rows.push({ m: anchor, measured: factor.value, projected: factor.value });
    rows.push({ m: tail, projected: endValue });
  }

  const bounds = [...past.map((point) => point.measured), factor?.value, threshold, endValue].filter(Number.isFinite);
  const domain = bounds.length ? paddedDomain(bounds, 0.18) : [0, 1];
  const xTicks = [...new Set([left, left / 2, 0, factor ? breachAt : null, factor ? tail : null].filter((value) => value !== null).map((value) => Math.round(value)))]
    .filter((value) => value >= Math.floor(left) && value <= Math.ceil(tail));
  const cautionMinutes = Math.min(etaMinutes, (factor?.horizonSeconds || 1440) / 60);
  const evacuateMinutes = Math.min(etaMinutes, 10);

  const headline = stale ? "Projection expired"
    : factor ? `${asMinutes(factor.etaSeconds)} min of warning`
    : watch ? "Nothing trending toward a limit"
    : "Waiting for readings";
  const subline = stale ? `${device.deviceId} stopped reporting ${asMinutes(-anchor * 60)} min ago — window elapsed unconfirmed`
    : factor ? `${tidy(factor.value)}${unit ? ` ${unit}` : ""} now → ${threshold}${unit ? ` ${unit}` : ""} ${severity} limit · ${Math.round((factor.confidence ?? 0) * 100)}% confidence`
    : watch ? `${watch.sensor} is closest — ${tidy(watch.value)}${unit ? ` ${unit}` : ""} against a ${threshold}${unit ? ` ${unit}` : ""} warning limit`
    : "No sensor readings for this device yet";

  return <section className="viz-card projection-card">
    <div className="viz-card-head">
      <div>
        <span className="viz-kicker">Risk projection{subject ? ` · ${subject.sensor}` : ""}</span>
        <div className="viz-readout num-hero" style={{ color: stale || !factor ? INK.secondary : color }}>{headline}</div>
        <small style={{ color: INK.muted, fontSize: 12.5 }}>{subline}</small>
      </div>
      {past.length > 0 && <button className="viz-toggle" onClick={() => setShowTable((current) => !current)} aria-pressed={showTable}>{showTable ? "Chart" : "Table"}</button>}
    </div>

    {!past.length ? <div className="viz-foot" style={{ borderTop: "none", padding: "6px 18px 26px" }}>
        {subject ? "Collecting readings for this sensor…" : "This device has not reported anything the configured rules watch."}
      </div>
      : showTable ? <div className="viz-table-wrap"><table className="viz-table"><thead><tr><th>Time</th><th>{subject.sensor} {unit || ""}</th></tr></thead><tbody>
          {[...past].reverse().map((point) => <tr key={point.t}><td>{clockTime(point.t)}</td><td>{tidy(point.measured)}</td></tr>)}
          {factor && <tr><td style={{ color }}>projected · {relativeMinutes(breachAt)}</td><td style={{ color }}>{threshold} ({severity} limit)</td></tr>}
        </tbody></table></div>
      : <>
      <div className="viz-body"><ResponsiveContainer width="100%" height={252}>
        <ComposedChart data={rows} margin={{ top: 16, right: 128, bottom: 6, left: 2 }}>
          <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
          <XAxis type="number" dataKey="m" domain={[left, tail]} ticks={xTicks} tickFormatter={relativeMinutes} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis domain={domain} tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={axisTick} />
          <Tooltip cursor={{ stroke: INK.muted, strokeWidth: 1 }} content={<ProjectionTooltip unit={unit} color={measuredColor} />} />

          {factor && <ReferenceArea x1={anchor} x2={breachAt} fill={color} fillOpacity={0.09} label={{ value: stale ? "window elapsed" : `${plural(asMinutes(factor.etaSeconds), "minute")} of warning`, position: "insideBottom", fill: color, fontSize: 12, fontWeight: 600, offset: 8 }} />}
          {Number.isFinite(threshold) && <ReferenceLine y={threshold} stroke={color} strokeWidth={2} strokeDasharray="7 5" label={{ value: `${threshold}${unit ? ` ${unit}` : ""} ${severity} limit`, position: "right", fill: color, fontSize: 11.5, fontWeight: 600 }} />}
          <ReferenceLine x={0} stroke={INK.muted} strokeWidth={1.5} label={{ value: "NOW", position: "top", fill: INK.muted, fontSize: 10.5, letterSpacing: ".08em" }} />
          {factor && <ReferenceLine x={breachAt} stroke={color} strokeWidth={2} label={{ value: "LIMIT", position: "top", fill: color, fontSize: 10.5, letterSpacing: ".08em" }} />}
          {factor && cautionMinutes < etaMinutes && <ReferenceLine x={breachAt - cautionMinutes} stroke="#fab219" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: "caution", position: "top", fill: "#fab219", fontSize: 10.5 }} />}
          {factor && evacuateMinutes < etaMinutes && <ReferenceLine x={breachAt - evacuateMinutes} stroke="#d03b3b" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: "evacuate", position: "top", fill: "#d03b3b", fontSize: 10.5 }} />}

          <Line type="monotone" dataKey="measured" stroke={measuredColor} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          {factor && <Line type="linear" dataKey="projected" stroke={color} strokeWidth={2} strokeDasharray="8 6" dot={false} isAnimationActive={false} connectNulls />}
        </ComposedChart>
      </ResponsiveContainer></div>
      {factor && <div className="viz-legend">
        <span><i style={{ borderTopColor: measuredColor }} />Measured</span>
        <span><i style={{ borderTopColor: color, borderTopStyle: "dashed" }} />Projected at current rate</span>
      </div>}</>}

    <div className="viz-foot">
      <span className={`viz-tier tier-${factor ? factor.tier : "watch"}`}>{factor ? factor.tier : "watch"}</span>
      {factor
        ? <span>{factor.ratePerMinute < 0 ? "Falling" : "Rising"} {Math.abs(factor.ratePerMinute)}{unit ? ` ${unit}` : ""}/min over {factor.samples} readings</span>
        : <span>No sensor is projected to reach a configured limit. The nearest one is charted against its threshold.</span>}
      {factor?.corroboration?.agreeing?.length > 0 && <span style={{ color: "#199e70" }}>Backed by {factor.corroboration.agreeing.map((vote) => `${vote.sensor} (r=${vote.r})`).join(", ")}</span>}
      {factor?.sensorFaultSuspected && <span style={{ color: "#d03b3b", fontWeight: 600 }}>Correlated sensors disagree — suspected sensor fault, not an event</span>}
    </div>
  </section>;
}
