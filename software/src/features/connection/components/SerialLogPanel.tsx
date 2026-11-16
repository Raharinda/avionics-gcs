import { memo, useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { useSerialLog } from "../hooks/useSerialLog";
type Props = {
    log: string;
    dataSource: string;
    hardwareStatusLabel: string;
    streamIsActive: boolean;
    streamLabel: string | undefined;
    resetVersion: number;
};
export const SerialLogPanel = memo(function SerialLogPanel(props: Props) {
    const { log, dataSource, hardwareStatusLabel, streamIsActive, streamLabel, resetVersion } = props;
    const [isLogExpanded, setIsLogExpanded] = useState(false);
    const [serialView, setSerialView] = useState<"status" | "raw">("status");
    const [isSerialHistoryOpen, setIsSerialHistoryOpen] = useState(false);
    const { rawSerialLine, rawSerialHistory, clearHistory } = useSerialLog(resetVersion);
    return (<>
      <footer className={`serial-log ${isLogExpanded ? "expanded" : ""}`}>
        <div className="serial-log-heading">
          <span className="log-status">
            <i /> Serial log
          </span>
          <div className="serial-view-tabs" role="tablist" aria-label="Serial output view">
            <button className={serialView === "status" ? "active" : ""} type="button" onClick={() => setSerialView("status")} role="tab" aria-selected={serialView === "status"}>
              Status
            </button>
            <button className={serialView === "raw" ? "active" : ""} type="button" onClick={() => setSerialView("raw")} role="tab" aria-selected={serialView === "raw"}>
              Raw data
            </button>
            {serialView === "raw" && (<button className="serial-history-button" type="button" onClick={() => setIsSerialHistoryOpen(true)} disabled={rawSerialHistory.length === 0}>
                History
              </button>)}
          </div>
        </div>
        <code>
          {serialView === "status"
            ? log
            : rawSerialLine || "No raw serial data received"}
        </code>
        {isLogExpanded && (<pre>
            {serialView === "raw"
                ? rawSerialLine || "No raw serial data received"
                : `${log}
Telemetry source: ${dataSource}
Port: ${hardwareStatusLabel}
Listening: ${streamIsActive ? `active at ${streamLabel}` : "stopped"}`}
          </pre>)}
        <button className="serial-log-expand" type="button" onClick={() => setIsLogExpanded(!isLogExpanded)}>
          <Icon name="send"/> {isLogExpanded ? "Collapse log" : "Expand log"}
        </button>
      </footer>
      {isSerialHistoryOpen && (<div className="serial-history-overlay" role="presentation" onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                    setIsSerialHistoryOpen(false);
            }}>
          <section className="serial-history-modal" role="dialog" aria-modal="true" aria-labelledby="serial-history-title">
            <div className="serial-history-header">
              <div>
                <div className="section-label">RAW SERIAL DATA</div>
                <h2 id="serial-history-title">Serial history</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => setIsSerialHistoryOpen(false)} aria-label="Close serial history">
                ×
              </button>
            </div>
            <pre className="serial-history-content">
              {rawSerialHistory.join("\n") || "No raw serial data received"}
            </pre>
            <div className="serial-history-footer">
              {rawSerialHistory.length} lines stored
              <button type="button" onClick={() => clearHistory()}>
                Clear history
              </button>
            </div>
          </section>
        </div>)}
    </>);
});
