import { memo } from "react";
import { Card } from "../../../components/ui/Card";
import type { TelemetryPoint } from "../../../types/telemetry";

type Props = {
    telemetry: TelemetryPoint | null;
    hasData: boolean;
};

// The local calibration firmware reports RFU: X right, Y forward, Z up.
const ATTITUDE_AXES = [
    { key: "yaw", label: "YAW" },
    { key: "pitch", label: "PITCH" },
    { key: "roll", label: "ROLL" },
] as const;

export const AttitudeCard = memo(function AttitudeCard({ telemetry, hasData }: Props) {
    return (
        <Card className="attitude-telemetry-card">
            <div className="card-heading">
                <span>Attitude</span>
                <b className={`live-tag${hasData ? "" : " no-data"}`}>{hasData ? "LIVE" : "NO DATA"}</b>
            </div>
            <div className="attitude-telemetry-values">
                {ATTITUDE_AXES.map(({ key, label }) => (
                    <div key={key}>
                        <span>{label}</span>
                        <b>{hasData && telemetry ? `${telemetry[key].toFixed(1)}°` : "—"}</b>
                    </div>
                ))}
            </div>
            <p className="attitude-telemetry-note">Relative orientation from the calibrated IMU reference.</p>
        </Card>
    );
});
