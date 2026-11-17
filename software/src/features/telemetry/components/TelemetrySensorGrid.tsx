import { memo } from "react";
import { SensorCard } from "./SensorCard";
import { useSampledValue } from "../hooks/useSampledValue";
import type { TelemetryPoint } from "../../../types/telemetry";
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
export const TelemetrySensorGrid = memo(function TelemetrySensorGrid({ series, latestTelemetry, darkMode }: {
    series: TelemetryPoint[];
    latestTelemetry: TelemetryPoint | null;
    darkMode: boolean;
}) {
    const source = latestTelemetry ? latestTelemetry.sourcePort ?? "dummy" : null;
    const chartData = useSampledValue(series, 250, source);
    const imuChartData = useSampledValue(series, 1000, source);
    const imuReading = imuChartData.length > 0 ? imuChartData[imuChartData.length - 1] : null;
    const hasTelemetry = series.length > 0;
    const chartColors = darkMode
        ? { temperature: "#ff8b76", pressure: "#aeb8c2", gyroscope: "#d0d7de", acceleration: "#8eb3ff" }
        : { temperature: "#ff5733", pressure: "#252932", gyroscope: "#92959a", acceleration: "#252932" };
    return <div className="sensor-grid">
    <SensorCard title="Temperature" value={latestTelemetry ? latestTelemetry.temperature.toFixed(2) : "—"} unit="°C" color={chartColors.temperature} darkMode={darkMode} data={chartData} dataKey="temperature" domain={TEMPERATURE_DOMAIN} hasData={hasTelemetry}/>
    <SensorCard title="Pressure" value={latestTelemetry?.pressure != null ? latestTelemetry.pressure.toFixed(2) : "—"} unit="hPa" color={chartColors.pressure} darkMode={darkMode} data={chartData} dataKey="pressure" domain={PRESSURE_DOMAIN} hasData={hasTelemetry}/>
    <SensorCard title="Gyroscope" value={imuReading ? imuReading.gyroscope.toFixed(2) : "—"} unit="°/s" color={chartColors.gyroscope} darkMode={darkMode} data={imuChartData} dataKey="gyroscope" domain={GYRO_DOMAIN} hasData={imuChartData.length > 0}/>
    <SensorCard title="Accelerometer" value={imuReading ? imuReading.acceleration.toFixed(3) : "—"} unit="g" color={chartColors.acceleration} darkMode={darkMode} data={imuChartData} dataKey="acceleration" domain={ACCEL_DOMAIN} hasData={imuChartData.length > 0}/>
    <SensorCard title="Magnetometer" value="—" unit="µT" color={darkMode ? "#aeb8c2" : "#a6a8aa"} darkMode={darkMode} data={chartData} dataKey="pressure" domain={MAGNETOMETER_DOMAIN} hasData={hasTelemetry}/>
    <SensorCard title="Orientation" value="—" unit="°" color={darkMode ? "#d0d7de" : "#252932"} darkMode={darkMode} data={chartData} dataKey="temperature" domain={TEMPERATURE_DOMAIN} hasData={hasTelemetry}/>
  </div>;
});
