use serde::{Deserialize, Serialize};
use serialport::SerialPort;
use std::fs;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, State};

struct SerialState {
    stop: Mutex<Option<Arc<std::sync::atomic::AtomicBool>>>,
    command_port: Mutex<Option<Arc<Mutex<Box<dyn SerialPort>>>>>,
}

#[derive(Clone, Serialize)]
struct SerialPortInfo {
    name: String,
    description: Option<String>,
}

#[derive(Deserialize)]
struct RawTelemetryMessage {
    temperature: f64,
    pressure: f64,
    #[serde(rename = "accelX")]
    accel_x: f64,
    #[serde(rename = "accelY")]
    accel_y: f64,
    #[serde(rename = "accelZ")]
    accel_z: f64,
    #[serde(rename = "gyroX")]
    gyro_x: f64,
    #[serde(rename = "gyroY")]
    gyro_y: f64,
    #[serde(rename = "gyroZ")]
    gyro_z: f64,
}

#[derive(Clone, Serialize)]
struct TelemetryMessage {
    temperature: f64,
    pressure: f64,
    acceleration: f64,
    gyroscope: f64,
    altitude: f64,
    #[serde(rename = "accelX")]
    accel_x: f64,
    #[serde(rename = "accelY")]
    accel_y: f64,
    #[serde(rename = "accelZ")]
    accel_z: f64,
    roll: f64,
    pitch: f64,
    yaw: f64,
}

impl From<RawTelemetryMessage> for TelemetryMessage {
    fn from(raw: RawTelemetryMessage) -> Self {
        let acceleration =
            (raw.accel_x.powi(2) + raw.accel_y.powi(2) + raw.accel_z.powi(2)).sqrt() / 9.80665;
        let gyroscope =
            (raw.gyro_x.powi(2) + raw.gyro_y.powi(2) + raw.gyro_z.powi(2)).sqrt() * 57.295779513;
        let altitude = 44330.0 * (1.0 - (raw.pressure / 1013.25).powf(0.19029495));
        let roll = raw.accel_y.atan2(raw.accel_z).to_degrees();
        let pitch = (-raw.accel_x)
            .atan2((raw.accel_y.powi(2) + raw.accel_z.powi(2)).sqrt())
            .to_degrees();

        Self {
            temperature: raw.temperature,
            pressure: raw.pressure,
            acceleration,
            gyroscope,
            altitude,
            accel_x: raw.accel_x,
            accel_y: raw.accel_y,
            accel_z: raw.accel_z,
            roll,
            pitch,
            yaw: 0.0,
        }
    }
}

#[tauri::command]
fn start_serial_listener(
    port_name: String,
    state: State<'_, SerialState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    stop_current_listener(&state)?;

    let mut last_error = None;
    let port = (0..3).find_map(|_| {
        match serialport::new(&port_name, 115_200)
            .timeout(Duration::from_millis(250))
            .open()
        {
            Ok(port) => Some(port),
            Err(error) => {
                last_error = Some(error.to_string());
                thread::sleep(Duration::from_millis(300));
                None
            }
        }
    }).ok_or_else(|| {
        format!(
            "Failed to open {port_name}: {}. Close Arduino/PlatformIO Serial Monitor and retry.",
            last_error.unwrap_or_else(|| "unknown serial error".to_string())
        )
    })?;
    let command_port =
        Arc::new(Mutex::new(port.try_clone().map_err(|error| {
            format!("Failed to prepare serial commands: {error}")
        })?));

    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    {
        let mut current = state
            .stop
            .lock()
            .map_err(|_| "Serial state unavailable".to_string())?;
        *current = Some(stop);
    }
    {
        let mut current = state
            .command_port
            .lock()
            .map_err(|_| "Serial state unavailable".to_string())?;
        *current = Some(command_port);
    }

    thread::spawn(move || {
        read_serial_lines(port, thread_stop, app);
    });

    Ok(format!("Listening on {port_name}"))
}

#[tauri::command]
fn stop_serial_listener(state: State<'_, SerialState>) -> Result<(), String> {
    stop_current_listener(&state)?;
    let mut command_port = state
        .command_port
        .lock()
        .map_err(|_| "Serial state unavailable".to_string())?;
    *command_port = None;
    Ok(())
}

#[tauri::command]
fn send_serial_command(command: String, state: State<'_, SerialState>) -> Result<(), String> {
    let command_port = state
        .command_port
        .lock()
        .map_err(|_| "Serial state unavailable".to_string())?
        .clone()
        .ok_or_else(|| "Serial port is not connected".to_string())?;
    let mut port = command_port
        .lock()
        .map_err(|_| "Serial command port unavailable".to_string())?;
    port.write_all(format!("{command}\n").as_bytes())
        .map_err(|error| format!("Failed to send serial command: {error}"))
}

#[tauri::command]
fn list_serial_ports() -> Result<Vec<SerialPortInfo>, String> {
    serialport::available_ports()
        .map_err(|error| format!("Failed to enumerate serial ports: {error}"))
        .map(|ports| {
            ports
                .into_iter()
                .map(|port| SerialPortInfo {
                    name: port.port_name,
                    description: match port.port_type {
                        serialport::SerialPortType::UsbPort(info) => {
                            info.product.or(info.manufacturer)
                        }
                        serialport::SerialPortType::BluetoothPort { .. } => None,
                        _ => None,
                    },
                })
                .collect()
        })
}

#[tauri::command]
fn export_telemetry_csv(csv: String, path: String) -> Result<String, String> {
    fs::write(&path, csv).map_err(|error| format!("Failed to save CSV: {error}"))?;
    Ok(path)
}

fn extract_json(raw: &str) -> Option<&str> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    (end >= start).then(|| &raw[start..=end])
}

fn stop_current_listener(state: &SerialState) -> Result<(), String> {
    let current = state
        .stop
        .lock()
        .map_err(|_| "Serial state unavailable".to_string())?
        .take();
    if let Some(stop) = current {
        stop.store(true, std::sync::atomic::Ordering::Relaxed);
    }
    Ok(())
}

fn read_serial_lines(
    mut port: Box<dyn SerialPort>,
    stop: Arc<std::sync::atomic::AtomicBool>,
    app: tauri::AppHandle,
) {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 256];
    while !stop.load(std::sync::atomic::Ordering::Relaxed) {
        match port.read(&mut chunk) {
            Ok(0) => continue,
            Ok(count) => {
                buffer.extend_from_slice(&chunk[..count]);
                while let Some(newline) = buffer.iter().position(|byte| *byte == b'\n') {
                    let line = buffer.drain(..=newline).collect::<Vec<_>>();
                    let raw = String::from_utf8_lossy(&line).trim().to_owned();
                    if raw.is_empty() {
                        continue;
                    }
                    let _ = app.emit("serial_line", raw.clone());
                    let Some(json) = extract_json(&raw) else {
                        continue;
                    };
                    match serde_json::from_str::<RawTelemetryMessage>(json) {
                        Ok(raw) => {
                            let message = TelemetryMessage::from(raw);
                            let _ = app.emit("telemetry", message);
                        }
                        Err(error) => {
                            let _ = app
                                .emit("serial_error", format!("Invalid telemetry JSON: {error}"));
                        }
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::TimedOut => continue,
            Err(_) => break,
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(SerialState {
            stop: Mutex::new(None),
            command_port: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            start_serial_listener,
            stop_serial_listener,
            send_serial_command,
            export_telemetry_csv
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
