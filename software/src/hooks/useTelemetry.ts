import { useCallback, useEffect, useRef, useState } from "react";
import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { createDummyTelemetryPoint, dummySeries, DUMMY_SOURCE } from "../data/dummyTelemetry";
import { DEFAULT_DATA_SOURCE } from "../data/dummyTelemetry";
import { normalizeTelemetry } from "../data/normalizeTelemetry";
import type { SerialEvent, SerialPortInfo, TelemetryPoint } from "../types/telemetry";

type UseTelemetryOptions = {
  dataSource: string;
};

// Correlation ID for this app instance; does not require WebView crypto APIs.
let nextSessionId = 0;

export function useTelemetry({ dataSource }: UseTelemetryOptions) {
  const [series, setSeries] = useState<TelemetryPoint[]>([]);
  const [packetCount, setPacketCount] = useState(0);
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected" | "stopping">("disconnected");
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [activePort, setActivePort] = useState<string | null>(null);
  const [message, setMessage] = useState("Select a source and press Connect");
  const [logs, setLogs] = useState<string[]>([]);
  const [lastReceivedAt, setLastReceivedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const session = useRef<string | null>(null);
  const pendingConnect = useRef<Promise<void> | null>(null);
  const stopping = useRef(false);
  const mounted = useRef(true);
  const referencePressure = useRef<number | null>(null);
  const previous = useRef<TelemetryPoint | null>(null);
  const connected = status === "connected";
  const busy = status === "connecting" || status === "stopping";

  const appendLog = useCallback((line: string) => {
    setLogs((current) => [...current.slice(-79), line]);
  }, []);

  const clearTelemetry = useCallback(() => {
    setSeries([]);
    setPacketCount(0);
    setLastReceivedAt(null);
    setLogs([]);
    referencePressure.current = null;
    previous.current = null;
  }, []);

  const refreshPorts = useCallback(async () => {
    if (!isTauri()) {
      setMessage("USB Serial requires the desktop app. Dummy data is available in the browser.");
      return;
    }
    try {
      const result = await invoke<SerialPortInfo[]>("serial_ports");
      if (mounted.current) {
        setPorts(result);
        if (session.current === null) {
          const count = result.filter((port) => port.usb).length;
          setMessage(count === 0
            ? "No USB Serial device detected. Connect ESP32, then Refresh ports."
            : `Found ${count} USB Serial device${count === 1 ? "" : "s"}. Select a port or Auto, then Connect.`);
        }
      }
    } catch (error) {
      if (mounted.current) setMessage(`Cannot list ports: ${String(error)}`);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void refreshPorts();
    const clock = window.setInterval(() => setNow(Date.now()), 500);
    return () => {
      mounted.current = false;
      window.clearInterval(clock);
      const id = session.current;
      session.current = null;
      if (id && isTauri()) void invoke("serial_disconnect", { sessionId: id }).catch(() => {});
    };
  }, [refreshPorts]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!connected || dataSource !== DUMMY_SOURCE) return;
      setPacketCount((count) => count + 1);
      setLastReceivedAt(Date.now());
      setSeries((current) => {
        const lastTime = current.length > 0 ? current[current.length - 1].time : 0;
        return [...current.slice(-119), createDummyTelemetryPoint(lastTime)];
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connected, dataSource]);

  const startTelemetry = () => {
    if (session.current || pendingConnect.current || stopping.current || connected) return;
    clearTelemetry();
    if (dataSource === DUMMY_SOURCE) {
      setSeries(dummySeries);
      setPacketCount(dummySeries.length);
      setLastReceivedAt(Date.now());
      setStatus("connected");
      setMessage("Simulated telemetry running");
      return;
    }
    if (!isTauri()) {
      setMessage("Open the Tauri desktop app for USB Serial: pnpm tauri dev");
      return;
    }
    const id = `serial-${Date.now()}-${++nextSessionId}`;
    session.current = id;
    setStatus("connecting");
    setMessage("Opening ESP32 Serial at 115200 baud…");
    const receiveEvent = (event: SerialEvent) => {
      if (!mounted.current || session.current !== id) return;
      if (event.kind === "sample") {
        if (previous.current && event.elapsed_ms / 1000 < previous.current.time) {
          referencePressure.current = null;
          previous.current = null;
          setSeries([]);
          setPacketCount(0);
          appendLog("Device uptime restarted; altitude reference reset");
        }
        const normalized = normalizeTelemetry(event, referencePressure.current, previous.current);
        referencePressure.current = normalized.referencePressureHpa;
        previous.current = normalized.point;
        setSeries((current) => [...current.slice(-119), normalized.point]);
        setPacketCount((count) => count + 1);
        setLastReceivedAt(Date.now());
        setMessage("Receiving ESP32 sensor data");
      } else if (event.kind === "log") {
        appendLog(event.line);
      } else {
        session.current = null;
        setActivePort(null);
        setStatus("disconnected");
        setMessage(event.error ?? "Serial connection closed");
        appendLog(event.error ?? "Serial connection closed");
      }
    };
    // Defer until the ref is assigned, so even a synchronous IPC error clears it.
    pendingConnect.current = Promise.resolve().then(async () => {
      try {
        const channel = new Channel<SerialEvent>();
        channel.onmessage = receiveEvent;
        const port = await invoke<string>("serial_connect", {
          port: dataSource === DEFAULT_DATA_SOURCE ? null : dataSource,
          sessionId: id,
          onEvent: channel,
        });
        if (!mounted.current || session.current !== id) {
          await invoke("serial_disconnect", { sessionId: id });
          return;
        }
        setActivePort(port);
        setStatus("connected");
        setMessage(`Opened ${port} · 115200 baud; waiting for telemetry`);
      } catch (error) {
        if (mounted.current && session.current === id) {
          session.current = null;
          setStatus("disconnected");
          setMessage(String(error));
          appendLog(String(error));
        }
      } finally {
        pendingConnect.current = null;
      }
    });
  };

  const stopTelemetry = async () => {
    if (stopping.current) return;
    stopping.current = true;
    const id = session.current;
    session.current = null;
    setStatus("stopping");
    try {
      await pendingConnect.current;
      if (id && isTauri()) await invoke("serial_disconnect", { sessionId: id });
      setMessage("Telemetry stopped; Serial port released");
    } catch (error) {
      setMessage(`Could not close Serial: ${String(error)}`);
    } finally {
      stopping.current = false;
      if (mounted.current) {
        setActivePort(null);
        setStatus("disconnected");
        clearTelemetry();
      }
    }
  };

  const sampleAge = lastReceivedAt === null ? null : Math.max(0, (now - lastReceivedAt) / 1000);
  const live = connected && sampleAge !== null && sampleAge < 3;
  return {
    series, packetCount, connected, busy, status, ports, activePort, message, logs,
    sampleAge, live, startTelemetry, stopTelemetry, refreshPorts, clearTelemetry,
  };
}
