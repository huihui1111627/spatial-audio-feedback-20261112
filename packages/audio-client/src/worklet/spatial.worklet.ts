/**
 * 空间音频 worklet —— 只做搬运，不写任何 DSP。
 *
 * 约束（继承 podcast-repair 的 worklet 约定）：
 * - 信号运算全部在 wasm 的 RenderSession 内完成
 * - process 回调里不分配对象（除首次复用的交错缓冲外）、不做日志
 * - 参数经主线程消息投递（M0）；M2 起换成 SAB SPSC ringbuf，本文件再扩通道
 */
import initWasm, { EngineSession } from "../wasm/sa_wasm.js";

const BLOCK_FRAMES = 128;

type WorkletMessage =
  | { kind: "init"; module: WebAssembly.Module; sampleRate: number }
  | { kind: "setGain"; gain: number }
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
          // 复用主线程编译好的 Module，worklet 内零网络请求。
          initWasm(msg.module).then(() => {
            this.session = new EngineSession(msg.sampleRate);
            this.port.postMessage({ kind: "ready" });
          });
          break;
        case "setGain":
          this.session?.setGain(msg.gain);
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
