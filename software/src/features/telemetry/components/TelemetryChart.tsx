import { memo } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TelemetryPoint } from "../../../types/telemetry";
export type TelemetryChartProps = {
    data: TelemetryPoint[];
    dataKey: "temperature" | "pressure" | "acceleration" | "gyroscope";
    color: string;
    domain?: [
        number,
        number
    ];
};
export const TelemetryChart = memo(function TelemetryChart({ data, dataKey, color, domain }: TelemetryChartProps) {
    return <ResponsiveContainer width="100%" height="100%">
    <LineChart data={data} margin={{ top: 8, right: 2, left: -32, bottom: 0 }}>
      <CartesianGrid vertical={false} stroke="#edf0f5"/>
      <YAxis domain={domain} hide/><XAxis dataKey="time" hide/>
      <Tooltip content={() => null}/>
      <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.2} dot={false} isAnimationActive={false}/>
    </LineChart>
  </ResponsiveContainer>;
});
