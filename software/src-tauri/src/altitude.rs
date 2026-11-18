#[derive(Default)]
pub struct AltitudeReference {
    pressure_hpa: Option<f64>,
}

impl AltitudeReference {
    // Each serial listener owns a fresh reference, so Start sets a new zero.
    pub fn read(&mut self, pressure_hpa: Option<f64>) -> Option<f64> {
        let pressure = pressure_hpa.filter(|value| value.is_finite() && *value > 0.0)?;
        let reference = *self.pressure_hpa.get_or_insert(pressure);
        let height = 44330.0 * (1.0 - (pressure / reference).powf(0.19029495));
        height.is_finite().then_some(height)
    }
}

#[cfg(test)]
mod tests {
    use super::AltitudeReference;

    #[test]
    fn first_valid_pressure_sets_zero_and_tracks_height_in_both_directions() {
        let mut reference = AltitudeReference::default();
        for pressure in [None, Some(0.0), Some(-1.0), Some(f64::NAN), Some(f64::INFINITY)] {
            assert_eq!(reference.read(pressure), None);
        }
        assert_eq!(reference.read(Some(994.4)), Some(0.0));
        let pressure_at_ten_metres = 994.4 * (1.0_f64 - 10.0 / 44330.0).powf(1.0 / 0.19029495);
        assert!((reference.read(Some(pressure_at_ten_metres)).unwrap() - 10.0).abs() < 1e-8);
        assert!(reference.read(Some(995.0)).unwrap() < 0.0);
        assert_eq!(reference.read(Some(994.4)), Some(0.0));
    }

    #[test]
    fn missing_pressure_keeps_reference_and_a_new_session_sets_a_new_zero() {
        let mut first = AltitudeReference::default();
        assert_eq!(first.read(Some(1000.0)), Some(0.0));
        let height = first.read(Some(990.0)).unwrap();
        assert_eq!(first.read(None), None);
        assert_eq!(first.read(Some(0.0)), None);
        assert_eq!(first.read(Some(990.0)), Some(height));

        let mut restarted = AltitudeReference::default();
        assert_eq!(restarted.read(Some(990.0)), Some(0.0));
        assert_eq!(first.read(Some(990.0)), Some(height));
    }
}
