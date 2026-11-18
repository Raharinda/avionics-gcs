import { memo } from "react";
import { Card } from "../../../components/ui/Card";
type Props = {
    title: string;
    value: string;
    unit?: string;
    hasData: boolean;
    color?: string;
    width: string;
};
export const MetricCard = memo(function MetricCard({ title, value, unit, hasData, color = "", width }: Props) {
    return <Card className="metric">
    <div className="card-heading"><span>{title}</span><b className={`live-tag${hasData ? "" : " no-data"}`}>{hasData ? "LIVE" : "NO DATA"}</b></div>
    <strong>{hasData ? value : "—"}</strong>{unit && <small>{unit}</small>}
    <div className={`metric-bar${color ? ` ${color}` : ""}${hasData ? "" : " no-data"}`}><span style={{ width: hasData ? width : "8%" }}/></div>
  </Card>;
});
