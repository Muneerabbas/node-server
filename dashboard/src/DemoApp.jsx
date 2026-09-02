import React, { useCallback, useEffect, useMemo, useState } from "react";
import { demoApi, demoWebsocketUrl } from "./api.js";
import "./demo.css";
import "./viz.css";
import SensorChart from "./SensorChart.jsx";
import MineMap from "./MineMap.jsx";
import RiskProjection, { mostUrgent } from "./RiskProjection.jsx";

const riskRank = { normal: 0, warning: 1, high: 2, critical: 3 };
const riskClass = (risk) => `demo-risk-${risk || "normal"}`;
const pretty = (value) => value ? value[0].toUpperCase() + value.slice(1) : "Normal";
const time = (value) => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";
const valueAt = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);

export default function DemoApp() {
  const [state, setState] = useState(null); const [alerts, setAlerts] = useState([]); const [histories, setHistories] = useState({}); const [selectedDevice, setSelectedDevice] = useState(""); const [error, setError] = useState(""); const [lastEvent, setLastEvent] = useState("Connecting");
  const devices = state?.devices || [];
  const refresh = useCallback(async () => {
    try {
      setError("");
      const [nextState, nextAlerts] = await Promise.all([demoApi.state(), demoApi.alerts()]);
      const nextHistories = Object.fromEntries(await Promise.all((nextState.devices || []).map(async (device) => [device.deviceId, (await demoApi.deviceHistory(device.deviceId)).rows || []])));
      setState(nextState); setAlerts(nextAlerts); setHistories(nextHistories); setSelectedDevice((current) => current || mostUrgent(nextState.devices || [])?.deviceId || nextState.devices?.[0]?.deviceId || "");
    } catch (requestError) { setError(requestError.message); }
  }, []);
  useEffect(() => { refresh(); const interval = setInterval(refresh, 10_000); return () => clearInterval(interval); }, [refresh]);
  useEffect(() => { let socket; let reconnect; const connect = () => { socket = new WebSocket(demoWebsocketUrl()); socket.onopen = () => setLastEvent("Live"); socket.onmessage = (message) => { try { const event = JSON.parse(message.data); if (event.type !== "connected") setLastEvent(event.type); } catch { /* Ignore malformed gateway events. */ } }; socket.onclose = () => { setLastEvent("Reconnecting"); reconnect = setTimeout(connect, 3000); }; socket.onerror = () => socket.close(); }; connect(); return () => { clearTimeout(reconnect); socket?.close(); }; }, []);

  const selected = devices.find((device) => device.deviceId === selectedDevice) || devices[0];
  const history = useMemo(() => [...(histories[selected?.deviceId] || [])].reverse(), [histories, selected]);
  const chart = (path) => history.map((row) => ({ t: row.timestamp, value: valueAt(row.payload?.data, path) })).filter((item) => typeof item.value === "number");
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
      <RiskProjection device={selected} history={histories[selected?.deviceId] || []} />
      <section className="demo-charts">
        <SensorChart sensor="gas.co" title="Carbon monoxide" unit="ppm" data={chart("gas.co")} />
        <SensorChart sensor="gas.co2" title="Carbon dioxide" unit="ppm" data={chart("gas.co2")} />
        <SensorChart sensor="gas.ch4" title="Methane" unit="%LEL" data={chart("gas.ch4")} />
        <SensorChart sensor="gas.o2" title="Oxygen" unit="%" data={chart("gas.o2")} />
        <SensorChart sensor="temperature" title="Temperature" unit="°C" data={chart("temperature")} />
        <SensorChart sensor="battery" title="Battery" unit="%" data={chart("battery")} />
      </section>
      <section className="demo-lower"><div className="demo-panel"><div className="demo-panel-heading"><div><span className="demo-kicker">Live fleet</span><h2>Simulator devices</h2></div><span>{devices.length} nodes</span></div>{devices.map((device) => <button className={`demo-device ${device.deviceId === selected?.deviceId ? "selected" : ""}`} key={device.deviceId} onClick={() => setSelectedDevice(device.deviceId)}><span><b>{device.deviceId}</b><small>{device.location?.name || "Unknown location"}</small></span><em className={riskClass(device.assessment?.riskLevel)}>{pretty(device.assessment?.riskLevel)}</em><strong>{device.battery ?? "—"}%</strong></button>)}</div><div className="demo-panel"><div className="demo-panel-heading"><div><span className="demo-kicker">Event stream</span><h2>Latest alerts</h2></div><span>{alerts.length} total</span></div><div className="demo-alerts">{alerts.slice(0, 8).map((alert) => <div className={`demo-alert ${riskClass(alert.severity)}`} key={alert.id}><i>{alert.severity === "critical" ? "!" : "·"}</i><span><b>{alert.code}</b><small>{alert.message} · {time(alert.created_at)}</small></span></div>)}{!alerts.length && <p className="demo-empty">Waiting for rule findings…</p>}</div></div></section>
    </main>
  </div>;
}
