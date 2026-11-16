import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_DATA_SOURCE, DUMMY_SOURCE } from "../data/dummyTelemetry";
import { listSerialPorts, startSerialListener, stopSerialListener } from "../services/serialConnection";
import type { SerialPortInfo } from "../types/serial";
export function useSerialConnection(setLog: (message: string) => void) {
    const [connected, setConnected] = useState(false);
    const [portConnected, setPortConnected] = useState(false);
    const [streamingSource, setStreamingSource] = useState<string | null>(null);
    const [dataSource, setDataSource] = useState(DEFAULT_DATA_SOURCE);
    const [serialPorts, setSerialPorts] = useState<SerialPortInfo[]>([]);
    const discovering = useRef(false);
    const mounted = useRef(true);
    const refreshSerialPorts = useCallback(async () => {
        if (discovering.current)
            return;
        discovering.current = true;
        try {
            const nextPorts = await listSerialPorts();
            if (mounted.current)
                setSerialPorts((previous) => previous.length === nextPorts.length && previous.every((port, index) => {
                    const next = nextPorts[index];
                    return port.name === next.name && port.description === next.description && port.is_usb === next.is_usb;
                }) ? previous : nextPorts);
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
        const timer = window.setInterval(() => void refreshSerialPorts(), 2000);
        return () => { mounted.current = false; window.clearInterval(timer); };
    }, [refreshSerialPorts]);
    const selectDataSource = useCallback(async (source: string) => {
        if (source === dataSource)
            return;
        try {
            if (dataSource !== DUMMY_SOURCE)
                await stopSerialListener();
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
            setStreamingSource(DUMMY_SOURCE);
            setConnected(true);
            setLog("14:32:09.021  DUMMY RX alt: 1244.9, vel: -18.6, packet: 28492");
            return;
        }
        try {
            const message = await startSerialListener(dataSource.split(" · ")[0]);
            setPortConnected(true);
            setConnected(true);
            setStreamingSource(dataSource);
            setLog(`${message} — waiting for JSON telemetry`);
        }
        catch (error) {
            setPortConnected(false);
            setConnected(false);
            setStreamingSource(null);
            setLog(`Serial error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [dataSource, setLog]);
    const stopTelemetry = useCallback(async () => {
        if (dataSource !== DUMMY_SOURCE)
            await stopSerialListener();
        setConnected(false);
        setPortConnected(false);
        setStreamingSource(null);
        setLog("Telemetry stopped — no data received");
    }, [dataSource, setLog]);
    const detectedUsbPorts = serialPorts.filter((port) => port.is_usb).map((port) => port.name).sort();
    const hardwareStatusLabel = detectedUsbPorts.length ? `Connected at ${detectedUsbPorts.join(", ")}` : "Port disconnected";
    const streamIsActive = streamingSource !== null && (streamingSource === DUMMY_SOURCE || serialPorts.some((port) => port.name === streamingSource.split(" · ")[0]));
    const streamLabel = streamingSource === DUMMY_SOURCE ? "Dummy Data" : streamingSource?.split(" · ")[0];
    const portStatusLabel = streamIsActive ? `Streaming at ${streamLabel}` : hardwareStatusLabel;
    const connectionReady = dataSource === DUMMY_SOURCE || (dataSource.startsWith("COM") && portConnected);
    const hardwareStreaming = connected && streamingSource === dataSource && dataSource !== DUMMY_SOURCE;
    return { connected, setConnected, streamingSource, dataSource, serialPorts, hardwareStreaming,
        hardwareStatusLabel, streamIsActive, streamLabel, portStatusLabel, hasDetectedUsb: detectedUsbPorts.length > 0,
        connectionReady, refreshSerialPorts, selectDataSource, startTelemetry, stopTelemetry };
}
