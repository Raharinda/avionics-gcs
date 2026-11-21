pub fn normalize_quaternion(q: [f64; 4]) -> Option<[f64; 4]> {
    if !q.iter().all(|value| value.is_finite()) { return None; }
    let length = q.iter().map(|value| value * value).sum::<f64>().sqrt();
    if !(0.5..=1.5).contains(&length) { return None; }
    Some(q.map(|value| value / length))
}

// New frames are right/forward/up. Older imu3d-v2 firmware used X right,
// Y nose/up, Z backwards, so map its quaternion vector to [x, -z, y].
pub fn normalize_rfu(q: [f64; 4], frame: Option<&str>) -> Option<[f64; 4]> {
    let [w, x, y, z] = normalize_quaternion(q)?;
    match frame {
        Some("RFU") => Some([w, x, y, z]),
        None => Some([w, x, -z, y]),
        _ => None,
    }
}

pub fn euler_degrees([w, x, y, z]: [f64; 4]) -> [f64; 3] {
    [
        (2.0 * (w*x+y*z)).atan2(1.0-2.0*(x*x+y*y)).to_degrees(),
        (2.0 * (w*y-z*x)).clamp(-1.0, 1.0).asin().to_degrees(),
        (2.0 * (w*z+x*y)).atan2(1.0-2.0*(y*y+z*z)).to_degrees(),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_invalid_and_zero_quaternions() {
        assert!(normalize_quaternion([0.0; 4]).is_none());
        assert!(normalize_quaternion([f64::NAN, 0.0, 0.0, 0.0]).is_none());
        assert!(normalize_quaternion([5.0, 0.0, 0.0, 0.0]).is_none());
    }
    #[test]
    fn normalized_quaternion_preserves_rotation_and_sign_equivalence() {
        let half = std::f64::consts::FRAC_PI_4;
        let q = [half.cos(), 0.0, 0.0, half.sin()];
        assert!((euler_degrees(q)[2] - 90.0).abs() < 1e-6);
        assert_eq!(euler_degrees(q), euler_degrees(q.map(|value| -value)));
        let recovered = normalize_quaternion(q.map(|value| value * 1.1)).unwrap();
        assert!((euler_degrees(recovered)[2] - 90.0).abs() < 1e-6);
    }
    #[test]
    fn pitch_handles_the_vertical_pose_without_nan() {
        let half = std::f64::consts::FRAC_PI_4;
        let angles = euler_degrees([half.cos(), 0.0, half.sin(), 0.0]);
        assert!((angles[1] - 90.0).abs() < 1e-5);
        assert!(angles.iter().all(|value| value.is_finite()));
    }
    #[test]
    fn frame_conversion_preserves_right_forward_up_and_old_y_up_rotations() {
        let h=std::f64::consts::FRAC_PI_4;
        for axis in 0..3 {
            let mut q=[h.cos(),0.0,0.0,0.0]; q[axis+1]=h.sin();
            let angles=euler_degrees(normalize_rfu(q,Some("RFU")).unwrap());
            assert!((angles[axis]-90.0).abs()<1e-5);
        }
        let legacy_up=[h.cos(),0.0,h.sin(),0.0];
        assert!((euler_degrees(normalize_rfu(legacy_up,None).unwrap())[2]-90.0).abs()<1e-5);
        assert!(normalize_rfu(legacy_up,Some("unsupported")).is_none());
    }
}
