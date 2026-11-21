import type { ReactNode } from "react";
type Props = {
    isDarkMode: boolean;
    header: ReactNode;
    metrics: ReactNode;
    rocket: ReactNode;
    map: ReactNode;
    sensors: ReactNode;
    commands: ReactNode;
    signal?: ReactNode;
    dialogs: ReactNode;
    serialLog: ReactNode;
    onOpenCalibration: () => void;
};
export function DashboardLayout({ isDarkMode, header, metrics, rocket, map, sensors, commands, signal, dialogs, serialLog, onOpenCalibration }: Props) {
    return (
        <main className={`app-shell ${isDarkMode ? "dark-mode" : ""}`}>
            {header}
            <div className="dashboard">
                <div className="dashboard-toolbar">
                    <div>
                        <div className="section-label">SENSOR SETUP</div>
                        <h1>Flight instrumentation</h1>
                    </div>
                    <button className="calibration-trigger" type="button" onClick={onOpenCalibration}>
                        Calibrate sensors
                    </button>
                </div>
                {metrics}
                <section className="main-grid">
                    <div className="left-column">{rocket}{map}</div>
                    {sensors}
                    <div className="right-column">{commands}{signal}</div>
                </section>
            </div>
            {dialogs}
            {serialLog}
        </main>
    );
}
