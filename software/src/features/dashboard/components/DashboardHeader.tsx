import { memo } from "react";
import { Icon } from "../../../components/ui/Icon";
import { LaptopClock } from "./LaptopClock";
import { DUMMY_SOURCE } from "../../../data/dummyTelemetry";
import type { SerialPortInfo } from "../../../types/serial";
import type { Phase } from "../../../types/telemetry";
type Props = {
    phase: Phase;
    dataSource: string;
    serialPorts: SerialPortInfo[];
    streamIsActive: boolean;
    streamLabel: string | undefined;
    hardwareStatusLabel: string;
    portStatusLabel: string;
    hasDetectedUsb: boolean;
    clockSynchronizedAt: number;
    onSelectSource: (source: string) => void;
    onRefreshPorts: () => void;
    onExportCsv: () => void;
};
export const DashboardHeader = memo(function DashboardHeader(props: Props) {
    const { phase, dataSource, serialPorts, streamIsActive, streamLabel, hardwareStatusLabel, portStatusLabel, hasDetectedUsb, clockSynchronizedAt, onSelectSource, onRefreshPorts, onExportCsv } = props;
    return (<header className="topbar">
        <div className="brand">
          <div className="brand-mark">G</div>
          <strong>AVIONICS GCS</strong>
          <span className="connection-pill" role="status" aria-live="polite" title={streamIsActive
            ? `Telemetry streaming from ${streamLabel}. ${hardwareStatusLabel}`
            : `${hardwareStatusLabel}. Press Start to stream the selected data source.`}>
            <i className={hasDetectedUsb || streamIsActive ? "connected" : ""}/>
            <span className="connection-copy">
              <span className="connection-port">{portStatusLabel}</span>
              <small>{streamIsActive ? "Streaming" : "Not streaming"}</small>
            </span>
          </span>
        </div>
        <nav className="phase-nav">
          {(["Initialization", "Flight", "Recovery"] as Phase[]).map((item, index, phases) => (<span className="phase-group" key={item}>
              <span className={`phase-item ${phase === item ? "active" : ""} ${item === "Recovery" ? "future" : ""}`}>
                <span className="phase-dot"/>
                {item}
              </span>
              {index < phases.length - 1 && <span className="phase-connector"/>}
            </span>))}
        </nav>
        <div className="header-actions">
          <LaptopClock synchronizedAt={clockSynchronizedAt}/>
          <select aria-label="Data source" value={dataSource} onChange={(event) => onSelectSource(event.target.value)}>
            {dataSource !== DUMMY_SOURCE &&
            !serialPorts.some((port) => `${port.name} · ${port.description ?? "Serial"}` === dataSource) && <option value={dataSource}>{dataSource}</option>}
            {serialPorts.map((port) => (<option key={port.name} value={`${port.name} · ${port.description ?? "Serial"}`}>
                {port.name} · {port.description ?? "Serial"}
              </option>))}
            <option>Dummy data</option>
          </select>
          <button className="download" type="button" onClick={() => void onRefreshPorts()}>
            Refresh ports
          </button>
          <button className="download" type="button" onClick={onExportCsv}>
            <Icon name="download"/> Download CSV
          </button>
        </div>
      </header>);
});
