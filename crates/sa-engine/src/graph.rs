//! 场景图运行态：把 [`SessionState`] 里的声源状态渲染成音频块。
//!
//! 零分配热路径：scratch 缓冲在 [`SceneGraph`] 里复用，process 只读写
//! 预分配内存。M1 的声像模型是单声道等增益混合到双耳，空间化在 M2 接入。

use std::collections::HashMap;
use std::sync::Arc;

use sa_core::Smoother;
use sa_dsp::BLOCK_SAMPLES;

use crate::state::{PlayerState, SourceState};

/// 素材 PCM 仓库：内容哈希 → 48k 单声道 f32。不可变，不进 checkpoint。
pub type AssetStore = HashMap<String, Arc<Vec<f32>>>;

/// 内置测试音频率（声源未挂素材时的占位信号）。
pub const TEST_TONE_HZ: f32 = 440.0;

pub fn test_tone_increment(sample_rate: u32) -> f32 {
    2.0 * std::f32::consts::PI * TEST_TONE_HZ / sample_rate as f32
}

/// 场景图的运行时部分（不可序列化的缓冲与素材引用）。
pub struct SceneGraph {
    /// 单声道声源渲染 scratch，逐声源复用。
    source_block: Vec<f32>,
}

impl SceneGraph {
    pub fn new() -> Self {
        Self {
            source_block: vec![0.0; BLOCK_SAMPLES],
        }
    }

    /// 把一个声源渲染成单声道块并累加进左右总线。
    /// `master` 是主增益平滑器，在块末统一施加。
    pub fn render_source_into(
        &mut self,
        src: &mut SourceState,
        assets: &AssetStore,
        left: &mut [f32],
        right: &mut [f32],
    ) {
        debug_assert_eq!(left.len(), BLOCK_SAMPLES);
        let block = &mut self.source_block;
        match &mut src.player {
            PlayerState::Tone { phase, increment } => {
                for (i, x) in block.iter_mut().enumerate() {
                    let g = src.gain.next_sample() * src.fade.next_sample();
                    *x = phase.sin() * g;
                    *phase += *increment;
                    if *phase > 2.0 * std::f32::consts::PI {
                        *phase -= 2.0 * std::f32::consts::PI;
                    }
                    let _ = i;
                }
            }
            PlayerState::Wav {
                asset_hash,
                playhead,
            } => {
                let pcm = assets.get(asset_hash);
                for x in block.iter_mut() {
                    let g = src.gain.next_sample() * src.fade.next_sample();
                    let s = match pcm {
                        Some(pcm) if !pcm.is_empty() => {
                            let s = pcm[*playhead as usize % pcm.len()];
                            *playhead += 1;
                            s
                        }
                        // 素材未装配（如 restore 后未 load_asset）时输出静音而不是崩溃。
                        _ => 0.0,
                    };
                    *x = s * g;
                }
            }
        }
        for i in 0..BLOCK_SAMPLES {
            left[i] += block[i];
            right[i] += block[i];
        }
    }
}

impl Default for SceneGraph {
    fn default() -> Self {
        Self::new()
    }
}

/// 判断 fade 已经完整淡出到 0（dying 声源可以移除）。
pub fn fade_completed(fade: &Smoother) -> bool {
    fade.target() == 0.0 && fade.current() == 0.0
}
