import { lazy, memo, Suspense } from "react";
import type { TelemetryPoint } from "../../../types/telemetry";
import { Card } from "../../../components/ui/Card";
const TelemetryChart = lazy(() => import("./TelemetryChart").then((module) => ({ default: module.TelemetryChart })));
type SensorKey = "temperature" | "pressure" | "acceleration" | "gyroscope";
type SensorCardProps = {
    title: string;
    value: string;
    unit: string;
    color?: string;
    darkMode?: boolean;
    data: TelemetryPoint[];
    dataKey: SensorKey;
    domain?: [
        number | "auto",
        number | "auto"
    ];
    hasData: boolean;
};
export const SensorCard = memo(function SensorCard({ title, value, unit, color = "#3b6ff5", darkMode = false, data, dataKey, domain, hasData, }: SensorCardProps) {
    const rawSpan = data.length >= 2 ? data[data.length - 1].time - data[0].time : NaN;
    const spanSeconds = Number.isFinite(rawSpan) && rawSpan > 0 ? Math.max(1, Math.round(rawSpan)) : 12;
    return (<Card className="sensor-card">
      <div className="card-heading"><span>{title}</span><b className={`live-tag${hasData ? "" : " no-data"}`}>{hasData ? "LIVE" : "NO DATA"}</b></div>
      <div className="sensor-value">{hasData ? value : "—"}<small>{unit}</small></div>
      <div className="chart">
        <Suspense fallback={null}><TelemetryChart data={data} dataKey={dataKey} color={color} darkMode={darkMode} domain={domain}/></Suspense>
      </div>
      <div className="chart-axis"><span>{`T−${spanSeconds}s`}</span><span>T−0s</span></div>
    </Card>);
});
