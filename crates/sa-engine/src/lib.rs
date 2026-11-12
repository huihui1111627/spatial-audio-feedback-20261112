//! sa-engine：实时试听与离线渲染的唯一信号内核门面。
//!
//! 架构铁律：TS 侧不允许出现第二套声学/DSP 逻辑，所有声音只能从
//! [`RenderSession::process_block`] 出来。实时模式由 AudioWorklet 量子驱动，
//! 离线模式（M5）由外部样本时钟驱动同一条路径。

pub mod graph;
pub mod scene_apply;
pub mod session;
pub mod state;

pub use scene_apply::eval_autom_param;
pub use session::RenderSession;
pub use state::{PlayerState, SessionState, SourceState, STATE_VERSION};
