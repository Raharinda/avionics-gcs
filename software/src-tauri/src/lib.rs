mod attitude;
mod altitude;

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
    is_usb: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SerialControlLine {
    source_port: String,
    line: String,
}

#[derive(Deserialize)]
struct RawTelemetryMessage {
    temperature: f64,
    pressure: Option<f64>,
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
    #[serde(default, rename = "timestampMs")]
    timestamp_ms: Option<u64>,
    #[serde(default, rename = "imuValid")]
    imu_valid: Option<bool>,
    #[serde(default)]
    calibrated: bool,
    #[serde(default, rename = "referenceSet")]
    reference_set: bool,
    #[serde(default)]
    orientation: Option<[f64; 4]>, // firmware quaternion [w, x, y, z]
}

#[derive(Clone, Serialize)]
struct TelemetryMessage {
    temperature: f64,
    pressure: Option<f64>,
    acceleration: f64,
    gyroscope: f64,
    altitude: Option<f64>,
    #[serde(rename = "accelX")]
    accel_x: f64,
    #[serde(rename = "accelY")]
    accel_y: f64,
    #[serde(rename = "accelZ")]
    accel_z: f64,
    roll: f64,
    pitch: f64,
    yaw: f64,
    #[serde(rename = "timestampMs")]
    timestamp_ms: Option<u64>,
    #[serde(rename = "imuValid")]
    imu_valid: bool,
    calibrated: bool,
    #[serde(rename = "referenceSet")]
    reference_set: bool,
    orientation: Option<[f64; 4]>,
    #[serde(rename = "sourcePort")]
    source_port: String,
}

impl TelemetryMessage {
    fn from_raw(raw: RawTelemetryMessage, altitude_reference: &mut altitude::AltitudeReference) -> Result<Self, &'static str> {
        if raw.imu_valid == Some(false) { return Err("MPU6050 sample marked invalid by firmware"); }
        if ![raw.temperature, raw.accel_x, raw.accel_y, raw.accel_z,
             raw.gyro_x, raw.gyro_y, raw.gyro_z].iter().all(|value| value.is_finite()) {
            return Err("Non-finite sensor measurement");
        }
        let acceleration = raw.accel_x.hypot(raw.accel_y).hypot(raw.accel_z) / 9.80665;
        let gyroscope = raw.gyro_x.hypot(raw.gyro_y).hypot(raw.gyro_z).to_degrees();
        let pressure = raw.pressure.filter(|value| value.is_finite() && *value > 0.0);
        let altitude = altitude_reference.read(pressure);
        let orientation = raw.orientation.filter(|_| raw.calibrated && raw.reference_set)
            .and_then(attitude::normalize_quaternion);
        let [roll, pitch, yaw] = orientation.map(attitude::euler_degrees).unwrap_or([
            raw.accel_y.atan2(raw.accel_z).to_degrees(),
            (-raw.accel_x).atan2(raw.accel_y.hypot(raw.accel_z)).to_degrees(), 0.0,
        ]);
        Ok(Self {
            temperature: raw.temperature, pressure, acceleration, gyroscope, altitude,
            accel_x: raw.accel_x, accel_y: raw.accel_y, accel_z: raw.accel_z,
            roll, pitch, yaw, timestamp_ms: raw.timestamp_ms,
            imu_valid: true, calibrated: raw.calibrated,
            reference_set: orientation.is_some(), orientation, source_port: String::new(),
        })
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

