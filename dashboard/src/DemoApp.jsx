import React, { useCallback, useEffect, useMemo, useState } from "react";
import { demoApi, demoWebsocketUrl } from "./api.js";
import "./demo.css";

const riskRank = { normal: 0, warning: 1, high: 2, critical: 3 };
const riskClass = (risk) => `demo-risk-${risk || "normal"}`;
const pretty = (value) => value ? value[0].toUpperCase() + value.slice(1) : "Normal";
const time = (value) => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
const valueAt = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);

function LineChart({ title, unit, values, color }) {
  const width = 640; const height = 205; const pad = { top: 18, right: 18, bottom: 28, left: 43 };
  const numeric = values.map((item) => Number(item.value)).filter(Number.isFinite);
  const min = numeric.length ? Math.min(...numeric) : 0; const max = numeric.length ? Math.max(...numeric) : 1; const spread = max - min || Math.max(Math.abs(max) * 0.1, 1);
  const low = min - spread * 0.12; const high = max + spread * 0.12;
  const x = (index) => pad.left + (values.length <= 1 ? 0 : index * (width - pad.left - pad.right) / (values.length - 1));
  const y = (value) => pad.top + (high - value) * (height - pad.top - pad.bottom) / (high - low);
  const points = values.map((item, index) => `${x(index)},${y(Number(item.value))}`).join(" ");
  return <section className="demo-chart-card">
    <div className="demo-chart-heading"><div><span>{title}</span><strong>{numeric.length ? `${numeric[numeric.length - 1].toFixed(1)} ${unit}` : "No data"}</strong></div><small>{values.length} readings</small></div>
    {numeric.length ? <svg className="demo-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${title} over time`}>
      {[0, 1, 2, 3].map((line) => { const level = low + (high - low) * line / 3; return <g key={line}><line x1={pad.left} x2={width - pad.right} y1={y(level)} y2={y(level)} /><text x={pad.left - 8} y={y(level) + 4} textAnchor="end">{level.toFixed(1)}</text></g>; })}
      <polyline points={points} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {values.map((item, index) => <circle key={`${item.timestamp}-${index}`} cx={x(index)} cy={y(Number(item.value))} r="4" fill={color}><title>{`${time(item.timestamp)} — ${item.value} ${unit}`}</title></circle>)}
      <text x={pad.left} y={height - 7}>{time(values[0]?.timestamp)}</text><text x={width - pad.right} y={height - 7} textAnchor="end">{time(values.at(-1)?.timestamp)}</text>
    </svg> : <div className="demo-chart-empty">Waiting for simulator readings…</div>}
  </section>;
}

const mapSpots = {
  ENTRANCE: { x: 150, y: 180, label: "Entrance" },
  "NORTH-TUNNEL": { x: 435, y: 92, label: "North Tunnel" },
  "SOUTH-TUNNEL": { x: 435, y: 268, label: "South Tunnel" },
};
const markerColor = (risk) => ({ critical: "#f06d61", warning: "#e8b04f", high: "#e89452", normal: "#55c7b0" }[risk] || "#55c7b0");

