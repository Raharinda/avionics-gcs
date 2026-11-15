import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";

type Phase = "Initialization" | "Flight" | "Recovery";
type CommandState = "safe" | "armed" | "firing" | "complete";
type TelemetryPoint = {
  time: number;
  temperature: number;
  pressure: number;
  acceleration: number;
  altitude: number;
};

const dummySeries: TelemetryPoint[] = Array.from({ length: 18 }, (_, index) => ({
  time: index,
  temperature: 24.2 + Math.sin(index / 2.4) * 1.2 + index * 0.06,
  pressure: 100.9 - Math.sin(index / 2.8) * 0.8 - index * 0.04,
  acceleration: 0.96 + Math.sin(index / 2.2) * 0.08,
  altitude: 420 + index * 48 + Math.sin(index) * 10,
}));

function Icon({ name }: { name: "download" | "chevron" | "radio" | "shield" | "send" }) {
  const paths = {
    download: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 20h16" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    radio: <><circle cx="12" cy="12" r="2" /><path d="M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8" /></>,
    shield: <><path d="M12 3 19 6v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6l7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    send: <><path d="m21 3-7.5 18-3.5-7-7-3.5L21 3Z" /><path d="M10 14 21 3" /></>,
  };
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function SensorCard({
  title,
  value,
  unit,
  color = "#3b6ff5",
  data,
  dataKey,
  domain,
  hasData,
}: {
  title: string;
  value: string;
  unit: string;
  color?: string;
  data: TelemetryPoint[];
  dataKey: "temperature" | "pressure" | "acceleration";
  domain?: [number, number];
  hasData: boolean;
}) {
  return (
    <article className="card sensor-card">
      <div className="card-heading"><span>{title}</span><b className="live-tag">{hasData ? "LIVE" : "NO DATA"}</b></div>
      <div className="sensor-value">{value}<small>{unit}</small></div>
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 2, left: -32, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#edf0f5" />
            <YAxis domain={domain} hide />
            <XAxis dataKey="time" hide />
            <Tooltip content={() => null} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-axis"><span>T−12s</span><span>T−0s</span></div>
    </article>
  );
}

function App() {
  const [phase, setPhase] = useState<Phase>("Initialization");
  const [connected, setConnected] = useState(false);
  const [dataSource, setDataSource] = useState("COM4 · USB");
  const [commandState, setCommandState] = useState<CommandState>("safe");
  const [series, setSeries] = useState<TelemetryPoint[]>([]);
  const [packetCount, setPacketCount] = useState(0);
  const [log, setLog] = useState("No telemetry data received");

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!connected) return;
      setPacketCount((count) => count + 1);
      setSeries((current) => [...current.slice(-17), {
        time: current[current.length - 1].time + 1,
        temperature: 24.5 + Math.sin(Date.now() / 1200) * 1.2,
        pressure: 100.4 + Math.sin(Date.now() / 1700) * 0.6,
        acceleration: 0.98 + Math.sin(Date.now() / 900) * 0.06,
        altitude: 1248 + Math.sin(Date.now() / 3000) * 8,
      }]);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connected]);

  const altitude = series.length > 0 ? series[series.length - 1].altitude : null;
  const chartData = useMemo(() => series, [series]);
  const hasTelemetry = series.length > 0;

  const loadDummyData = () => {
    setSeries(dummySeries);
    setPacketCount(28492);
    setConnected(true);
    setLog("14:32:09.021  DUMMY RX alt: 1244.9, vel: -18.6, packet: 28492");
  };

  const clearTelemetry = () => {
    setConnected(false);
    setSeries([]);
    setPacketCount(0);
    setLog("Telemetry stopped — no data received");
  };

  const stopTelemetry = () => {
    clearTelemetry();
    setDataSource("COM4 · USB");
  };

  const selectDataSource = (source: string) => {
    setDataSource(source);
    if (source === "Dummy data") {
      loadDummyData();
    } else {
      clearTelemetry();
    }
  };

  const armSystem = () => {
    if (commandState === "safe") {
      setCommandState("armed");
      setLog("14:32:10.422  TX ARM_SYSTEM — awaiting FIRE command");
    }
  };

  const fireCharge = () => {
    if (commandState !== "armed") return;
    setCommandState("firing");
    setLog("14:32:11.008  TX FIRE — command sent via serial");
    window.setTimeout(() => {
      setCommandState("complete");
      setPhase("Flight");
      setLog("14:32:11.236  ACK FIRE — ejection charge triggered");
    }, 1200);
  };

  const commandLabel = commandState === "safe" ? "SAFE" : commandState === "armed" ? "ARMED" : commandState === "firing" ? "SENDING" : "FIRED";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark">G</div><strong>AVIONICS GCS</strong><span className="connection-pill"><i className={connected ? "connected" : ""} />{connected ? "Connected" : "Disconnected"}</span></div>
        <nav className="phase-nav">
          {(["Initialization", "Flight", "Recovery"] as Phase[]).map((item) => <div key={item} className={`phase-item ${phase === item ? "active" : ""} ${item === "Recovery" ? "future" : ""}`}><span className="phase-dot" />{item}</div>)}
        </nav>
        <div className="header-actions"><div className="utc"><b>--:--:--</b><span>NO UTC DATA</span></div><select aria-label="Data source" value={dataSource} onChange={(event) => selectDataSource(event.target.value)}><option>COM4 · USB</option><option>COM3 · USB</option><option>Dummy data</option></select><button className="download"><Icon name="download" /> Download CSV</button></div>
      </header>

      <div className="dashboard">
        <section className="metric-row">
          <article className="card metric"><div className="card-heading"><span>Altitude</span><b className="live-tag">{hasTelemetry ? "LIVE" : "NO DATA"}</b></div><strong>{altitude === null ? "—" : altitude.toLocaleString("en-US", { maximumFractionDigits: 1 })}</strong><small>m</small><div className="metric-bar"><span style={{ width: hasTelemetry ? "72%" : "0%" }} /></div></article>
          <article className="card metric"><div className="card-heading"><span>Descent rate</span><b className="live-tag">{hasTelemetry ? "LIVE" : "NO DATA"}</b></div><strong>{hasTelemetry ? "−18.4" : "—"}</strong><small>m/s</small><div className="metric-bar blue"><span style={{ width: hasTelemetry ? "43%" : "0%" }} /></div></article>
          <article className="card metric"><div className="card-heading"><span>Packet count</span><b className="live-tag">{hasTelemetry ? "LIVE" : "NO DATA"}</b></div><strong>{hasTelemetry ? packetCount.toLocaleString() : "—"}</strong><div className="metric-bar purple"><span style={{ width: hasTelemetry ? "86%" : "0%" }} /></div></article>
          <article className="card metric"><div className="card-heading"><span>Lost packets</span><b className="live-tag">{hasTelemetry ? "LIVE" : "NO DATA"}</b></div><strong>{hasTelemetry ? "3" : "—"}</strong><div className="metric-bar green"><span style={{ width: hasTelemetry ? "10%" : "0%" }} /></div></article>
        </section>

        <section className="main-grid">
          <div className="left-column">
            <article className="card attitude-card">
              <div className="section-label">ATTITUDE</div><div className="card-title-row"><h2>Rocket view</h2><span className="axis">Z ↑</span></div>
              <div className="rocket-stage"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="rocket"><div className="nose" /><div className="body" /><div className="fin left" /><div className="fin right" /><div className="engine" /></div></div>
              <div className="attitude-values"><div><span>ROLL</span><b>{hasTelemetry ? "−1.4°" : "—"}</b></div><div><span>PITCH</span><b>{hasTelemetry ? "2.8°" : "—"}</b></div><div><span>YAW</span><b>{hasTelemetry ? "184.2°" : "—"}</b></div></div>
            </article>
            <article className="card map-card"><div className="section-label">POSITION</div><div className="card-title-row"><h2>Map view</h2><span className="coordinates">{hasTelemetry ? "35.8842° N · 106.3075° W" : "NO POSITION DATA"}</span></div><div className="map"><div className="map-road road-main" /><div className="map-road road-side" />{hasTelemetry && <div className="map-pin" />}<span className="map-scale">{hasTelemetry ? "200 m" : "—"}</span></div></article>
          </div>

          <div className="sensor-grid">
            <SensorCard title="Temperature" value={hasTelemetry ? "24.8" : "—"} unit="°C" color="#ff5733" data={chartData} dataKey="temperature" domain={[21, 28]} hasData={hasTelemetry} />
            <SensorCard title="Pressure" value={hasTelemetry ? "100.6" : "—"} unit="kPa" color="#252932" data={chartData} dataKey="pressure" domain={[98, 103]} hasData={hasTelemetry} />
            <SensorCard title="Gyroscope" value={hasTelemetry ? "−1.4" : "—"} unit="°/s" color="#92959a" data={chartData} dataKey="acceleration" domain={[0.8, 1.2]} hasData={hasTelemetry} />
            <SensorCard title="Accelerometer" value={hasTelemetry ? "0.98" : "—"} unit="g" color="#252932" data={chartData} dataKey="acceleration" domain={[0.8, 1.2]} hasData={hasTelemetry} />
            <SensorCard title="Magnetometer" value={hasTelemetry ? "42.1" : "—"} unit="µT" color="#a6a8aa" data={chartData} dataKey="pressure" domain={[98, 103]} hasData={hasTelemetry} />
            <SensorCard title="Orientation" value={hasTelemetry ? "184.2" : "—"} unit="°" color="#252932" data={chartData} dataKey="temperature" domain={[21, 28]} hasData={hasTelemetry} />
          </div>

          <aside className="card command-card">
            <div className="section-label">COMMAND</div><div className="card-title-row"><h2>Ejection</h2><span className={`status-badge ${commandState}`}>{commandLabel}</span></div>
            <div className="command-step"><span className="step-number">01</span><div><b>Arm system</b><small>Enable fire controls</small></div><button className={`toggle ${commandState !== "safe" ? "on" : ""}`} onClick={armSystem} aria-label="Arm system"><span /></button></div>
            <div className="command-step fire-step"><span className="step-number">02</span><div><b>Fire charge</b><small>Arm system first</small></div><button className={`fire-button ${commandState}`} disabled={commandState !== "armed"} onClick={fireCharge}>FIRE</button></div>
            <div className="command-timeline"><div className={commandState !== "safe" ? "done" : ""}><i />Sending FIRE</div><div className={commandState === "firing" || commandState === "complete" ? "done" : ""}><i />Sent via serial</div><div className={commandState === "complete" ? "done" : ""}><i />Ack from rocket</div></div>
            <div className="health-row"><span><i />1</span><span><i />2</span><span><i />3</span><span><i />4</span><b>No error</b><Icon name="chevron" /></div>
            <div className="command-footer"><button onClick={() => setLog("14:32:12.004  UTC clock synchronized")}>Set UTC</button><button onClick={() => { setCommandState("safe"); setPhase("Initialization"); setLog("14:32:12.004  Command sequence reset"); }}>Reset</button><button disabled>Start</button><button className="stop" onClick={stopTelemetry}>Stop</button></div>
          </aside>
        </section>
      </div>
      <footer className="serial-log"><span className="log-status"><i /> Serial log</span><code>{log}</code><button onClick={() => setConnected(!connected)}><Icon name={connected ? "radio" : "send"} /> {connected ? "Pause stream" : "Resume stream"}</button></footer>
    </main>
  );
}

export default App;
