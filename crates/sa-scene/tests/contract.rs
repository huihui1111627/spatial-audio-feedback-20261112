//! 双端契约测试：Rust 与 TS 解析同一份共享 fixture。
//! fixture 路径在仓库根 tests/fixtures，改字段必须两侧同时改。

use sa_scene::{validate_scene, SceneProject, SCHEMA_VERSION};

const FIXTURE: &str = include_str!("../../../tests/fixtures/sample-scene.json");

#[test]
fn parses_shared_fixture() {
    let p: SceneProject = serde_json::from_str(FIXTURE).expect("共享 fixture 必须能被 Rust 解析");
    assert_eq!(p.schema_version, SCHEMA_VERSION);
    assert_eq!(p.room.walls.len(), 6);
    assert_eq!(p.sources.len(), 1);
    assert_eq!(p.sources[0].id, "src_1");
    assert!(validate_scene(&p).is_ok());
}

#[test]
fn serde_defaults_match_zod() {
    // 去掉带 serde default 的字段后仍能解析，默认值与 TS zod 对齐。
    let mut raw: serde_json::Value = serde_json::from_str(FIXTURE).unwrap();
    raw["room"].as_object_mut().unwrap().remove("doors");
    raw.as_object_mut().unwrap().remove("assets");
    raw["sources"][0].as_object_mut().unwrap().remove("asset_hash");
    let p: SceneProject = serde_json::from_value(raw).unwrap();
    assert!(p.room.doors.is_empty());
    assert!(p.assets.is_empty());
    assert_eq!(p.sources[0].asset_hash, "");
}

#[test]
fn rejects_unknown_schema_version() {
    let mut raw: serde_json::Value = serde_json::from_str(FIXTURE).unwrap();
    raw["schema_version"] = 99.into();
    let p: SceneProject = serde_json::from_value(raw).unwrap();
    assert!(validate_scene(&p).is_err());
}
