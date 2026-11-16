import { memo, useEffect, useState } from "react";
export const LaptopClock = memo(function LaptopClock({ synchronizedAt }: {
    synchronizedAt: number;
}) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        setNow(new Date());
        const timer = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(timer);
    }, [synchronizedAt]);
    const laptopTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    return <div className="utc"><b>{laptopTime}</b><span>LAPTOP TIME</span></div>;
});
