import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { SerialLogBuffer } from "../../../data/serialLogBuffer";
export function useSerialLog(resetVersion: number) {
    const [buffer] = useState(() => new SerialLogBuffer());
    const [rawSerialLine, setRawSerialLine] = useState("");
    const [rawSerialHistory, setHistory] = useState<string[]>([]);
    useEffect(() => {
        buffer.clear();
        setRawSerialLine("");
        setHistory([]);
    }, [buffer, resetVersion]);
    useEffect(() => {
        let disposed = false;
        let unlisten: (() => void) | undefined;
        listen<string>("serial_line", ({ payload }) => { if (!disposed)
            buffer.append(payload); })
            .then((cleanup) => { if (disposed)
            cleanup();
        else
            unlisten = cleanup; });
        let historyVersion = -1;
        // Only this panel updates for raw lines; no dashboard render per serial frame.
        const historyTimer = window.setInterval(() => {
            const snapshot = buffer.readHistory(historyVersion);
            if (snapshot) {
                historyVersion = snapshot.version;
                setHistory(snapshot.lines);
            }
        }, 1000);
        const frameTimer = window.setInterval(() => setRawSerialLine(buffer.readFrame()), 1000);
        return () => { disposed = true; unlisten?.(); window.clearInterval(historyTimer); window.clearInterval(frameTimer); };
    }, [buffer]);
    const clearHistory = useCallback(() => { buffer.clearHistory(); setHistory([]); }, [buffer]);
    return { rawSerialLine, rawSerialHistory, clearHistory };
}
