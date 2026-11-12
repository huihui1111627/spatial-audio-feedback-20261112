//! 场景快照应用：把编辑态的 SceneProject diff 到运行中的会话上。
//!
//! 规则（防爆音铁律的具体化）：
//! - 结构性变更（新增/删除声源、换素材）：节点重建 + 10ms 等功率淡入，
//!   删除不立即摘节点，转入 dying 列表淡出到 0 再移除；
//! - 参数性变更（增益等）：一律写 Smoother target，绝不原地改值。

use sa_core::{SmoothKind, Smoother};
use sa_scene::project::{AutomParam, Easing, SceneProject, SoundSource};

use crate::graph::test_tone_increment;
use crate::state::{PlayerState, SessionState, SourceState};

/// 增益类参数的平滑时间常数。
const GAIN_SMOOTH_MS: f32 = 10.0;
/// 结构性变更的淡入淡出时长。
const FADE_MS: f32 = 10.0;

/// 求可自动化参数在时刻 t（秒）的值。M3 的自动化求值器会复用这套规则。
pub fn eval_autom_param(param: &AutomParam, t: f32) -> f32 {
    let keys = &param.keys;
    if keys.is_empty() {
        return 0.0;
    }
    if t <= keys[0].t {
        return keys[0].value;
    }
    for w in keys.windows(2) {
        let (a, b) = (&w[0], &w[1]);
        if t < b.t {
            return match a.easing {
                Easing::Step => a.value,
                Easing::Linear => {
                    let span = b.t - a.t;
                    if span <= 0.0 {
                        b.value
                    } else {
                        a.value + (b.value - a.value) * (t - a.t) / span
                    }
                }
            };
        }
    }
    keys[keys.len() - 1].value
}

fn make_player(source: &SoundSource, sample_rate: u32) -> PlayerState {
    if source.asset_hash.is_empty() {
        PlayerState::Tone {
            phase: 0.0,
            increment: test_tone_increment(sample_rate),
        }
    } else {
        PlayerState::Wav {
            asset_hash: source.asset_hash.clone(),
            playhead: 0,
        }
    }
}

fn player_asset(player: &PlayerState) -> &str {
    match player {
        PlayerState::Tone { .. } => "",
        PlayerState::Wav { asset_hash, .. } => asset_hash,
    }
}

fn new_source_state(source: &SoundSource, sample_rate: u32, t: f32) -> SourceState {
    let gain_value = eval_autom_param(&source.gain, t);
    let mut fade = Smoother::new(SmoothKind::EqualPower, sample_rate, FADE_MS, 0.0);
    fade.set_target(1.0);
    SourceState {
        id: source.id.clone(),
        // 新声源增益直接到位，靠 fade 做无声进入。
        gain: Smoother::new(SmoothKind::EqualPower, sample_rate, GAIN_SMOOTH_MS, gain_value),
        fade,
        player: make_player(source, sample_rate),
    }
}

/// 把新场景 diff 应用到会话状态。调用方负责先过 validate_scene。
pub fn apply_scene(state: &mut SessionState, scene: SceneProject) {
    let t = state.samples_processed as f32 / state.sample_rate as f32;
    let sr = state.sample_rate;

    let prev_sources: Vec<SoundSource> = state
        .scene
        .as_ref()
        .map(|p| p.sources.clone())
        .unwrap_or_default();

    // 1. 现有节点：保留并更新参数，或转入 dying 淡出。
    let mut kept: Vec<SourceState> = Vec::with_capacity(state.sources.len());
    for mut node in state.sources.drain(..) {
        match scene.sources.iter().find(|s| s.id == node.id) {
            None => {
                node.fade.set_target(0.0);
                state.dying.push(node);
            }
            Some(new_src) => {
                if player_asset(&node.player) != new_src.asset_hash {
                    // 换素材 = 结构性变更：重建播放器并重新淡入。
                    node.player = make_player(new_src, sr);
                    node.fade.set_target(1.0);
                }
                node.gain
                    .set_target(eval_autom_param(&new_src.gain, t).max(0.0));
                kept.push(node);
            }
        }
    }

    // 2. 新增节点：淡入进入。
    for s in &scene.sources {
        if prev_sources.iter().all(|p| p.id != s.id)
            && kept.iter().all(|k| k.id != s.id)
        {
            kept.push(new_source_state(s, sr, t));
        }
    }

    state.sources = kept;
    state.scene = Some(scene);
}
