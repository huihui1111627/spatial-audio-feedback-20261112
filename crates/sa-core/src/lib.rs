//! sa-core：跨 crate 共享的基础类型。
//! 零 IO、零线程、零平台依赖，native 与 wasm32 行为必须一致。

pub mod config;
pub mod error;
pub mod prng;
pub mod smoother;

pub use config::{BLOCK_FRAMES, DEFAULT_SAMPLE_RATE};
pub use error::SaError;
pub use prng::Xoshiro256;
pub use smoother::{SmoothKind, Smoother};
