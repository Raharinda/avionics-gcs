import { invoke } from "@tauri-apps/api/core";
import type { SerialPortInfo } from "../types/serial";
export const listSerialPorts = () => invoke<SerialPortInfo[]>("list_serial_ports");
export const startSerialListener = (portName: string) => invoke<string>("start_serial_listener", { portName });
export const stopSerialListener = () => invoke<void>("stop_serial_listener");
export const sendSerialCommand = (command: string) => invoke<void>("send_serial_command", { command });
