import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { Icon } from "./components/Icon";
import { RocketModel3D } from "./components/RocketModel3D";
import { ImuCalibrationWizard } from "./components/ImuCalibrationWizard";
import { useImuCalibration } from "./hooks/useImuCalibration";
import { SensorCard } from "./components/SensorCard";
import { DEFAULT_DATA_SOURCE, DUMMY_SOURCE } from "./data/dummyTelemetry";
import { useTelemetry, type SerialPortInfo } from "./hooks/useTelemetry";
import type { CommandState, Phase } from "./types/telemetry";
import "./App.css";

function App() {
  const [phase, setPhase] = useState<Phase>("Initialization");
  const [connected, setConnected] = useState(false);
  const [portConnected, setPortConnected] = useState(false);
  const [streamingSource, setStreamingSource] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState(DEFAULT_DATA_SOURCE);
  const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
  const [commandState, setCommandState] = useState<CommandState>("safe");
  const [log, setLog] = useState("No telemetry data received");
  const [rawSerialLine, setRawSerialLine] = useState("");
  const latestRawSerialLine = useRef("");
  const rawFrameLines = useRef<string[]>([]);
  const latestRawFrame = useRef("");
  const [rawSerialHistory, setRawSerialHistory] = useState<string[]>([]);
  const [isSerialHistoryOpen, setIsSerialHistoryOpen] = useState(false);
  const [serialView, setSerialView] = useState<"status" | "raw">("status");
  const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [utcNow, setUtcNow] = useState(() => new Date());
  const sourceState = useRef(
    new Map<string, {
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
    sendSerialCommand,
    listSerialPorts,
    receivedAt,
  } = useTelemetry({ connected: connected && streamingSource === dataSource, dataSource });

  const hardwareStreaming = connected && streamingSource === dataSource && dataSource !== DUMMY_SOURCE;
  const imuCalibration = useImuCalibration(hardwareStreaming, dataSource, sendSerialCommand);
  useEffect(() => { if (hardwareStreaming) setLog(imuCalibration.error ?? imuCalibration.message); }, [hardwareStreaming, imuCalibration.error, imuCalibration.message]);

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

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    listen<string>("serial_line", (event) => {
      latestRawSerialLine.current = event.payload;
      if (rawFrameLines.current[rawFrameLines.current.length - 1] !== event.payload) {
        rawFrameLines.current.push(event.payload);
      }
      if (event.payload.includes("{") && event.payload.includes("}")) {
        latestRawFrame.current = rawFrameLines.current.join("\n");
        rawFrameLines.current = [];
      }
      setRawSerialHistory((history) => [...history.slice(-199), event.payload]);

    }).then((cleanup) => {
      if (disposed) {
        cleanup();
      } else {
        unlisten = cleanup;
      }
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (latestRawFrame.current) {
        setRawSerialLine(latestRawFrame.current);
        latestRawFrame.current = "";
      } else if (latestRawSerialLine.current) {
        setRawSerialLine(latestRawSerialLine.current);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const altitude =
    series.length > 0 ? series[series.length - 1].altitude : null;
  const latestTelemetry = series.length > 0 ? series[series.length - 1] : null;
  const simulated = dataSource === DUMMY_SOURCE;
  const freshAttitude = receivedAt !== null && Date.now() - receivedAt < 1500;
  const attitudeLive = simulated ? connected : hardwareStreaming && freshAttitude &&
    !!imuCalibration.state?.referenceSet && !!latestTelemetry?.referenceSet && !!latestTelemetry.orientation;
  const attitudeStatus = simulated ? "SIMULATION" : !hardwareStreaming ? "Start ESP32 telemetry"
    : !imuCalibration.state ? "Firmware imu3d-v2 required"
    : !imuCalibration.state.imuReady ? "IMU unavailable"
    : !imuCalibration.state.calibrated ? "Calibrate six positions"
    : !imuCalibration.state.referenceSet ? "Set your reference pose"
    : !freshAttitude ? "No recent attitude data"
    : !latestTelemetry?.referenceSet || !latestTelemetry.orientation ? "Waiting for referenced attitude" : "LIVE · relative to reference";
  const chartData = useMemo(() => series, [series]);
  const hasTelemetry = series.length > 0;
  const detectedUsbPorts = serialPorts.filter((port) => port.is_usb)
    .map((port) => port.name).sort();
  const hardwareStatusLabel = detectedUsbPorts.length > 0
    ? `Connected at ${detectedUsbPorts.join(", ")}` : "Port disconnected";
  const streamIsActive = streamingSource !== null && (
    streamingSource === DUMMY_SOURCE ||
    serialPorts.some((port) => port.name === streamingSource.split(" · ")[0])
  );
  const streamLabel = streamingSource === DUMMY_SOURCE
    ? "Dummy Data" : streamingSource?.split(" · ")[0];
  const portStatusLabel = streamIsActive
    ? `Streaming at ${streamLabel}` : hardwareStatusLabel;
  const sourceAvailable =
    dataSource === DUMMY_SOURCE || dataSource.startsWith("COM");
  const connectionReady =
    dataSource === DUMMY_SOURCE || (sourceAvailable && portConnected);

  useEffect(() => {
    if (activeSource.current !== dataSource) {
      activeSource.current = dataSource;
      const saved = sourceState.current.get(dataSource);
      if (!saved) return;
      setCommandState(saved.commandState);
      setPhase(saved.phase);
      setLog(saved.log);
      return;
    }
    sourceState.current.set(dataSource, {
      commandState,
      phase,
      log,
    });
  }, [commandState, dataSource, log, phase]);
  const clearTelemetry = () => {
    setConnected(false);
    setPortConnected(false);
    setStreamingSource(null);
    clearTelemetryData();
    latestRawSerialLine.current = "";
    rawFrameLines.current = [];
    latestRawFrame.current = "";
    setRawSerialLine("");
    setRawSerialHistory([]);
    setLog("Telemetry stopped — no data received");
  };

  const stopTelemetry = async () => {
    if (dataSource !== DUMMY_SOURCE) {
      await stopSerialListener();
    }
    clearTelemetry();
  };

  const selectDataSource = async (source: string) => {
    if (source === dataSource) return;
    try {
      if (dataSource !== DUMMY_SOURCE) {
        await stopSerialListener();
      }
      setConnected(false);
      setPortConnected(false);
      setStreamingSource(null);
      setDataSource(source);
    } catch (error) {
      setLog(`Serial error: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const startTelemetry = async () => {
    if (dataSource === DUMMY_SOURCE) {
      loadDummyData();
      setStreamingSource(DUMMY_SOURCE);
      setConnected(true);
      setLog("14:32:09.021  DUMMY RX alt: 1244.9, vel: -18.6, packet: 28492");
      return;
    }
    const portName = dataSource.split(" · ")[0];
    try {
      const message = await startSerialListener(portName);
      setPortConnected(true);
      setConnected(true);
      setStreamingSource(dataSource);
      setLog(`${message} — waiting for JSON telemetry`);
    } catch (error) {
      setPortConnected(false);
      setConnected(false);
      setStreamingSource(null);
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
  const downloadTelemetryCsv = async () => {
    const header = "time,temperature,pressure,acceleration,gyroscope,altitude";
    const rows = series.map((point) =>
      [
        point.time,
        point.temperature,
        point.pressure,
        point.acceleration,
        point.gyroscope,
        point.altitude,
      ].join(","),
    );
    const csv = [header, ...rows].join("\r\n");
    try {
      const path = await save({
        defaultPath: `telemetry-${new Date().toISOString().slice(0, 10)}.csv`,
        filters: [{ name: "CSV files", extensions: ["csv"] }],
      });
      if (!path) {
        setLog("CSV export cancelled");
        return;
      }
      const savedPath = await invoke<string>("export_telemetry_csv", {
        csv,
        path,
      });
      setLog(
        rows.length > 0
          ? `CSV exported — ${rows.length} telemetry points (${savedPath})`
          : `CSV exported — no telemetry data available (${savedPath})`,
      );
    } catch (error) {
      setLog(`CSV export error: ${error instanceof Error ? error.message : String(error)}`);
    }
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
          <span className="connection-pill" role="status" aria-live="polite"
            title={streamIsActive
              ? `Telemetry streaming from ${streamLabel}. ${hardwareStatusLabel}`
              : `${hardwareStatusLabel}. Press Start to stream the selected data source.`}>
            <i className={detectedUsbPorts.length > 0 || streamIsActive ? "connected" : ""} />
            <span className="connection-copy">
              <span className="connection-port">{portStatusLabel}</span>
              <small>{streamIsActive ? "Streaming" : "Not streaming"}</small>
            </span>
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
          <button className="download" type="button" onClick={downloadTelemetryCsv}>
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
                <span className="axis">
                  {attitudeStatus}
                </span>
              </div>
              <div className="rocket-stage">
                <RocketModel3D active={attitudeLive} quaternion={simulated ? null : latestTelemetry?.orientation ?? null}
                  roll={latestTelemetry?.roll ?? 0} pitch={latestTelemetry?.pitch ?? 0} yaw={latestTelemetry?.yaw ?? 0} />
              </div>
              <div className="attitude-values">
                <div>
                  <span>X ROTATION</span>
                  <b>{attitudeLive && latestTelemetry ? `${latestTelemetry.roll.toFixed(1)}°` : "—"}</b>
                </div>
                <div>
                  <span>Y ROTATION</span>
                  <b>{attitudeLive && latestTelemetry ? `${latestTelemetry.pitch.toFixed(1)}°` : "—"}</b>
                </div>
                <div>
                  <span>Z ROTATION</span>
                  <b>{attitudeLive && latestTelemetry ? `${latestTelemetry.yaw.toFixed(1)}°` : "—"}</b>
                </div>
              </div>
              <p className="imu-note">{attitudeStatus}. Drag untuk memutar kamera, scroll untuk zoom. Acuan awal tidak memakai arah kompas.</p>
              <button type="button" className="attitude-reference-link" onClick={() => setIsCalibrationOpen(true)}>Kalibrasi XYZ / tetapkan acuan</button>
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
              value={latestTelemetry?.pressure != null ? latestTelemetry.pressure.toFixed(2) : "—"}
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
      {isCalibrationOpen && <ImuCalibrationWizard controller={imuCalibration} connected={hardwareStreaming} onClose={() => setIsCalibrationOpen(false)} />}
      <footer className={`serial-log ${isLogExpanded ? "expanded" : ""}`}>
        <div className="serial-log-heading">
          <span className="log-status">
            <i /> Serial log
          </span>
          <div className="serial-view-tabs" role="tablist" aria-label="Serial output view">
            <button
              className={serialView === "status" ? "active" : ""}
              type="button"
              onClick={() => setSerialView("status")}
              role="tab"
              aria-selected={serialView === "status"}
            >
              Status
            </button>
            <button
              className={serialView === "raw" ? "active" : ""}
              type="button"
              onClick={() => setSerialView("raw")}
              role="tab"
              aria-selected={serialView === "raw"}
            >
              Raw data
            </button>
            {serialView === "raw" && (
              <button
                className="serial-history-button"
                type="button"
                onClick={() => setIsSerialHistoryOpen(true)}
                disabled={rawSerialHistory.length === 0}
              >
                History
              </button>
            )}
          </div>
        </div>
        <code>
          {serialView === "status"
            ? log
            : rawSerialLine || "No raw serial data received"}
        </code>
        {isLogExpanded && (
          <pre>
            {serialView === "raw"
              ? rawSerialLine || "No raw serial data received"
              : `${log}
Telemetry source: ${dataSource}
Port: ${hardwareStatusLabel}
Listening: ${streamIsActive ? `active at ${streamLabel}` : "stopped"}`}
          </pre>
        )}
        <button
          className="serial-log-expand"
          type="button"
          onClick={() => setIsLogExpanded(!isLogExpanded)}
        >
          <Icon name="send" /> {isLogExpanded ? "Collapse log" : "Expand log"}
        </button>
      </footer>
      {isSerialHistoryOpen && (
        <div
          className="serial-history-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsSerialHistoryOpen(false);
          }}
        >
          <section className="serial-history-modal" role="dialog" aria-modal="true" aria-labelledby="serial-history-title">
            <div className="serial-history-header">
              <div>
                <div className="section-label">RAW SERIAL DATA</div>
                <h2 id="serial-history-title">Serial history</h2>
              </div>
              <button
                className="modal-close"
                type="button"
                onClick={() => setIsSerialHistoryOpen(false)}
                aria-label="Close serial history"
              >
                ×
              </button>
            </div>
            <pre className="serial-history-content">
              {rawSerialHistory.join("\n") || "No raw serial data received"}
            </pre>
            <div className="serial-history-footer">
              {rawSerialHistory.length} lines stored
              <button type="button" onClick={() => setRawSerialHistory([])}>
                Clear history
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default App;
