import React, { useState } from "react";
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, ResponsiveContainer } from "recharts";
import { GRID, AXIS, INK, seriesColor, statusColor, relativeMinutes, tidy, clockTime, axisTick, paddedDomain, plural } from "./vizTheme.js";
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

export default function RiskProjection({ device, history = [] }) {
  const [showTable, setShowTable] = useState(false);
  const factor = leadingFactor(device);

  if (!factor) return <section className="viz-card projection-card">
    <div className="viz-card-head"><div><span className="viz-kicker">Risk projection</span><div className="viz-readout">No trend heading for a limit</div></div><span className="viz-kicker">{device?.deviceId || "—"}</span></div>
    <div className="viz-foot" style={{ borderTop: "none", padding: "8px 18px 22px" }}>Every sensor is steady, or already breaching and handled by the rules engine. A projection appears as soon as one starts trending toward a configured threshold.</div>
  </section>;

  const now = Date.now();
  const past = history
    .map((row) => ({ m: (Date.parse(row.timestamp) - now) / 60000, measured: valueAt(row.payload?.data, factor.sensor), t: row.timestamp }))
    .filter((point) => Number.isFinite(point.measured) && Number.isFinite(point.m))
    .sort((a, b) => a.m - b.m);

  const etaMinutes = factor.etaSeconds / 60;
  const anchor = past.at(-1)?.m ?? 0;
  const breachAt = anchor + etaMinutes;
  // A projection is only a countdown while the device is still reporting. Once the
  // predicted breach time has passed with no new telemetry the window elapsed
  // unconfirmed - say so rather than showing a lead time that already ran out.
  const stale = breachAt < 0;
  const tail = Math.max(breachAt + etaMinutes * 0.35 + 1, 0.6);
  const left = Math.min(past[0]?.m ?? -etaMinutes, -etaMinutes * 0.6);
  const endValue = factor.value + factor.ratePerMinute * (tail - anchor);

  const rows = past.map((point) => ({ ...point }));
  if (rows.length) rows[rows.length - 1].projected = factor.value; else rows.push({ m: anchor, measured: factor.value, projected: factor.value });
  rows.push({ m: tail, projected: endValue });

  const color = statusColor(factor.severity);
  const measuredColor = seriesColor(factor.sensor);
  const domain = paddedDomain([...past.map((point) => point.measured), factor.value, factor.threshold, endValue], 0.18);
  // Explicit ticks: the moments that matter, deduped so rounding cannot print the
  // same minute twice.
  const xTicks = [...new Set([left, left / 2, 0, breachAt, tail].map((value) => Math.round(value)))].filter((value) => value >= Math.floor(left) && value <= Math.ceil(tail));
  const cautionMinutes = Math.min(etaMinutes, (factor.horizonSeconds || 1440) / 60);
  const evacuateMinutes = Math.min(etaMinutes, 10);

  return <section className="viz-card projection-card">
    <div className="viz-card-head">
      <div>
        <span className="viz-kicker">Risk projection · {factor.sensor}</span>
        <div className="viz-readout num-hero" style={{ color: stale ? INK.muted : color }}>{stale ? "Projection expired" : `${asMinutes(factor.etaSeconds)} min of warning`}</div>
        <small style={{ color: INK.muted, fontSize: 12.5 }}>{stale
          ? `${device.deviceId} stopped reporting ${asMinutes(-anchor * 60)} min ago — window elapsed unconfirmed`
          : `${tidy(factor.value)}${factor.unit ? ` ${factor.unit}` : ""} now → ${factor.threshold}${factor.unit ? ` ${factor.unit}` : ""} ${factor.severity} limit · ${Math.round((factor.confidence ?? 0) * 100)}% confidence`}</small>
      </div>
      <button className="viz-toggle" onClick={() => setShowTable((current) => !current)} aria-pressed={showTable}>{showTable ? "Chart" : "Table"}</button>
    </div>

    {showTable ? <div className="viz-table-wrap"><table className="viz-table"><thead><tr><th>Time</th><th>Measured {factor.unit || ""}</th></tr></thead><tbody>
        {[...past].reverse().map((point) => <tr key={point.t}><td>{clockTime(point.t)}</td><td>{tidy(point.measured)}</td></tr>)}
        <tr><td style={{ color: color }}>projected · {relativeMinutes(breachAt)}</td><td style={{ color: color }}>{factor.threshold} ({factor.severity} limit)</td></tr>
      </tbody></table></div>
      : <>
      <div className="viz-body"><ResponsiveContainer width="100%" height={252}>
        <ComposedChart data={rows} margin={{ top: 16, right: 128, bottom: 6, left: 2 }}>
          <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
          <XAxis type="number" dataKey="m" domain={[left, tail]} ticks={xTicks} tickFormatter={relativeMinutes} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
          <YAxis domain={domain} tick={AXIS} axisLine={false} tickLine={false} width={56} tickFormatter={axisTick} />
          <Tooltip cursor={{ stroke: INK.muted, strokeWidth: 1 }} content={<ProjectionTooltip unit={factor.unit} color={measuredColor} />} />

          <ReferenceArea x1={anchor} x2={breachAt} fill={color} fillOpacity={0.09} label={{ value: stale ? "window elapsed" : `${plural(asMinutes(factor.etaSeconds), "minute")} of warning`, position: "insideBottom", fill: color, fontSize: 12, fontWeight: 600, offset: 8 }} />
          <ReferenceLine y={factor.threshold} stroke={color} strokeWidth={2} strokeDasharray="7 5" label={{ value: `${factor.threshold}${factor.unit ? ` ${factor.unit}` : ""} ${factor.severity} limit`, position: "right", fill: color, fontSize: 11.5, fontWeight: 600 }} />
          <ReferenceLine x={0} stroke={INK.muted} strokeWidth={1.5} label={{ value: "NOW", position: "top", fill: INK.muted, fontSize: 10.5, letterSpacing: ".08em" }} />
          <ReferenceLine x={breachAt} stroke={color} strokeWidth={2} label={{ value: "LIMIT", position: "top", fill: color, fontSize: 10.5, letterSpacing: ".08em" }} />
          {cautionMinutes < etaMinutes && <ReferenceLine x={breachAt - cautionMinutes} stroke="#fab219" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: "caution", position: "top", fill: "#fab219", fontSize: 10.5 }} />}
          {evacuateMinutes < etaMinutes && <ReferenceLine x={breachAt - evacuateMinutes} stroke="#d03b3b" strokeWidth={1.5} strokeDasharray="4 4" label={{ value: "evacuate", position: "top", fill: "#d03b3b", fontSize: 10.5 }} />}

          <Line type="monotone" dataKey="measured" stroke={measuredColor} strokeWidth={2} dot={false} isAnimationActive={false} connectNulls={false} />
          <Line type="linear" dataKey="projected" stroke={color} strokeWidth={2} strokeDasharray="8 6" dot={false} isAnimationActive={false} connectNulls />
        </ComposedChart>
      </ResponsiveContainer></div>
      <div className="viz-legend">
        <span><i style={{ borderTopColor: measuredColor }} />Measured</span>
        <span><i style={{ borderTopColor: color, borderTopStyle: "dashed" }} />Projected at current rate</span>
      </div></>}

    <div className="viz-foot">
      <span className={`viz-tier tier-${factor.tier}`}>{factor.tier}</span>
      <span>{factor.ratePerMinute < 0 ? "Falling" : "Rising"} {Math.abs(factor.ratePerMinute)}{factor.unit ? ` ${factor.unit}` : ""}/min over {factor.samples} readings</span>
      {factor.corroboration?.agreeing?.length > 0 && <span style={{ color: "#199e70" }}>Backed by {factor.corroboration.agreeing.map((vote) => `${vote.sensor} (r=${vote.r})`).join(", ")}</span>}
      {factor.sensorFaultSuspected && <span style={{ color: "#d03b3b", fontWeight: 600 }}>Correlated sensors disagree — suspected sensor fault, not an event</span>}
    </div>
  </section>;
}
