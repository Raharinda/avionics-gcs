import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DUMMY_SOURCE } from "../../../data/dummyTelemetry";
import { sendSerialCommand } from "../../../services/serialConnection";
import { useSerialConnection } from "../../connection/hooks/useSerialConnection";
import { useTelemetry } from "../../telemetry/hooks/useTelemetry";
import { useImuCalibration } from "../../calibration/hooks/useImuCalibration";
import type { CommandState, Phase, TelemetryPoint } from "../../../types/telemetry";

const DEFAULT_LOG = "No telemetry data received";

function formatLogTimestamp(date = new Date()): string {
    return `${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}.${String(date.getMilliseconds()).padStart(3, "0")}`;
}

export function buildTelemetryCsv(points: TelemetryPoint[]): string {
    const header = "time,timestampMs,temperature,pressure,acceleration,gyroscope,altitude,accelX,accelY,accelZ,roll,pitch,yaw,calibrated,referenceSet";
    const rows = points.map((point) => [
        point.time,
        point.timestampMs ?? "",
        point.temperature,
        point.pressure ?? "",
        point.acceleration,
        point.gyroscope,
        point.altitude ?? "",
        point.accelX,
        point.accelY,
        point.accelZ,
        point.roll,
        point.pitch,
        point.yaw,
        point.calibrated ?? "",
        point.referenceSet ?? "",
    ].join(","));
    return [header, ...rows].join("\r\n");
}

