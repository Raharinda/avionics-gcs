import { lazy, memo, Suspense } from "react";
import type { TelemetryPoint } from "../../types/telemetry";
import { Card } from "../atoms/Card";
const TelemetryChart = lazy(() => import("./TelemetryChart").then((module) => ({ default: module.TelemetryChart })));
type SensorKey = "temperature" | "pressure" | "acceleration" | "gyroscope";
type SensorCardProps = {
    title: string;
    value: string;
    unit: string;
    color?: string;
    data: TelemetryPoint[];
    dataKey: SensorKey;
    domain?: [
        number,
        number
    ];
    hasData: boolean;
};
export const SensorCard = memo(function SensorCard({ title, value, unit, color = "#3b6ff5", data, dataKey, domain, hasData, }: SensorCardProps) {
    return (<Card className="sensor-card">
      <div className="card-heading"><span>{title}</span><b className="live-tag">{hasData ? "LIVE" : "NO DATA"}</b></div>
      <div className="sensor-value">{value}<small>{unit}</small></div>
      <div className="chart">
        <Suspense fallback={null}><TelemetryChart data={data} dataKey={dataKey} color={color} domain={domain}/></Suspense>
      </div>
      <div className="chart-axis"><span>T−12s</span><span>T−0s</span></div>
    </Card>);
});
