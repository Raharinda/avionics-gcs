import { memo } from "react";
import { MetricCard } from "./MetricCard";
export const TelemetryMetrics = memo(function TelemetryMetrics({ altitude, packetCount, hasTelemetry }: {
    altitude: number | null;
    packetCount: number;
    hasTelemetry: boolean;
}) {
    return <section className="metric-row">
    <MetricCard title="Altitude" value={altitude === null ? "—" : altitude.toLocaleString("en-US", { maximumFractionDigits: 1 })} unit="m" hasData={hasTelemetry} width="72%"/>
    <MetricCard title="Descent rate" value="—" unit="m/s" hasData={hasTelemetry} color="blue" width="43%"/>
    <MetricCard title="Packet count" value={hasTelemetry ? packetCount.toLocaleString() : "—"} hasData={hasTelemetry} color="purple" width="86%"/>
    <MetricCard title="Lost packets" value={hasTelemetry ? "3" : "—"} hasData={hasTelemetry} color="green" width="10%"/>
  </section>;
});
