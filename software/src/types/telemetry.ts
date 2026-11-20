export type Phase = "Initialization" | "Flight" | "Recovery";
export type CommandState = "safe" | "armed" | "firing" | "complete" | "error";

export type TelemetryPoint = {
  time: number;
  temperature: number;
  pressure: number | null;
  acceleration: number;
  gyroscope: number;
  altitude: number | null;
  accelX: number;
  accelY: number;
  accelZ: number;
  roll: number;
  pitch: number;
  yaw: number;
  orientation?: [number, number, number, number] | null;
  calibrated?: boolean;
  referenceSet?: boolean;
  imuValid?: boolean;
  barometerValid?: boolean;
  timestampMs?: number | null;
  rssi?: number | null;
  sourcePort?: string;
};
