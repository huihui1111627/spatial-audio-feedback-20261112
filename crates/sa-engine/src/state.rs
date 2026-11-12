//! 可序列化的会话状态。
//!
//! M0 只包含测试振荡器与平滑器；后续每个有记忆的元件（VDL、FDN、
//! 分区卷积缓冲、PRNG……）都必须把完整状态放进这里，分段渲染靠
//! dump/restore 这个结构保证拼接点样本级连续。

use sa_core::Smoother;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionState {
    /// 状态结构自身的版本号，与会话工程 schema 独立演进。
    pub state_version: u32,
    pub sample_rate: u32,
    /// 已处理的样本总数，离线分段恢复后必须与文件写入位置一致。
    pub samples_processed: u64,
    pub gain: Smoother,
    /// 振荡器相位（弧度），恢复后波形零接缝。
    pub osc_phase: f32,
    pub osc_increment: f32,
}