export function useDashboardController() {
    const [phase, setPhase] = useState<Phase>("Initialization");
    const [commandState, setCommandState] = useState<CommandState>("safe");
    const [log, setLog] = useState(DEFAULT_LOG);
    const [clockSynchronizedAt, setClockSynchronizedAt] = useState(0);
    const [serialLogResetVersion, setSerialLogResetVersion] = useState(0);
    const connection = useSerialConnection(setLog);
    const telemetry = useTelemetry({ connected: connection.connected && connection.streamingSource === connection.dataSource, dataSource: connection.dataSource });
    const imuCalibration = useImuCalibration(connection.hardwareStreaming, connection.dataSource, sendSerialCommand);
    const sourceState = useRef(new Map<string, {
        commandState: CommandState;
        phase: Phase;
        log: string;
    }>());
    const activeSource = useRef(connection.dataSource);
    const fireTimer = useRef<number | undefined>(undefined);
    const lastCalibrationLog = useRef<string | null>(null);

    const clearFireTimer = useCallback(() => {
        if (fireTimer.current !== undefined) {
            window.clearTimeout(fireTimer.current);
            fireTimer.current = undefined;
        }
    }, []);

    useEffect(() => clearFireTimer, [clearFireTimer]);

    useEffect(() => {
        if (!connection.connected) {
            clearFireTimer();
            setCommandState((current) => (current === "armed" || current === "firing" ? "safe" : current));
        }
    }, [clearFireTimer, connection.connected]);

    useEffect(() => {
        if (!connection.hardwareStreaming) {
            lastCalibrationLog.current = null;
            return;
        }
        const candidate = imuCalibration.error ?? imuCalibration.message;
        if (!candidate || candidate === lastCalibrationLog.current)
            return;
        lastCalibrationLog.current = candidate;
        if (candidate === "Menunggu status dan profil dari ESP32.")
            return;
        if (!imuCalibration.progress.active && !imuCalibration.cancelling && candidate.startsWith("Receiver E22 hanya telemetri"))
            return;
        setLog(candidate);
    }, [
        connection.hardwareStreaming,
        imuCalibration.cancelling,
        imuCalibration.error,
        imuCalibration.message,
        imuCalibration.progress.active,
    ]);

    useEffect(() => {
        if (activeSource.current !== connection.dataSource) {
            clearFireTimer();
            activeSource.current = connection.dataSource;
            const saved = sourceState.current.get(connection.dataSource);
            setCommandState(saved?.commandState ?? "safe");
            setPhase(saved?.phase ?? "Initialization");
            setLog(saved?.log ?? DEFAULT_LOG);
            return;
        }
        sourceState.current.set(connection.dataSource, { commandState, phase, log });
    }, [clearFireTimer, commandState, connection.dataSource, log, phase]);

    const startTelemetry = useCallback(async () => {
        if (connection.dataSource === DUMMY_SOURCE)
            telemetry.loadDummyData();
        else
            telemetry.clearTelemetry();
        await connection.startTelemetry();
    }, [connection.dataSource, connection.startTelemetry, telemetry.clearTelemetry, telemetry.loadDummyData]);

    const stopTelemetry = useCallback(async () => {
        clearFireTimer();
        setCommandState((current) => (current === "armed" || current === "firing" ? "safe" : current));
        await connection.stopTelemetry();
        telemetry.clearTelemetry();
        setSerialLogResetVersion((version) => version + 1);
    }, [clearFireTimer, connection.stopTelemetry, telemetry.clearTelemetry]);

    // Preserve the existing simulated command UI workflow; firmware does not implement ejection uplink yet.
    const armSystem = useCallback(() => {
        const timestamp = formatLogTimestamp();
        if (!connection.connectionReady) {
            setLog(`${timestamp}  ARM_SYSTEM rejected — connect port first`);
            return;
        }
        if (commandState === "safe") {
            setCommandState("armed");
            setLog(`${timestamp}  ARM_SYSTEM armed (UI simulation) — awaiting FIRE command`);
        }
    }, [connection.connectionReady, commandState]);

    const disarmSystem = useCallback(() => {
        if (commandState === "armed") {
            setCommandState("safe");
            setLog(`${formatLogTimestamp()}  ARM_SYSTEM disarmed — fire controls disabled`);
        }
    }, [commandState]);

    const fireCharge = useCallback(() => {
        const timestamp = formatLogTimestamp();
        if (!connection.connectionReady) {
            setLog(`${timestamp}  FIRE rejected — connect port first`);
            return;
        }
        if (commandState !== "armed") {
            setLog(`${timestamp}  FIRE rejected — arm system first`);
            return;
        }
        clearFireTimer();
        const firingSource = connection.dataSource;
        setCommandState("firing");
        setLog(`${timestamp}  SIMULATED FIRE — command sequence initiated`);
        fireTimer.current = window.setTimeout(() => {
            fireTimer.current = undefined;
            if (activeSource.current !== firingSource)
                return;
            setCommandState("complete");
            setPhase("Flight");
            setLog(`${formatLogTimestamp()}  SIMULATED ACK FIRE — ejection workflow complete`);
        }, 1200);
    }, [clearFireTimer, commandState, connection.connectionReady, connection.dataSource]);

    const resetCommands = useCallback(() => {
        clearFireTimer();
        setCommandState("safe");
        setPhase("Initialization");
        setLog(`${formatLogTimestamp()}  Command sequence reset`);
    }, [clearFireTimer]);

    const refreshClock = useCallback(() => {
        const synchronizedAt = new Date();
        setClockSynchronizedAt(synchronizedAt.getTime());
        setLog(`${formatLogTimestamp(synchronizedAt)}  Laptop clock synchronized`);
    }, []);

    const downloadTelemetryCsv = useCallback(async () => {
        const exportPoints = telemetry.getExportSeries();
        const csv = buildTelemetryCsv(exportPoints);
        try {
            const { save } = await import("@tauri-apps/plugin-dialog");
            const path = await save({ defaultPath: `telemetry-${new Date().toISOString().slice(0, 10)}.csv`, filters: [{ name: "CSV files", extensions: ["csv"] }] });
            if (!path) {
                setLog("CSV export cancelled");
                return;
            }
            const savedPath = await invoke<string>("export_telemetry_csv", { csv, path });
            setLog(exportPoints.length > 0 ? `CSV exported — ${exportPoints.length} telemetry points (${savedPath})` : `CSV exported — no telemetry data available (${savedPath})`);
        }
        catch (error) {
            setLog(`CSV export error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [telemetry.getExportSeries]);

    const latestTelemetry = telemetry.series.length ? telemetry.series[telemetry.series.length - 1] : null;
    return { connection, telemetry, imuCalibration, latestTelemetry, phase, commandState, log,
        clockSynchronizedAt, serialLogResetVersion, startTelemetry, stopTelemetry, armSystem, disarmSystem, fireCharge, resetCommands, refreshClock, downloadTelemetryCsv };
}
