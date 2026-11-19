import { memo } from "react";
import { Card } from "../../../components/ui/Card";
import type { TelemetryPoint } from "../../../types/telemetry";

type Props = {
  connected: boolean;
  hasTelemetry: boolean;
  latestTelemetry: TelemetryPoint | null;
  packetCount: number;
  lostPacketCount: number;
};

type SignalAssessment = {
  bars: number;
  quality: string;
  tone: "good" | "fair" | "weak" | "none";
};

function assessSignal(
  hasTelemetry: boolean,
  rssi: number | null | undefined,
  deliveryPct: number | null,
): SignalAssessment {
  if (!hasTelemetry) {
    return { bars: 0, quality: "NO SIGNAL", tone: "none" };
  }
  if (typeof rssi === "number" && Number.isFinite(rssi)) {
    if (rssi >= -70) return { bars: 4, quality: "EXCELLENT", tone: "good" };
    if (rssi >= -85) return { bars: 3, quality: "GOOD", tone: "good" };
    if (rssi >= -95) return { bars: 2, quality: "FAIR", tone: "fair" };
    return { bars: 1, quality: "WEAK", tone: "weak" };
  }
  const pct = deliveryPct ?? 100;
  if (pct >= 95) return { bars: 4, quality: "STRONG", tone: "good" };
  if (pct >= 80) return { bars: 3, quality: "FAIR", tone: "fair" };
  if (pct >= 50) return { bars: 2, quality: "WEAK", tone: "weak" };
  return { bars: 1, quality: "POOR", tone: "weak" };
}

export const SignalStrengthCard = memo(function SignalStrengthCard({
  connected,
  hasTelemetry,
  latestTelemetry,
  packetCount,
  lostPacketCount,
}: Props) {
  const rssi = latestTelemetry?.rssi;
  const hasRssi = typeof rssi === "number" && Number.isFinite(rssi);
  const totalPackets = packetCount + lostPacketCount;
  const deliveryPct = totalPackets > 0 ? Math.round((packetCount / totalPackets) * 100) : null;
  const { bars, quality, tone } = assessSignal(hasTelemetry, rssi, deliveryPct);

  const primaryValue = !hasTelemetry
    ? "—"
    : hasRssi
      ? `${Math.round(rssi)} dBm`
      : deliveryPct !== null
        ? `${deliveryPct}%`
        : "—";

  const statusTag = !hasTelemetry ? "NO DATA" : connected ? "LIVE" : "STALE";

  return (
    <Card className="signal-card">
      <div className="section-label">LINK</div>
      <div className="card-title-row">
        <h2>Signal strength</h2>
        <b className={`live-tag${!hasTelemetry ? " no-data" : ""}`}>{statusTag}</b>
      </div>

      <div className="signal-meter-row">
        <div className={`signal-bars ${tone}`} aria-label={`Signal strength ${bars} of 4 bars`}>
          {[1, 2, 3, 4].map((level) => (
            <span key={level} className={level <= bars ? "active" : ""} />
          ))}
        </div>
        <div className="signal-readout">
          <strong>{primaryValue}</strong>
          <small>{hasTelemetry && !hasRssi ? "Link delivery" : "Radio RSSI"}</small>
        </div>
        <span className={`signal-badge ${tone}`}>{quality}</span>
      </div>
    </Card>
  );
});
