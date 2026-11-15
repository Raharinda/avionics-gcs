//! Decoder for the text protocol already emitted by the ESP32 firmware.
//! A frame ends at the next timestamp marker. Missing sensor values remain absent.

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Sample {
    pub elapsed_ms: u64,
    pub accel_mps2: Option<[f64; 3]>,
    pub gyro_rads: Option<[f64; 3]>,
    pub mpu_temperature_c: Option<f64>,
    pub temperature_c: Option<f64>,
    pub pressure_hpa: Option<f64>,
}

impl Sample {
    fn has_data(&self) -> bool {
        self.accel_mps2.is_some() || self.gyro_rads.is_some() || self.pressure_hpa.is_some()
    }
}

#[derive(Debug)]
pub enum Record {
    Log(String),
    Sample(Sample),
}

#[derive(Default)]
pub struct Decoder {
    line: Vec<u8>,
    discarding: bool,
    current: Option<Sample>,
}

fn number_after(line: &str, label: &str) -> Option<f64> {
    let value = line.split_once(label)?.1.split_whitespace().next()?.parse::<f64>().ok()?;
    value.is_finite().then_some(value)
}

fn axes(line: &str) -> Option<[f64; 3]> {
    Some([number_after(line, "X=")?, number_after(line, "Y=")?, number_after(line, "Z=")?])
}

impl Decoder {
    pub fn feed(&mut self, bytes: &[u8]) -> Vec<Record> {
        let mut records = Vec::new();
        for &byte in bytes {
            if byte == b'\n' {
                if !self.discarding {
                    if let Ok(line) = std::str::from_utf8(&self.line) {
                        let line = line.trim().to_owned();
                        if !line.is_empty() {
                            if let Some(sample) = self.read_line(&line) {
                                records.push(Record::Sample(sample));
                            }
                            records.push(Record::Log(line));
                        }
                    }
                }
                self.line.clear();
                self.discarding = false;
            } else if !self.discarding {
                if self.line.len() < 512 {
                    self.line.push(byte);
                } else {
                    self.line.clear();
                    self.current = None;
                    self.discarding = true;
                    records.push(Record::Log("Dropped oversized Serial line".into()));
                }
            }
        }
        records
    }

