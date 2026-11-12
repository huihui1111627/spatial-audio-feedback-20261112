//! RenderSession：单一会话内核，实时/离线同一条 process_block 路径。
//!
//! M1 起会话由场景快照驱动：apply_scene 做 diff 应用，set_param 写
//! Smoother target。所有有记忆元件的状态都在 [`SessionState`] 里，
//! checkpoint/restore 保证样本级连续。

use std::sync::Arc;

use sa_core::{SaError, SmoothKind, Smoother, DEFAULT_SAMPLE_RATE};
use sa_dsp::BLOCK_SAMPLES;
use sa_scene::project::SceneProject;

use crate::graph::{fade_completed, AssetStore, SceneGraph};
use crate::scene_apply::apply_scene;
use crate::state::{SessionState, STATE_VERSION};

const MASTER_GAIN_SMOOTH_MS: f32 = 10.0;

pub struct RenderSession {
    state: SessionState,
    graph: SceneGraph,
    /// 素材 PCM（48k 单声道），内容哈希寻址；不进 checkpoint。
    assets: AssetStore,
}

impl RenderSession {
    pub fn new(sample_rate: u32) -> Self {
        let state = SessionState {
            state_version: STATE_VERSION,
            sample_rate,
            samples_processed: 0,
            master_gain: Smoother::new(
                SmoothKind::EqualPower,
                sample_rate,
                MASTER_GAIN_SMOOTH_MS,
                0.0,
            ),
            playing: false,
            scene: None,
            sources: Vec::new(),
            dying: Vec::new(),
        };
        Self {
            state,
            graph: SceneGraph::new(),
            assets: AssetStore::new(),
        }
    }

    pub fn sample_rate(&self) -> u32 {
        self.state.sample_rate
    }

    pub fn samples_processed(&self) -> u64 {
        self.state.samples_processed
    }

    pub fn is_playing(&self) -> bool {
        self.state.playing
    }

    /// 走带启停。停止时输出静音、时钟不推进。
    pub fn set_playing(&mut self, playing: bool) {
        self.state.playing = playing;
    }

    /// 主增益目标值，经等功率 Smoother 过渡。
    pub fn set_gain(&mut self, gain: f32) {
        self.state.master_gain.set_target(gain.clamp(0.0, 1.0));
    }

    /// 装配素材 PCM（restore 之后也需要重新装配）。
    pub fn load_asset(&mut self, hash: String, pcm: Vec<f32>) {
        self.assets.insert(hash, Arc::new(pcm));
    }

    /// 应用新场景快照（diff 到运行状态，结构性变更自动淡入淡出）。
    pub fn apply_scene(&mut self, scene: SceneProject) {
        apply_scene(&mut self.state, scene);
    }

    /// JSON 入口：解析 + 语义校验 + 应用。wasm/CLI 共用。
    pub fn apply_scene_json(&mut self, json: &str) -> Result<(), SaError> {
        let scene: SceneProject = serde_json::from_str(json)?;
        sa_scene::validate_scene(&scene)?;
        self.apply_scene(scene);
        Ok(())
    }

    /// 细粒度参数写入（全部走 Smoother，调用频率不限）。
    ///
    /// 路径格式：
    /// - `master/gain`
    /// - `source/{id}/gain`
    pub fn set_param(&mut self, path: &str, value: f32) -> Result<(), SaError> {
        let parts: Vec<&str> = path.split('/').collect();
        match parts.as_slice() {
            ["master", "gain"] => {
                self.set_gain(value);
                Ok(())
            }
            ["source", id, "gain"] => {
                let src = self
                    .state
                    .sources
                    .iter_mut()
                    .find(|s| s.id == *id)
                    .ok_or_else(|| SaError::InvalidArg(format!("声源 {id} 不存在")))?;
                src.gain.set_target(value.clamp(0.0, 1.0));
                Ok(())
            }
            _ => Err(SaError::InvalidArg(format!("未知参数路径 {path}"))),
        }
    }

