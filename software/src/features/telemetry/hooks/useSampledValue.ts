import { useEffect, useRef, useState } from "react";
// A fixed sampling interval avoids starving the charts during continuous input.
export function useSampledValue<T>(value: T, intervalMs: number) {
    const latest = useRef(value);
    latest.current = value;
    const [sampled, setSampled] = useState(value);
    useEffect(() => {
        const timer = window.setInterval(() => setSampled(latest.current), intervalMs);
        return () => window.clearInterval(timer);
    }, [intervalMs]);
    return sampled;
}
