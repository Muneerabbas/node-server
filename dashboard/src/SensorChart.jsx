import React, { useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList } from "recharts";
import { GRID, AXIS, INK, seriesColor, clockTime, tidy, axisTick, paddedDomain } from "./vizTheme.js";
import "./viz.css";

function SensorTooltip({ active, payload, label, unit, title, color }) {
  if (!active || !payload?.length) return null;
  return <div className="viz-tip">
    <div className="viz-tip-time">{clockTime(label)}</div>
    <div className="viz-tip-row"><i style={{ background: color }} /><span>{title}</span> {tidy(payload[0].value)} {unit}</div>
  </div>;
}

// One sensor, one series: the card title names it, so no legend box. The latest
// reading is direct-labelled at the line's end; every other value is reachable
// through the crosshair tooltip and the table view.
export default function SensorChart({ sensor, title, unit, data = [], height = 190 }) {
  const [showTable, setShowTable] = useState(false);
  const color = seriesColor(sensor);
  const latest = data.at(-1)?.value;
  const domain = data.length ? paddedDomain(data.map((point) => point.value)) : [0, 1];

  return <section className="viz-card">
    <div className="viz-card-head">
      <div><span className="viz-kicker">{title}</span><div className="viz-readout num-hero">{data.length ? `${tidy(latest, 1)} ${unit}` : "No data"}</div></div>
      <div style={{ textAlign: "right" }}>
        <div className="viz-kicker">{data.length} readings</div>
        {data.length > 0 && <button className="viz-toggle" style={{ marginTop: 6 }} onClick={() => setShowTable((current) => !current)} aria-pressed={showTable}>{showTable ? "Chart" : "Table"}</button>}
      </div>
    </div>
    {!data.length ? <div className="viz-foot" style={{ borderTop: "none", padding: "26px 18px 30px", justifyContent: "center" }}>Waiting for readings…</div>
      : showTable ? <div className="viz-table-wrap"><table className="viz-table"><thead><tr><th>Time</th><th>{title} ({unit})</th></tr></thead><tbody>{[...data].reverse().map((point) => <tr key={point.t}><td>{clockTime(point.t)}</td><td>{tidy(point.value)}</td></tr>)}</tbody></table></div>
      : <div className="viz-body"><ResponsiveContainer width="100%" height={height}>
          <LineChart data={data} margin={{ top: 10, right: 46, bottom: 4, left: 2 }}>
            <CartesianGrid stroke={GRID} strokeWidth={1} vertical={false} />
            <XAxis dataKey="t" tickFormatter={clockTime} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} minTickGap={48} />
            <YAxis domain={domain} tick={AXIS} axisLine={false} tickLine={false} width={48} tickFormatter={axisTick} />
            <Tooltip cursor={{ stroke: INK.muted, strokeWidth: 1 }} content={<SensorTooltip unit={unit} title={title} color={color} />} />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} activeDot={{ r: 4.5, strokeWidth: 2, stroke: "#0d151e" }} isAnimationActive={false}>
              <LabelList dataKey="value" position="right" content={({ x, y, value, index }) => index !== data.length - 1 ? null : <text x={x + 8} y={y + 4} fill={color} fontSize={11.5} fontWeight={600}>{tidy(value, 1)}</text>} />
            </Line>
          </LineChart>
        </ResponsiveContainer></div>}
  </section>;
}
