import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { DEFAULT_DATA_SOURCE, DUMMY_SOURCE } from "../../../data/dummyTelemetry";
import { listSerialPorts, startSerialListener, stopSerialListener } from "../../../services/serialConnection";
import type { SerialPortInfo } from "../../../types/serial";

type SerialDisconnectPayload = {
    sourcePort: string;
    reason: string;
};

export function extractPortName(dataSource: string): string | null {
    if (dataSource === DUMMY_SOURCE) return null;
    const portName = dataSource.split(" · ")[0].trim();
    return portName.length > 0 ? portName : null;
}

export function isConnectionReady(dataSource: string, portConnected: boolean): boolean {
    if (dataSource === DUMMY_SOURCE) return true;
    return extractPortName(dataSource) !== null && portConnected;
}

export function useSerialConnection(setLog: (message: string) => void) {
    const [connected, setConnected] = useState(false);
    const [portConnected, setPortConnected] = useState(false);
    const [streamingSource, setStreamingSource] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState(DEFAULT_DATA_SOURCE);
    const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
    const discovering = useRef(false);
    const mounted = useRef(true);
    const activeConnection = useRef({ connected, dataSource, streamingSource });
    activeConnection.current = { connected, dataSource, streamingSource };
    const observedStreamingPort = useRef(false);

    const refreshSerialPorts = useCallback(async () => {
        if (discovering.current)
            return;
        discovering.current = true;
        try {
            const nextPorts = await listSerialPorts();
            if (!mounted.current)
                return;
            setSerialPorts((previous) => previous.length === nextPorts.length && previous.every((port, index) => {
                const next = nextPorts[index];
                return port.name === next.name && port.description === next.description && port.is_usb === next.is_usb;
            }) ? previous : nextPorts);

            const current = activeConnection.current;
            const streamingPort = current.streamingSource ? extractPortName(current.streamingSource) : null;
            if (current.connected && streamingPort) {
                const stillPresent = nextPorts.some((port) => port.name === streamingPort);
                if (stillPresent) {
                    observedStreamingPort.current = true;
                }
                else if (observedStreamingPort.current) {
                    observedStreamingPort.current = false;
                    setConnected(false);
                    setPortConnected(false);
                    setStreamingSource(null);
                    setLog(`Serial disconnected (${streamingPort}) — port removed`);
                    void stopSerialListener().catch(() => {});
                }
            }
        }
        catch (error) {
            if (mounted.current)
                setLog(`Serial port discovery error: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            discovering.current = false;
        }
    }, [setLog]);

    useEffect(() => {
        mounted.current = true;
        void refreshSerialPorts();
        const timer = window.setInterval(() => void refreshSerialPorts(), 1000);
        return () => { mounted.current = false; window.clearInterval(timer); };
    }, [refreshSerialPorts]);

    useEffect(() => {
        let disposed = false;
        let unlistenError: (() => void) | undefined;
        let unlistenDisconnect: (() => void) | undefined;

        listen<string>("serial_error", ({ payload }) => {
            if (disposed)
                return;
            const current = activeConnection.current;
            if (!current.connected || current.dataSource === DUMMY_SOURCE)
                return;
            setLog(`Serial error: ${payload}`);
        }).then((cleanup) => {
            if (disposed)
                cleanup();
            else
                unlistenError = cleanup;
        }).catch(() => {});

        listen<SerialDisconnectPayload>("serial_disconnected", ({ payload }) => {
            if (disposed)
                return;
            const current = activeConnection.current;
            const streamingPort = current.streamingSource ? extractPortName(current.streamingSource) : null;
            if (!streamingPort || payload.sourcePort !== streamingPort)
                return;
            observedStreamingPort.current = false;
            setConnected(false);
            setPortConnected(false);
            setStreamingSource(null);
            setLog(`Serial disconnected (${payload.sourcePort}): ${payload.reason}`);
            void refreshSerialPorts();
        }).then((cleanup) => {
            if (disposed)
                cleanup();
            else
                unlistenDisconnect = cleanup;
        }).catch(() => {});

        return () => {
            disposed = true;
            unlistenError?.();
            unlistenDisconnect?.();
        };
    }, [refreshSerialPorts, setLog]);

    const selectDataSource = useCallback(async (source: string) => {
        if (source === dataSource)
            return;
        try {
            if (dataSource !== DUMMY_SOURCE)
                await stopSerialListener();
            observedStreamingPort.current = false;
            setConnected(false);
            setPortConnected(false);
            setStreamingSource(null);
            setDataSource(source);
        }
        catch (error) {
            setLog(`Serial error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [dataSource, setLog]);

    const startTelemetry = useCallback(async () => {
        if (dataSource === DUMMY_SOURCE) {
            observedStreamingPort.current = false;
            setStreamingSource(DUMMY_SOURCE);
            setConnected(true);
            const now = new Date();
            const timestamp = `${now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}.${String(now.getMilliseconds()).padStart(3, "0")}`;
            setLog(`${timestamp}  DUMMY RX streaming simulated telemetry`);
            return;
        }
        const portName = extractPortName(dataSource);
        if (!portName) {
            setPortConnected(false);
            setConnected(false);
            setStreamingSource(null);
            setLog("Serial error: No serial port selected");
            return;
        }
        try {
            const message = await startSerialListener(portName);
            observedStreamingPort.current = serialPorts.some((port) => port.name === portName);
            setPortConnected(true);
            setConnected(true);
            setStreamingSource(dataSource);
            setLog(`${message} — waiting for JSON telemetry`);
        }
        catch (error) {
            observedStreamingPort.current = false;
            setPortConnected(false);
            setConnected(false);
            setStreamingSource(null);
            setLog(`Serial error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [dataSource, serialPorts, setLog]);

    const stopTelemetry = useCallback(async () => {
        let stopError: unknown = null;
        try {
            if (dataSource !== DUMMY_SOURCE)
                await stopSerialListener();
        }
        catch (error) {
            stopError = error;
        }
        finally {
            observedStreamingPort.current = false;
            setConnected(false);
            setPortConnected(false);
            setStreamingSource(null);
        }
        if (stopError)
            setLog(`Serial stop error: ${stopError instanceof Error ? stopError.message : String(stopError)}`);
        else
            setLog("Telemetry stopped — no data received");
    }, [dataSource, setLog]);

    const detectedUsbPorts = serialPorts.filter((port) => port.is_usb).map((port) => port.name).sort();
    const hardwareStatusLabel = detectedUsbPorts.length ? `Connected at ${detectedUsbPorts.join(", ")}` : "Port disconnected";
    const streamIsActive = streamingSource !== null && (streamingSource === DUMMY_SOURCE || serialPorts.some((port) => port.name === streamingSource.split(" · ")[0]));
    const streamLabel = streamingSource === DUMMY_SOURCE ? "Dummy Data" : streamingSource?.split(" · ")[0];
    const portStatusLabel = streamIsActive ? `Streaming at ${streamLabel}` : hardwareStatusLabel;
    const connectionReady = isConnectionReady(dataSource, portConnected);
    const hardwareStreaming = connected && streamingSource === dataSource && dataSource !== DUMMY_SOURCE;
    return { connected, setConnected, streamingSource, dataSource, serialPorts, hardwareStreaming,
        hardwareStatusLabel, streamIsActive, streamLabel, portStatusLabel, hasDetectedUsb: detectedUsbPorts.length > 0,
        connectionReady, refreshSerialPorts, selectDataSource, startTelemetry, stopTelemetry };
}
