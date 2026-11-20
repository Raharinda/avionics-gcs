import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DUMMY_SOURCE } from "../../../data/dummyTelemetry";
import { sendSerialCommand } from "../../../services/serialConnection";
import { useSerialConnection } from "../../connection/hooks/useSerialConnection";
import { useTelemetry } from "../../telemetry/hooks/useTelemetry";
import { useImuCalibration } from "../../calibration/hooks/useImuCalibration";
import type { Phase, TelemetryPoint } from "../../../types/telemetry";

import { useGpio19Command } from "../../command/hooks/useGpio19Command";
import { DEFAULT_PULSE_MS } from "../../../data/gpio19Command";

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
    const [pulseDuration, setPulseDuration] = useState(String(DEFAULT_PULSE_MS));
    const [log, setLog] = useState(DEFAULT_LOG);
    const [clockSynchronizedAt, setClockSynchronizedAt] = useState(0);
    const [serialLogResetVersion, setSerialLogResetVersion] = useState(0);
    const connection = useSerialConnection(setLog);
    const gpio19 = useGpio19Command(connection.hardwareStreaming && connection.connectionReady, connection.dataSource, setLog);
    const commandState = gpio19.state;
    const telemetry = useTelemetry({ connected: connection.connected && connection.streamingSource === connection.dataSource, dataSource: connection.dataSource });
    const imuCalibration = useImuCalibration(connection.hardwareStreaming, connection.dataSource, sendSerialCommand);
    const sourceState = useRef(new Map<string, {
        phase: Phase;
        log: string;
    }>());
    const activeSource = useRef(connection.dataSource);
    const lastCalibrationLog = useRef<string | null>(null);

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
        if (!imuCalibration.progress.active && !imuCalibration.cancelling && /^Receiver E(?:22|32) hanya telemetri/.test(candidate))
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
            activeSource.current = connection.dataSource;
            const saved = sourceState.current.get(connection.dataSource);
            setPhase(saved?.phase ?? "Initialization");
            setLog(saved?.log ?? DEFAULT_LOG);
            return;
        }
        sourceState.current.set(connection.dataSource, { phase, log });
    }, [connection.dataSource, log, phase]);

    const startTelemetry = useCallback(async () => {
        if (connection.dataSource === DUMMY_SOURCE)
            telemetry.loadDummyData();
        else
            telemetry.clearTelemetry();
        await connection.startTelemetry();
    }, [connection.dataSource, connection.startTelemetry, telemetry.clearTelemetry, telemetry.loadDummyData]);

    const stopTelemetry = useCallback(async () => {
        await connection.stopTelemetry();
        telemetry.clearTelemetry();
        setSerialLogResetVersion((version) => version + 1);
    }, [connection.stopTelemetry, telemetry.clearTelemetry]);

    const armSystem = gpio19.arm;
    const disarmSystem = gpio19.disarm;
    const fireCharge = useCallback(() => gpio19.fire(Number(pulseDuration)), [gpio19.fire, pulseDuration]);
    const resetCommands = gpio19.reset;
    useEffect(() => {
        if (commandState === "complete") setPhase("Flight");
        else if (commandState === "safe") setPhase("Initialization");
    }, [commandState]);

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
        commandReady: gpio19.ready, commandSent: gpio19.sent, pulseDuration, setPulseDuration,
        clockSynchronizedAt, serialLogResetVersion, startTelemetry, stopTelemetry, armSystem, disarmSystem, fireCharge, resetCommands, refreshClock, downloadTelemetryCsv };
}
