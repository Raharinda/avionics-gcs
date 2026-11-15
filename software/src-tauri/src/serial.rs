use crate::telemetry::{Decoder, Record, Sample};
use serde::Serialize;
use serialport::SerialPortType;
use std::{
    io::Read,
    sync::{Arc, Mutex, atomic::{AtomicBool, Ordering}},
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use tauri::{State, ipc::Channel};

#[derive(Serialize)]
pub struct PortInfo {
    name: String,
    label: String,
    usb: bool,
}

#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SerialEvent {
    Sample {
        elapsed_ms: u64,
        accel_mps2: Option<[f64; 3]>,
        gyro_rads: Option<[f64; 3]>,
        mpu_temperature_c: Option<f64>,
        temperature_c: Option<f64>,
        pressure_hpa: Option<f64>,
    },
    Log { line: String },
    Closed { error: Option<String> },
}

impl From<Sample> for SerialEvent {
    fn from(sample: Sample) -> Self {
        Self::Sample {
            elapsed_ms: sample.elapsed_ms,
            accel_mps2: sample.accel_mps2,
            gyro_rads: sample.gyro_rads,
            mpu_temperature_c: sample.mpu_temperature_c,
            temperature_c: sample.temperature_c,
            pressure_hpa: sample.pressure_hpa,
        }
    }
}

struct Reader {
    session_id: String,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Drop for Reader {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

#[derive(Clone, Default)]
pub struct SerialState(Arc<Mutex<Option<Reader>>>);

#[tauri::command]
pub fn serial_ports() -> Result<Vec<PortInfo>, String> {
    let mut ports: Vec<_> = serialport::available_ports().map_err(|error| error.to_string())?
        .into_iter().map(|port| {
            let (label, usb) = match port.port_type {
                SerialPortType::UsbPort(info) => (
                    format!("{} · {}", port.port_name, info.product.as_deref().unwrap_or("USB Serial")), true,
                ),
                _ => (port.port_name.clone(), false),
            };
            PortInfo { name: port.port_name, label, usb }
        }).collect();
    ports.sort_by(|a, b| b.usb.cmp(&a.usb).then(a.name.cmp(&b.name)));
    Ok(ports)
}

impl SerialState {
    pub fn disconnect(&self, session_id: Option<&str>) -> Result<(), String> {
        let mut reader = self.0.lock().map_err(|_| "Serial state is unavailable".to_string())?;
        if reader.as_ref().is_some_and(|reader| session_id.is_none_or(|id| id == reader.session_id)) {
            reader.take(); // Drop stops and joins the old reader before another port is opened.
        }
        Ok(())
    }

    fn connect(&self, port: Option<String>, session_id: String, on_event: Channel<SerialEvent>) -> Result<String, String> {
        let ports = serial_ports()?;
        let port = match port.filter(|port| !port.is_empty()) {
            Some(name) if ports.iter().any(|port| port.name == name) => name,
            Some(_) => return Err("Port no longer available. Refresh the port list.".into()),
            None => {
                let usb: Vec<_> = ports.iter().filter(|port| port.usb).collect();
                match usb.as_slice() {
                    [port] => port.name.clone(),
                    [] => return Err("No USB Serial device found. Connect ESP32 and refresh ports.".into()),
                    _ => return Err("Multiple USB Serial devices found. Select the ESP32 port.".into()),
                }
            }
        };
        let mut reader = self.0.lock().map_err(|_| "Serial state is unavailable".to_string())?;
        reader.take();
        let mut device = serialport::new(&port, 115200)
            .timeout(Duration::from_millis(100))
            .flow_control(serialport::FlowControl::None)
            .open().map_err(|error| format!("Cannot open {port}: {error}. Close PlatformIO Serial Monitor and check device permissions."))?;
        let stop = Arc::new(AtomicBool::new(false));
        let worker_stop = Arc::clone(&stop);
        let thread = thread::Builder::new().name("esp32-serial".into()).spawn(move || {
            let mut decoder = Decoder::default();
            let mut buffer = [0u8; 1024];
            let mut error = None;
            let mut log_window = Instant::now();
            let mut log_count = 0;
            'read: while !worker_stop.load(Ordering::Acquire) {
                match device.read(&mut buffer) {
                    Ok(0) => { error = Some("Serial device disconnected".into()); break; }
                    Ok(count) => {
                        for record in decoder.feed(&buffer[..count]) {
                            let event = match record {
                                Record::Sample(sample) => SerialEvent::from(sample),
                                Record::Log(line) => {
                                    if log_window.elapsed() >= Duration::from_secs(1) {
                                        log_window = Instant::now();
                                        log_count = 0;
                                    }
                                    if log_count >= 20 { continue; }
                                    log_count += 1;
                                    SerialEvent::Log { line }
                                }
                            };
                            if on_event.send(event).is_err() { break 'read; }
                        }
                    }
                    Err(error) if matches!(error.kind(), std::io::ErrorKind::TimedOut | std::io::ErrorKind::Interrupted | std::io::ErrorKind::WouldBlock) => {}
                    Err(cause) => { error = Some(format!("Serial connection lost: {cause}")); break; }
                }
            }
            drop(device);
            let _ = on_event.send(SerialEvent::Closed { error });
        }).map_err(|error| error.to_string())?;
        *reader = Some(Reader { session_id, stop, thread: Some(thread) });
        Ok(port)
    }
}

#[tauri::command]
pub async fn serial_connect(state: State<'_, SerialState>, port: Option<String>, session_id: String, on_event: Channel<SerialEvent>) -> Result<String, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.connect(port, session_id, on_event))
        .await.map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn serial_disconnect(state: State<'_, SerialState>, session_id: String) -> Result<(), String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || state.disconnect(Some(&session_id)))
        .await.map_err(|error| error.to_string())?
}
