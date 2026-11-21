import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { createDummyTelemetryPoint, dummySeries, DUMMY_SOURCE } from "../../../data/dummyTelemetry";
import { PacketLossTracker } from "../../../data/packetLoss";
import type { TelemetryPoint } from "../../../types/telemetry";

const MAX_EXPORT_POINTS = 100_000;

type UseTelemetryOptions = {
    connected: boolean;
    dataSource: string;
};

type CachedSourceTelemetry = {
    series: TelemetryPoint[];
    exportSeries: TelemetryPoint[];
    packetCount: number;
    lostPacketCount: number;
    tracker: PacketLossTracker;
};

function createEmptySourceTelemetry(): CachedSourceTelemetry {
    return {
        series: [],
        exportSeries: [],
        packetCount: 0,
        lostPacketCount: 0,
        tracker: new PacketLossTracker(),
    };
}

export function useTelemetry({ connected, dataSource }: UseTelemetryOptions) {
    const [series, setSeries] = useState<TelemetryPoint[]>([]);
    const [packetCount, setPacketCount] = useState(0);
    const [lostPacketCount, setLostPacketCount] = useState(0);
    const [receivedAt, setReceivedAt] = useState<number | null>(null);
    const connection = useRef({ connected, dataSource });
    connection.current = { connected, dataSource };
    const sourceState = useRef(new Map<string, CachedSourceTelemetry>());
    const activeSource = useRef(dataSource);

    const getSourceEntry = useCallback((source: string) => {
        let entry = sourceState.current.get(source);
        if (!entry) {
            entry = createEmptySourceTelemetry();
            sourceState.current.set(source, entry);
        }
        return entry;
    }, []);

    useEffect(() => {
        if (!connected)
            setReceivedAt(null);
    }, [connected]);

    useEffect(() => {
        if (activeSource.current !== dataSource) {
            activeSource.current = dataSource;
            const saved = sourceState.current.get(dataSource);
            setSeries(saved?.series ?? []);
            setPacketCount(saved?.packetCount ?? 0);
            setLostPacketCount(saved?.lostPacketCount ?? 0);
            setReceivedAt(null);
            return;
        }
        const entry = getSourceEntry(dataSource);
        entry.series = series;
        entry.packetCount = packetCount;
        entry.lostPacketCount = lostPacketCount;
    }, [dataSource, getSourceEntry, lostPacketCount, packetCount, series]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            if (!connected || dataSource !== DUMMY_SOURCE)
                return;
            const entry = getSourceEntry(DUMMY_SOURCE);
            const lastTime = entry.exportSeries.length > 0
                ? entry.exportSeries[entry.exportSeries.length - 1].time
                : (entry.series.length > 0 ? entry.series[entry.series.length - 1].time : 0);
            const nextPoint = createDummyTelemetryPoint(lastTime);
            entry.exportSeries.push(nextPoint);
            if (entry.exportSeries.length > MAX_EXPORT_POINTS)
                entry.exportSeries.shift();
            setReceivedAt(Date.now());
            setPacketCount((count) => count + 1);
            setSeries((current) => [...current.slice(-17), nextPoint]);
        }, 1000);
        return () => window.clearInterval(timer);
    }, [connected, dataSource, getSourceEntry]);

    useEffect(() => {
        let unlisten: (() => void) | undefined;
        let disposed = false;
        listen<Omit<TelemetryPoint, "time">>("telemetry", (event) => {
            const payload = event.payload;
            const current = connection.current;
            if (disposed || !current.connected || current.dataSource === DUMMY_SOURCE ||
                (payload.sourcePort && payload.sourcePort !== current.dataSource.split(" · ")[0]))
                return;
            const entry = getSourceEntry(current.dataSource);
            const totalLost = entry.tracker.record(payload.timestampMs);
            const lastTime = entry.exportSeries.length > 0
                ? entry.exportSeries[entry.exportSeries.length - 1].time
                : (entry.series.length > 0 ? entry.series[entry.series.length - 1].time : 0);
            const nextPoint: TelemetryPoint = {
                ...payload,
                time: payload.timestampMs != null ? payload.timestampMs / 1000 : lastTime + 1,
            };
            entry.exportSeries.push(nextPoint);
            if (entry.exportSeries.length > MAX_EXPORT_POINTS)
                entry.exportSeries.shift();
            entry.lostPacketCount = totalLost;
            setReceivedAt(Date.now());
            setPacketCount((count) => count + 1);
            setLostPacketCount(totalLost);
            setSeries((prev) => [...prev.slice(-119), nextPoint]);
        }).then((cleanup) => {
            if (disposed)
                cleanup();
            else
                unlisten = cleanup;
        });
        return () => { disposed = true; unlisten?.(); };
    }, [getSourceEntry]);

    const loadDummyData = useCallback(() => {
        const entry = getSourceEntry(dataSource);
        entry.series = dummySeries;
        entry.exportSeries = [...dummySeries];
        entry.packetCount = 28492;
        entry.lostPacketCount = 0;
        entry.tracker.reset();
        setSeries(dummySeries);
        setPacketCount(28492);
        setLostPacketCount(0);
        setReceivedAt(Date.now());
    }, [dataSource, getSourceEntry]);

    const clearTelemetry = useCallback(() => {
        const entry = getSourceEntry(dataSource);
        entry.series = [];
        entry.exportSeries = [];
        entry.packetCount = 0;
        entry.lostPacketCount = 0;
        entry.tracker.reset();
        setSeries([]);
        setPacketCount(0);
        setLostPacketCount(0);
        setReceivedAt(null);
    }, [dataSource, getSourceEntry]);

    const getExportSeries = useCallback(() => {
        const entry = sourceState.current.get(connection.current.dataSource);
        return entry ? [...entry.exportSeries] : [];
    }, []);

    return {
        series,
        packetCount,
        lostPacketCount,
        loadDummyData,
        clearTelemetry,
        getExportSeries,
        receivedAt,
    };
}
