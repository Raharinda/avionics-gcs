import { memo } from "react";
type Props = {
    hasTelemetry: boolean;
};
export const MapPanel = memo(function MapPanel(props: Props) {
    const { hasTelemetry } = props;
    return (<article className="card map-card">
              <div className="section-label">POSITION</div>
              <div className="card-title-row">
                <h2>Map view</h2>
                <span className="coordinates">
                  {hasTelemetry
            ? "35.8842° N · 106.3075° W"
            : "NO POSITION DATA"}
                </span>
              </div>
              <div className="map">
                <div className="map-road road-main"/>
                <div className="map-road road-side"/>
                {hasTelemetry && <div className="map-pin"/>}
                <span className="map-scale">
                  {hasTelemetry ? "200 m" : "—"}
                </span>
              </div>
            </article>);
});
