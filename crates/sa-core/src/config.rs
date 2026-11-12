//! 全局音频常量。

/// 默认采样率。离线渲染支持其他采样率时在调用侧按比例换算。
pub const DEFAULT_SAMPLE_RATE: u32 = 48_000;

/// AudioWorklet 标准量子，所有块处理都按这个帧数对齐，
/// 分段渲染的切段点也必须是它的整数倍。
pub const BLOCK_FRAMES: usize = 128;
