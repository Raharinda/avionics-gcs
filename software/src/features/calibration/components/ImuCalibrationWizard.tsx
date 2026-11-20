import { useEffect, useState } from "react";
import { FACES, faceLabel, faceDirection, type FaceId } from "../../../types/imu";
import type { useImuCalibration } from "../hooks/useImuCalibration";
import { RocketViewport } from "../../flight/components/RocketViewport";
import { calibrationHint } from "../../../data/calibrationHint";
import { useTelemetryFreshness } from "../../telemetry/hooks/useTelemetryFreshness";
import type { TelemetryPoint } from "../../../types/telemetry";
type Props = {
    controller: ReturnType<typeof useImuCalibration>;
    connected: boolean;
    telemetry: TelemetryPoint | null;
    receivedAt: number | null;
    onClose: () => void;
};
export function ImuCalibrationWizard({ controller: imu, connected, telemetry, receivedAt, onClose }: Props) {
    const telemetryFresh = useTelemetryFreshness(receivedAt);
    const [selectedFace, setSelectedFace] = useState<FaceId>("ZP");
    useEffect(() => { if (imu.progress.face)
        setSelectedFace(imu.progress.face); }, [imu.progress.face]);
    const disabled = !connected || imu.pending || !imu.state?.imuReady;
    const reading = connected && telemetryFresh ? telemetry : null;
    const hint = calibrationHint(imu.progress.face ?? selectedFace, reading);
    return <div className="calibration-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget)
        onClose(); }}>
    <section className="calibration-modal imu-wizard" role="dialog" aria-modal="true" aria-labelledby="calibration-title">
      <div className="calibration-modal-header">
        <div><div className="section-label">KALIBRASI IMU · 6 POSISI</div><h2 id="calibration-title">Kenali semua sumbu, tetapkan arah awal</h2></div>
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close calibration">×</button>
      </div>
      {!connected && <p className="imu-warning">Pilih port ESP32 dan klik Start. Kalibrasi memakai sensor asli; Dummy Data tidak menyimpan profil.</p>}
      {connected && !imu.state && <p className="imu-warning">Menunggu firmware imu3d-v2. Jika belum ada respons, flash firmware baru terlebih dahulu.</p>}
      {imu.error && <p className="imu-error" role="alert">{imu.error}</p>}
      <p className="imu-message" role="status">{imu.message}</p>
      <div className="imu-wizard-grid">
        <div>
          <h3>1. Kalibrasi ±X, ±Y, ±Z</h3>
          <p>Posisi normal: <b>+X kanan, +Y depan, +Z atas</b>; arah negatifnya kiri, belakang, dan bawah. Pasang sensor mengikuti tanda sumbu ini.</p>
          <p>Untuk kalibrasi enam posisi, putar papan agar <b>sumbu yang dipilih menghadap atas</b> secara bergantian. Klik Rekam, lalu tahan diam sekitar 2 detik. Contoh +Y: arah depan papan diputar menghadap langit. Goyangan besar mengulang hitungan sampel.</p>
          <div className="imu-board-preview"><RocketViewport mode="sensor" sensorFace={selectedFace}/></div>
          {connected && <div className={`imu-pose-feedback ${hint.tone}`} role="status">
            <b>{imu.progress.face ? `Sedang merekam ${faceLabel(imu.progress.face)}` : `Panduan ${faceLabel(selectedFace)} ke atas`}</b>
            <p>{hint.message}</p>
            {reading && <div className="imu-live-values">
              <span>X {reading.accelX.toFixed(2)}</span><span>Y {reading.accelY.toFixed(2)}</span><span>Z {reading.accelZ.toFixed(2)} m/s²</span>
              <span>Gyro {reading.gyroscope.toFixed(2)} °/s</span>
            </div>}
            <small>Petunjuk dari telemetry terkini. Progres dan penyimpanan dikonfirmasi ESP32.</small>
          </div>}
          <div className="imu-faces">
            {FACES.map((face) => <button key={face} type="button" className={`${selectedFace === face ? "selected" : ""} ${imu.progress.completed.includes(face) ? "complete" : ""}`} disabled={imu.pending || imu.progress.face !== null} onClick={() => setSelectedFace(face)}>
              <b>{faceLabel(face)} · {faceDirection(face)}</b><small>Hadapkan sisi {faceDirection(face)} ke atas</small><small>{imu.progress.completed.includes(face) ? "Terekam ✓" : "Belum direkam"}</small>
            </button>)}
          </div>
          {imu.progress.face && <div className="imu-progress" role="status">
            <label>{faceLabel(imu.progress.face)}: {imu.progress.samples}/{imu.progress.target} sampel stabil</label>
            <progress max={imu.progress.target} value={imu.progress.samples}/>
          </div>}
          <div className="imu-actions">
            <button type="button" className="calibration-start" disabled={disabled || imu.progress.active} onClick={() => void imu.start()}>Mulai enam posisi</button>
            <button type="button" className="calibration-start" disabled={disabled || !imu.progress.active || imu.progress.face !== null} onClick={() => void imu.capture(selectedFace)}>Rekam {faceLabel(selectedFace)}</button>
            <button type="button" disabled={!connected || imu.cancelling} onClick={() => void imu.cancel()}>{imu.cancelling ? "Menghapus kalibrasi…" : "Batalkan & hapus kalibrasi"}</button>
            {imu.progress.active && imu.progress.completed.length === 6 && <button type="button" disabled={imu.pending} onClick={() => void imu.save()}>Simpan profil</button>}
          </div>
          <p className="imu-note">Setelah keenam posisi valid, profil otomatis disimpan di ESP32. Batalkan & hapus kalibrasi menghapus profil dan acuan tersimpan; data IMU dan gyro tetap tersedia.</p>
        </div>
        <div>
          <h3>2. Tetapkan pose nol untuk tampilan live</h3>
          <p>Setelah kalibrasi selesai, pegang roket pada pose awal yang kamu inginkan. Tahan diam lalu tetapkan acuan. Pose ini menjadi posisi nol model 3D.</p>
          <button className="calibration-start imu-reference-button" type="button" disabled={disabled || !imu.state?.calibrated || imu.progress.active} onClick={() => { if (imu.state)
            void imu.setReference(imu.state.noseAxis, imu.state.rightAxis); }}>Tetapkan posisi sekarang sebagai acuan</button>
          <p className="imu-note">Tampilan live mengukur perubahan dari pose nol ini dengan sumbu X kanan, Y depan, dan Z atas. Yaw adalah rotasi terhadap sumbu Z.</p>
          <p className="imu-reference-status">{imu.state?.referenceSet ? "✓ Acuan aktif pada sesi ini" : "Acuan sesi belum ditetapkan"}</p>
          <p className="imu-note">Profil dan catatan pose awal tersimpan setelah ESP32 mengonfirmasi. Setelah reboot, tetapkan acuan lagi. Yaw relatif dapat drift; arah kompas dan posisi XYZ dalam meter tidak diukur.</p>
          {imu.state?.profile && <div className="imu-saved-profile">
            <h3>Profil tersimpan di ESP32</h3>
            <table><thead><tr><th>Pose</th><th>X</th><th>Y</th><th>Z</th></tr></thead><tbody>
              {imu.state.profile.poses.map((pose) => <tr key={pose.face}><td>{faceLabel(pose.face)} ↑</td>{pose.accel.map((value, index) => <td key={index}>{value.toFixed(3)}</td>)}</tr>)}
            </tbody></table>
            <small>Rata-rata akselerasi mentah (m/s²), ≥200 sampel per pose.</small>
            <p>Offset XYZ: {imu.state.profile.offset.map((value) => value.toFixed(4)).join(" / ")}</p>
            <p>Skala XYZ: {imu.state.profile.scale.map((value) => value.toFixed(5)).join(" / ")}</p>
            <p>Bias gyro: {imu.state.profile.gyroBias.map((value) => value.toFixed(5)).join(" / ")} rad/s</p>
          </div>}
          {imu.state?.lastReference && <p className="imu-note">Catatan acuan terakhir, akselerasi XYZ: {imu.state.lastReference.accel.map((value) => value.toFixed(3)).join(" / ")} m/s². {imu.state.referenceSet ? "Aktif pada sesi ini." : "Catatan tersimpan; perlu tetapkan ulang untuk sesi ini."}</p>}
        </div>
      </div>
      <div className="imu-modal-footer"><button type="button" disabled={!connected || imu.pending} onClick={() => void imu.refresh()}>Baca ulang profil ESP32</button><button type="button" onClick={onClose}>Tutup</button></div>
    </section>
  </div>;
}
