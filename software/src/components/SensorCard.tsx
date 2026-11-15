import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TelemetryPoint } from "../types/telemetry";

type SensorKey = "temperature" | "pressure" | "acceleration";

type SensorCardProps = {
  title: string;
  value: string;
  unit: string;
  color?: string;
  data: TelemetryPoint[];
  dataKey: SensorKey;
  domain?: [number, number];
  hasData: boolean;
};

export function SensorCard({
  title,
  value,
  unit,
  color = "#3b6ff5",
  data,
  dataKey,
  domain,
  hasData,
}: SensorCardProps) {
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
