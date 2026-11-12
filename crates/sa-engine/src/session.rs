//! RenderSession：单一会话内核，实时/离线同一条 process_block 路径。

use sa_core::{SmoothKind, Smoother, DEFAULT_SAMPLE_RATE};
use sa_dsp::BLOCK_SAMPLES;
use serde::{Deserialize, Serialize};

use crate::state::SessionState;

/// M0 的自检参数。M1 起替换为场景快照驱动的真实声源参数。
const TEST_TONE_HZ: f32 = 440.0;
const GAIN_SMOOTH_MS: f32 = 10.0;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RenderSession {
    state: SessionState,
}

impl RenderSession {
    pub fn new(sample_rate: u32) -> Self {
        let state = SessionState {
            state_version: 1,
            sample_rate,
            samples_processed: 0,
            gain: Smoother::new(SmoothKind::EqualPower, sample_rate, GAIN_SMOOTH_MS, 0.0),
            osc_phase: 0.0,
            osc_increment: 2.0 * std::f32::consts::PI * TEST_TONE_HZ / sample_rate as f32,
        };
        Self { state }
    }

    pub fn sample_rate(&self) -> u32 {
        self.state.sample_rate
    }

    pub fn samples_processed(&self) -> u64 {
        self.state.samples_processed
    }

    /// 增益目标值，经等功率 Smoother 过渡，拖拽参数不会产生爆音。
    pub fn set_gain(&mut self, gain: f32) {
        self.state.gain.set_target(gain.clamp(0.0, 1.0));
    }

    /// 处理一个 128 帧块，左右声道写入调用方提供的缓冲。
    /// worklet 内由 wasm 导出函数包装调用；离线渲染在 worker/CLI 里循环调用。
    pub fn process_block(&mut self, out_left: &mut [f32], out_right: &mut [f32]) {
        assert_eq!(out_left.len(), BLOCK_SAMPLES);
        assert_eq!(out_right.len(), BLOCK_SAMPLES);
        for (l, r) in out_left.iter_mut().zip(out_right.iter_mut()) {
            let gain = self.state.gain.next_sample();
            let sample = self.state.osc_phase.sin() * gain;
            self.state.osc_phase += self.state.osc_increment;
            if self.state.osc_phase > 2.0 * std::f32::consts::PI {
                self.state.osc_phase -= 2.0 * std::f32::consts::PI;
            }
            *l = sample;
            *r = sample;
        }
        self.state.samples_processed += BLOCK_SAMPLES as u64;
    }

    /// 导出 checkpoint（分段渲染的段末动作）。
    pub fn checkpoint(&self) -> serde_json::Result<String> {
        serde_json::to_string(&self.state)
    }

    /// 从 checkpoint 恢复（下一段的段首动作）。
    pub fn restore(json: &str) -> Result<Self, sa_core::SaError> {
        let state: SessionState = serde_json::from_str(json)?;
        if state.state_version != 1 {
            return Err(sa_core::SaError::Checkpoint(format!(
                "未知 state_version {}",
                state.state_version
            )));
        }
        Ok(Self { state })
    }
}

impl Default for RenderSession {
    fn default() -> Self {
        Self::new(DEFAULT_SAMPLE_RATE)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn silence_before_gain_raised() {
        let mut s = RenderSession::new(48_000);
        let (mut l, mut r) = (vec![1.0; 128], vec![1.0; 128]);
        s.process_block(&mut l, &mut r);
        assert!(l.iter().all(|x| *x == 0.0));
        assert!(r.iter().all(|x| *x == 0.0));
    }

    #[test]
    fn gain_change_has_no_discontinuity() {
        let mut s = RenderSession::new(48_000);
        s.set_gain(0.8);
        let (mut l, mut r) = (vec![0.0; 128], vec![0.0; 128]);
        s.process_block(&mut l, &mut r);
        // 逐样本差分不能出现跳变（正弦本身连续，增益走平滑）。
        for w in l.windows(2) {
            assert!((w[1] - w[0]).abs() < 0.05, "出现疑似爆音跳变");
        }
        let _ = r;
    }

    #[test]
    fn checkpoint_restore_is_sample_exact() {
        let mut a = RenderSession::new(48_000);
        a.set_gain(0.5);
        let (mut l, mut r) = (vec![0.0; 128], vec![0.0; 128]);
        for _ in 0..10 {
            a.process_block(&mut l, &mut r);
        }
        // 中途改一次目标，让 Smoother 处于过渡中间态再 checkpoint。
        a.set_gain(0.2);
        a.process_block(&mut l, &mut r);
        let json = a.checkpoint().unwrap();
        let mut b = RenderSession::restore(&json).unwrap();

        for _ in 0..20 {
            let (mut la, mut ra) = (vec![0.0; 128], vec![0.0; 128]);
            let (mut lb, mut rb) = (vec![0.0; 128], vec![0.0; 128]);
            a.process_block(&mut la, &mut ra);
            b.process_block(&mut lb, &mut rb);
            assert_eq!(la, lb, "checkpoint 恢复后必须逐样本相等");
            assert_eq!(ra, rb);
        }
        assert_eq!(a.samples_processed(), b.samples_processed());
    }

    #[test]
    fn same_seed_style_determinism() {
        // 同参数两个会话的输出必须完全一致（离线可复现的基本保证）。
        let render_all = |gain_at: u32| {
            let mut s = RenderSession::new(48_000);
            let mut out = Vec::new();
            let (mut l, mut r) = (vec![0.0; 128], vec![0.0; 128]);
            for i in 0..8 {
                if i == gain_at {
                    s.set_gain(0.6);
                }
                s.process_block(&mut l, &mut r);
                out.extend_from_slice(&l);
            }
            out
        };
        assert_eq!(render_all(2), render_all(2));
        assert_ne!(render_all(2), render_all(3));
    }
}
