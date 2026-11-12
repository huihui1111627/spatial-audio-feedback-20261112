//! 可序列化的会话状态。
//!
//! 每个有记忆的元件（Smoother、播放器读写头、后续 M2 的 VDL、M4 的
//! FDN 与分区卷积缓冲、PRNG……）都必须把完整状态放进这里，分段渲染靠
//! dump/restore 这个结构保证拼接点样本级连续。
//!
//! 注意：素材 PCM 本体不进 checkpoint（内容哈希寻址、不可变），
//! restore 之后由调用方按 hash 重新装配 [`crate::RenderSession::load_asset`]。

use sa_core::Smoother;
use sa_scene::project::SceneProject;
use serde::{Deserialize, Serialize};

/// 当前会话状态版本。结构变更时 bump 并在 restore 里拒绝旧版本。
pub const STATE_VERSION: u32 = 2;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SessionState {
    /// 状态结构自身的版本号，与会话工程 schema 独立演进。
    pub state_version: u32,
    pub sample_rate: u32,
    /// 已处理的样本总数（走带时间），离线分段恢复后必须与文件写入位置一致。
    /// 暂停时不推进。
    pub samples_processed: u64,
    pub master_gain: Smoother,
    /// 走带状态：false 时输出静音且不推进时钟。
    pub playing: bool,
    /// 最近一次 apply_scene 的场景快照，checkpoint 随状态一起落盘。
    pub scene: Option<SceneProject>,
    pub sources: Vec<SourceState>,
    /// 已删除但仍在做淡出收尾的声源，fade 到 0 后移除。
    pub dying: Vec<SourceState>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SourceState {
    pub id: String,
    /// 声源增益（场景里 gain 自动化在当前走带时刻的值）。
    pub gain: Smoother,
    /// 结构性变更（新建/换素材/删除）的等功率淡入淡出。
    pub fade: Smoother,
    pub player: PlayerState,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlayerState {
    /// 内置测试音（声源未挂素材时），相位连续保证无爆音。
    Tone { phase: f32, increment: f32 },
    /// 素材 PCM 循环播放，playhead 是帧索引。PCM 本体按 hash 外部装配。
    Wav { asset_hash: String, playhead: u64 },
}
