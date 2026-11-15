import { useEffect, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { SensorCard } from "./components/SensorCard";
import { DEFAULT_DATA_SOURCE, DUMMY_SOURCE } from "./data/dummyTelemetry";
import { useTelemetry } from "./hooks/useTelemetry";
import type { CommandState, Phase } from "./types/telemetry";
import "./App.css";

const format = (value: number | null | undefined, digits = 2) =>
  value == null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: digits });

function App() {
  const [phase, setPhase] = useState<Phase>("Initialization");
  const [dataSource, setDataSource] = useState(DEFAULT_DATA_SOURCE);
  const [commandState, setCommandState] = useState<CommandState>("safe");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [isLogExpanded, setIsLogExpanded] = useState(false);
  const simulationTimer = useRef<number | null>(null);
  const {
    series, packetCount, connected, busy, status, ports, activePort,
    message, logs, sampleAge, live, refreshPorts, clearTelemetry,
    startTelemetry: beginTelemetry, stopTelemetry: endTelemetry,
  } = useTelemetry({ dataSource });
  const latest = series[series.length - 1];
  const simulated = dataSource === DUMMY_SOURCE;
  const hasTelemetry = latest !== undefined;
  const tag = !hasTelemetry ? "NO DATA" : simulated ? "SIMULATED" : live ? "LIVE" : "STALE";
  const connectionLabel = busy ? (status === "stopping" ? "Stopping…" : "Connecting…")
    : !connected ? "Disconnected" : simulated ? "Simulation"
    : live ? "Receiving" : sampleAge === null ? "Waiting for data" : "No recent data";
  const log = actionMessage ?? (connected && !simulated && !live && sampleAge !== null
    ? "No telemetry for over 3 seconds — check sensor connections and Serial output" : message);

  useEffect(() => {
    if (!connected || !simulated) setCommandState("safe");
    return () => {
      if (simulationTimer.current !== null) window.clearTimeout(simulationTimer.current);
    };
  }, [connected, simulated]);

  const selectDataSource = (source: string) => {
    setDataSource(source);
    clearTelemetry();
    setCommandState("safe");
    setPhase("Initialization");
    setActionMessage(source === DUMMY_SOURCE
      ? "Dummy data selected — press Start simulation"
      : "USB Serial selected — press Connect at 115200 baud");
  };

  const startTelemetry = () => {
    setActionMessage(null);
    beginTelemetry();
  };

  const stopTelemetry = async () => {
    setCommandState("safe");
    setPhase("Initialization");
    setActionMessage(null);
    await endTelemetry();
  };

  const armSystem = () => {
    if (!simulated || !connected) return;
    if (commandState === "safe") {
      setCommandState("armed");
      setActionMessage("SIMULATION: controls armed; no hardware command sent");
    }
  };

  const fireCharge = () => {
    if (!simulated || !connected || commandState !== "armed") return;
    setCommandState("firing");
    setActionMessage("SIMULATION: running command demonstration");
    simulationTimer.current = window.setTimeout(() => {
      setCommandState("complete");
      setPhase("Flight");
      setActionMessage("SIMULATION complete; no hardware command sent");
    }, 1200);
  };

  const commandLabel = !simulated ? "READ ONLY" : commandState.toUpperCase();
  const downloadCsv = () => {
    const keys = ["time", "temperature", "pressure", "acceleration", "gyroscope", "altitude", "mpuTemperature", "accelZ", "gyroZ", "roll", "pitch", "descentRate"] as const;
    const header = "time_s,bmp_temperature_c,pressure_kpa,acceleration_g,gyroscope_deg_s,relative_altitude_m,mpu_temperature_c,accel_z_g,gyro_z_deg_s,tilt_roll_deg,tilt_pitch_deg,descent_m_s";
    const csv = [header, ...series.map((point) => keys.map((key) => point[key] ?? "").join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `telemetry-${simulated ? "simulated" : "serial"}-${Date.now()}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const axisDetail = (axes: [number, number, number] | null | undefined, units: string) =>
    axes ? `X ${format(axes[0], 3)} · Y ${format(axes[1], 3)} · Z ${format(axes[2], 3)} ${units}` : undefined;
  const cards = [
    { title: "BMP280 temperature", key: "temperature", unit: "°C", color: "#ff5733" },
    { title: "Pressure", key: "pressure", unit: "kPa", color: "#252932" },
    { title: "Gyroscope magnitude", key: "gyroscope", unit: "°/s", color: "#92959a", detail: axisDetail(latest?.gyro, "rad/s") },
    { title: "Acceleration magnitude", key: "acceleration", unit: "g", color: "#252932", detail: axisDetail(latest?.accel, "m/s²") },
    { title: "MPU6050 temperature", key: "mpuTemperature", unit: "°C", color: "#a6a8aa" },
    { title: "Acceleration Z", key: "accelZ", unit: "g", color: "#252932" },
  ] as const;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">G</div>
          <strong>AVIONICS GCS</strong>
          <span className="connection-pill" aria-live="polite">
            <i className={live && !simulated ? "connected" : simulated && connected ? "simulated" : ""} />
            {connectionLabel}
          </span>
        </div>
        <nav className="phase-nav">
          {(["Initialization", "Flight", "Recovery"] as Phase[]).map((item) => (
            <div key={item} className={`phase-item ${phase === item ? "active" : ""} ${item === "Recovery" ? "future" : ""}`}>
              <span className="phase-dot" />{item}
            </div>
          ))}
        </nav>
        <div className="header-actions">
          <div className="utc"><b>--:--:--</b><span>NO UTC DATA</span></div>
          <button className="download" onClick={downloadCsv} disabled={!hasTelemetry} title="Export the most recent 120 samples">
            <Icon name="download" /> Download CSV
          </button>
        </div>
      </header>

      <div className="dashboard">
        <section className="connection-panel" aria-label="Serial connection">
          <div className="connection-controls">
            <label htmlFor="serial-source">Telemetry source</label>
            <select id="serial-source" aria-label="Data source" value={dataSource} disabled={connected || busy}
              onChange={(event) => selectDataSource(event.target.value)}>
              <option value={DEFAULT_DATA_SOURCE}>Auto · USB</option>
              {ports.map((port) => <option key={port.name} value={port.name}>{port.label}</option>)}
              {!ports.some((port) => port.name === dataSource) && dataSource !== DEFAULT_DATA_SOURCE && !simulated &&
                <option value={dataSource}>{dataSource} · unavailable</option>}
              <option value={DUMMY_SOURCE}>Dummy data</option>
            </select>
            <button className="refresh-ports" onClick={() => { setActionMessage(null); void refreshPorts(); }}
              disabled={connected || busy}>Refresh ports</button>
            <button className="connect-button" onClick={startTelemetry} disabled={connected || busy}>
              {status === "connecting" ? "Connecting…" : simulated ? "Start simulation" : "Connect"}
            </button>
            <button className="disconnect-button" onClick={() => void stopTelemetry()}
              disabled={(!connected && !busy) || status === "stopping"}>
              {status === "stopping" ? "Disconnecting…" : status === "connecting" ? "Cancel" : "Disconnect"}
            </button>
            <span className="port-count">{ports.filter((port) => port.usb).length} USB Serial detected</span>
          </div>
          <div className="source-summary" role="status" aria-live="polite">
            <span>{simulated ? "SIMULATION" : `${activePort ?? "USB Serial"} · 115200 baud`}</span>
            <span>{log}</span>
          </div>
        </section>
        <section className="metric-row">
          <article className="card metric" title="Barometric estimate relative to the first valid pressure reading of this session">
            <div className="card-heading"><span>Relative altitude</span><b className={`live-tag ${tag.toLowerCase()}`}>{latest?.altitude == null ? "NO DATA" : tag}</b></div>
            <strong>{format(latest?.altitude, 1)}</strong><small>m</small>
            <div className="metric-bar"><span style={{ width: latest?.altitude == null ? "0%" : "100%" }} /></div>
          </article>
          <article className="card metric" title="Change in barometric altitude; positive values indicate descent">
            <div className="card-heading"><span>Descent estimate</span><b className={`live-tag ${tag.toLowerCase()}`}>{latest?.descentRate == null ? "NO DATA" : tag}</b></div>
            <strong>{format(latest?.descentRate, 1)}</strong><small>m/s</small>
            <div className="metric-bar blue"><span style={{ width: latest?.descentRate == null ? "0%" : "100%" }} /></div>
          </article>
          <article className="card metric">
            <div className="card-heading"><span>Received samples</span><b className={`live-tag ${tag.toLowerCase()}`}>{tag}</b></div>
            <strong>{hasTelemetry ? packetCount.toLocaleString() : "—"}</strong>
            <div className="metric-bar purple"><span style={{ width: hasTelemetry ? "100%" : "0%" }} /></div>
          </article>
          <article className="card metric">
            <div className="card-heading"><span>Sample age</span><b className={`live-tag ${tag.toLowerCase()}`}>{tag}</b></div>
            <strong>{format(sampleAge, 1)}</strong><small>s</small>
            <div className="metric-bar green"><span style={{ width: live ? "100%" : "0%" }} /></div>
          </article>
        </section>

        <section className="main-grid">
          <div className="left-column">
            <article className="card attitude-card" title="Tilt estimated from gravity. Motion and vibration affect this estimate; yaw is unavailable.">
              <div className="section-label">ACCELEROMETER TILT</div>
              <div className="card-title-row"><h2>Rocket view</h2><span className="axis">Z ↑</span></div>
              <div className="rocket-stage">
                <div className="orbit orbit-one" /><div className="orbit orbit-two" />
                <div className="rocket" style={{ transform: `rotate(${latest?.roll ?? 0}deg)` }}>
                  <div className="nose" /><div className="body" /><div className="fin left" /><div className="fin right" /><div className="engine" />
                </div>
              </div>
              <div className="attitude-values">
                <div><span>ROLL</span><b>{format(latest?.roll, 1)}{latest?.roll != null ? "°" : ""}</b></div>
                <div><span>PITCH</span><b>{format(latest?.pitch, 1)}{latest?.pitch != null ? "°" : ""}</b></div>
                <div><span>YAW</span><b>—</b></div>
              </div>
            </article>
            <article className="card map-card">
              <div className="section-label">POSITION</div>
              <div className="card-title-row"><h2>Map view</h2><span className="coordinates">NO GPS DATA</span></div>
              <div className="map"><div className="map-road road-main" /><div className="map-road road-side" /><span className="map-scale">—</span></div>
            </article>
          </div>

          <div className="sensor-grid">
            {cards.map((card) => <SensorCard key={card.key} title={card.title}
              value={format(latest?.[card.key])} unit={card.unit} color={card.color}
              data={series} dataKey={card.key} hasData={latest?.[card.key] != null}
              status={tag} detail={"detail" in card ? card.detail : undefined} />)}
          </div>

          <aside className="card command-card">
            <div className="section-label">{simulated ? "COMMAND SIMULATION" : "SENSOR MONITOR"}</div>
            <div className="card-title-row"><h2>Ejection</h2><span className={`status-badge ${commandState}`}>{commandLabel}</span></div>
            <p className="command-note">{simulated ? "Demonstration only. No commands are sent to hardware." : "Sensor firmware provides telemetry only. Hardware commands are unavailable."}</p>
            <div className="command-step">
              <span className="step-number">01</span><div><b>Arm system</b><small>{simulated ? "Simulation controls" : "Unavailable on sensor firmware"}</small></div>
              <button className={`toggle ${commandState !== "safe" ? "on" : ""}`} onClick={armSystem}
                disabled={!simulated || !connected || commandState !== "safe"} aria-label="Arm system"><span /></button>
            </div>
            <div className="command-step fire-step">
              <span className="step-number">02</span><div><b>Fire charge</b><small>Simulation only</small></div>
              <button className={`fire-button ${commandState}`} disabled={!simulated || !connected || commandState !== "armed"} onClick={fireCharge}>FIRE</button>
            </div>
            <div className="command-timeline">
              <div className={commandState !== "safe" ? "done" : ""}><i />Simulation started</div>
              <div className={commandState === "firing" || commandState === "complete" ? "done" : ""}><i />Simulating response</div>
              <div className={commandState === "complete" ? "done" : ""}><i />Simulation complete</div>
            </div>
            <div className="health-row"><b>{simulated ? "Simulated data" : live ? "Receiving sensor data" : connected ? "Waiting for sensor data" : "Serial disconnected"}</b></div>
            <div className="command-footer">
              <button disabled title="UTC synchronization is not implemented">Set UTC</button>
              <button onClick={() => {
                if (simulationTimer.current !== null) window.clearTimeout(simulationTimer.current);
                setCommandState("safe"); setPhase("Initialization"); setActionMessage(null);
              }}>Reset</button>
            </div>
          </aside>
        </section>
      </div>
      <footer className={`serial-log ${isLogExpanded ? "expanded" : ""}`}>
        <span className="log-status"><i className={live ? "connected" : "idle"} /> Serial log</span>
        <code>{log}</code>
        {isLogExpanded && <pre>{logs.length > 0 ? logs.join("\n") : log}</pre>}
        <button onClick={() => setIsLogExpanded(!isLogExpanded)}><Icon name="send" /> {isLogExpanded ? "Collapse log" : "Expand log"}</button>
      </footer>
    </main>
  );
}

export default App;
