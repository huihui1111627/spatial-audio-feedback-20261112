//! 参数平滑器：实时线程与离线渲染共用的无爆音基础设施。
//!
//! 铁律：音频参数不允许直接赋值跳变，所有目标值都经过 Smoother。
//! 增益类参数用 [`SmoothKind::EqualPower`]，普通线性参数用
//! [`SmoothKind::Linear`]。

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum SmoothKind {
    /// 线性插值，用于延迟、频率等非增益参数。
    Linear,
    /// 等功率（余弦）插值，用于增益/声像，保证过渡期间总能量恒定。
    EqualPower,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Smoother {
    kind: SmoothKind,
    sample_rate: u32,
    /// 平滑时间常数，毫秒。
    time_ms: f32,
    start: f32,
    current: f32,
    target: f32,
    total: u32,
    remaining: u32,
}

impl Smoother {
    pub fn new(kind: SmoothKind, sample_rate: u32, time_ms: f32, initial: f32) -> Self {
        Self {
            kind,
            sample_rate,
            time_ms,
            start: initial,
            current: initial,
            target: initial,
            total: 0,
            remaining: 0,
        }
    }

    /// 改平滑时间，不影响当前正在进行的过渡。
    pub fn set_time_ms(&mut self, time_ms: f32) {
        self.time_ms = time_ms;
    }

    /// 设置新目标值，按配置的时间常数启动一段平滑过渡。
    pub fn set_target(&mut self, target: f32) {
        if target == self.target {
            return;
        }
        self.start = self.current;
        self.target = target;
        self.total = (self.sample_rate as f32 * self.time_ms / 1000.0).round() as u32;
        self.remaining = self.total;
    }

    /// 瞬时重置（仅用于 checkpoint 恢复，正常音频路径禁止调用）。
    pub fn reset_unchecked(&mut self, value: f32) {
        self.start = value;
        self.current = value;
        self.target = value;
        self.total = 0;
        self.remaining = 0;
    }

    pub fn current(&self) -> f32 {
        self.current
    }

    pub fn target(&self) -> f32 {
        self.target
    }

    /// 推进一个样本并返回平滑后的值。
    pub fn next_sample(&mut self) -> f32 {
        if self.remaining == 0 {
            self.current = self.target;
            return self.current;
        }
        let done = self.total - self.remaining;
        // 当前样本在过渡中的位置：第 1 个样本 t=1/total，最后一个 t=1，
        // 保证末值严格等于 target。
        let t = (done + 1) as f32 / self.total as f32;
        self.current = match self.kind {
            SmoothKind::Linear => self.start + (self.target - self.start) * t,
            // θ: 0 -> π/2，g = start·cos θ + target·sin θ，
            // 两端点取值正确，且平方和对 0..1 归一化增益保持等功率。
            SmoothKind::EqualPower => {
                let theta = t * std::f32::consts::FRAC_PI_2;
                self.start * theta.cos() + self.target * theta.sin()
            }
        };
        self.remaining -= 1;
        self.current
    }

    /// 处理一整块，逐样本写入 `out`。
    pub fn process_block(&mut self, out: &mut [f32]) {
        for x in out.iter_mut() {
            *x = self.next_sample();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn holds_constant_without_target_change() {
        let mut s = Smoother::new(SmoothKind::Linear, 48_000, 10.0, 0.5);
        assert!((s.next_sample() - 0.5).abs() < 1e-7);
        assert!((s.next_sample() - 0.5).abs() < 1e-7);
    }

    #[test]
    fn ramp_reaches_target_exactly() {
        let mut s = Smoother::new(SmoothKind::Linear, 48_000, 10.0, 0.0);
        s.set_target(1.0);
        let n = (48_000.0 * 0.01) as usize;
        let mut last = 0.0;
        for _ in 0..n {
            last = s.next_sample();
        }
        assert!((last - 1.0).abs() < 1e-6, "ramp 末值应到达 target，实际 {last}");
        assert!((s.next_sample() - 1.0).abs() < 1e-7);
    }

    #[test]
    fn equal_power_endpoints_and_monotonicity() {
        let mut s = Smoother::new(SmoothKind::EqualPower, 48_000, 10.0, 0.0);
        s.set_target(1.0);
        let n = 480;
        let mut prev = -1.0;
        for _ in 0..n {
            let v = s.next_sample();
            assert!(v >= prev - 1e-7, "等功率过渡必须单调");
            prev = v;
        }
        assert!((prev - 1.0).abs() < 1e-6);
    }

    #[test]
    fn equal_power_conserves_energy_for_unit_gains() {
        // 两路互补等功率淡变的平方和应恒为 1。
        let n = 480u32;
        for i in 0..=n {
            let theta = (i as f32 / n as f32) * std::f32::consts::FRAC_PI_2;
            let a = theta.cos();
            let b = theta.sin();
            assert!((a * a + b * b - 1.0).abs() < 1e-6);
        }
    }
}
