//! 场景工程 schema（v1）。
//!
//! M0 只落最小可用集合；轨迹、指向性、距离模型、头部轨迹等在对应
//! 里程碑扩展，扩展时 bump SCHEMA_VERSION 并在 migration/ 加纯函数迁移。

use serde::{Deserialize, Serialize};

/// 当前工程 schema 版本。
pub const SCHEMA_VERSION: u32 = 1;

/// 倍频程频段数（63Hz–8kHz）。
pub const BAND_COUNT: usize = 8;

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Vec3 {
    pub x: f32,
    pub y: f32,
    pub z: f32,
}

/// 可自动化参数的关键帧。M0 只有线性 easing，后续加 cubic 等。
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Easing {
    Linear,
    Step,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Keyframe {
    /// 时间，秒。
    pub t: f32,
    pub value: f32,
    #[serde(default = "default_easing")]
    pub easing: Easing,
}

fn default_easing() -> Easing {
    Easing::Linear
}

/// 统一的可自动化参数。静态值就是单关键帧。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AutomParam {
    pub keys: Vec<Keyframe>,
}

impl AutomParam {
    pub fn constant(value: f32) -> Self {
        Self {
            keys: vec![Keyframe {
                t: 0.0,
                value,
                easing: Easing::Linear,
            }],
        }
    }
}

/// 墙面材质：每个倍频程频段一个吸声/散射系数（0..1）。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct WallMaterial {
    pub material_id: String,
    pub absorption: [f32; BAND_COUNT],
    pub scattering: [f32; BAND_COUNT],
}

/// 门（M0 仅静态开合比例，自动化在 M3 接入）。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Door {
    /// 所属墙面索引 0..6（-x,+x,-y,+y,-z,+z）。
    pub wall: u8,
    /// 开合比例 0..1。
    pub open_fraction: f32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Room {
    pub dimensions: Vec3,
    pub walls: [WallMaterial; 6],
    #[serde(default)]
    pub doors: Vec<Door>,
}

/// 声源。M0 只有静态位置与增益；轨迹/指向/距离模型在 M1–M2 扩展。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SoundSource {
    pub id: String,
    pub name: String,
    /// OPFS 素材的内容哈希；空字符串表示内置测试音。
    #[serde(default)]
    pub asset_hash: String,
    pub position: Vec3,
    pub gain: AutomParam,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Listener {
    pub position: Vec3,
    /// 朝向单位向量与头顶单位向量，共同确定听音方向。
    pub forward: Vec3,
    pub up: Vec3,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AssetRef {
    /// 内容哈希，同时是 OPFS 里的存储键。
    pub hash: String,
    pub name: String,
    pub mime: String,
    pub byte_length: u64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SceneProject {
    pub schema_version: u32,
    pub app_version: String,
    pub room: Room,
    #[serde(default)]
    pub sources: Vec<SoundSource>,
    pub listener: Listener,
    #[serde(default)]
    pub assets: Vec<AssetRef>,
}

/// 测试与校验模块共用的合法工程样例。
#[cfg(test)]
pub(crate) mod tests_fn {
    use super::*;

    pub fn valid_project() -> SceneProject {
        let mat = WallMaterial {
            material_id: "plaster".into(),
            absorption: [0.15; BAND_COUNT],
            scattering: [0.05; BAND_COUNT],
        };
        SceneProject {
            schema_version: SCHEMA_VERSION,
            app_version: "0.0.0".into(),
            room: Room {
                dimensions: Vec3 {
                    x: 8.0,
                    y: 3.0,
                    z: 5.0,
                },
                walls: [
                    mat.clone(),
                    mat.clone(),
                    mat.clone(),
                    mat.clone(),
                    mat.clone(),
                    mat,
                ],
                doors: vec![Door {
                    wall: 0,
                    open_fraction: 0.5,
                }],
            },
            sources: vec![SoundSource {
                id: "src_1".into(),
                name: "测试声源".into(),
                asset_hash: String::new(),
                position: Vec3 {
                    x: 1.0,
                    y: 1.5,
                    z: -2.0,
                },
                gain: AutomParam::constant(0.8),
            }],
            listener: Listener {
                position: Vec3 {
                    x: 0.0,
                    y: 1.6,
                    z: 0.0,
                },
                forward: Vec3 {
                    x: 0.0,
                    y: 0.0,
                    z: -1.0,
                },
                up: Vec3 {
                    x: 0.0,
                    y: 1.0,
                    z: 0.0,
                },
            },
            assets: vec![],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::tests_fn::valid_project;
    use super::*;

    #[test]
    fn json_roundtrip() {
        let p = valid_project();
        let json = serde_json::to_string_pretty(&p).unwrap();
        let back: SceneProject = serde_json::from_str(&json).unwrap();
        assert_eq!(p, back);
    }

    #[test]
    fn constant_automparam_is_single_key() {
        let a = AutomParam::constant(0.42);
        assert_eq!(a.keys.len(), 1);
        assert_eq!(a.keys[0].value, 0.42);
    }
}
