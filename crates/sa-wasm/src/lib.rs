//! sa-wasm：音频内核的 wasm 绑定。
//!
//! 绑定层不允许写信号逻辑，只做 JS 类型与 RenderSession 之间的薄转换。
//! AudioWorklet 内实例化本模块后，每个 128 帧量子调一次 [`EngineSession::process_block`]。

use sa_engine::RenderSession;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn add(a: u32, b: u32) -> u32 {
    a + b
}

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

    #[wasm_bindgen(js_name = setGain)]
    pub fn set_gain(&mut self, gain: f32) {
        self.inner.set_gain(gain);
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

    /// 段末导出 checkpoint（M5 分段渲染用，M0 先验证序列化链路）。
    #[wasm_bindgen(js_name = checkpoint)]
    pub fn checkpoint(&self) -> Result<String, JsError> {
        self.inner.checkpoint().map_err(|e| JsError::new(&e.to_string()))
    }
}

#[cfg(all(test, target_arch = "wasm32"))]
#[wasm_bindgen_test::wasm_bindgen_test]
fn add_works() {
    assert_eq!(add(40, 2), 42);
}

#[cfg(all(test, target_arch = "wasm32"))]
#[wasm_bindgen_test::wasm_bindgen_test]
fn session_fills_interleaved_buffer() {
    let mut s = EngineSession::new(48_000);
    s.set_gain(0.5);
    let mut buf = vec![0.0f32; 256];
    s.process_block(&mut buf).unwrap();
    assert_eq!(s.blocks(), 1);
    // 平滑器从 0 起步，首样本为 0，后续非零。
    assert_eq!(buf[0], 0.0);
    assert!(buf[254].abs() > 0.0);
    // 左右声道一致（M0 单声像测试音）。
    assert_eq!(buf[0], buf[1]);
}
