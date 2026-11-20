import { memo } from "react";
import { SensorCard } from "./SensorCard";
import { AttitudeCard } from "./AttitudeCard";
import { useSampledValue } from "../hooks/useSampledValue";
import type { TelemetryPoint } from "../../../types/telemetry";
import { DUMMY_SOURCE } from "../../../data/dummyTelemetry";
const TEMPERATURE_DOMAIN: [
    number,
    number
] = [21, 28];
const PRESSURE_DOMAIN: [
    number,
    number
] = [980, 1030];
const GYRO_DOMAIN: [
    "auto",
    "auto"
] = ["auto", "auto"];
const ACCEL_DOMAIN: [
    number,
    number
] = [.8, 1.2];
const MAGNETOMETER_DOMAIN: [
    number,
    number
] = [98, 103];

export function computePaddedDomain(
    data: TelemetryPoint[],
    key: "temperature" | "pressure" | "acceleration" | "gyroscope",
    minHalfSpan: number,
    fallback: [number, number],
): [number, number] {
    let min = Infinity;
    let max = -Infinity;
    for (const point of data) {
        const value = point[key];
        if (typeof value === "number" && Number.isFinite(value)) {
            if (value < min) min = value;
            if (value > max) max = value;
        }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return fallback;
    const span = max - min;
    const pad = Math.max(minHalfSpan * 0.25, span * 0.15);
    const center = (min + max) / 2;
    const halfSpan = Math.max(span / 2 + pad, minHalfSpan);
    return [center - halfSpan, center + halfSpan];
}

export const TelemetrySensorGrid = memo(function TelemetrySensorGrid({ series, latestTelemetry, dataSource, darkMode, hasTelemetry }: {
    series: TelemetryPoint[];
    latestTelemetry: TelemetryPoint | null;
    dataSource: string;
    darkMode: boolean;
    hasTelemetry: boolean;
}) {
    const source = latestTelemetry ? latestTelemetry.sourcePort ?? dataSource : dataSource;
    const attitudeHasData = hasTelemetry && (dataSource === DUMMY_SOURCE ||
        Boolean(latestTelemetry?.referenceSet && latestTelemetry.orientation));
    const chartData = useSampledValue(series, 250, source);
    const imuChartData = useSampledValue(series, 1000, source);
    const imuReading = imuChartData.length > 0 ? imuChartData[imuChartData.length - 1] : null;
    const chartDataForStatus = hasTelemetry ? chartData : [];
    const imuChartDataForStatus = hasTelemetry ? imuChartData : [];
    const temperatureDomain = computePaddedDomain(chartDataForStatus, "temperature", 2, TEMPERATURE_DOMAIN);
    const pressureDomain = computePaddedDomain(chartDataForStatus, "pressure", 2, PRESSURE_DOMAIN);
    const accelDomain = computePaddedDomain(imuChartDataForStatus, "acceleration", 0.2, ACCEL_DOMAIN);
    const chartColors = darkMode
        ? { temperature: "#ff8b76", pressure: "#aeb8c2", gyroscope: "#d0d7de", acceleration: "#8eb3ff" }
        : { temperature: "#ff5733", pressure: "#252932", gyroscope: "#92959a", acceleration: "#252932" };
    return <div className="sensor-grid">
    <SensorCard title="Temperature" value={latestTelemetry ? latestTelemetry.temperature.toFixed(2) : "—"} unit="°C" color={chartColors.temperature} darkMode={darkMode} data={chartDataForStatus} dataKey="temperature" domain={temperatureDomain} hasData={hasTelemetry}/>
    <SensorCard title="Pressure" value={latestTelemetry?.pressure != null ? latestTelemetry.pressure.toFixed(2) : "—"} unit="hPa" color={chartColors.pressure} darkMode={darkMode} data={chartDataForStatus} dataKey="pressure" domain={pressureDomain} hasData={hasTelemetry && latestTelemetry?.pressure != null}/>
    <SensorCard title="Gyroscope" value={imuReading ? imuReading.gyroscope.toFixed(2) : "—"} unit="°/s" color={chartColors.gyroscope} darkMode={darkMode} data={imuChartDataForStatus} dataKey="gyroscope" domain={GYRO_DOMAIN} hasData={hasTelemetry && imuChartData.length > 0}/>
    <SensorCard title="Accelerometer" value={imuReading ? imuReading.acceleration.toFixed(3) : "—"} unit="g" color={chartColors.acceleration} darkMode={darkMode} data={imuChartDataForStatus} dataKey="acceleration" domain={accelDomain} hasData={hasTelemetry && imuChartData.length > 0}/>
    <SensorCard title="Magnetometer" value="—" unit="µT" color={darkMode ? "#aeb8c2" : "#a6a8aa"} darkMode={darkMode} data={[]} dataKey="pressure" domain={MAGNETOMETER_DOMAIN} hasData={false}/>
    <SensorCard title="Orientation" value="—" unit="°" color={darkMode ? "#d0d7de" : "#252932"} darkMode={darkMode} data={[]} dataKey="temperature" domain={TEMPERATURE_DOMAIN} hasData={false}/>
    <AttitudeCard telemetry={latestTelemetry} hasData={attitudeHasData}/>
  </div>;
});
