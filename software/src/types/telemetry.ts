export type Phase = "Initialization" | "Flight" | "Recovery";
export type CommandState = "safe" | "armed" | "firing" | "complete";

export type TelemetryPoint = {
  time: number;
  temperature: number;
  pressure: number;
  acceleration: number;
  gyroscope: number;
  altitude: number;
  accelX: number;
  accelY: number;
  accelZ: number;
  roll: number;
  pitch: number;
  yaw: number;
};
