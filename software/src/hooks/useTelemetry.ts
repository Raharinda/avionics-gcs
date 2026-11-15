import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createDummyTelemetryPoint, dummySeries, DUMMY_SOURCE } from "../data/dummyTelemetry";
import type { TelemetryPoint } from "../types/telemetry";

type UseTelemetryOptions = {
  connected: boolean;
  dataSource: string;
};

export type SerialPortInfo = {
  name: string;
  description?: string;
};

export function useTelemetry({ connected, dataSource }: UseTelemetryOptions) {
  const [series, setSeries] = useState<TelemetryPoint[]>([]);
  const [packetCount, setPacketCount] = useState(0);
  const sourceState = useRef(new Map<string, { series: TelemetryPoint[]; packetCount: number }>());
  const activeSource = useRef(dataSource);

  useEffect(() => {
    if (activeSource.current !== dataSource) {
      activeSource.current = dataSource;
      const saved = sourceState.current.get(dataSource);
      setSeries(saved?.series ?? []);
      setPacketCount(saved?.packetCount ?? 0);
      return;
    }
    sourceState.current.set(dataSource, { series, packetCount });
  }, [dataSource, packetCount, series]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!connected || dataSource !== DUMMY_SOURCE) return;
      setPacketCount((count) => count + 1);
      setSeries((current) => {
        const lastTime = current.length > 0 ? current[current.length - 1].time : 0;
        const nextSeries = [...current.slice(-17), createDummyTelemetryPoint(lastTime)];
        return nextSeries;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connected, dataSource]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<Omit<TelemetryPoint, "time">>("telemetry", (event) => {
      const payload = event.payload;
      setPacketCount((count) => count + 1);
      setSeries((current) => {
        const lastTime = current.length > 0 ? current[current.length - 1].time : 0;
        return [...current.slice(-17), { ...payload, time: lastTime + 1 }];
      });
    }).then((cleanup) => {
      unlisten = cleanup;
    });
    return () => unlisten?.();
  }, []);

  const loadDummyData = () => {
    setSeries(dummySeries);
    setPacketCount(28492);
    sourceState.current.set(dataSource, { series: dummySeries, packetCount: 28492 });
  };

  const clearTelemetry = () => {
    setSeries([]);
    setPacketCount(0);
    sourceState.current.set(dataSource, { series: [], packetCount: 0 });
  };

  const startSerialListener = (portName: string) =>
    invoke<string>("start_serial_listener", { portName });

  const stopSerialListener = () =>
    invoke<void>("stop_serial_listener");

  const listSerialPorts = () =>
    invoke<SerialPortInfo[]>("list_serial_ports");

  return {
    series,
    packetCount,
    loadDummyData,
    clearTelemetry,
    startSerialListener,
    stopSerialListener,
    listSerialPorts,
  };
}