    /// 处理一个 128 帧块，左右声道写入调用方提供的缓冲。
    /// worklet 内由 wasm 导出函数包装调用；离线渲染在 worker/CLI 里循环调用。
    pub fn process_block(&mut self, out_left: &mut [f32], out_right: &mut [f32]) {
        assert_eq!(out_left.len(), BLOCK_SAMPLES);
        assert_eq!(out_right.len(), BLOCK_SAMPLES);

        if !self.state.playing {
            out_left.fill(0.0);
            out_right.fill(0.0);
            return;
        }

        out_left.fill(0.0);
        out_right.fill(0.0);

        for i in 0..self.state.sources.len() {
            // 分裂借用：graph/state.sources/assets 是不相交字段。
            let src = &mut self.state.sources[i];
            self.graph
                .render_source_into(src, &self.assets, out_left, out_right);
        }
        for i in 0..self.state.dying.len() {
            let src = &mut self.state.dying[i];
            self.graph
                .render_source_into(src, &self.assets, out_left, out_right);
        }
        self.state.dying.retain(|s| !fade_completed(&s.fade));

        for (l, r) in out_left.iter_mut().zip(out_right.iter_mut()) {
            let g = self.state.master_gain.next_sample();
            *l *= g;
            *r *= g;
        }
        self.state.samples_processed += BLOCK_SAMPLES as u64;
    }

    /// 导出 checkpoint（分段渲染的段末动作）。
    pub fn checkpoint(&self) -> serde_json::Result<String> {
        serde_json::to_string(&self.state)
    }

    /// 从 checkpoint 恢复（下一段的段首动作）。
    /// 注意：素材 PCM 不进 checkpoint，恢复后需按 hash 重新 load_asset。
    pub fn restore(json: &str) -> Result<Self, SaError> {
        let state: SessionState = serde_json::from_str(json)?;
        if state.state_version != STATE_VERSION {
            return Err(SaError::Checkpoint(format!(
                "未知 state_version {}（当前支持 {}）",
                state.state_version, STATE_VERSION
            )));
        }
        Ok(Self {
            state,
            graph: SceneGraph::new(),
            assets: AssetStore::new(),
        })
    }
}