function MineMap({ devices, selectedDevice, onSelect }) {
  return <section className="demo-map-panel">
    <div className="demo-panel-heading demo-map-heading"><div><span className="demo-kicker">Spatial view</span><h2>Mine map</h2><p>Live device condition by underground zone</p></div><div className="demo-map-legend"><span><i className="legend-normal" />Normal</span><span><i className="legend-warning" />Warning</span><span><i className="legend-critical" />Critical</span></div></div>
    <div className="demo-map-body">
      <div className="demo-map-canvas"><svg viewBox="0 0 760 360" role="img" aria-label="Mine map showing Entrance, North Tunnel, and South Tunnel">
        <defs><pattern id="map-grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M 28 0 L 0 0 0 28" fill="none" stroke="#253344" strokeWidth="1" /></pattern><filter id="marker-glow"><feGaussianBlur stdDeviation="4" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs>
        <rect width="760" height="360" fill="url(#map-grid)" />
        <path className="demo-tunnel demo-tunnel-shadow" d="M90 180 H650 M435 180 V92 M435 180 V268" />
        <path className="demo-tunnel" d="M90 180 H650 M435 180 V92 M435 180 V268" />
        <path className="demo-tunnel-edge" d="M90 166 H650 M421 180 V92 M449 180 V268" />
        <path className="demo-map-centerline" d="M90 180 H650 M435 180 V92 M435 180 V268" />
        <text className="demo-map-label" x="620" y="164">MAIN ACCESS DRIFT</text><text className="demo-map-label" x="456" y="88">NORTH LEVEL</text><text className="demo-map-label" x="456" y="283">SOUTH LEVEL</text>
        <g className="demo-map-station" transform="translate(650 180)"><rect x="-8" y="-8" width="16" height="16" /><path d="M-3 0h6M0-3v6" /></g>
        {devices.map((device, index) => { const spot = mapSpots[device.location?.locationId] || { x: 560 + index * 50, y: 180, label: device.location?.name || "Unknown zone" }; const risk = device.assessment?.riskLevel || "normal"; const color = markerColor(risk); return <g className={`demo-map-marker ${device.deviceId === selectedDevice ? "selected" : ""}`} key={device.deviceId} transform={`translate(${spot.x} ${spot.y})`} onClick={() => onSelect(device.deviceId)} role="button" tabIndex="0" onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect(device.deviceId); }}>
          <circle className="demo-marker-ring" r="19" stroke={color} /><circle className="demo-marker-core" r="10" fill={color} filter="url(#marker-glow)" /><circle className="demo-marker-dot" r="3" />
          <text className="demo-marker-name" x="27" y="-5">{device.deviceId}</text><text className="demo-marker-meta" x="27" y="11">{spot.label} · {pretty(risk)}</text>
        </g>; })}
      </svg></div>
      <aside className="demo-map-aside"><div><span className="demo-kicker">Network snapshot</span><strong>{devices.filter((device) => device.status === "online").length}/{devices.length}</strong><small>devices reporting</small></div>{devices.map((device) => <button className={`demo-map-device ${device.deviceId === selectedDevice ? "selected" : ""}`} key={device.deviceId} onClick={() => onSelect(device.deviceId)}><i style={{ background: markerColor(device.assessment?.riskLevel) }} /><span><b>{device.location?.name || device.location?.locationId}</b><small>{device.deviceId} · {device.status}</small></span><em className={riskClass(device.assessment?.riskLevel)}>{pretty(device.assessment?.riskLevel)}</em></button>)}</aside>
    </div>
  </section>;
}

