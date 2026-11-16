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
    <div className="card-heading"><span>{title}</span><b className="live-tag">{hasData ? "LIVE" : "NO DATA"}</b></div>
    <strong>{value}</strong>{unit && <small>{unit}</small>}
    <div className={`metric-bar${color ? ` ${color}` : ""}`}><span style={{ width: hasData ? width : "0%" }}/></div>
  </Card>;
});