impl Default for RenderSession {
    fn default() -> Self {
        Self::new(DEFAULT_SAMPLE_RATE)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sa_scene::project::tests_fn::valid_project;

    fn render_blocks(s: &mut RenderSession, n: usize) -> (Vec<f32>, Vec<f32>) {
        let mut left = Vec::new();
        let mut right = Vec::new();
        let (mut l, mut r) = (vec![0.0; BLOCK_SAMPLES], vec![0.0; BLOCK_SAMPLES]);
        for _ in 0..n {
            s.process_block(&mut l, &mut r);
            left.extend_from_slice(&l);
            right.extend_from_slice(&r);
        }
        (left, right)
    }

    fn playing_session() -> RenderSession {
        let mut s = RenderSession::new(48_000);
        s.apply_scene(valid_project());
        s.set_gain(0.8);
        s.set_playing(true);
        s
    }

    #[test]
    fn silence_when_stopped() {
        let mut s = RenderSession::new(48_000);
        s.apply_scene(valid_project());
        s.set_gain(0.8);
        let (l, r) = render_blocks(&mut s, 4);
        assert!(l.iter().all(|x| *x == 0.0));
        assert!(r.iter().all(|x| *x == 0.0));
        assert_eq!(s.samples_processed(), 0, "暂停时时钟不推进");
    }

    #[test]
    fn plays_after_scene_applied() {
        let mut s = playing_session();
        // 多渲染几块，越过淡入与主增益平滑期。
        let (l, _) = render_blocks(&mut s, 20);
        assert!(l.iter().any(|x| x.abs() > 0.1), "播放中应有非零输出");
        assert_eq!(s.samples_processed(), 20 * BLOCK_SAMPLES as u64);
    }

    #[test]
    fn master_gain_change_has_no_discontinuity() {
        let mut s = playing_session();
        render_blocks(&mut s, 20);
        s.set_gain(0.2);
        let (l, _) = render_blocks(&mut s, 1);
        for w in l.windows(2) {
            assert!((w[1] - w[0]).abs() < 0.05, "出现疑似爆音跳变");
        }
    }

    #[test]
    fn add_and_remove_source_has_no_discontinuity() {
        let mut s = playing_session();
        render_blocks(&mut s, 20);

        // 新增一个声源（结构性变更，应淡入）。
        let mut scene2 = valid_project();
        scene2.sources.push(sa_scene::project::SoundSource {
            id: "src_2".into(),
            name: "第二个声源".into(),
            asset_hash: String::new(),
            position: sa_scene::project::Vec3 {
                x: -1.0,
                y: 1.5,
                z: 1.0,
            },
            gain: sa_scene::project::AutomParam::constant(0.6),
        });
        s.apply_scene(scene2.clone());
        let (l, _) = render_blocks(&mut s, 1);
        for w in l.windows(2) {
            assert!((w[1] - w[0]).abs() < 0.05, "新增声源出现跳变");
        }

        // 删除声源（应淡出而不是硬切）。
        s.apply_scene(valid_project());
        let (l, _) = render_blocks(&mut s, 1);
        for w in l.windows(2) {
            assert!((w[1] - w[0]).abs() < 0.05, "删除声源出现跳变");
        }
    }

    #[test]
    fn checkpoint_restore_is_sample_exact() {
        let mut a = playing_session();
        render_blocks(&mut a, 10);
        // 让 Smoother 处于过渡中间态再 checkpoint。
        a.set_gain(0.3);
        a.set_param("source/src_1/gain", 0.4).unwrap();
        render_blocks(&mut a, 1);
        let json = a.checkpoint().unwrap();
        let mut b = RenderSession::restore(&json).unwrap();

        for _ in 0..20 {
            let (mut la, mut ra) = (vec![0.0; BLOCK_SAMPLES], vec![0.0; BLOCK_SAMPLES]);
            let (mut lb, mut rb) = (vec![0.0; BLOCK_SAMPLES], vec![0.0; BLOCK_SAMPLES]);
            a.process_block(&mut la, &mut ra);
            b.process_block(&mut lb, &mut rb);
            assert_eq!(la, lb, "checkpoint 恢复后必须逐样本相等");
            assert_eq!(ra, rb);
        }
        assert_eq!(a.samples_processed(), b.samples_processed());
    }

    #[test]
    fn restore_rejects_unknown_state_version() {
        let s = playing_session();
        let json = s.checkpoint().unwrap().replace(
            &format!("\"state_version\":{}", STATE_VERSION),
            "\"state_version\":999",
        );
        assert!(RenderSession::restore(&json).is_err());
    }

    #[test]
    fn wav_player_loops_and_is_deterministic() {
        let pcm: Vec<f32> = (0..100).map(|i| (i as f32) / 100.0).collect();
        let make = || {
            let mut s = RenderSession::new(48_000);
            let mut scene = valid_project();
            scene.sources[0].asset_hash = "hash_a".into();
            s.load_asset("hash_a".into(), pcm.clone());
            s.apply_scene(scene);
            s.set_gain(1.0);
            s.set_playing(true);
            s
        };
        let (la, _) = render_blocks(&mut make(), 8);
        let (lb, _) = render_blocks(&mut make(), 8);
        assert_eq!(la, lb, "同素材同参数必须 bit-equal");
        // 100 帧的 PCM 在 8×128 帧内必然循环多次，输出应非零。
        assert!(la.iter().any(|x| x.abs() > 0.0));
    }

    #[test]
    fn set_param_rejects_bad_path() {
        let mut s = playing_session();
        assert!(s.set_param("source/ghost/gain", 0.5).is_err());
        assert!(s.set_param("nonsense", 0.5).is_err());
    }
}
