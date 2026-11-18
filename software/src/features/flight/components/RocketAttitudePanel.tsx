import { memo } from "react";
import { RocketViewport } from "./RocketViewport";
import { rocketAxes } from "../../../data/rocketAxes";
import { useTelemetryFreshness } from "../../telemetry/hooks/useTelemetryFreshness";
import type { ImuState } from "../../../types/imu";
import type { TelemetryPoint } from "../../../types/telemetry";
type Props = {
    latestTelemetry: TelemetryPoint | null;
    receivedAt: number | null;
    simulated: boolean;
    connected: boolean;
    hardwareStreaming: boolean;
    imuState: ImuState | null;
    calibrationActive: boolean;
    calibrationPending: boolean;
    paused: boolean;
    darkMode: boolean;
    onOpenCalibration: () => void;
    onSetReference: (nose: number, right: number) => Promise<void>;
};
export const RocketAttitudePanel = memo(function RocketAttitudePanel(props: Props) {
    const { latestTelemetry, receivedAt, simulated, connected, hardwareStreaming, imuState, calibrationActive, calibrationPending, paused, darkMode, onOpenCalibration, onSetReference } = props;
    const confirmedMount = !simulated && imuState
        ? { noseAxis: imuState.noseAxis, rightAxis: imuState.rightAxis } : undefined;
    const displayedAxes = rocketAxes(confirmedMount);
    const freshAttitude = useTelemetryFreshness(receivedAt);
    const attitudeLive = simulated ? connected : hardwareStreaming && freshAttitude &&
        !!imuState?.referenceSet && !!latestTelemetry?.referenceSet && !!latestTelemetry.orientation;
    const canStraighten = hardwareStreaming && freshAttitude && !!imuState?.calibrated &&
        imuState.imuReady && !calibrationActive && !calibrationPending;
    const attitudeStatus = simulated ? "SIMULATION" : !hardwareStreaming ? "Start ESP32 telemetry"
        : !imuState ? "Firmware imu3d-v2 required"
            : !imuState.imuReady ? "IMU unavailable"
                : !imuState.calibrated ? "Calibrate six positions"
                    : !imuState.referenceSet ? "Set your reference pose"
                        : !freshAttitude ? "No recent attitude data"
                            : !latestTelemetry?.referenceSet || !latestTelemetry.orientation ? "Waiting for referenced attitude" : "LIVE · relative to reference";
    return (<article className="card attitude-card">
              <div className="section-label">ATTITUDE</div>
              <div className="card-title-row">
                <h2>Rocket view</h2>
                <span className="axis">
                  {attitudeStatus}
                </span>
              </div>
              <div className="rocket-stage">
                <RocketViewport mode="rocket" active={attitudeLive} mounting={confirmedMount} paused={paused} darkMode={darkMode} quaternion={simulated ? null : latestTelemetry?.orientation ?? null} roll={latestTelemetry?.roll ?? 0} pitch={latestTelemetry?.pitch ?? 0} yaw={latestTelemetry?.yaw ?? 0}/>
              </div>
              <div className="attitude-values">
                <div>
                  <span>{displayedAxes[0].angleLabel}</span>
                  <b>{attitudeLive && latestTelemetry ? `${latestTelemetry.roll.toFixed(1)}°` : "—"}</b>
                </div>
                <div>
                  <span>{displayedAxes[1].angleLabel}</span>
                  <b>{attitudeLive && latestTelemetry ? `${latestTelemetry.pitch.toFixed(1)}°` : "—"}</b>
                </div>
                <div>
                  <span>{displayedAxes[2].angleLabel}</span>
                  <b>{attitudeLive && latestTelemetry ? `${latestTelemetry.yaw.toFixed(1)}°` : "—"}</b>
                </div>
              </div>
              <p className="imu-note">{attitudeStatus}. Acuan awal tidak memakai arah kompas. Drag untuk memutar kamera, scroll untuk zoom.</p>
              <div className="attitude-reference-actions">
                <button type="button" className="attitude-reference-link" onClick={() => onOpenCalibration()}>Kalibrasi XYZ / tetapkan acuan</button>
                {!simulated && <button type="button" className="attitude-reference-link" disabled={!canStraighten || !confirmedMount} onClick={() => { if (confirmedMount)
            void onSetReference(confirmedMount.noseAxis, confirmedMount.rightAxis); }}>Luruskan pose sekarang</button>}
              </div>
              {!simulated && <p className="imu-note">Untuk koreksi kemiringan awal: pegang roket tegak dan diam, lalu klik Luruskan pose sekarang. Ini menggantikan acuan awal X/Y/Z di ESP32.</p>}
            </article>);
});
