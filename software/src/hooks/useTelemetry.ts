import { useEffect, useState } from "react";
import { createDummyTelemetryPoint, dummySeries, DUMMY_SOURCE } from "../data/dummyTelemetry";
import type { TelemetryPoint } from "../types/telemetry";

type UseTelemetryOptions = {
  connected: boolean;
  dataSource: string;
};

export function useTelemetry({ connected, dataSource }: UseTelemetryOptions) {
  const [series, setSeries] = useState<TelemetryPoint[]>([]);
  const [packetCount, setPacketCount] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!connected || dataSource !== DUMMY_SOURCE) return;
      setPacketCount((count) => count + 1);
      setSeries((current) => {
        const lastTime = current.length > 0 ? current[current.length - 1].time : 0;
        return [...current.slice(-17), createDummyTelemetryPoint(lastTime)];
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [connected, dataSource]);

  const loadDummyData = () => {
    setSeries(dummySeries);
    setPacketCount(28492);
  };

  const clearTelemetry = () => {
    setSeries([]);
    setPacketCount(0);
  };

  return { series, packetCount, loadDummyData, clearTelemetry };
}
