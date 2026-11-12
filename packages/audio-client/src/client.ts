/**
 * RenderSessionClient：主线程接触音频内核的唯一门面。
 *
 * M0 链路：主线程 fetch+compile wasm → 把 Module 转移给 worklet →
 * worklet 内 initWasm(module) 实例化 EngineSession。
 * 后续参数通道（M2 起）在这里切 SAB ringbuf，调用方接口不变。
 */
import type { EngineSession } from "./wasm/sa_wasm.js";

// worklet 通过 ?url 交给 Vite 产出独立 chunk，AudioWorklet.addModule 加载。
import workletUrl from "./worklet/spatial.worklet.ts?url";
// wasm 二进制同样作为独立资源 URL，由主线程编译后转移给 worklet。
import wasmUrl from "./wasm/sa_wasm_bg.wasm?url";

export type ClientStatus = "idle" | "compiling" | "ready" | "failed";

export interface ClientHeartbeat {
  blocks: number;
  samples: number;
}

export interface StartOptions {
  audioContext: AudioContext;
}

export class RenderSessionClient {
  private node: AudioWorkletNode | null = null;
  private context: AudioContext | null = null;
  private status: ClientStatus = "idle";
  private heartbeatListeners = new Set<(h: ClientHeartbeat) => void>();

  get currentStatus(): ClientStatus {
    return this.status;
  }

  async start({ audioContext }: StartOptions): Promise<void> {
    if (this.status === "ready" || this.status === "compiling") return;
    this.status = "compiling";
    this.context = audioContext;

    const [module] = await Promise.all([
      WebAssembly.compileStreaming(fetch(wasmUrl)),
      audioContext.audioWorklet.addModule(workletUrl),
    ]);

    const node = new AudioWorkletNode(audioContext, "spatial-processor", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    node.port.onmessage = (event: MessageEvent) => {
      if (event.data?.kind === "ready") {
        this.status = "ready";
      } else if (event.data?.kind === "heartbeat") {
        const hb: ClientHeartbeat = {
          blocks: event.data.blocks as number,
          samples: event.data.samples as number,
        };
        this.heartbeatListeners.forEach((fn) => fn(hb));
      }
    };
    node.connect(audioContext.destination);
    node.port.postMessage({
      kind: "init",
      module,
      sampleRate: audioContext.sampleRate,
    });
    this.node = node;

    // 等待 worklet 回 ready，避免调用方在 DSP 未就绪时调参。
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("worklet wasm 初始化超时")),
        5000,
      );
      const check = setInterval(() => {
        if (this.status === "ready") {
          clearInterval(check);
          clearTimeout(timer);
          resolve();
        } else if (this.status === "failed") {
          clearInterval(check);
          clearTimeout(timer);
          reject(new Error("worklet wasm 初始化失败"));
        }
      }, 16);
    });
  }

  /** 增益目标值；内核侧 Smoother 做等功率过渡，调用频率不限。 */
  setGain(gain: number): void {
    this.node?.port.postMessage({ kind: "setGain", gain });
  }

  requestHeartbeat(): Promise<ClientHeartbeat> {
    return new Promise((resolve) => {
      const node = this.node;
      if (!node) {
        resolve({ blocks: 0, samples: 0 });
        return;
      }
      const handler = (event: MessageEvent) => {
        if (event.data?.kind === "heartbeat") {
          node.port.removeEventListener("message", handler);
          resolve({
            blocks: event.data.blocks as number,
            samples: event.data.samples as number,
          });
        }
      };
      node.port.addEventListener("message", handler);
      node.port.postMessage({ kind: "heartbeat" });
    });
  }

  onHeartbeat(fn: (h: ClientHeartbeat) => void): () => void {
    this.heartbeatListeners.add(fn);
    return () => this.heartbeatListeners.delete(fn);
  }

  async stop(): Promise<void> {
    this.node?.disconnect();
    this.node = null;
    this.status = "idle";
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }
}

// 仅用于约束导出类型，避免 tree-shaking 后类型名丢失。
export type { EngineSession };
