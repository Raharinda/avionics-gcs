import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { parseCalibrationProgress, parseImuState } from "../../../data/imuProtocol";
import { faceLabel, type CalibrationProgress, type FaceId, type ImuState } from "../../../types/imu";
const EMPTY: CalibrationProgress = { active: false, face: null, samples: 0, target: 200, completed: [] };
export function useImuCalibration(connected: boolean, source: string, sendCommand: (command: string) => Promise<void>) {
    const [state, setState] = useState<ImuState | null>(null);
    const [progress, setProgress] = useState<CalibrationProgress>(EMPTY);
    const [pending, setPending] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [supported, setSupported] = useState<boolean | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const transport = useRef({ connected, sendCommand });
    transport.current = { connected, sendCommand };
    const session = useRef(0);
    const request = useRef(0);
    const pendingCommand = useRef<string | null>(null);
    const ackTimer = useRef<number | undefined>(undefined);
    const acknowledge = useCallback(() => {
        window.clearTimeout(ackTimer.current);
        pendingCommand.current = null;
        setPending(false);
        setCancelling(false);
    }, []);
    const issue = useCallback(async (command: string) => {
        if (!transport.current.connected) {
            setError("Mulai streaming dari port ESP32 terlebih dahulu.");
            return;
        }
        // Starting can supersede a status request that missed the board's boot response.
        const startingDuringStatus = command === "CALIBRATE_START" && pendingCommand.current === "IMU_STATUS";
        // Reset can interrupt any other pending command.
        if (pendingCommand.current && !startingDuringStatus &&
            (command !== "CALIBRATE_RESET" || pendingCommand.current === command))
            return;
        const token = session.current;
        const requestId = ++request.current;
        pendingCommand.current = command;
        setError(null);
        setNotice(null);
        setPending(true);
        setCancelling(command === "CALIBRATE_RESET");
        window.clearTimeout(ackTimer.current);
        ackTimer.current = window.setTimeout(() => {
            if (session.current !== token || request.current !== requestId)
                return;
            acknowledge();
            setError(command === "CALIBRATE_RESET"
                ? "Penghapusan kalibrasi belum dikonfirmasi ESP32. Pastikan firmware terbaru sudah di-flash, lalu coba lagi atau baca ulang profil."
                : "ESP32 belum mengonfirmasi. Pastikan firmware imu3d-v2 sudah di-flash dan sensor siap.");
        }, 5000);
        try {
            await transport.current.sendCommand(command);
        }
        catch (cause) {
            if (session.current === token && request.current === requestId && pendingCommand.current === command) {
                acknowledge();
                setError(String(cause));
            }
        }
    }, [acknowledge]);
    useEffect(() => {
        ++session.current;
        setState(null);
        setProgress(EMPTY);
        setSupported(null);
        setError(null);
        setNotice(null);
        acknowledge();
        if (!connected)
            return;
        let disposed = false;
        let unlisten: (() => void) | undefined;
        listen<{
            sourcePort: string;
            line: string;
        }>("serial_control", ({ payload }) => {
            if (disposed || payload.sourcePort !== source.split(" · ")[0])
                return;
            const line = payload.line;
            const command = pendingCommand.current;
            if (line.startsWith("IMU_STATE:")) {
                const next = parseImuState(line.slice("IMU_STATE:".length));
                if (!next) {
                    setError("Status IMU tidak sesuai protokol firmware imu3d-v2.");
                    return;
                }
                setState(next);
                setSupported(true);
            }
            else if (line.startsWith("CALIBRATION_STATUS:")) {
                const next = parseCalibrationProgress(line.slice("CALIBRATION_STATUS:".length));
                if (next) {
                    setProgress(next);
                    if (command === "IMU_STATUS" ||
                        (command === "CALIBRATE_START" && next.active) ||
                        (command?.startsWith("CALIBRATE_FACE:") && next.face === command.slice("CALIBRATE_FACE:".length)))
                        acknowledge();
                }
            }
            else if (line.startsWith("CALIBRATION_RESET_ERROR:")) {
                if (command === "CALIBRATE_RESET")
                    acknowledge();
                setError(line.slice("CALIBRATION_RESET_ERROR:".length));
            }
            else if (line.startsWith("CALIBRATION_ERROR:")) {
                // Older GCS firmware reports its local calibration limitation as an error.
                if (/^CALIBRATION_ERROR:Receiver E(?:22|32) hanya telemetri/.test(line)) {
                    acknowledge();
                    setSupported(false);
                    setError(null);
                    setNotice("Telemetry melalui GCS tetap diterima. Untuk kalibrasi, hubungkan USB langsung ke avionics/transmitter.");
                    return;
                }
                // A previous capture can fail while reset is already in flight.
                if (command !== "CALIBRATE_RESET") {
                    acknowledge();
                    setError(line.slice("CALIBRATION_ERROR:".length));
                }
            }
            else if (line.startsWith("CALIBRATION_UNSUPPORTED:")) {
                acknowledge();
                setSupported(false);
                setError(null);
                setNotice(line.slice("CALIBRATION_UNSUPPORTED:".length));
            }
            else if (line === "CALIBRATION_STARTED") {
                setProgress({ ...EMPTY, active: true });
                setNotice(null);
                if (command === "CALIBRATE_START")
                    acknowledge();
            }
            else if (line.startsWith("CALIBRATION_COMPLETE:")) {
                setProgress(EMPTY);
                setNotice("Enam posisi tersimpan. Tetapkan acuan awal untuk menampilkan orientasi.");
                if (command !== "CALIBRATE_RESET")
                    acknowledge();
            }
            else if (line === "CALIBRATION_RESET") {
                setProgress(EMPTY);
                setState((current) => current ? { ...current, calibrated: false, referenceSet: false, profile: null, lastReference: null } : current);
                setError(null);
                setNotice("Sesi dihentikan. Profil kalibrasi dan acuan di ESP32 dihapus. Data IMU dan gyro tetap tersedia.");
                if (command === "CALIBRATE_RESET")
                    acknowledge();
            }
            else if (line === "CALIBRATION_CANCELLED") {
                if (command === "CALIBRATE_RESET")
                    return;
                setProgress(EMPTY);
                setError(null);
                setNotice("Sesi dibatalkan. Profil yang sudah tersimpan tetap tersedia.");
            }
            else if (line.startsWith("REFERENCE_SET:")) {
                if (command?.startsWith("IMU_REFERENCE:"))
                    acknowledge();
                setError(null);
                setNotice(line.slice("REFERENCE_SET:".length));
            }
        }).then((cleanup) => {
            if (disposed)
                cleanup();
            else {
                unlisten = cleanup;
                void issue("IMU_STATUS");
            }
        }).catch((cause) => { if (!disposed)
            setError(String(cause)); });
        return () => { disposed = true; ++session.current; unlisten?.(); window.clearTimeout(ackTimer.current); };
    }, [connected, source, acknowledge, issue]);
    const actions = useMemo(() => ({
        start: () => issue("CALIBRATE_START"),
        capture: (face: FaceId) => issue(`CALIBRATE_FACE:${face}`),
        cancel: () => issue("CALIBRATE_RESET"),
        save: () => issue("CALIBRATE_FINISH"),
        refresh: () => issue("IMU_STATUS"),
        setReference: (nose: number, right: number) => issue(`IMU_REFERENCE:${nose},${right}`),
    }), [issue]);
    const message = !connected ? "Hubungkan ESP32 untuk membaca profil kalibrasi."
        : cancelling ? "Meminta ESP32 menghentikan sesi dan menghapus profil kalibrasi…"
            : progress.active ? progress.face
                ? `Sedang merekam ${faceLabel(progress.face)}. Tahan papan tetap diam.`
                : "Sesi kalibrasi aktif. Arahkan satu sumbu papan ke atas, lalu rekam posisinya."
            : notice ?? (!state ? "Menunggu status dan profil dari ESP32."
                : state.referenceSet ? "Acuan awal ditetapkan. Model 3D mengikuti sensor."
                    : state.calibrated ? "Profil enam posisi tersimpan. Tetapkan acuan awal untuk menampilkan orientasi."
                        : "Kalibrasi enam posisi diperlukan.");
    const checkingStatus = pending && pendingCommand.current === "IMU_STATUS";
    return { state, progress, pending, checkingStatus, supported, cancelling, error, message, ...actions };
}
