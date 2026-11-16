import type { FaceId, Quaternion } from "./imu";
import type { SensorMount } from "../data/rocketAxes";
export type RocketModelProps = {
  roll?: number; pitch?: number; yaw?: number; quaternion?: Quaternion | null;
  active?: boolean; mode?: "rocket" | "sensor" | "mounting";
  sensorFace?: FaceId; mounting?: SensorMount; paused?: boolean; darkMode?: boolean;
};
export type RocketSceneState = {
  roll: number; pitch: number; yaw: number; quaternion: Quaternion | null;
  active: boolean; mode: "rocket" | "sensor" | "mounting"; sensorFace: FaceId;
  mounting?: SensorMount; paused: boolean; darkMode: boolean;
};
