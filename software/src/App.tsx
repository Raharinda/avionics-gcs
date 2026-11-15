import { useMemo, useState } from "react";
import { Icon } from "./components/Icon";
import { SensorCard } from "./components/SensorCard";
import { DEFAULT_DATA_SOURCE, DUMMY_SOURCE } from "./data/dummyTelemetry";
import { useTelemetry } from "./hooks/useTelemetry";
import type { CommandState, Phase } from "./types/telemetry";
import "./App.css";

function App() {
  const [phase, setPhase] = useState<Phase>("Initialization");
  const [connected, setConnected] = useState(false);
  const [dataSource, setDataSource] = useState(DEFAULT_DATA_SOURCE);
  const [commandState, setCommandState] = useState<CommandState>("safe");
  const [log, setLog] = useState("No telemetry data received");
  const {
    series,
    packetCount,
    loadDummyData,
    clearTelemetry: clearTelemetryData,
  } = useTelemetry({ connected, dataSource });

  const altitude =
    series.length > 0 ? series[series.length - 1].altitude : null;
  const chartData = useMemo(() => series, [series]);
  const hasTelemetry = series.length > 0;
  const sourceAvailable =
    dataSource === DUMMY_SOURCE || dataSource.startsWith("COM");
  const connectionReady =
    dataSource === DUMMY_SOURCE || (sourceAvailable && connected);
  const clearTelemetry = () => {
    setConnected(false);
    setCommandState("safe");
    setPhase("Initialization");
    clearTelemetryData();
    setLog("Telemetry stopped — no data received");
  };

  const stopTelemetry = () => {
    clearTelemetry();
    setDataSource(DEFAULT_DATA_SOURCE);
  };

  const selectDataSource = (source: string) => {
    setDataSource(source);
    clearTelemetry();
    setLog(
      source === DUMMY_SOURCE
        ? "Dummy data selected — press Start to stream"
        : "No telemetry data received",
    );
  };

  const startTelemetry = () => {
    if (dataSource === DUMMY_SOURCE) {
      loadDummyData();
      setConnected(true);
      setLog("14:32:09.021  DUMMY RX alt: 1244.9, vel: -18.6, packet: 28492");
      return;
    }
    setConnected(true);
    setLog(`${dataSource} selected — waiting for telemetry data`);
  };

  const armSystem = () => {
    if (!connectionReady) {
      setLog("14:32:10.422  ARM_SYSTEM rejected — connect port first");
      return;
    }
    if (commandState === "safe") {
      setCommandState("armed");
      setLog("14:32:10.422  TX ARM_SYSTEM — awaiting FIRE command");
    }
  };

  const fireCharge = () => {
    if (!connectionReady || commandState !== "armed") {
      setLog("14:32:11.008  FIRE rejected — connect port first");
      return;
    }
    setConnected(true);
    setCommandState("firing");
    setLog("14:32:11.008  TX FIRE — command sent via serial");
    window.setTimeout(() => {
      setCommandState("complete");
      setPhase("Flight");
      setConnected(true);
      setLog(
        "14:32:11.236  ACK FIRE — ejection charge triggered; listening for telemetry",
      );
    }, 1200);
  };

  const commandLabel =
    commandState === "safe"
      ? "SAFE"
      : commandState === "armed"
        ? "ARMED"
        : commandState === "firing"
          ? "SENDING"
          : "FIRED";
  const [isLogExpanded, setIsLogExpanded] = useState(false);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">G</div>
          <strong>AVIONICS GCS</strong>
          <span className="connection-pill">
            <i className={connected ? "connected" : ""} />
            {connected ? "Connected" : "Disconnected"}
          </span>
        </div>
        <nav className="phase-nav">
          {(["Initialization", "Flight", "Recovery"] as Phase[]).map((item) => (
            <div
              key={item}
              className={`phase-item ${phase === item ? "active" : ""} ${item === "Recovery" ? "future" : ""}`}
            >
              <span className="phase-dot" />
              {item}
            </div>
          ))}
        </nav>
        <div className="header-actions">
          <div className="utc">
            <b>--:--:--</b>
            <span>NO UTC DATA</span>
          </div>
          <select
            aria-label="Data source"
            value={dataSource}
            onChange={(event) => selectDataSource(event.target.value)}
          >
            <option>COM4 · USB</option>
            <option>COM3 · USB</option>
            <option>Dummy data</option>
          </select>
          <button className="download">
            <Icon name="download" /> Download CSV
          </button>
        </div>
      </header>

      <div className="dashboard">
        <section className="metric-row">
          <article className="card metric">
            <div className="card-heading">
              <span>Altitude</span>
              <b className="live-tag">{hasTelemetry ? "LIVE" : "NO DATA"}</b>
            </div>
            <strong>
              {altitude === null
                ? "—"
                : altitude.toLocaleString("en-US", {
                    maximumFractionDigits: 1,
                  })}
            </strong>
            <small>m</small>
            <div className="metric-bar">
              <span style={{ width: hasTelemetry ? "72%" : "0%" }} />
            </div>
          </article>
          <article className="card metric">
            <div className="card-heading">
              <span>Descent rate</span>
              <b className="live-tag">{hasTelemetry ? "LIVE" : "NO DATA"}</b>
            </div>
            <strong>{hasTelemetry ? "−18.4" : "—"}</strong>
            <small>m/s</small>
            <div className="metric-bar blue">
              <span style={{ width: hasTelemetry ? "43%" : "0%" }} />
            </div>
          </article>
          <article className="card metric">
            <div className="card-heading">
              <span>Packet count</span>
              <b className="live-tag">{hasTelemetry ? "LIVE" : "NO DATA"}</b>
            </div>
            <strong>{hasTelemetry ? packetCount.toLocaleString() : "—"}</strong>
            <div className="metric-bar purple">
              <span style={{ width: hasTelemetry ? "86%" : "0%" }} />
            </div>
          </article>
          <article className="card metric">
            <div className="card-heading">
              <span>Lost packets</span>
              <b className="live-tag">{hasTelemetry ? "LIVE" : "NO DATA"}</b>
            </div>
            <strong>{hasTelemetry ? "3" : "—"}</strong>
            <div className="metric-bar green">
              <span style={{ width: hasTelemetry ? "10%" : "0%" }} />
            </div>
          </article>
        </section>

        <section className="main-grid">
          <div className="left-column">
            <article className="card attitude-card">
              <div className="section-label">ATTITUDE</div>
              <div className="card-title-row">
                <h2>Rocket view</h2>
                <span className="axis">Z ↑</span>
              </div>
              <div className="rocket-stage">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="rocket">
                  <div className="nose" />
                  <div className="body" />
                  <div className="fin left" />
                  <div className="fin right" />
                  <div className="engine" />
                </div>
              </div>
              <div className="attitude-values">
                <div>
                  <span>ROLL</span>
                  <b>{hasTelemetry ? "−1.4°" : "—"}</b>
                </div>
                <div>
                  <span>PITCH</span>
                  <b>{hasTelemetry ? "2.8°" : "—"}</b>
                </div>
                <div>
                  <span>YAW</span>
                  <b>{hasTelemetry ? "184.2°" : "—"}</b>
                </div>
              </div>
            </article>
            <article className="card map-card">
              <div className="section-label">POSITION</div>
              <div className="card-title-row">
                <h2>Map view</h2>
                <span className="coordinates">
                  {hasTelemetry
                    ? "35.8842° N · 106.3075° W"
                    : "NO POSITION DATA"}
                </span>
              </div>
              <div className="map">
                <div className="map-road road-main" />
                <div className="map-road road-side" />
                {hasTelemetry && <div className="map-pin" />}
                <span className="map-scale">
                  {hasTelemetry ? "200 m" : "—"}
                </span>
              </div>
            </article>
          </div>

          <div className="sensor-grid">
            <SensorCard
              title="Temperature"
              value={hasTelemetry ? "24.8" : "—"}
              unit="°C"
              color="#ff5733"
              data={chartData}
              dataKey="temperature"
              domain={[21, 28]}
              hasData={hasTelemetry}
            />
            <SensorCard
              title="Pressure"
              value={hasTelemetry ? "100.6" : "—"}
              unit="kPa"
              color="#252932"
              data={chartData}
              dataKey="pressure"
              domain={[98, 103]}
              hasData={hasTelemetry}
            />
            <SensorCard
              title="Gyroscope"
              value={hasTelemetry ? "−1.4" : "—"}
              unit="°/s"
              color="#92959a"
              data={chartData}
              dataKey="acceleration"
              domain={[0.8, 1.2]}
              hasData={hasTelemetry}
            />
            <SensorCard
              title="Accelerometer"
              value={hasTelemetry ? "0.98" : "—"}
              unit="g"
              color="#252932"
              data={chartData}
              dataKey="acceleration"
              domain={[0.8, 1.2]}
              hasData={hasTelemetry}
            />
            <SensorCard
              title="Magnetometer"
              value={hasTelemetry ? "42.1" : "—"}
              unit="µT"
              color="#a6a8aa"
              data={chartData}
              dataKey="pressure"
              domain={[98, 103]}
              hasData={hasTelemetry}
            />
            <SensorCard
              title="Orientation"
              value={hasTelemetry ? "184.2" : "—"}
              unit="°"
              color="#252932"
              data={chartData}
              dataKey="temperature"
              domain={[21, 28]}
              hasData={hasTelemetry}
            />
          </div>

          <aside className="card command-card">
            <div className="section-label">COMMAND</div>
            <div className="card-title-row">
              <h2>Ejection</h2>
              <span className={`status-badge ${commandState}`}>
                {commandLabel}
              </span>
            </div>
            <div className="command-step">
              <span className="step-number">01</span>
              <div>
                <b>Arm system</b>
                <small>Enable fire controls</small>
              </div>
              <button
                className={`toggle ${commandState !== "safe" ? "on" : ""}`}
                onClick={armSystem}
                aria-label="Arm system"
              >
                <span />
              </button>
            </div>
            <div className="command-step fire-step">
              <span className="step-number">02</span>
              <div>
                <b>Fire charge</b>
                <small>Arm system first</small>
              </div>
              <button
                className={`fire-button ${commandState}`}
                disabled={commandState !== "armed"}
                onClick={fireCharge}
              >
                FIRE
              </button>
            </div>
            <div className="command-timeline">
              <div className={commandState !== "safe" ? "done" : ""}>
                <i />
                Sending FIRE
              </div>
              <div
                className={
                  commandState === "firing" || commandState === "complete"
                    ? "done"
                    : ""
                }
              >
                <i />
                Sent via serial
              </div>
              <div className={commandState === "complete" ? "done" : ""}>
                <i />
                Ack from rocket
              </div>
            </div>
            <div className="health-row">
              <span>
                <i />1
              </span>
              <span>
                <i />2
              </span>
              <span>
                <i />3
              </span>
              <span>
                <i />4
              </span>
              <b>No error</b>
              <Icon name="chevron" />
            </div>
            <div className="command-footer">
              <button
                onClick={() => setLog("14:32:12.004  UTC clock synchronized")}
              >
                Set UTC
              </button>
              <button
                onClick={() => {
                  setCommandState("safe");
                  setPhase("Initialization");
                  setLog("14:32:12.004  Command sequence reset");
                }}
              >
                Reset
              </button>
              <button
                className="start"
                onClick={startTelemetry}
                disabled={connected}
              >
                Start
              </button>
              <button
                className="stop"
                onClick={stopTelemetry}
                disabled={!connected}
              >
                Stop
              </button>
            </div>
          </aside>
        </section>
      </div>
      <footer className={`serial-log ${isLogExpanded ? "expanded" : ""}`}>
        <span className="log-status">
          <i /> Serial log
        </span>
        <code>{log}</code>
        {isLogExpanded && (
          <pre>
            {log}
            {"\n"}Telemetry source: {dataSource}
            {"\n"}Stream: {connected ? "active" : "stopped"}
          </pre>
        )}
        <button onClick={() => setIsLogExpanded(!isLogExpanded)}>
          <Icon name="send" /> {isLogExpanded ? "Collapse log" : "Expand log"}
        </button>
      </footer>
    </main>
  );
}

export default App;
