import { memo, useMemo } from "react";
import { calculateLostPackets } from "../../../data/packetLoss";
import type { TelemetryPoint } from "../../../types/telemetry";
import { MetricCard } from "./MetricCard";

export { calculateLostPackets };

export function calculateDescentRate(series: TelemetryPoint[]): number | null {
    const samples = series
        .slice(-6)
        .filter((point) => Number.isFinite(point.time) && point.altitude !== null && Number.isFinite(point.altitude));

    if (samples.length < 2) return null;

    const count = samples.length;
    const timeMean = samples.reduce((sum, point) => sum + point.time, 0) / count;
    const altitudeMean = samples.reduce((sum, point) => sum + (point.altitude as number), 0) / count;
    let covariance = 0;
    let timeVariance = 0;

    for (const point of samples) {
        const timeOffset = point.time - timeMean;
        covariance += timeOffset * ((point.altitude as number) - altitudeMean);
        timeVariance += timeOffset * timeOffset;
    }

    if (timeVariance <= 0) return null;

    const altitudeSlopePerSecond = covariance / timeVariance;
    if (!Number.isFinite(altitudeSlopePerSecond)) return null;

    return -altitudeSlopePerSecond;
}

export const TelemetryMetrics = memo(function TelemetryMetrics({ altitude, packetCount, lostPacketCount, hasTelemetry, series }: {
    altitude: number | null;
    packetCount: number;
    lostPacketCount?: number;
    hasTelemetry: boolean;
    series: TelemetryPoint[];
}) {
    const descentRate = useMemo(() => calculateDescentRate(series), [series]);
    const descentDisplay = descentRate === null ? "—" : descentRate.toFixed(1);
    const computedLostPackets = useMemo(() => calculateLostPackets(series), [series]);
    const lostPackets = lostPacketCount ?? computedLostPackets;
    const descentBarWidth = descentRate === null
        ? "0%"
        : `${Math.min(100, Math.max(8, Math.abs(descentRate) / 60 * 100)).toFixed(0)}%`;

    return <section className="metric-row">
    <MetricCard title="Altitude" value={altitude === null ? "—" : altitude.toLocaleString("en-US", { maximumFractionDigits: 1 })} unit="m" hasData={hasTelemetry} width="72%"/>
    <MetricCard title="Descent rate" value={descentDisplay} unit="m/s" hasData={hasTelemetry && descentRate !== null} color="blue" width={descentBarWidth}/>
    <MetricCard title="Packet count" value={packetCount.toLocaleString()} hasData={hasTelemetry} preserveValue retainStatus={packetCount > 0} showBar={false}/>
    <MetricCard title="Lost packets" value={lostPackets.toLocaleString()} hasData={hasTelemetry} preserveValue retainStatus={packetCount > 0} showBar={false}/>
  </section>;
});