    fn read_line(&mut self, line: &str) -> Option<Sample> {
        if line.starts_with("--- Waktu:") {
            let timestamp = line.strip_prefix("--- Waktu: ")
                .and_then(|text| text.strip_suffix(" ms ---"))
                .and_then(|text| text.parse::<u32>().ok());
            let previous = self.current.take();
            if let Some(timestamp) = timestamp {
                self.current = Some(Sample { elapsed_ms: u64::from(timestamp), ..Sample::default() });
                return previous.filter(Sample::has_data);
            }
            return None;
        }
        let frame = self.current.as_mut()?;
        if line.starts_with("MPU6050 | Accel [m/s^2]") {
            frame.accel_mps2 = axes(line);
        } else if line.starts_with("| Gyro [rad/s]") {
            frame.gyro_rads = axes(line);
            frame.mpu_temperature_c = number_after(line, "Suhu=");
        } else if line.starts_with("BMP280  |") {
            let temperature = number_after(line, "Suhu=");
            let pressure = number_after(line, "Tekanan=").filter(|value| *value > 0.0);
            if temperature.is_some() && pressure.is_some() {
                frame.temperature_c = temperature;
                frame.pressure_hpa = pressure;
            } else {
                frame.temperature_c = None;
                frame.pressure_hpa = None;
            }
        } else if line.starts_with("MPU6050:") || line.starts_with("MPU6050 terputus") {
            frame.accel_mps2 = None;
            frame.gyro_rads = None;
            frame.mpu_temperature_c = None;
        } else if line.starts_with("BMP280:") || line.starts_with("BMP280 terputus") {
            frame.temperature_c = None;
            frame.pressure_hpa = None;
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const FRAME: &str = "--- Waktu: 2000 ms ---\r\nMPU6050 | Accel [m/s^2] X=0.020 Y=-0.030 Z=9.810\r\n        | Gyro [rad/s]  X=0.001 Y=-0.002 Z=0.003 | Suhu=29.10 C\r\nBMP280  | Suhu=28.40 C | Tekanan=1008.25 hPa\r\n--- Waktu: 2500 ms ---\r\n";

    fn samples(records: Vec<Record>) -> Vec<Sample> {
        records.into_iter().filter_map(|record| match record {
            Record::Sample(sample) => Some(sample),
            _ => None,
        }).collect()
    }

    #[test]
    fn decodes_actual_firmware_units_and_signed_axes() {
        let data = samples(Decoder::default().feed(FRAME.as_bytes()));
        assert_eq!(data.len(), 1);
        assert_eq!(data[0].elapsed_ms, 2000);
        assert_eq!(data[0].accel_mps2, Some([0.02, -0.03, 9.81]));
        assert_eq!(data[0].gyro_rads, Some([0.001, -0.002, 0.003]));
        assert_eq!(data[0].mpu_temperature_c, Some(29.1));
        assert_eq!(data[0].temperature_c, Some(28.4));
        assert_eq!(data[0].pressure_hpa, Some(1008.25));
    }

    #[test]
    fn every_possible_serial_chunk_boundary_is_supported() {
        for boundary in 0..=FRAME.len() {
            let mut decoder = Decoder::default();
            let mut records = decoder.feed(&FRAME.as_bytes()[..boundary]);
            records.extend(decoder.feed(&FRAME.as_bytes()[boundary..]));
            assert_eq!(samples(records).len(), 1, "boundary {boundary}");
        }
    }

    #[test]
    fn absent_bmp_does_not_reuse_previous_pressure() {
        let mut decoder = Decoder::default();
        decoder.feed(FRAME.as_bytes());
        let data = samples(decoder.feed(b"MPU6050 | Accel [m/s^2] X=1 Y=2 Z=3\n--- Waktu: 3000 ms ---\n"));
        assert_eq!(data[0].accel_mps2, Some([1.0, 2.0, 3.0]));
        assert_eq!(data[0].pressure_hpa, None);
        assert_eq!(data[0].gyro_rads, None);
    }

    #[test]
    fn rejects_nonfinite_malformed_and_nonpositive_measurements() {
        let data = samples(Decoder::default().feed(b"--- Waktu: 1 ms ---\nMPU6050 | Accel [m/s^2] X=nan Y=0 Z=1\nBMP280  | Suhu=23 C | Tekanan=-1 hPa\n--- Waktu: 2 ms ---\n"));
        assert!(data.is_empty());
    }

    #[test]
    fn ignores_boot_noise_and_partial_frame_before_first_marker() {
        let mut decoder = Decoder::default();
        assert!(samples(decoder.feed(b"boot\nBMP280  | Suhu=23 C | Tekanan=1013 hPa\n")).is_empty());
        assert_eq!(samples(decoder.feed(FRAME.as_bytes())).len(), 1);
    }

    #[test]
    fn overlong_lines_are_bounded_and_resynchronize_at_newline() {
        let mut decoder = Decoder::default();
        decoder.feed(&vec![b'x'; 10_000]);
        assert!(decoder.line.len() <= 512);
        decoder.feed(b"\n");
        assert_eq!(samples(decoder.feed(FRAME.as_bytes())).len(), 1);
    }

    #[test]
    fn disconnection_message_clears_that_sensor_in_current_frame() {
        let mut decoder = Decoder::default();
        let text = FRAME.replace("--- Waktu: 2500 ms ---", "MPU6050 terputus; menunggu deteksi ulang.\n--- Waktu: 2500 ms ---");
        let data = samples(decoder.feed(text.as_bytes()));
        assert_eq!(data[0].accel_mps2, None);
        assert_eq!(data[0].pressure_hpa, Some(1008.25));
    }

    #[test]
    fn device_restart_can_restart_timestamp_without_losing_frame() {
        let text = FRAME.replace("2500 ms", "0 ms");
        let mut decoder = Decoder::default();
        assert_eq!(samples(decoder.feed(text.as_bytes()))[0].elapsed_ms, 2000);
        let data = samples(decoder.feed(b"BMP280  | Suhu=20 C | Tekanan=1000 hPa\n--- Waktu: 500 ms ---\n"));
        assert_eq!(data[0].elapsed_ms, 0);
    }
}
