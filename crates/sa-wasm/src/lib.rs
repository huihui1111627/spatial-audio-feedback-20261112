//! sa-wasm：音频内核的 wasm 绑定。
//!
//! 绑定层不允许写信号逻辑，只做 JS 类型与 RenderSession 之间的薄转换。
//! AudioWorklet 内实例化本模块后，每个 128 帧量子调一次 [`EngineSession::process_block`]。

use sa_engine::RenderSession;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct EngineSession {
    inner: RenderSession,
    /// 累计处理的块数，worklet 心跳直接读它，验证整条调用链活着。
    blocks: u32,
}

#[wasm_bindgen]
impl EngineSession {
    #[wasm_bindgen(constructor)]
    pub fn new(sample_rate: u32) -> Self {
        Self {
            inner: RenderSession::new(sample_rate),
            blocks: 0,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn blocks(&self) -> u32 {
        self.blocks
    }

    #[wasm_bindgen(getter)]
    pub fn samples_processed(&self) -> u64 {
        self.inner.samples_processed()
    }

    /// 主增益目标值；内核侧 Smoother 做等功率过渡，调用频率不限。
    #[wasm_bindgen(js_name = setGain)]
    pub fn set_gain(&mut self, gain: f32) {
        self.inner.set_gain(gain);
    }

    /// 走带启停（暂停时输出静音、时钟不推进）。
    #[wasm_bindgen(js_name = setPlaying)]
    pub fn set_playing(&mut self, playing: bool) {
        self.inner.set_playing(playing);
    }

    /// 应用场景快照 JSON（解析 + 校验 + diff 应用）。
    #[wasm_bindgen(js_name = applyScene)]
    pub fn apply_scene(&mut self, json: &str) -> Result<(), JsError> {
        self.inner
            .apply_scene_json(json)
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// 细粒度参数写入，路径格式见 RenderSession::set_param。
    #[wasm_bindgen(js_name = setParam)]
    pub fn set_param(&mut self, path: &str, value: f32) -> Result<(), JsError> {
        self.inner
            .set_param(path, value)
            .map_err(|e| JsError::new(&e.to_string()))
    }

    /// 装配素材 PCM（48k 单声道 f32），按内容哈希寻址。
    #[wasm_bindgen(js_name = loadAsset)]
    pub fn load_asset(&mut self, hash: &str, pcm: &[f32]) {
        self.inner.load_asset(hash.to_string(), pcm.to_vec());
    }

    /// 处理一个 128 帧块，直接写入 worklet 提供的交错立体声缓冲
    /// （长度须为 256：L,R,L,R...）。零拷贝、无返回分配。
    pub fn process_block(&mut self, interleaved: &mut [f32]) -> Result<(), JsError> {
        if interleaved.len() != 256 {
            return Err(JsError::new("process_block 需要 256 个交错样本 (128 帧立体声)"));
        }
        let mut left = [0.0f32; 128];
        let mut right = [0.0f32; 128];
        self.inner.process_block(&mut left, &mut right);
        for i in 0..128 {
            interleaved[i * 2] = left[i];
            interleaved[i * 2 + 1] = right[i];
        }
        self.blocks += 1;
        Ok(())
    }

    /// 段末导出 checkpoint（M5 分段渲染用）。
    #[wasm_bindgen(js_name = checkpoint)]
    pub fn checkpoint(&self) -> Result<String, JsError> {
        self.inner.checkpoint().map_err(|e| JsError::new(&e.to_string()))
    }
}

#[cfg(all(test, target_arch = "wasm32"))]
mod tests {
    use super::*;
    use wasm_bindgen_test::wasm_bindgen_test;

    /// 最小合法场景：一个测试音声源。
    const SCENE_JSON: &str = r#"{
        "schema_version": 1,
        "app_version": "0.0.0",
        "room": {
            "dimensions": {"x": 8.0, "y": 3.0, "z": 5.0},
            "walls": [
                {"material_id": "plaster", "absorption": [0.15,0.15,0.15,0.15,0.15,0.15,0.15,0.15], "scattering": [0.05,0.05,0.05,0.05,0.05,0.05,0.05,0.05]},
                {"material_id": "plaster", "absorption": [0.15,0.15,0.15,0.15,0.15,0.15,0.15,0.15], "scattering": [0.05,0.05,0.05,0.05,0.05,0.05,0.05,0.05]},
                {"material_id": "plaster", "absorption": [0.15,0.15,0.15,0.15,0.15,0.15,0.15,0.15], "scattering": [0.05,0.05,0.05,0.05,0.05,0.05,0.05,0.05]},
                {"material_id": "plaster", "absorption": [0.15,0.15,0.15,0.15,0.15,0.15,0.15,0.15], "scattering": [0.05,0.05,0.05,0.05,0.05,0.05,0.05,0.05]},
                {"material_id": "plaster", "absorption": [0.15,0.15,0.15,0.15,0.15,0.15,0.15,0.15], "scattering": [0.05,0.05,0.05,0.05,0.05,0.05,0.05,0.05]},
                {"material_id": "plaster", "absorption": [0.15,0.15,0.15,0.15,0.15,0.15,0.15,0.15], "scattering": [0.05,0.05,0.05,0.05,0.05,0.05,0.05,0.05]}
            ],
            "doors": []
        },
        "sources": [
            {"id": "src_1", "name": "测试声源", "asset_hash": "", "position": {"x": 1.0, "y": 1.5, "z": -2.0}, "gain": {"keys": [{"t": 0.0, "value": 0.8, "easing": "linear"}]}}
        ],
        "listener": {
            "position": {"x": 0.0, "y": 1.6, "z": 0.0},
            "forward": {"x": 0.0, "y": 0.0, "z": -1.0},
            "up": {"x": 0.0, "y": 1.0, "z": 0.0}
        },
        "assets": []
    }"#;

    #[wasm_bindgen_test]
    fn session_fills_interleaved_buffer() {
        let mut s = EngineSession::new(48_000);
        s.apply_scene(SCENE_JSON).unwrap();
        s.set_gain(0.5);
        s.set_playing(true);
        let mut buf = vec![0.0f32; 256];
        s.process_block(&mut buf).unwrap();
        assert_eq!(s.blocks(), 1);
        // 平滑器从 0 起步，首样本为 0，后续非零。
        assert_eq!(buf[0], 0.0);
        assert!(buf[254].abs() > 0.0);
        // 左右声道一致（M1 单声像混合）。
        assert_eq!(buf[0], buf[1]);
    }

    #[wasm_bindgen_test]
    fn stopped_session_outputs_silence() {
        let mut s = EngineSession::new(48_000);
        s.apply_scene(SCENE_JSON).unwrap();
        s.set_gain(0.5);
        let mut buf = vec![1.0f32; 256];
        s.process_block(&mut buf).unwrap();
        assert!(buf.iter().all(|x| *x == 0.0));
        assert_eq!(s.samples_processed(), 0);
    }

    #[wasm_bindgen_test]
    fn set_param_routes_to_source() {
        let mut s = EngineSession::new(48_000);
        s.apply_scene(SCENE_JSON).unwrap();
        assert!(s.set_param("source/src_1/gain", 0.3).is_ok());
        assert!(s.set_param("source/ghost/gain", 0.3).is_err());
        assert!(s.set_param("master/gain", 0.9).is_ok());
    }
}
