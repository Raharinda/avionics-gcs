import { useEffect, useState } from "react";
export function useTelemetryFreshness(receivedAt: number | null, maximumAgeMs = 1500) {
    const [expiredTimestamp, setExpiredTimestamp] = useState<number | null>(null);
    useEffect(() => {
        if (receivedAt === null) {
            return;
        }
        const remaining = maximumAgeMs - (Date.now() - receivedAt);
        const timer = window.setTimeout(() => setExpiredTimestamp(receivedAt), Math.max(0, remaining));
        return () => window.clearTimeout(timer);
    }, [receivedAt, maximumAgeMs]);
    return receivedAt !== null && expiredTimestamp !== receivedAt && Date.now() - receivedAt < maximumAgeMs;
}
