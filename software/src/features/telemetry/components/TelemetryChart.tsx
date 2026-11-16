import { memo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TelemetryPoint } from "../../../types/telemetry";
export type TelemetryChartProps = {
    data: TelemetryPoint[];
    dataKey: "temperature" | "pressure" | "acceleration" | "gyroscope";
    color: string;
    darkMode?: boolean;
    domain?: [
        number | "auto",
        number | "auto"
    ];
};
export const TelemetryChart = memo(function TelemetryChart({ data, dataKey, color, darkMode = false, domain }: TelemetryChartProps) {
    const units = {
        temperature: "°C",
        pressure: "hPa",
        acceleration: "g",
        gyroscope: "°/s",
    } as const;
    const labels = {
        temperature: "Temperature",
        pressure: "Pressure",
        acceleration: "Accelerometer",
        gyroscope: "Gyroscope",
    } as const;
    return <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top: 8, right: 2, left: -32, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke={darkMode ? "#46515c" : "#edf0f5"}/>
      <YAxis domain={domain} hide/><XAxis dataKey="time" hide/>
      <Tooltip
        cursor={{ stroke: darkMode ? "#71808d" : "#c3cbd3", strokeDasharray: "3 3" }}
        labelFormatter={(value) => `T+${Number(value).toFixed(0)}s`}
        formatter={(value) => [`${Number(value).toFixed(dataKey === "acceleration" ? 3 : 2)} ${units[dataKey]}`, labels[dataKey]]}
        contentStyle={{
            border: `1px solid ${darkMode ? "#46515c" : "#dce3ea"}`,
            borderRadius: "8px",
            background: darkMode ? "#252d35" : "#ffffff",
            color: darkMode ? "#e2eaf1" : "#29303a",
            fontSize: "11px",
        }}
        labelStyle={{ color: darkMode ? "#aeb8c2" : "#717b87", marginBottom: "3px" }}
      />
      <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.2} dot={false} isAnimationActive={false}/>
    </LineChart>
  </ResponsiveContainer>;
});
