//! 场景语义校验：schema 只管结构，物理合理性在这里查。

use sa_core::SaError;

use crate::project::{SceneProject, SCHEMA_VERSION};

pub fn validate_scene(p: &SceneProject) -> Result<(), SaError> {
    if p.schema_version != SCHEMA_VERSION {
        return Err(SaError::UnsupportedSchema {
            found: p.schema_version,
            supported: SCHEMA_VERSION,
        });
    }
    let d = &p.room.dimensions;
    if d.x <= 0.0 || d.y <= 0.0 || d.z <= 0.0 {
        return Err(SaError::Schema("房间尺寸必须为正数".into()));
    }
    for (i, w) in p.room.walls.iter().enumerate() {
        for (b, a) in w.absorption.iter().enumerate() {
            if !(0.0..=1.0).contains(a) {
                return Err(SaError::Schema(format!(
                    "墙面 {i} 频段 {b} 吸声系数 {a} 超出 0..1"
                )));
            }
        }
        for (b, s) in w.scattering.iter().enumerate() {
            if !(0.0..=1.0).contains(s) {
                return Err(SaError::Schema(format!(
                    "墙面 {i} 频段 {b} 散射系数 {s} 超出 0..1"
                )));
            }
        }
    }
    for door in &p.room.doors {
        if door.wall >= 6 {
            return Err(SaError::Schema(format!(
                "门的墙面索引 {} 越界（0..6）",
                door.wall
            )));
        }
        if !(0.0..=1.0).contains(&door.open_fraction) {
            return Err(SaError::Schema(format!(
                "门开合比例 {} 超出 0..1",
                door.open_fraction
            )));
        }
    }
    for s in &p.sources {
        if s.id.is_empty() {
            return Err(SaError::Schema("声源 id 不能为空".into()));
        }
        for k in &s.gain.keys {
            if k.value < 0.0 {
                return Err(SaError::Schema(format!("声源 {} 增益不能为负", s.id)));
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::tests_fn::valid_project;

    #[test]
    fn accepts_valid() {
        assert!(validate_scene(&valid_project()).is_ok());
    }

    #[test]
    fn rejects_bad_dimensions() {
        let mut p = valid_project();
        p.room.dimensions.x = -1.0;
        assert!(validate_scene(&p).is_err());
    }

    #[test]
    fn rejects_bad_absorption() {
        let mut p = valid_project();
        p.room.walls[0].absorption[3] = 1.2;
        assert!(validate_scene(&p).is_err());
    }
}
