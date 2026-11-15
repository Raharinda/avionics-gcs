import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "./components/Icon";
import { SensorCard } from "./components/SensorCard";
import { DEFAULT_DATA_SOURCE, DUMMY_SOURCE } from "./data/dummyTelemetry";
import { useTelemetry } from "./hooks/useTelemetry";
import type { CommandState, Phase } from "./types/telemetry";
import "./App.css";

function App() {
  const [phase, setPhase] = useState<Phase>("Initialization");
  const [connected, setConnected] = useState(false);
  const [portConnected, setPortConnected] = useState(false);
  const [dataSource, setDataSource] = useState(DEFAULT_DATA_SOURCE);
  const [serialPorts, setSerialPorts] = useState<
    { name: string; description?: string }[]
  >([]);
  const [commandState, setCommandState] = useState<CommandState>("safe");
  const [log, setLog] = useState("No telemetry data received");
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [isCalibrationStarted, setIsCalibrationStarted] = useState(false);
  const [isCalibrationComplete, setIsCalibrationComplete] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [utcNow, setUtcNow] = useState(() => new Date());
  const sourceState = useRef(
    new Map<string, {
      connected: boolean;
      portConnected: boolean;
      commandState: CommandState;
      phase: Phase;
      log: string;
    }>(),
  );
  const activeSource = useRef(dataSource);
  const {
    series,
    packetCount,
    loadDummyData,
    clearTelemetry: clearTelemetryData,
    startSerialListener,
    stopSerialListener,
    listSerialPorts,
  } = useTelemetry({ connected, dataSource });

  const refreshSerialPorts = async () => {
    try {
      setSerialPorts(await listSerialPorts());
    } catch (error) {
      setLog(`Serial port discovery error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  useEffect(() => {
    void refreshSerialPorts();
    const timer = window.setInterval(() => {
      void refreshSerialPorts();
    }, 2000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setUtcNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const altitude =
    series.length > 0 ? series[series.length - 1].altitude : null;
  const latestTelemetry = series.length > 0 ? series[series.length - 1] : null;
  const chartData = useMemo(() => series, [series]);
  const hasTelemetry = series.length > 0;
  const sourceAvailable =
    dataSource === DUMMY_SOURCE || dataSource.startsWith("COM");
  const connectionReady =
    dataSource === DUMMY_SOURCE || (sourceAvailable && portConnected);

  useEffect(() => {
    if (activeSource.current !== dataSource) {
      activeSource.current = dataSource;
      const saved = sourceState.current.get(dataSource);
      if (!saved) return;
      setConnected(saved.connected);
      setPortConnected(saved.portConnected);
      setCommandState(saved.commandState);
      setPhase(saved.phase);
      setLog(saved.log);
      return;
    }
    sourceState.current.set(dataSource, {
      connected,
      portConnected,
      commandState,
      phase,
      log,
    });
  }, [commandState, connected, dataSource, log, phase, portConnected]);
  const clearTelemetry = () => {
    setConnected(false);
    clearTelemetryData();
    setLog("Telemetry stopped — no data received");
  };

  const stopTelemetry = async () => {
    if (dataSource !== DUMMY_SOURCE) {
      await stopSerialListener();
    }
    clearTelemetry();
  };

  const selectDataSource = async (source: string) => {
    if (dataSource !== DUMMY_SOURCE) {
      await stopSerialListener();
    }
    setDataSource(source);
  };

  const startTelemetry = async () => {
    if (dataSource === DUMMY_SOURCE) {
      loadDummyData();
      setConnected(true);
      setLog("14:32:09.021  DUMMY RX alt: 1244.9, vel: -18.6, packet: 28492");
      return;
    }
    const portName = dataSource.split(" · ")[0];
    try {
      const message = await startSerialListener(portName);
      setPortConnected(true);
      setConnected(true);
      setLog(`${message} — waiting for JSON telemetry`);
    } catch (error) {
      setPortConnected(false);
      setConnected(false);
      setLog(`Serial error: ${error instanceof Error ? error.message : String(error)}`);
    }
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
  const startCalibration = () => {
    setIsCalibrationStarted(true);
    setIsCalibrationComplete(false);
    setLog("14:32:13.104  Sensor calibration started — hold vehicle steady");
  };
  const finishCalibration = () => {
    setIsCalibrationComplete(true);
    setLog("14:32:18.772  Sensor calibration complete — offsets saved");
  };
  const closeCalibration = () => {
    setIsCalibrationOpen(false);
    setIsCalibrationStarted(false);
    setIsCalibrationComplete(false);
  };
  const laptopTime = utcNow.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <main className={`app-shell ${isDarkMode ? "dark-mode" : ""}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">G</div>
          <strong>AVIONICS GCS</strong>
          <span className="connection-pill">
            <i className={portConnected ? "connected" : ""} />
            {portConnected ? "Port connected" : "Port disconnected"}
          </span>
        </div>
        <nav className="phase-nav">
          {(["Initialization", "Flight", "Recovery"] as Phase[]).map((item, index, phases) => (
            <span className="phase-group" key={item}>
              <span
                className={`phase-item ${phase === item ? "active" : ""} ${item === "Recovery" ? "future" : ""}`}
              >
                <span className="phase-dot" />
                {item}
              </span>
              {index < phases.length - 1 && <span className="phase-connector" />}
            </span>
          ))}
        </nav>
        <div className="header-actions">
          <div className="utc">
            <b>{laptopTime}</b>
            <span>LAPTOP TIME</span>
          </div>
          <select
            aria-label="Data source"
            value={dataSource}
            onChange={(event) => selectDataSource(event.target.value)}
          >
            {dataSource !== DUMMY_SOURCE &&
              !serialPorts.some(
                (port) => `${port.name} · ${port.description ?? "Serial"}` === dataSource,
              ) && <option value={dataSource}>{dataSource}</option>}
            {serialPorts.map((port) => (
              <option key={port.name} value={`${port.name} · ${port.description ?? "Serial"}`}>
                {port.name} · {port.description ?? "Serial"}
              </option>
            ))}
            <option>Dummy data</option>
          </select>
          <button className="download" type="button" onClick={() => void refreshSerialPorts()}>
            Refresh ports
          </button>
          <button className="download">
            <Icon name="download" /> Download CSV
          </button>
        </div>
      </header>

      <div className="dashboard">
        <div className="dashboard-toolbar">
          <div>
            <div className="section-label">SENSOR SETUP</div>
            <h1>Flight instrumentation</h1>
          </div>
          <button
            className="calibration-trigger"
            type="button"
            onClick={() => setIsCalibrationOpen(true)}
          >
            Calibrate sensors
          </button>
        </div>
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
            <strong>—</strong>
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
                  <b>—</b>
                </div>
                <div>
                  <span>PITCH</span>
                  <b>—</b>
                </div>
                <div>
                  <span>YAW</span>
                  <b>—</b>
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
              value={latestTelemetry ? latestTelemetry.temperature.toFixed(2) : "—"}
              unit="°C"
              color="#ff5733"
              data={chartData}
              dataKey="temperature"
              domain={[21, 28]}
              hasData={hasTelemetry}
            />
            <SensorCard
              title="Pressure"
              value={latestTelemetry ? latestTelemetry.pressure.toFixed(2) : "—"}
              unit="hPa"
              color="#252932"
              data={chartData}
              dataKey="pressure"
              domain={[980, 1030]}
              hasData={hasTelemetry}
            />
            <SensorCard
              title="Gyroscope"
              value={latestTelemetry ? latestTelemetry.gyroscope.toFixed(2) : "—"}
              unit="°/s"
              color="#92959a"
              data={chartData}
              dataKey="gyroscope"
              domain={[0, 360]}
              hasData={hasTelemetry}
            />
            <SensorCard
              title="Accelerometer"
              value={latestTelemetry ? latestTelemetry.acceleration.toFixed(3) : "—"}
              unit="g"
              color="#252932"
              data={chartData}
              dataKey="acceleration"
              domain={[0.8, 1.2]}
              hasData={hasTelemetry}
            />
            <SensorCard
              title="Magnetometer"
              value="—"
              unit="µT"
              color="#a6a8aa"
              data={chartData}
              dataKey="pressure"
              domain={[98, 103]}
              hasData={hasTelemetry}
            />
            <SensorCard
              title="Orientation"
              value="—"
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
                <small>{connectionReady ? "Enable fire controls" : "Connect port first"}</small>
              </div>
              <button
                className={`toggle ${commandState !== "safe" ? "on" : ""}`}
                onClick={armSystem}
                disabled={!connectionReady || commandState !== "safe"}
                aria-label="Arm system"
              >
                <span />
              </button>
            </div>
            <div className="command-step fire-step">
              <span className="step-number">02</span>
              <div>
                <b>Fire charge</b>
                <small>{connectionReady ? "Arm system first" : "Connect port first"}</small>
              </div>
              <button
                className={`fire-button ${commandState}`}
                disabled={!connectionReady || commandState !== "armed"}
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
              <div className="command-footer-primary">
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
              <div className="command-footer-secondary">
                <button
                  type="button"
                  onClick={() => {
                    const synchronizedAt = new Date();
                    setUtcNow(synchronizedAt);
                    setLog(
                      `${synchronizedAt.toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: false,
                      })}.${String(synchronizedAt.getMilliseconds()).padStart(3, "0")}  Laptop clock synchronized`,
                    );
                  }}
                >
                  Refresh UTC
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCommandState("safe");
                    setPhase("Initialization");
                    setLog("14:32:12.004  Command sequence reset");
                  }}
                >
                  Reset
                </button>
                <button
                  className="theme-toggle"
                  type="button"
                  onClick={() => setIsDarkMode((enabled) => !enabled)}
                  aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                >
                  {isDarkMode ? "Light" : "Dark"}
                </button>
              </div>
            </div>
          </aside>
        </section>
      </div>
      {isCalibrationOpen && (
        <div
          className="calibration-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCalibration();
          }}
        >
          <section
            className="calibration-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calibration-title"
          >
            <div className="calibration-modal-header">
              <div>
                <div className="section-label">SENSOR CALIBRATION</div>
                <h2 id="calibration-title">Align vehicle sensors</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={closeCalibration}
                aria-label="Close calibration"
              >
                ×
              </button>
            </div>
            <div className="calibration-preview" aria-label="3D calibration model preview">
              <div className="calibration-grid" />
              <div className="calibration-model">
                <div className="calibration-face face-front">IMU</div>
                <div className="calibration-face face-back">IMU</div>
                <div className="calibration-face face-right">X</div>
                <div className="calibration-face face-left">−X</div>
                <div className="calibration-face face-top">Z</div>
                <div className="calibration-face face-bottom">−Z</div>
              </div>
              <span className="calibration-axis axis-x">X</span>
              <span className="calibration-axis axis-y">Y</span>
              <span className="calibration-axis axis-z">Z</span>
            </div>
            <div className="calibration-status">
              <span className={`calibration-indicator ${isCalibrationComplete ? "complete" : isCalibrationStarted ? "active" : ""}`} />
              {isCalibrationComplete
                ? "Calibration complete. Offsets saved."
                : isCalibrationStarted
                  ? "Calibration running. Keep the vehicle steady."
                  : "Ready to calibrate accelerometer, gyroscope, and magnetometer."}
            </div>
            <div className="calibration-actions">
              <button
                className="calibration-start"
                type="button"
                onClick={startCalibration}
                disabled={isCalibrationStarted && !isCalibrationComplete}
              >
                Start calibration
              </button>
              <button
                className="calibration-finish"
                type="button"
                onClick={finishCalibration}
                disabled={!isCalibrationStarted || isCalibrationComplete}
              >
                Calibration complete
              </button>
            </div>
          </section>
        </div>
      )}
      <footer className={`serial-log ${isLogExpanded ? "expanded" : ""}`}>
        <span className="log-status">
          <i /> Serial log
        </span>
        <code>{log}</code>
        {isLogExpanded && (
          <pre>
            {log}
            {"\n"}Telemetry source: {dataSource}
            {"\n"}Port: {portConnected ? "connected" : "disconnected"}
            {"\n"}Listening: {connected ? "active" : "stopped"}
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
