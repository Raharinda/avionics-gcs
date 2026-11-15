mod serial;
mod telemetry;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(serial::SerialState::default())
        .invoke_handler(tauri::generate_handler![serial::serial_ports, serial::serial_connect, serial::serial_disconnect])
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                let _ = window.state::<serial::SerialState>().disconnect(None);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
