import { lazy, Suspense, useCallback, useState } from "react";
import { useTelemetryFreshness } from "../features/telemetry/hooks/useTelemetryFreshness";
import { DashboardLayout } from "../features/dashboard/components/DashboardLayout";
import { DashboardHeader } from "../features/dashboard/components/DashboardHeader";
import { TelemetryMetrics } from "../features/telemetry/components/TelemetryMetrics";
import { RocketAttitudePanel } from "../features/flight/components/RocketAttitudePanel";
import { MapPanel } from "../features/navigation/components/MapPanel";
import { TelemetrySensorGrid } from "../features/telemetry/components/TelemetrySensorGrid";
import { SignalStrengthCard } from "../features/telemetry/components/SignalStrengthCard";
import { CommandPanel } from "../features/command/components/CommandPanel";
import { SerialLogPanel } from "../features/connection/components/SerialLogPanel";
import { useDashboardController } from "../features/dashboard/hooks/useDashboardController";
import { DUMMY_SOURCE } from "../data/dummyTelemetry";
const ImuCalibrationWizard = lazy(() => import("../features/calibration/components/ImuCalibrationWizard").then((module) => ({ default: module.ImuCalibrationWizard })));
export function TelemetryDashboard() {
    const dashboard = useDashboardController();
    const { connection, telemetry, imuCalibration, latestTelemetry } = dashboard;
    const [isDarkMode, setIsDarkMode] = useState(false);
    const [isCalibrationOpen, setIsCalibrationOpen] = useState(false);
    const telemetryFresh = useTelemetryFreshness(telemetry.receivedAt, 5000);
    const hasTelemetry = telemetry.series.length > 0 && telemetryFresh && connection.connected && connection.streamingSource === connection.dataSource;
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
                    lostPacketCount={telemetry.lostPacketCount}
                    hasTelemetry={hasTelemetry}
                    series={telemetry.series}
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
                    darkMode={isDarkMode}
                    onOpenCalibration={openCalibration}
                    onSetReference={imuCalibration.setReference}
                />
            }
            map={<MapPanel hasTelemetry={hasTelemetry} />}
            sensors={<TelemetrySensorGrid series={telemetry.series} latestTelemetry={latestTelemetry} dataSource={connection.dataSource} darkMode={isDarkMode} hasTelemetry={hasTelemetry} />}
            commands={
                <CommandPanel
                    commandState={dashboard.commandState}
                    commandSent={dashboard.commandSent}
                    pulseDuration={dashboard.pulseDuration}
                    onPulseDurationChange={dashboard.setPulseDuration}
                    connectionReady={dashboard.commandReady}
                    connected={connection.connected}
                    isDarkMode={isDarkMode}
                    hasTelemetry={hasTelemetry}
                    latestTelemetry={latestTelemetry}
                    onArm={dashboard.armSystem}
                    onDisarm={dashboard.disarmSystem}
                    onFire={dashboard.fireCharge}
                    onStart={dashboard.startTelemetry}
                    onStop={dashboard.stopTelemetry}
                    onRefreshClock={dashboard.refreshClock}
                    onReset={dashboard.resetCommands}
                    onToggleTheme={toggleTheme}
                />
            }
            signal={
                <SignalStrengthCard
                    connected={connection.connected}
                    hasTelemetry={hasTelemetry}
                    latestTelemetry={latestTelemetry}
                    packetCount={telemetry.packetCount}
                    lostPacketCount={telemetry.lostPacketCount}
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