export default function DemoApp() {
  const [state, setState] = useState(null); const [alerts, setAlerts] = useState([]); const [histories, setHistories] = useState({}); const [selectedDevice, setSelectedDevice] = useState(""); const [error, setError] = useState(""); const [lastEvent, setLastEvent] = useState("Connecting");
  const devices = state?.devices || [];
  const refresh = useCallback(async () => {
    try {
      setError("");
      const [nextState, nextAlerts] = await Promise.all([demoApi.state(), demoApi.alerts()]);
      const nextHistories = Object.fromEntries(await Promise.all((nextState.devices || []).map(async (device) => [device.deviceId, (await demoApi.deviceHistory(device.deviceId)).rows || []])));
      setState(nextState); setAlerts(nextAlerts); setHistories(nextHistories); setSelectedDevice((current) => current || nextState.devices?.[0]?.deviceId || "");
    } catch (requestError) { setError(requestError.message); }
  }, []);
  useEffect(() => { refresh(); const interval = setInterval(refresh, 10_000); return () => clearInterval(interval); }, [refresh]);
  useEffect(() => { let socket; let reconnect; const connect = () => { socket = new WebSocket(demoWebsocketUrl()); socket.onopen = () => setLastEvent("Live"); socket.onmessage = (message) => { try { const event = JSON.parse(message.data); if (event.type !== "connected") setLastEvent(event.type); } catch { /* Ignore malformed gateway events. */ } }; socket.onclose = () => { setLastEvent("Reconnecting"); reconnect = setTimeout(connect, 3000); }; socket.onerror = () => socket.close(); }; connect(); return () => { clearTimeout(reconnect); socket?.close(); }; }, []);

  const selected = devices.find((device) => device.deviceId === selectedDevice) || devices[0];
  const history = useMemo(() => [...(histories[selected?.deviceId] || [])].reverse(), [histories, selected]);
  const chart = (path) => history.map((row) => ({ timestamp: row.timestamp, value: valueAt(row.payload?.data, path) })).filter((item) => typeof item.value === "number");
  const critical = alerts.filter((alert) => alert.severity === "critical").length;
  const warning = alerts.filter((alert) => alert.severity === "warning").length;
  const overall = state?.overall?.riskLevel || "normal";

  return <div className="demo-shell">
    <header className="demo-topbar"><div><span className="demo-kicker">Simulator environment</span><h1>Mine Edge / Demo Lab</h1></div><div className="demo-live"><i />{lastEvent === "Live" ? "Live feed" : lastEvent}<a href="/dashboard/">Open operational dashboard →</a></div></header>
    <main className="demo-content">
      <div className="demo-notice"><strong>DEMO DATA ONLY</strong><span>These readings are synthetic and intentionally unsafe for testing visual states. They are separate from the operational dashboard layout.</span></div>
      {error && <div className="demo-error">Gateway error: {error}</div>}
      <section className="demo-summary"><div><span>Scenario status</span><strong className={riskClass(overall)}>{pretty(overall)}</strong><small>{state?.summary?.telemetryCount || 0} readings stored</small></div><div><span>Devices online</span><strong>{state?.summary?.devices?.online ?? 0}/{state?.summary?.devices?.total ?? 0}</strong><small>Simulator nodes</small></div><div><span>Critical alerts</span><strong className="demo-risk-critical">{critical}</strong><small>Deduplicated active alerts</small></div><div><span>Warnings</span><strong className="demo-risk-warning">{warning}</strong><small>Configured rule findings</small></div></section>
      <MineMap devices={devices} selectedDevice={selected?.deviceId} onSelect={setSelectedDevice} />
      <section className="demo-control"><div><span className="demo-kicker">Telemetry explorer</span><h2>Sensor trends</h2><p>Choose a simulated ESP32 to inspect its changing readings.</p></div><label>Device<select value={selected?.deviceId || ""} onChange={(event) => setSelectedDevice(event.target.value)}>{devices.map((device) => <option key={device.deviceId} value={device.deviceId}>{device.deviceId} · {device.location?.name}</option>)}</select></label></section>
      <section className="demo-charts"><LineChart title="Carbon monoxide" unit="ppm" values={chart("gas.co")} color="#ff716f" /><LineChart title="Carbon dioxide" unit="ppm" values={chart("gas.co2")} color="#ffb84d" /><LineChart title="Methane" unit="%LEL" values={chart("gas.ch4")} color="#c98cff" /><LineChart title="Temperature" unit="°C" values={chart("temperature")} color="#52d6c1" /><LineChart title="Battery" unit="%" values={chart("battery")} color="#74a9ff" /></section>
      <section className="demo-lower"><div className="demo-panel"><div className="demo-panel-heading"><div><span className="demo-kicker">Live fleet</span><h2>Simulator devices</h2></div><span>{devices.length} nodes</span></div>{devices.map((device) => <button className={`demo-device ${device.deviceId === selected?.deviceId ? "selected" : ""}`} key={device.deviceId} onClick={() => setSelectedDevice(device.deviceId)}><span><b>{device.deviceId}</b><small>{device.location?.name || "Unknown location"}</small></span><em className={riskClass(device.assessment?.riskLevel)}>{pretty(device.assessment?.riskLevel)}</em><strong>{device.battery ?? "—"}%</strong></button>)}</div><div className="demo-panel"><div className="demo-panel-heading"><div><span className="demo-kicker">Event stream</span><h2>Latest alerts</h2></div><span>{alerts.length} total</span></div><div className="demo-alerts">{alerts.slice(0, 8).map((alert) => <div className={`demo-alert ${riskClass(alert.severity)}`} key={alert.id}><i>{alert.severity === "critical" ? "!" : "·"}</i><span><b>{alert.code}</b><small>{alert.message} · {time(alert.created_at)}</small></span></div>)}{!alerts.length && <p className="demo-empty">Waiting for rule findings…</p>}</div></div></section>
    </main>
  </div>;
}
