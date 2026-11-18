import { useEffect, useRef, useState } from "react";
// A fixed sampling interval avoids starving the charts during continuous input.
export function useSampledValue<T>(value: T, intervalMs: number, resetKey?: string | null) {
    const latest = useRef(value);
    latest.current = value;
    const [sampled, setSampled] = useState({ value, key: resetKey });
    useEffect(() => {
        const update = () => setSampled((current) => current.key === resetKey && Object.is(current.value, latest.current)
            ? current : { value: latest.current, key: resetKey });
        update();
        const timer = window.setInterval(update, intervalMs);
        return () => window.clearInterval(timer);
    }, [intervalMs, resetKey]);
    return sampled.key === resetKey ? sampled.value : value;
}
