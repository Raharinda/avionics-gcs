import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { parseCalibrationProgress, parseImuState } from "../data/imuProtocol";
import type { CalibrationProgress, FaceId, ImuState } from "../types/imu";

const EMPTY: CalibrationProgress = { active: false, face: null, samples: 0, target: 200, completed: [] };

export function useImuCalibration(connected: boolean, source: string, sendCommand: (command: string) => Promise<void>) {
  const [state, setState] = useState<ImuState | null>(null);
  const [progress, setProgress] = useState<CalibrationProgress>(EMPTY);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("Hubungkan ESP32 untuk membaca profil kalibrasi.");
  const transport = useRef({ connected, sendCommand });
  transport.current = { connected, sendCommand };
  const session = useRef(0);
  const ackTimer = useRef<number | undefined>(undefined);
  const acknowledge = useCallback(() => {
    window.clearTimeout(ackTimer.current); setPending(false);
  }, []);

  const issue = useCallback(async (commands: string[]) => {
    if (!transport.current.connected) { setError("Mulai streaming dari port ESP32 terlebih dahulu."); return; }
    const token = session.current;
    setError(null); setPending(true);
    window.clearTimeout(ackTimer.current);
    ackTimer.current = window.setTimeout(() => {
      if (session.current !== token) return;
      setPending(false);
      setError("ESP32 belum mengonfirmasi. Pastikan firmware imu3d-v2 sudah di-flash dan sensor siap.");
    }, 5000);
    try {
      for (const command of commands) {
        if (session.current !== token || !transport.current.connected) return;
        await transport.current.sendCommand(command);
      }
    } catch (cause) {
      if (session.current === token) { acknowledge(); setError(String(cause)); }
    }
  }, [acknowledge]);

  useEffect(() => {
    ++session.current;
    setState(null); setProgress(EMPTY); setError(null); acknowledge();
    setMessage(connected ? "Menunggu status dan profil dari ESP32." : "Hubungkan ESP32 untuk membaca profil kalibrasi.");
    if (!connected) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<{ sourcePort: string; line: string }>("serial_control", ({ payload }) => {
      if (disposed || payload.sourcePort !== source.split(" · ")[0]) return;
      const line = payload.line;
      if (line.startsWith("IMU_STATE:")) {
        const next = parseImuState(line.slice("IMU_STATE:".length));
        if (!next) { setError("Status IMU tidak sesuai protokol firmware imu3d-v2."); return; }
        setState(next); acknowledge();
        setMessage(next.referenceSet ? "Acuan awal ditetapkan. Model 3D mengikuti sensor." : next.calibrated ? "Profil enam posisi tersimpan. Tetapkan acuan awal untuk menampilkan orientasi." : "Kalibrasi enam posisi diperlukan.");
      } else if (line.startsWith("CALIBRATION_STATUS:")) {
        const next = parseCalibrationProgress(line.slice("CALIBRATION_STATUS:".length));
        if (next) { setProgress(next); acknowledge(); }
      } else if (line.startsWith("CALIBRATION_ERROR:")) {
        acknowledge(); setError(line.slice("CALIBRATION_ERROR:".length));
      } else if (line === "CALIBRATION_STARTED") {
        acknowledge(); setMessage("Arahkan satu sumbu papan ke atas, lalu ambil posisinya.");
      } else if (line.startsWith("CALIBRATION_COMPLETE:")) {
        acknowledge(); setMessage("Enam posisi tersimpan. Tunggu profil dari ESP32.");
      } else if (line === "CALIBRATION_CANCELLED") {
        acknowledge(); setMessage("Sesi dibatalkan. Profil yang sudah tersimpan tetap tersedia.");
      } else if (line.startsWith("REFERENCE_SET:")) {
        acknowledge(); setError(null); setMessage(line.slice("REFERENCE_SET:".length));
      }
    }).then((cleanup) => {
      if (disposed) cleanup();
      else { unlisten = cleanup; void issue(["IMU_STATUS"]); }
    }).catch((cause) => { if (!disposed) setError(String(cause)); });
    return () => { disposed = true; ++session.current; unlisten?.(); window.clearTimeout(ackTimer.current); };
  }, [connected, source, acknowledge, issue]);

  return {
    state, progress, pending, error, message,
    start: () => issue(["CALIBRATE_START"]),
    capture: (face: FaceId) => issue([`CALIBRATE_FACE:${face}`]),
    cancel: () => issue(["CALIBRATE_CANCEL"]),
    save: () => issue(["CALIBRATE_FINISH"]),
    refresh: () => issue(["IMU_STATUS"]),
    setReference: (nose: number, right: number) => issue([`IMU_REFERENCE:${nose},${right}`]),
  };
}
