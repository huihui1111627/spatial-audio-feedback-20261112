/**
 * RenderSessionClient：主线程接触音频内核的唯一门面。
 *
 * 链路：主线程 fetch wasm 字节 → 转移给 worklet → worklet 内
 * initSync 同步编译实例化。注意不能传编译好的 WebAssembly.Module：
 * 它无法结构化克隆进 AudioWorklet（消息会被静默丢弃）。
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
  private initError: string | null = null;
  private heartbeatListeners = new Set<(h: ClientHeartbeat) => void>();

  get currentStatus(): ClientStatus {
    return this.status;
  }

  async start({ audioContext }: StartOptions): Promise<void> {
    if (this.status === "ready" || this.status === "compiling") return;
    this.status = "compiling";
    this.context = audioContext;

    const [wasmBytes] = await Promise.all([
      fetch(wasmUrl).then((r) => {
        if (!r.ok) throw new Error(`wasm 下载失败：HTTP ${r.status}`);
        return r.arrayBuffer();
      }),
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
      } else if (event.data?.kind === "initError") {
        this.status = "failed";
        this.initError = String(event.data.error ?? "未知初始化错误");
      } else if (event.data?.kind === "heartbeat") {
        const hb: ClientHeartbeat = {
          blocks: event.data.blocks as number,
          // samples_processed 是 u64，wasm 侧出来是 BigInt，这里归一成 number。
          samples: Number(event.data.samples),
        };
        this.heartbeatListeners.forEach((fn) => fn(hb));
      }
    };
    node.connect(audioContext.destination);
    // wasm 字节走转移（transfer），主线程不再持有副本。
    node.port.postMessage(
      {
        kind: "init",
        wasmBytes,
        sampleRate: audioContext.sampleRate,
      },
      [wasmBytes],
    );
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
          reject(new Error(this.initError ?? "worklet wasm 初始化失败"));
        }
      }, 16);
    });
  }

  /** 增益目标值；内核侧 Smoother 做等功率过渡，调用频率不限。 */
  setGain(gain: number): void {
    this.node?.port.postMessage({ kind: "setGain", gain });
  }

  /** 走带启停。 */
  setPlaying(playing: boolean): void {
    this.node?.port.postMessage({ kind: "setPlaying", playing });
  }

  /** 应用场景快照（SceneProject 的 JSON 串），内核做 diff 与平滑过渡。 */
  applyScene(sceneJson: string): void {
    this.node?.port.postMessage({ kind: "applyScene", scene: sceneJson });
  }

  /** 细粒度参数写入（master/gain、source/{id}/gain …）。 */
  setParam(path: string, value: number): void {
    this.node?.port.postMessage({ kind: "setParam", path, value });
  }

  /** 装配素材 PCM（48k 单声道），底层缓冲零拷贝转移给 worklet。 */
  loadAsset(hash: string, pcm: Float32Array): void {
    this.node?.port.postMessage({ kind: "loadAsset", hash, pcm }, [pcm.buffer]);
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
            samples: Number(event.data.samples),
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
