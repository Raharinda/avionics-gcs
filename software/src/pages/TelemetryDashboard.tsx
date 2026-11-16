import { lazy, Suspense, useCallback, useState } from "react";
import { DashboardLayout } from "../components/templates/DashboardLayout";
import { DashboardHeader } from "../components/organisms/DashboardHeader";
import { TelemetryMetrics } from "../components/organisms/TelemetryMetrics";
import { RocketAttitudePanel } from "../components/organisms/RocketAttitudePanel";
import { MapPanel } from "../components/organisms/MapPanel";
import { TelemetrySensorGrid } from "../components/organisms/TelemetrySensorGrid";
import { CommandPanel } from "../components/organisms/CommandPanel";
import { SerialLogPanel } from "../components/organisms/SerialLogPanel";
import { useDashboardController } from "../hooks/useDashboardController";
import { DUMMY_SOURCE } from "../data/dummyTelemetry";
const ImuCalibrationWizard = lazy(() => import("../components/organisms/ImuCalibrationWizard").then((module) => ({ default: module.ImuCalibrationWizard })));
export function TelemetryDashboard() {
    const dashboard = useDashboardController();
    const { connection, telemetry, imuCalibration, latestTelemetry } = dashboard;
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
    const openCalibration = useCallback(() => setIsCalibrationOpen(true), []);
    const closeCalibration = useCallback(() => setIsCalibrationOpen(false), []);
    const toggleTheme = useCallback(() => setIsDarkMode((enabled) => !enabled), []);
    return (
        <DashboardLayout
            isDarkMode={isDarkMode}
            onOpenCalibration={openCalibration}
            header={
                <DashboardHeader
                    phase={dashboard.phase}
                    dataSource={connection.dataSource}
                    serialPorts={connection.serialPorts}
                    streamIsActive={connection.streamIsActive}
                    streamLabel={connection.streamLabel}
                    hardwareStatusLabel={connection.hardwareStatusLabel}
                    portStatusLabel={connection.portStatusLabel}
                    hasDetectedUsb={connection.hasDetectedUsb}
                    clockSynchronizedAt={dashboard.clockSynchronizedAt}
                    onSelectSource={connection.selectDataSource}
                    onRefreshPorts={connection.refreshSerialPorts}
                    onExportCsv={dashboard.downloadTelemetryCsv}
                />
            }
            metrics={
                <TelemetryMetrics
                    altitude={latestTelemetry?.altitude ?? null}
                    packetCount={telemetry.packetCount}
                    hasTelemetry={telemetry.series.length > 0}
                />
            }
            rocket={
                <RocketAttitudePanel
                    latestTelemetry={latestTelemetry}
                    receivedAt={telemetry.receivedAt}
                    simulated={connection.dataSource === DUMMY_SOURCE}
                    connected={connection.connected}
                    hardwareStreaming={connection.hardwareStreaming}
                    imuState={imuCalibration.state}
                    calibrationActive={imuCalibration.progress.active}
                    calibrationPending={imuCalibration.pending}
                    paused={isCalibrationOpen}
                    onOpenCalibration={openCalibration}
                    onSetReference={imuCalibration.setReference}
                />
            }
            map={<MapPanel hasTelemetry={telemetry.series.length > 0} />}
            sensors={<TelemetrySensorGrid series={telemetry.series} latestTelemetry={latestTelemetry} />}
            commands={
                <CommandPanel
                    commandState={dashboard.commandState}
                    connectionReady={connection.connectionReady}
                    connected={connection.connected}
                    isDarkMode={isDarkMode}
                    onArm={dashboard.armSystem}
                    onFire={dashboard.fireCharge}
                    onStart={dashboard.startTelemetry}
                    onStop={dashboard.stopTelemetry}
                    onRefreshClock={dashboard.refreshClock}
                    onReset={dashboard.resetCommands}
                    onToggleTheme={toggleTheme}
                />
            }
            dialogs={
                isCalibrationOpen && (
                    <Suspense fallback={null}>
                        <ImuCalibrationWizard
                            controller={imuCalibration}
                            connected={connection.hardwareStreaming}
                            telemetry={latestTelemetry}
                            receivedAt={telemetry.receivedAt}
                            onClose={closeCalibration}
                        />
                    </Suspense>
                )
            }
            serialLog={
                <SerialLogPanel
                    log={dashboard.log}
                    dataSource={connection.dataSource}
                    hardwareStatusLabel={connection.hardwareStatusLabel}
                    streamIsActive={connection.streamIsActive}
                    streamLabel={connection.streamLabel}
                    resetVersion={dashboard.serialLogResetVersion}
                />
            }
        />
    );
}
