/**
 * 空间音频 worklet —— 只做搬运，不写任何 DSP。
 *
 * 约束（继承 podcast-repair 的 worklet 约定）：
 * - 信号运算全部在 wasm 的 RenderSession 内完成
 * - process 回调里不分配对象（除首次复用的交错缓冲外）、不做日志
 * - 参数经主线程消息投递（M0）；M2 起换成 SAB SPSC ringbuf，本文件再扩通道
 */
// 顺序敏感：polyfill 必须先于 sa_wasm.js 求值（worklet 全局缺 TextDecoder/TextEncoder）。
import "./text-encoding-polyfill.js";
import { initSync, EngineSession } from "../wasm/sa_wasm.js";

const BLOCK_FRAMES = 128;

type WorkletMessage =
  | { kind: "init"; wasmBytes: ArrayBuffer; sampleRate: number }
  | { kind: "setGain"; gain: number }
  | { kind: "setPlaying"; playing: boolean }
  | { kind: "applyScene"; scene: string }
  | { kind: "setParam"; path: string; value: number }
  | { kind: "loadAsset"; hash: string; pcm: Float32Array }
  | { kind: "heartbeat" };

class SpatialProcessor extends AudioWorkletProcessor {
  private session: EngineSession | null = null;
  private readonly interleaved = new Float32Array(BLOCK_FRAMES * 2);
  private blockCount = 0;

  constructor() {
    super();
    this.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      const msg = event.data;
      switch (msg.kind) {
        case "init":
          // wasm 字节由主线程转移过来（WebAssembly.Module 无法克隆进
          // AudioWorklet，必须传字节在本地编译）。同步编译只发生在启动一次。
          try {
            initSync(msg.wasmBytes);
            this.session = new EngineSession(msg.sampleRate);
            this.port.postMessage({ kind: "ready" });
          } catch (err) {
            this.port.postMessage({
              kind: "initError",
              error: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        case "setGain":
          this.session?.setGain(msg.gain);
          break;
        case "setPlaying":
          this.session?.setPlaying(msg.playing);
          break;
        case "applyScene":
          // 场景校验失败不炸音频线程：静默丢弃，由主线程侧先行校验兜底。
          try {
            this.session?.applyScene(msg.scene);
          } catch {
            // 忽略非法场景，主线程 store 层保证只发合法数据。
          }
          break;
        case "setParam":
          try {
            this.session?.setParam(msg.path, msg.value);
          } catch {
            // 未知路径/目标静默忽略。
          }
          break;
        case "loadAsset":
          this.session?.loadAsset(msg.hash, msg.pcm);
          break;
        case "heartbeat":
          this.port.postMessage({
            kind: "heartbeat",
            blocks: this.blockCount,
            samples: this.session?.samples_processed ?? 0,
          });
          break;
      }
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const session = this.session;
    if (!session) {
      // wasm 尚未就绪，输出静音而不是停掉节点。
      for (const channels of outputs) {
        for (const channel of channels) channel.fill(0);
      }
      return true;
    }

    session.process_block(this.interleaved);

    const channels = outputs[0];
    if (!channels || channels.length < 2) return true;
    const left = channels[0]!;
    const right = channels[1]!;
    for (let i = 0; i < BLOCK_FRAMES; i += 1) {
      left[i] = this.interleaved[i * 2]!;
      right[i] = this.interleaved[i * 2 + 1]!;
    }
    this.blockCount += 1;
    return true;
  }
}

registerProcessor("spatial-processor", SpatialProcessor);
