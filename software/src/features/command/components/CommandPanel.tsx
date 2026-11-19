import { memo, useEffect, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import type { CommandState, TelemetryPoint } from "../../../types/telemetry";

type Props = {
    commandState: CommandState;
    connectionReady: boolean;
    connected: boolean;
    isDarkMode: boolean;
    hasTelemetry: boolean;
    latestTelemetry: TelemetryPoint | null;
    onArm: () => void;
    onDisarm: () => void;
    onFire: () => void;
    onStart: () => void;
    onStop: () => void;
    onRefreshClock: () => void;
    onReset: () => void;
    onToggleTheme: () => void;
};

export const CommandPanel = memo(function CommandPanel(props: Props) {
    const { commandState, connectionReady, connected, isDarkMode, hasTelemetry, latestTelemetry, onArm, onDisarm, onFire, onStart, onStop, onRefreshClock, onReset, onToggleTheme } = props;
    const [healthOpen, setHealthOpen] = useState(false);
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
    useEffect(() => {
        if (!resetConfirmOpen && !healthOpen)
            return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setResetConfirmOpen(false);
                setHealthOpen(false);
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [resetConfirmOpen, healthOpen]);
    const commandLabel = { safe: "SAFE", armed: "ARMED", firing: "SENDING", complete: "FIRED" }[commandState];
    const healthChecks = [
        { label: "LoRa / Serial port", ok: connectionReady, detail: connectionReady ? "Port is connected and ready" : "Port is disconnected or unavailable" },
        { label: "Telemetry stream", ok: connected && hasTelemetry, detail: connected ? (hasTelemetry ? "Streaming telemetry packets" : "Connected, but no telemetry packet received") : "Telemetry stream is stopped" },
        { label: "Telemetry payload", ok: hasTelemetry && latestTelemetry !== null, detail: hasTelemetry && latestTelemetry ? "Latest payload contains valid telemetry" : "Waiting for a valid JSON telemetry payload" },
        { label: "Avionic / IMU", ok: hasTelemetry && latestTelemetry?.imuValid !== false, detail: latestTelemetry?.imuValid === false ? "IMU reported an invalid reading" : (hasTelemetry ? (latestTelemetry?.calibrated ? "IMU is calibrated and valid" : "IMU is valid but not calibrated") : "No IMU reading received") },
    ];
    const failedChecks = healthChecks.filter((check) => !check.ok);
    const healthLabel = failedChecks.length === 0 ? "No error" : failedChecks.length === 1 ? failedChecks[0].label : `${failedChecks.length} issues`;
    return (<aside className="card command-card">
            <div className="section-label">COMMAND</div>
            <div className="card-title-row">
              <h2>Ejection</h2>
              <span className={`status-badge ${commandState}`}>
                {commandLabel}
              </span>
            </div>
            <div className="command-step">
              <span className="step-number">01</span>
              <div>
                <b>Arm system</b>
                <small>{connectionReady ? "Enable fire controls" : "Connect port first"}</small>
              </div>
              <button className={`toggle ${commandState !== "safe" ? "on" : ""}`} onClick={commandState === "armed" ? onDisarm : onArm} disabled={!connectionReady || commandState === "firing" || commandState === "complete"} aria-label={commandState === "armed" ? "Disarm system" : "Arm system"}>
                <span />
              </button>
            </div>
            <div className="command-step fire-step">
              <span className="step-number">02</span>
              <div>
                <b>Fire charge</b>
                <small>{connectionReady ? "Arm system first" : "Connect port first"}</small>
              </div>
              <button className={`fire-button ${commandState}`} disabled={!connectionReady || commandState !== "armed"} onClick={onFire}>
                FIRE
              </button>
            </div>
            <div className="command-timeline">
              <div className={commandState === "firing" || commandState === "complete" ? "done" : ""}>
                <i />
                Sending FIRE
              </div>
              <div className={commandState === "firing" || commandState === "complete"
            ? "done"
            : ""}>
                <i />
                Sent via serial
              </div>
              <div className={commandState === "complete" ? "done" : ""}>
                <i />
                Ack from rocket
              </div>
            </div>
            <button className="health-row" type="button" onClick={() => setHealthOpen(true)} aria-label="View system health details">
              {healthChecks.map((check, index) => (
                <span className={check.ok ? "healthy" : "unhealthy"} key={check.label}>{index + 1}</span>
              ))}
              <b className={failedChecks.length ? "has-error" : ""}>{healthLabel}</b>
              <Icon name="chevron"/>
            </button>
            {healthOpen && <div className="health-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setHealthOpen(false)}>
              <div className="health-modal" role="dialog" aria-modal="true" aria-labelledby="health-title">
                <div className="health-modal-header">
                  <div>
                    <div className="section-label">SYSTEM STATUS</div>
                    <h2 id="health-title">Health details</h2>
                  </div>
                  <button className="modal-close" type="button" onClick={() => setHealthOpen(false)} aria-label="Close health details">×</button>
                </div>
                <div className="health-list">
                  {healthChecks.map((check, index) => (
                    <div className="health-detail" key={check.label}>
                      <span className={check.ok ? "healthy" : "unhealthy"}>{index + 1}</span>
                      <div><b>{check.label}</b><small>{check.detail}</small></div>
                      <strong className={check.ok ? "ok" : "error"}>{check.ok ? "OK" : "ISSUE"}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>}
            {resetConfirmOpen && <div className="health-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setResetConfirmOpen(false)}>
              <div className="health-modal confirm-modal" role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title">
                <div className="health-modal-header">
                  <div>
                    <div className="section-label">COMMAND VERIFICATION</div>
                    <h2 id="reset-confirm-title">Reset fire charge state?</h2>
                  </div>
                  <button className="modal-close" type="button" onClick={() => setResetConfirmOpen(false)} aria-label="Close reset confirmation">×</button>
                </div>
                <p className="confirm-modal-copy">
                  Current state is <strong>{commandLabel}</strong>. Resetting will return the ejection fire charge state to <strong>SAFE</strong> and phase to <strong>Initialization</strong>.
                </p>
                <div className="confirm-modal-actions">
                  <button className="confirm-cancel" type="button" onClick={() => setResetConfirmOpen(false)}>
                    Cancel
                  </button>
                  <button className="confirm-danger" type="button" onClick={() => { setResetConfirmOpen(false); onReset(); }}>
                    Confirm Reset
                  </button>
                </div>
              </div>
            </div>}
            <div className="command-footer">
              <div className="command-footer-primary">
                <button className="start" onClick={onStart} disabled={connected}>
                  Start
                </button>
                <button className="stop" onClick={onStop} disabled={!connected}>
                  Stop
                </button>
              </div>
              <div className="command-footer-secondary">
                <button type="button" onClick={onRefreshClock}>
                  Refresh UTC
                </button>
                <button type="button" onClick={() => setResetConfirmOpen(true)}>
                  Reset
                </button>
                <button className="theme-toggle" type="button" onClick={onToggleTheme} aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}>
                  {isDarkMode ? "Light" : "Dark"}
                </button>
              </div>
            </div>
          </aside>);
});
