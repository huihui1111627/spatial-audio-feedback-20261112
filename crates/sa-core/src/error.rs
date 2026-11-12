//! 统一错误类型。

use thiserror::Error;

#[derive(Debug, Error)]
pub enum SaError {
    #[error("参数无效：{0}")]
    InvalidArg(String),

    #[error("场景快照版本 {found} 不受支持（最高支持 {supported}）")]
    UnsupportedSchema { found: u32, supported: u32 },

    #[error("场景数据校验失败：{0}")]
    Schema(String),

    #[error("渲染状态恢复失败：{0}")]
    Checkpoint(String),

    #[error(transparent)]
    Json(#[from] serde_json::Error),
}

pub type SaResult<T> = Result<T, SaError>;
