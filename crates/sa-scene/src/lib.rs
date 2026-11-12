//! sa-scene：场景工程的 Rust 侧 schema 与校验。
//!
//! 与 packages/scene-model 的 zod schema 字段一一对应，两侧禁止各自发明字段。
//! CI 用同一份样例 JSON 做双端解析快照测试，任何一侧漂移都会红。

pub mod project;
pub mod validate;

pub use project::{SceneProject, SCHEMA_VERSION};
pub use validate::validate_scene;
