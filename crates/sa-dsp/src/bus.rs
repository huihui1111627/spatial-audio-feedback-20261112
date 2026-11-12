//! 音频块与输出总线。

use sa_core::BLOCK_FRAMES;

/// 每个处理块的样本数，固定对齐 AudioWorklet 量子。
pub const BLOCK_SAMPLES: usize = BLOCK_FRAMES;

/// 一次渲染的输出总线。M0 只有双耳立体声；
/// 5.1 的 SurroundBus 在 M6 加入，枚举在这里扩展。
#[derive(Debug, Clone)]
pub struct RenderBus {
    pub left: Vec<f32>,
    pub right: Vec<f32>,
}

impl RenderBus {
    pub fn silent() -> Self {
        Self {
            left: vec![0.0; BLOCK_SAMPLES],
            right: vec![0.0; BLOCK_SAMPLES],
        }
    }

    pub fn fill(&mut self, value: f32) {
        self.left.fill(value);
        self.right.fill(value);
    }
}
