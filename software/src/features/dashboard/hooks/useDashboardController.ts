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

function formatCsvNumber(value: number | null | undefined, maxDecimals: number): string {
    if (value == null || !Number.isFinite(value))
        return "";
    return String(Number(value.toFixed(maxDecimals)));
}

function formatCsvFilename(date = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `telemetry-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.csv`;
}

export function buildTelemetryCsv(points: TelemetryPoint[]): string {
    const header = "No,Time (s),Timestamp (ms),Altitude (m),Pressure (hPa),Temperature (°C),Acceleration (g),Accel X (m/s²),Accel Y (m/s²),Accel Z (m/s²),Gyroscope (°/s),Yaw (°),Pitch (°),Roll (°),RSSI (dBm),Calibrated,Reference Set";
    const rows = points.map((point, index) => [
        index + 1,
        formatCsvNumber(point.time, 3),
        point.timestampMs ?? "",
        formatCsvNumber(point.altitude, 2),
        formatCsvNumber(point.pressure, 2),
        formatCsvNumber(point.temperature, 2),
        formatCsvNumber(point.acceleration, 3),
        formatCsvNumber(point.accelX, 3),
        formatCsvNumber(point.accelY, 3),
        formatCsvNumber(point.accelZ, 3),
        formatCsvNumber(point.gyroscope, 2),
        formatCsvNumber(point.yaw, 2),
        formatCsvNumber(point.pitch, 2),
        formatCsvNumber(point.roll, 2),
        formatCsvNumber(point.rssi, 1),
        point.calibrated ?? "",
        point.referenceSet ?? "",
    ].join(","));
    return "\uFEFF" + ["sep=,", header, ...rows].join("\r\n");
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

    const armSystem = useCallback(async () => {
        const timestamp = formatLogTimestamp();
        if (!connection.connectionReady) {
            setLog(`${timestamp}  ARM_SYSTEM rejected — connect port first`);
            return;
        }
        if (commandState === "safe") {
            try {
                await sendSerialCommand("ARM_SYSTEM");
                setCommandState("armed");
                setLog(`${timestamp}  ARM_SYSTEM armed — awaiting FIRE command`);
            } catch (error) {
                setLog(`${timestamp}  ARM_SYSTEM rejected — ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }, [connection.connectionReady, commandState]);

    const disarmSystem = useCallback(async () => {
        if (commandState === "armed") {
            try {
                await sendSerialCommand("DISARM_SYSTEM");
                setCommandState("safe");
                setLog(`${formatLogTimestamp()}  ARM_SYSTEM disarmed — fire controls disabled`);
            } catch (error) {
                setLog(`${formatLogTimestamp()}  DISARM_SYSTEM rejected — ${error instanceof Error ? error.message : String(error)}`);
            }
        }
    }, [commandState]);

    const fireCharge = useCallback(async () => {
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
        setLog(`${timestamp}  FIRE — sending command to ESP32 GPIO19`);
        try {
            await sendSerialCommand("FIRE");
            fireTimer.current = window.setTimeout(() => {
                fireTimer.current = undefined;
                if (activeSource.current !== firingSource)
                    return;
                setCommandState("complete");
                setPhase("Flight");
                setLog(`${formatLogTimestamp()}  ACK FIRE — GPIO19 pulse complete (100 ms)`);
            }, 100);
        } catch (error) {
            setCommandState("armed");
            setLog(`${timestamp}  FIRE rejected — ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [clearFireTimer, commandState, connection.connectionReady, connection.dataSource]);

    const resetCommands = useCallback(async () => {
        clearFireTimer();
        setCommandState("safe");
        setPhase("Initialization");
        if (connection.connectionReady) {
            try {
                await sendSerialCommand("RESET_FIRE");
                setLog(`${formatLogTimestamp()}  Command sequence reset — fire output SAFE`);
            } catch (error) {
                setLog(`${formatLogTimestamp()}  UI reset complete — firmware reset rejected: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            setLog(`${formatLogTimestamp()}  Command sequence reset`);
        }
    }, [clearFireTimer, connection.connectionReady]);

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
            const path = await save({ defaultPath: formatCsvFilename(), filters: [{ name: "CSV files", extensions: ["csv"] }] });
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
