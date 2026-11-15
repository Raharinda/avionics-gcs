export type Phase = "Initialization" | "Flight" | "Recovery";
export type CommandState = "safe" | "armed" | "firing" | "complete";

export type TelemetryPoint = {
  time: number;
  temperature: number;
  pressure: number;
  acceleration: number;
  altitude: number;
};
