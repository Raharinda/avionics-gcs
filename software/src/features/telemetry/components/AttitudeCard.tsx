import { memo } from "react";
import { Card } from "../../../components/ui/Card";
import type { TelemetryPoint } from "../../../types/telemetry";

type Props = {
    telemetry: TelemetryPoint | null;
    hasData: boolean;
};

// Model coordinates: X is right (rocket pitch), Y is nose (rocket roll), Z is third axis (yaw).
// Backend Euler angles [roll, pitch, yaw] represent rotations around model [X, Y, Z].
const ATTITUDE_AXES = [
    { key: "yaw", label: "YAW" },
    { key: "roll", label: "PITCH" },
    { key: "pitch", label: "ROLL" },
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
