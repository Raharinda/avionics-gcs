import { memo } from "react";
import { SensorCard } from "../molecules/SensorCard";
import { useSampledValue } from "../../hooks/useSampledValue";
import type { TelemetryPoint } from "../../types/telemetry";
const TEMPERATURE_DOMAIN: [
    number,
    number
] = [21, 28];
const PRESSURE_DOMAIN: [
    number,
    number
] = [980, 1030];
const GYRO_DOMAIN: [
    number,
    number
] = [0, 360];
const ACCEL_DOMAIN: [
    number,
    number
] = [.8, 1.2];
const MAGNETOMETER_DOMAIN: [
    number,
    number
] = [98, 103];
export const TelemetrySensorGrid = memo(function TelemetrySensorGrid({ series, latestTelemetry }: {
    series: TelemetryPoint[];
    latestTelemetry: TelemetryPoint | null;
}) {
    const chartData = useSampledValue(series, 250);
    const hasTelemetry = series.length > 0;
    return <div className="sensor-grid">
    <SensorCard title="Temperature" value={latestTelemetry ? latestTelemetry.temperature.toFixed(2) : "—"} unit="°C" color="#ff5733" data={chartData} dataKey="temperature" domain={TEMPERATURE_DOMAIN} hasData={hasTelemetry}/>
    <SensorCard title="Pressure" value={latestTelemetry?.pressure != null ? latestTelemetry.pressure.toFixed(2) : "—"} unit="hPa" color="#252932" data={chartData} dataKey="pressure" domain={PRESSURE_DOMAIN} hasData={hasTelemetry}/>
    <SensorCard title="Gyroscope" value={latestTelemetry ? latestTelemetry.gyroscope.toFixed(2) : "—"} unit="°/s" color="#92959a" data={chartData} dataKey="gyroscope" domain={GYRO_DOMAIN} hasData={hasTelemetry}/>
    <SensorCard title="Accelerometer" value={latestTelemetry ? latestTelemetry.acceleration.toFixed(3) : "—"} unit="g" color="#252932" data={chartData} dataKey="acceleration" domain={ACCEL_DOMAIN} hasData={hasTelemetry}/>
    <SensorCard title="Magnetometer" value="—" unit="µT" color="#a6a8aa" data={chartData} dataKey="pressure" domain={MAGNETOMETER_DOMAIN} hasData={hasTelemetry}/>
    <SensorCard title="Orientation" value="—" unit="°" color="#252932" data={chartData} dataKey="temperature" domain={TEMPERATURE_DOMAIN} hasData={hasTelemetry}/>
  </div>;
});
