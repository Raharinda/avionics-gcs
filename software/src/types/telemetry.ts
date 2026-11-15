export type Phase = "Initialization" | "Flight" | "Recovery";
export type CommandState = "safe" | "armed" | "firing" | "complete";

export type TelemetryPoint = {
  time: number;
  temperature: number | null;
  pressure: number | null;
  acceleration: number | null;
  gyroscope: number | null;
  altitude: number | null;
  mpuTemperature: number | null;
  accelZ: number | null;
  gyroZ: number | null;
  accel: [number, number, number] | null;
  gyro: [number, number, number] | null;
  roll: number | null;
  pitch: number | null;
  descentRate: number | null;
};

export type SerialSample = {
  kind: "sample";
  elapsed_ms: number;
  accel_mps2: [number, number, number] | null;
  gyro_rads: [number, number, number] | null;
  mpu_temperature_c: number | null;
  temperature_c: number | null;
  pressure_hpa: number | null;
};

export type SerialEvent = SerialSample
  | { kind: "log"; line: string }
  | { kind: "closed"; error: string | null };

export type SerialPortInfo = { name: string; label: string; usb: boolean };
