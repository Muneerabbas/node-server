import React from "react";
import "./demo.css";

const pretty = (value) => value ? value[0].toUpperCase() + value.slice(1) : "Normal";
const riskClass = (risk) => `demo-risk-${risk || "normal"}`;
const markerColor = (risk) => ({ critical: "#f06d61", warning: "#e8b04f", high: "#e89452", normal: "#55c7b0" }[risk] || "#55c7b0");

const DRIFT_Y = 180; const DRIFT_START = 90; const DRIFT_END = 650;
const NORTH_Y = 92; const SOUTH_Y = 268;

// Locations are spaced evenly along the drift and alternate sides, so marker labels
// never land on top of each other however many zones a mine registers. The first
// location sits at the portal end of the drift.
function layout(devices) {
  const locations = [];
  for (const device of devices) { const id = device.location?.locationId || "UNASSIGNED"; if (!locations.some((item) => item.id === id)) locations.push({ id, name: device.location?.name || id }); }
  const spots = {};
  if (!locations.length) return { spots, locations };
  spots[locations[0].id] = { x: DRIFT_START + 60, y: DRIFT_Y, label: locations[0].name };
  const rest = locations.slice(1);
  const from = DRIFT_START + 140; const to = DRIFT_END - 20;
  rest.forEach((location, index) => {
    spots[location.id] = { x: Math.round(from + (to - from) * (index + 1) / (rest.length + 1)), y: index % 2 === 0 ? NORTH_Y : SOUTH_Y, label: location.name };
  });
  return { spots, locations };
}

export default function MineMap({ devices = [], selectedDevice, onSelect, kicker = "Spatial view", title = "Mine map", subtitle = "Live device condition by underground zone" }) {
  const { spots, locations } = layout(devices);
  const branches = locations.map((location) => spots[location.id]).filter((spot) => spot && spot.y !== DRIFT_Y);
  const drift = `M${DRIFT_START} ${DRIFT_Y} H${DRIFT_END}`;
  const tunnels = [drift, ...branches.map((spot) => `M${spot.x} ${DRIFT_Y} V${spot.y}`)].join(" ");
  const edges = [`M${DRIFT_START} ${DRIFT_Y - 14} H${DRIFT_END}`, ...branches.flatMap((spot) => [`M${spot.x - 14} ${DRIFT_Y} V${spot.y}`, `M${spot.x + 14} ${DRIFT_Y} V${spot.y}`])].join(" ");
  const online = devices.filter((device) => device.status === "online").length;

  return <section className="demo-map-panel">
    <div className="demo-panel-heading demo-map-heading"><div><span className="demo-kicker">{kicker}</span><h2>{title}</h2><p>{subtitle}</p></div><div className="demo-map-legend"><span><i className="legend-normal" />Normal</span><span><i className="legend-warning" />Warning</span><span><i className="legend-critical" />Critical</span></div></div>
    <div className="demo-map-body">
      <div className="demo-map-canvas"><svg viewBox="0 0 760 360" role="img" aria-label={`Mine map showing ${locations.map((location) => location.name).join(", ") || "no registered locations"}`}>
        <defs><pattern id="map-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#253344" strokeWidth="1" /></pattern><filter id="marker-glow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        <rect width="760" height="360" fill="url(#map-grid)" />
        <path className="demo-tunnel demo-tunnel-shadow" d={tunnels} />
        <path className="demo-tunnel" d={tunnels} />
        <path className="demo-tunnel-edge" d={edges} />
        <path className="demo-map-centerline" d={tunnels} />
        <text className="demo-map-label" x={DRIFT_END - 30} y={DRIFT_Y - 16} textAnchor="end">MAIN ACCESS DRIFT</text>
        {branches.map((spot) => <text className="demo-map-label" key={`${spot.x}-${spot.y}`} x={spot.x - 26} y={spot.y < DRIFT_Y ? spot.y - 22 : spot.y + 30} textAnchor="end">{spot.label.toUpperCase()}</text>)}
        <g className="demo-map-station" transform={`translate(${DRIFT_END} ${DRIFT_Y})`}><rect x="-8" y="-8" width="16" height="16" /><path d="M-3 0h6M0-3v6" /></g>
        {devices.map((device, index) => {
          const spot = spots[device.location?.locationId] || { x: 560 + index * 50, y: DRIFT_Y, label: "Unknown zone" };
          const risk = device.assessment?.riskLevel || "normal"; const color = markerColor(risk);
          return <g className={`demo-map-marker ${device.deviceId === selectedDevice ? "selected" : ""}`} key={device.deviceId} transform={`translate(${spot.x} ${spot.y})`} onClick={() => onSelect?.(device.deviceId)} role="button" tabIndex="0" onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect?.(device.deviceId); }}>
            <circle className="demo-marker-ring" r="19" stroke={color} /><circle className="demo-marker-core" r="10" fill={color} filter="url(#marker-glow)" /><circle className="demo-marker-dot" r="3" />
            <text className="demo-marker-name" x="27" y="-5">{device.deviceId}</text><text className="demo-marker-meta" x="27" y="11">{spot.label} · {pretty(risk)}</text>
          </g>;
        })}
      </svg></div>
      <aside className="demo-map-aside">
        <div><span className="demo-kicker">Network snapshot</span><strong>{online}/{devices.length}</strong><small>devices reporting</small></div>
        {devices.map((device) => <button className={`demo-map-device ${device.deviceId === selectedDevice ? "selected" : ""}`} key={device.deviceId} onClick={() => onSelect?.(device.deviceId)}><i style={{ background: markerColor(device.assessment?.riskLevel) }} /><span><b>{device.location?.name || device.location?.locationId}</b><small>{device.deviceId} · {device.status}</small></span><em className={riskClass(device.assessment?.riskLevel)}>{pretty(device.assessment?.riskLevel)}</em></button>)}
        {!devices.length && <p className="demo-empty">No devices registered yet.</p>}
      </aside>
    </div>
  </section>;
}
