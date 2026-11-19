import { memo } from "react";
import { Card } from "../../../components/ui/Card";
type Props = {
    title: string;
    value: string;
    unit?: string;
    hasData: boolean;
    color?: string;
    width?: string;
    showBar?: boolean;
    preserveValue?: boolean;
    preserveBar?: boolean;
    retainStatus?: boolean;
};
export const MetricCard = memo(function MetricCard({ title, value, unit, hasData, color = "", width = "8%", showBar = true, preserveValue = false, preserveBar = false, retainStatus = false }: Props) {
    const statusActive = hasData || retainStatus;
    return <Card className="metric">
    <div className="card-heading"><span>{title}</span><b className={`live-tag${statusActive ? "" : " no-data"}`}>{statusActive ? "LIVE" : "NO DATA"}</b></div>
    <strong>{hasData || preserveValue ? value : "—"}</strong>{unit && <small>{unit}</small>}
    {showBar && <div className={`metric-bar${color ? ` ${color}` : ""}${statusActive ? "" : " no-data"}`}><span style={{ width: hasData || preserveBar ? width : "8%" }}/></div>}
  </Card>;
});
