import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Gpio19Command, type GpioSnapshot } from "../../../data/gpio19Command";
import { sendSerialCommand } from "../../../services/serialConnection";

export function useGpio19Command(connected: boolean, source: string, setLog: (line: string) => void) {
    const [snapshot, setSnapshot] = useState<GpioSnapshot>({ state: "safe", sent: false, message: "" });
    const [listening, setListening] = useState(false);
    const controller = useRef<Gpio19Command | null>(null);
    useEffect(() => {
        let disposed = false;
        let unlisten: (() => void) | undefined;
        setListening(false);
        setSnapshot({ state: "safe", sent: false, message: "" });
        if (!connected) return;
        const command = new Gpio19Command(sendSerialCommand, next => {
            if (disposed) return;
            setSnapshot(next);
            setLog(next.message);
        });
        controller.current = command;
        void listen<{ sourcePort: string; line: string }>("serial_control", ({ payload }) => {
            if (!disposed && payload.sourcePort === source.split(" · ")[0]) command.receive(payload.line);
        }).then(stop => {
            if (disposed) stop();
            else { unlisten = stop; setListening(true); }
        }).catch(error => { if (!disposed) setLog(`D19 listener gagal: ${String(error)}`); });
        return () => { disposed = true; unlisten?.(); command.dispose(); controller.current = null; };
    }, [connected, source, setLog]);
    const ready = connected && listening;
    const arm = useCallback(() => { if (ready) controller.current?.arm(); }, [ready]);
    const disarm = useCallback(() => { if (ready) controller.current?.disarm(); }, [ready]);
    const fire = useCallback((ms: number) => { if (ready) void controller.current?.fire(ms); }, [ready]);
    const reset = useCallback(() => { if (ready) void controller.current?.reset(); }, [ready]);
    return { ...snapshot, ready, arm, disarm, fire, reset };
}
