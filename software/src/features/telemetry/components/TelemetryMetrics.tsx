import { memo, useMemo } from "react";
import type { TelemetryPoint } from "../../../types/telemetry";
import { MetricCard } from "./MetricCard";

export function calculateLostPackets(series: TelemetryPoint[]): number {
    const timestampSamples = series
        .map((point) => point.timestampMs)
        .filter((timestamp): timestamp is number => typeof timestamp === "number" && Number.isFinite(timestamp));

    if (timestampSamples.length < 2) return 0;

    let lostPackets = 0;
    for (let index = 1; index < timestampSamples.length; index++) {
        const gapMs = timestampSamples[index] - timestampSamples[index - 1];
        if (gapMs > 1500) lostPackets++;
    }
    return lostPackets;
}

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

export const TelemetryMetrics = memo(function TelemetryMetrics({ altitude, packetCount, hasTelemetry, series }: {
    altitude: number | null;
    packetCount: number;
    hasTelemetry: boolean;
    series: TelemetryPoint[];
}) {
    const descentRate = useMemo(() => calculateDescentRate(series), [series]);
    const descentDisplay = descentRate === null ? "—" : descentRate.toFixed(1);
    const lostPackets = useMemo(() => calculateLostPackets(series), [series]);
    const descentBarWidth = descentRate === null
        ? "0%"
        : `${Math.min(100, Math.max(8, Math.abs(descentRate) / 60 * 100)).toFixed(0)}%`;

    return <section className="metric-row">
    <MetricCard title="Altitude" value={altitude === null ? "—" : altitude.toLocaleString("en-US", { maximumFractionDigits: 1 })} unit="m" hasData={hasTelemetry} width="72%"/>
    <MetricCard title="Descent rate" value={descentDisplay} unit="m/s" hasData={hasTelemetry && descentRate !== null} color="blue" width={descentBarWidth}/>
    <MetricCard title="Packet count" value={hasTelemetry ? packetCount.toLocaleString() : "—"} hasData={hasTelemetry} color="purple" width="86%"/>
    <MetricCard title="Lost packets" value={hasTelemetry ? lostPackets.toLocaleString() : "—"} hasData={hasTelemetry} color="green" width={lostPackets === 0 ? "10%" : `${Math.min(100, 10 + lostPackets * 10)}%`}/>
  </section>;
});
