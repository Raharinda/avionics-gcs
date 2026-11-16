import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DUMMY_SOURCE } from "../../../data/dummyTelemetry";
import { sendSerialCommand } from "../../../services/serialConnection";
import { useSerialConnection } from "../../connection/hooks/useSerialConnection";
import { useTelemetry } from "../../telemetry/hooks/useTelemetry";
import { useImuCalibration } from "../../calibration/hooks/useImuCalibration";
import type { CommandState, Phase } from "../../../types/telemetry";
export function useDashboardController() {
    const [phase, setPhase] = useState<Phase>("Initialization");
    const [commandState, setCommandState] = useState<CommandState>("safe");
    const [log, setLog] = useState("No telemetry data received");
    const [clockSynchronizedAt, setClockSynchronizedAt] = useState(0);
    const [serialLogResetVersion, setSerialLogResetVersion] = useState(0);
    const connection = useSerialConnection(setLog);
    const telemetry = useTelemetry({ connected: connection.connected && connection.streamingSource === connection.dataSource, dataSource: connection.dataSource });
    const imuCalibration = useImuCalibration(connection.hardwareStreaming, connection.dataSource, sendSerialCommand);
    const seriesRef = useRef(telemetry.series);
    seriesRef.current = telemetry.series;
    const sourceState = useRef(new Map<string, {
        commandState: CommandState;
        phase: Phase;
        log: string;
    }>());
    const activeSource = useRef(connection.dataSource);
    const fireTimer = useRef<number | undefined>(undefined);
    useEffect(() => () => window.clearTimeout(fireTimer.current), []);
    useEffect(() => {
        if (connection.hardwareStreaming)
            setLog(imuCalibration.error ?? imuCalibration.message);
    }, [connection.hardwareStreaming, imuCalibration.error, imuCalibration.message]);
    useEffect(() => {
        if (activeSource.current !== connection.dataSource) {
            activeSource.current = connection.dataSource;
            const saved = sourceState.current.get(connection.dataSource);
            if (saved) {
                setCommandState(saved.commandState);
                setPhase(saved.phase);
                setLog(saved.log);
            }
            return;
        }
        sourceState.current.set(connection.dataSource, { commandState, phase, log });
    }, [commandState, connection.dataSource, log, phase]);
    const startTelemetry = useCallback(async () => {
        if (connection.dataSource === DUMMY_SOURCE)
            telemetry.loadDummyData();
        await connection.startTelemetry();
    }, [connection.dataSource, connection.startTelemetry, telemetry.loadDummyData]);
    const stopTelemetry = useCallback(async () => {
        await connection.stopTelemetry();
        telemetry.clearTelemetry();
        setSerialLogResetVersion((version) => version + 1);
    }, [connection.stopTelemetry, telemetry.clearTelemetry]);
    // Preserve the existing command UI workflow; this refactor adds no device commands.
    const armSystem = useCallback(() => {
        if (!connection.connectionReady) {
            setLog("14:32:10.422  ARM_SYSTEM rejected — connect port first");
            return;
        }
        if (commandState === "safe") {
            setCommandState("armed");
            setLog("14:32:10.422  TX ARM_SYSTEM — awaiting FIRE command");
        }
    }, [connection.connectionReady, commandState]);
    const fireCharge = useCallback(() => {
        if (!connection.connectionReady || commandState !== "armed") {
            setLog("14:32:11.008  FIRE rejected — connect port first");
            return;
        }
        connection.setConnected(true);
        setCommandState("firing");
        setLog("14:32:11.008  TX FIRE — command sent via serial");
        fireTimer.current = window.setTimeout(() => {
            setCommandState("complete");
            setPhase("Flight");
            connection.setConnected(true);
            setLog("14:32:11.236  ACK FIRE — ejection charge triggered; listening for telemetry");
        }, 1200);
    }, [connection.connectionReady, connection.setConnected, commandState]);
    const resetCommands = useCallback(() => {
        setCommandState("safe");
        setPhase("Initialization");
        setLog("14:32:12.004  Command sequence reset");
    }, []);
    const refreshClock = useCallback(() => {
        const synchronizedAt = new Date();
        setClockSynchronizedAt(synchronizedAt.getTime());
        setLog(`${synchronizedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}.${String(synchronizedAt.getMilliseconds()).padStart(3, "0")}  Laptop clock synchronized`);
    }, []);
    const downloadTelemetryCsv = useCallback(async () => {
        const rows = seriesRef.current.map((point) => [point.time, point.temperature, point.pressure, point.acceleration, point.gyroscope, point.altitude].join(","));
        const csv = ["time,temperature,pressure,acceleration,gyroscope,altitude", ...rows].join("\r\n");
        try {
            const { save } = await import("@tauri-apps/plugin-dialog");
            const path = await save({ defaultPath: `telemetry-${new Date().toISOString().slice(0, 10)}.csv`, filters: [{ name: "CSV files", extensions: ["csv"] }] });
            if (!path) {
                setLog("CSV export cancelled");
                return;
            }
            const savedPath = await invoke<string>("export_telemetry_csv", { csv, path });
            setLog(rows.length > 0 ? `CSV exported — ${rows.length} telemetry points (${savedPath})` : `CSV exported — no telemetry data available (${savedPath})`);
        }
        catch (error) {
            setLog(`CSV export error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, []);
    const latestTelemetry = telemetry.series.length ? telemetry.series[telemetry.series.length - 1] : null;
    return { connection, telemetry, imuCalibration, latestTelemetry, phase, commandState, log,
        clockSynchronizedAt, serialLogResetVersion, startTelemetry, stopTelemetry, armSystem, fireCharge, resetCommands, refreshClock, downloadTelemetryCsv };
}
