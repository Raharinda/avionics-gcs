import { memo } from "react";
import { Icon } from "../../../components/ui/Icon";
import type { CommandState } from "../../../types/telemetry";

type Props = {
    commandState: CommandState;
    connectionReady: boolean;
    connected: boolean;
    isDarkMode: boolean;
    onArm: () => void;
    onFire: () => void;
    onStart: () => void;
    onStop: () => void;
    onRefreshClock: () => void;
    onReset: () => void;
    onToggleTheme: () => void;
};

export const CommandPanel = memo(function CommandPanel(props: Props) {
    const { commandState, connectionReady, connected, isDarkMode, onArm, onFire, onStart, onStop, onRefreshClock, onReset, onToggleTheme } = props;
    const commandLabel = { safe: "SAFE", armed: "ARMED", firing: "SENDING", complete: "FIRED" }[commandState];
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
              <button className={`toggle ${commandState !== "safe" ? "on" : ""}`} onClick={onArm} disabled={!connectionReady || commandState !== "safe"} aria-label="Arm system">
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
              <div className={commandState !== "safe" ? "done" : ""}>
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
            <div className="health-row">
              <span>
                <i />1
              </span>
              <span>
                <i />2
              </span>
              <span>
                <i />3
              </span>
              <span>
                <i />4
              </span>
              <b>No error</b>
              <Icon name="chevron"/>
            </div>
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
                <button type="button" onClick={onReset}>
                  Reset
                </button>
                <button className="theme-toggle" type="button" onClick={onToggleTheme} aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}>
                  {isDarkMode ? "Light" : "Dark"}
                </button>
              </div>
            </div>
          </aside>);
});