    let reader_port_name = port_name.clone();
    thread::spawn(move || {
        read_serial_lines(port, thread_stop, app, reader_port_name);
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
                .map(|port| {
                    let (description, is_usb) = match port.port_type {
                        serialport::SerialPortType::UsbPort(info) => {
                            (info.product.or(info.manufacturer), true)
                        }
                        _ => (None, false),
                    };
                    SerialPortInfo {
                        name: port.port_name,
                        description,
                        is_usb,
                    }
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
    port_name: String,
) {
    let mut altitude_reference = altitude::AltitudeReference::default();
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 256];
    while !stop.load(std::sync::atomic::Ordering::Relaxed) {
        match port.read(&mut chunk) {
            Ok(0) => continue,
            Ok(count) => {
                buffer.extend_from_slice(&chunk[..count]);
                if buffer.len() > 8192 {
                    buffer.clear();
                    let _ = app.emit("serial_error", "Discarded oversized Serial frame");
                    continue;
                }
                while let Some(newline) = buffer.iter().position(|byte| *byte == b'\n') {
                    let line = buffer.drain(..=newline).collect::<Vec<_>>();
                    let raw = String::from_utf8_lossy(&line).trim().to_owned();
                    if raw.is_empty() {
                        continue;
                    }
                    let _ = app.emit("serial_line", raw.clone());
                    if raw.starts_with("IMU_STATE:") || raw.starts_with("CALIBRATION_") || raw.starts_with("REFERENCE_SET:") {
                        let _ = app.emit("serial_control", SerialControlLine { source_port: port_name.clone(), line: raw.clone() });
                    }
                    if !raw.starts_with('{') { continue; }
                    let Some(json) = extract_json(&raw) else {
                        continue;
                    };
                    match serde_json::from_str::<RawTelemetryMessage>(json) {
                        Ok(raw) => {
                            match TelemetryMessage::from_raw(raw, &mut altitude_reference) {
                                Ok(mut message) => {
                                    message.source_port = port_name.clone();
                                    let _ = app.emit("telemetry", message);
                                }
                                Err(error) => { let _ = app.emit("serial_error", error); }
                            }
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

#[cfg(test)]
mod telemetry_tests {
    use super::*;
    use serde_json::{Value, json};

    fn sample() -> Value {
        json!({"temperature":29.5,"pressure":994.4,
            "accelX":0.0,"accelY":0.0,"accelZ":9.80665,
            "gyroX":0.0,"gyroY":0.0,"gyroZ":0.0,
            "timestampMs":351583,"imuValid":true,"calibrated":true,"referenceSet":true,
            "orientation":[0.70710678,0.0,0.0,0.70710678]})
    }
    fn convert(value: Value) -> Result<TelemetryMessage, &'static str> {
        convert_session(value, &mut altitude::AltitudeReference::default())
    }
    fn convert_session(value: Value, reference: &mut altitude::AltitudeReference) -> Result<TelemetryMessage, &'static str> {
        TelemetryMessage::from_raw(serde_json::from_value::<RawTelemetryMessage>(value).unwrap(), reference)
    }

    #[test]
    fn real_quaternion_and_board_time_reach_frontend() {
        let telemetry=convert(sample()).unwrap();
        assert!((telemetry.yaw-90.0).abs()<1e-6);
        assert!(telemetry.roll.abs()<1e-6 && telemetry.pitch.abs()<1e-6);
        assert!(telemetry.reference_set && telemetry.calibrated && telemetry.imu_valid);
        assert_eq!(telemetry.timestamp_ms,Some(351583));
        assert!((telemetry.acceleration-1.0).abs()<1e-6);
        let serialized=serde_json::to_value(telemetry).unwrap();
        assert!(serialized["orientation"].is_array());
        assert_eq!(serialized["referenceSet"],true);
    }
    #[test]
    fn calibration_and_reference_are_required_for_live_attitude() {
        for flag in ["calibrated","referenceSet"] {
            let mut value=sample(); value[flag]=json!(false);
            let telemetry=convert(value).unwrap();
            assert!(!telemetry.reference_set && telemetry.orientation.is_none());
        }
        let mut value=sample(); value["orientation"]=json!([0.0,0.0,0.0,0.0]);
        assert!(!convert(value).unwrap().reference_set);
    }
    #[test]
    fn failed_imu_sample_is_not_published_as_zero_readings() {
        let mut value=sample(); value["imuValid"]=json!(false);
        assert!(convert(value).is_err());
        let mut raw: RawTelemetryMessage=serde_json::from_value(sample()).unwrap();
        raw.accel_z=f64::NAN;
        assert!(TelemetryMessage::from_raw(raw, &mut altitude::AltitudeReference::default()).is_err());
    }
    #[test]
    fn absent_barometer_does_not_discard_valid_attitude() {
        let mut value=sample(); value["pressure"]=Value::Null;
        let telemetry=convert(value).unwrap();
        assert!(telemetry.pressure.is_none() && telemetry.altitude.is_none());
        assert!(telemetry.orientation.is_some());
    }
    #[test]
    fn old_firmware_cannot_claim_calibrated_3d_heading() {
        let mut value=sample();
        for key in ["timestampMs","imuValid","calibrated","referenceSet","orientation"] {
            value.as_object_mut().unwrap().remove(key);
        }
        let telemetry=convert(value).unwrap();
        assert!(!telemetry.calibrated && !telemetry.reference_set);
        assert!(telemetry.orientation.is_none());
    }
    #[test]
    fn altitude_is_zeroed_on_first_valid_pressure_of_each_start() {
        let mut reference = altitude::AltitudeReference::default();
        let mut value = sample();
        value["pressure"] = Value::Null;
        let missing = convert_session(value.clone(), &mut reference).unwrap();
        assert!(missing.altitude.is_none() && missing.orientation.is_some());

        value["pressure"] = json!(1010.0);
        value["imuValid"] = json!(false);
        assert!(convert_session(value.clone(), &mut reference).is_err());
        let first = convert_session(sample(), &mut reference).unwrap();
        assert_eq!(first.altitude, Some(0.0));

        value["imuValid"] = json!(true);
        value["pressure"] = json!(990.0);
        let higher = convert_session(value.clone(), &mut reference).unwrap();
        assert!(higher.altitude.unwrap() > 0.0);
        assert_eq!(higher.pressure, Some(990.0));
        assert_eq!(higher.timestamp_ms, first.timestamp_ms);
        assert_eq!(higher.orientation, first.orientation);

        let mut restarted = altitude::AltitudeReference::default();
        assert_eq!(convert_session(value, &mut restarted).unwrap().altitude, Some(0.0));
    }
}
