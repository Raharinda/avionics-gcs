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
import { Card } from "./Card";

type SensorKey = "temperature" | "pressure" | "acceleration" | "gyroscope" | "mpuTemperature" | "accelZ";

type SensorCardProps = {
  title: string;
  value: string;
  unit: string;
  color?: string;
  data: TelemetryPoint[];
  dataKey: SensorKey;
  domain?: [number, number];
  hasData: boolean;
  status?: string;
  detail?: string;
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
  status = "LIVE",
  detail,
}: SensorCardProps) {
  return (
    <Card className="sensor-card">
      <div className="card-heading"><span>{title}</span><b className={`live-tag ${status.toLowerCase()}`}>{hasData ? status : "NO DATA"}</b></div>
      <div className="sensor-value">{value}<small>{unit}</small></div>
      {detail && <div className="sensor-detail" title={detail}>{detail}</div>}
      <div className="chart">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 2, left: -32, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#edf0f5" />
            <YAxis domain={domain ?? ["auto", "auto"]} hide />
            <XAxis dataKey="time" hide />
            <Tooltip content={() => null} />
            <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-axis"><span>{data.length > 1 ? `T−${(data[data.length - 1].time - data[0].time).toFixed(1)}s` : "—"}</span><span>Latest sample</span></div>
    </Card>
  );
}
