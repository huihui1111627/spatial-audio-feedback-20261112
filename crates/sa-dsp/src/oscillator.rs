//! 测试用正弦振荡器：相位累加，无表、无分配。
//! M0 用于验证 worklet → wasm → 扬声器的整条链路出声。

#[derive(Clone, Debug)]
pub struct SineOsc {
    phase: f32,
    increment: f32,
    sample_rate: u32,
}

impl SineOsc {
    pub fn new(sample_rate: u32, freq_hz: f32) -> Self {
        Self {
            phase: 0.0,
            increment: 2.0 * std::f32::consts::PI * freq_hz / sample_rate as f32,
            sample_rate,
        }
    }

    pub fn set_freq(&mut self, freq_hz: f32) {
        self.increment = 2.0 * std::f32::consts::PI * freq_hz / self.sample_rate as f32;
    }

    /// 推进一个样本。
    pub fn next_sample(&mut self) -> f32 {
        let v = self.phase.sin();
        self.phase += self.increment;
        if self.phase > 2.0 * std::f32::consts::PI {
            self.phase -= 2.0 * std::f32::consts::PI;
        }
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sine_is_bounded_and_periodic() {
        let mut osc = SineOsc::new(48_000, 1_000.0);
        for _ in 0..48_000 {
            let v = osc.next_sample();
            assert!(v.abs() <= 1.0 + 1e-6);
        }
        // 48 个样本后（1kHz 的整周期数）相位应回到起点附近。
        let mut osc = SineOsc::new(48_000, 1_000.0);
        let first = osc.next_sample();
        for _ in 1..48 {
            osc.next_sample();
        }
        let at_period = osc.next_sample();
        assert!((first - at_period).abs() < 1e-5);
    }
}
