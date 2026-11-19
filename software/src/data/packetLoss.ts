import type { TelemetryPoint } from "../types/telemetry";

const MIN_INTERVAL_MS = 20;
const MAX_OBSERVED_GAPS = 25;
const ROLLOVER_HIGH = 0xfff00000;
const ROLLOVER_LOW = 0x100000;
const UINT32_SPAN = 0x100000000;

export function timestampGapMs(previousMs: number, currentMs: number): number {
  let gap = currentMs - previousMs;
  if (gap < 0 && previousMs > ROLLOVER_HIGH && currentMs < ROLLOVER_LOW) {
    gap += UINT32_SPAN;
  }
  return gap;
}

function estimateIntervalMs(gaps: number[]): number | null {
  if (gaps.length === 0) return null;
  const sorted = [...gaps].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.25)];
}

function lossThresholdMs(nominalMs: number): number {
  return Math.max(nominalMs * 1.5, nominalMs + 40);
}

export class PacketLossTracker {
  private lastTimestampMs: number | null = null;
  private observedGaps: number[] = [];
  private lostPackets = 0;

  get totalLost(): number {
    return this.lostPackets;
  }

  reset() {
    this.lastTimestampMs = null;
    this.observedGaps = [];
    this.lostPackets = 0;
  }

  record(timestampMs?: number | null): number {
    if (typeof timestampMs !== "number" || !Number.isFinite(timestampMs)) {
      return this.lostPackets;
    }
    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = timestampMs;
      return this.lostPackets;
    }
    const gapMs = timestampGapMs(this.lastTimestampMs, timestampMs);
    this.lastTimestampMs = timestampMs;
    if (gapMs < MIN_INTERVAL_MS) {
      return this.lostPackets;
    }

    const nominal = estimateIntervalMs(this.observedGaps);
    if (nominal === null) {
      this.observedGaps.push(gapMs);
      return this.lostPackets;
    }

    if (gapMs < nominal * 0.75) {
      this.observedGaps = [gapMs];
      return this.lostPackets;
    }

    if (gapMs > lossThresholdMs(nominal)) {
      const expectedIntervals = Math.round(gapMs / nominal);
      this.lostPackets += Math.max(0, expectedIntervals - 1);
    } else {
      this.observedGaps.push(gapMs);
      if (this.observedGaps.length > MAX_OBSERVED_GAPS) {
        this.observedGaps.shift();
      }
    }
    return this.lostPackets;
  }
}

export function calculateLostPackets(series: TelemetryPoint[]): number {
  const timestamps = series
    .map((point) => point.timestampMs)
    .filter((timestamp): timestamp is number => typeof timestamp === "number" && Number.isFinite(timestamp));

  if (timestamps.length < 2) return 0;

  const gaps: number[] = [];
  for (let index = 1; index < timestamps.length; index++) {
    const gapMs = timestampGapMs(timestamps[index - 1], timestamps[index]);
    if (gapMs >= MIN_INTERVAL_MS) gaps.push(gapMs);
  }

  const nominal = estimateIntervalMs(gaps);
  if (nominal === null) return 0;

  const threshold = lossThresholdMs(nominal);
  let lostPackets = 0;
  for (const gapMs of gaps) {
    if (gapMs <= threshold) continue;
    const expectedIntervals = Math.round(gapMs / nominal);
    lostPackets += Math.max(0, expectedIntervals - 1);
  }
  return lostPackets;
}
