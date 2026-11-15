use serde::{Deserialize, Serialize};
use serialport::SerialPort;
use std::io::{BufRead, BufReader};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, State};

struct SerialState {
    stop: Mutex<Option<Arc<std::sync::atomic::AtomicBool>>>,
}

#[derive(Clone, Serialize)]
struct SerialPortInfo {
    name: String,
    description: Option<String>,
}

#[derive(Clone, Deserialize, Serialize)]
struct TelemetryMessage {
    temperature: f64,
    pressure: f64,
    acceleration: f64,
    altitude: f64,
}

#[tauri::command]
fn start_serial_listener(
    port_name: String,
    state: State<'_, SerialState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    stop_current_listener(&state)?;

    let port = serialport::new(&port_name, 115_200)
        .timeout(Duration::from_millis(250))
        .open()
        .map_err(|error| format!("Failed to open {port_name}: {error}"))?;

    let stop = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let thread_stop = Arc::clone(&stop);
    {
        let mut current = state.stop.lock().map_err(|_| "Serial state unavailable".to_string())?;
        *current = Some(stop);
    }

    thread::spawn(move || {
        read_serial_lines(port, thread_stop, app);
    });

    Ok(format!("Listening on {port_name}"))
}

#[tauri::command]
fn stop_serial_listener(state: State<'_, SerialState>) -> Result<(), String> {
    stop_current_listener(&state)
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
    port: Box<dyn SerialPort>,
    stop: Arc<std::sync::atomic::AtomicBool>,
    app: tauri::AppHandle,
) {
    let mut reader = BufReader::new(port);
    let mut line = String::new();
    while !stop.load(std::sync::atomic::Ordering::Relaxed) {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) => continue,
            Ok(_) => {
                if let Ok(message) = serde_json::from_str::<TelemetryMessage>(line.trim()) {
                    let _ = app.emit("telemetry", message);
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
        .manage(SerialState { stop: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            list_serial_ports,
            start_serial_listener,
            stop_serial_listener
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
