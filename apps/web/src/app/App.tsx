import { useEffect, useRef, useState } from "react";
import {
  detectCapabilities,
  RenderSessionClient,
  type ClientHeartbeat,
  type RuntimeCapabilities,
} from "@spatial/audio-client";
import { buildSampleScene } from "@spatial/scene-model";
import { packProject, unpackProject } from "@spatial/project";

type EngineStatus = "idle" | "compiling" | "ready" | "failed";

const CAP_LABELS: Array<[keyof RuntimeCapabilities, string]> = [
  ["crossOriginIsolated", "跨源隔离（SAB 前提）"],
  ["sharedArrayBuffer", "SharedArrayBuffer"],
  ["opfs", "OPFS 素材存储"],
  ["opfsSyncAccessHandle", "OPFS 同步句柄"],
  ["audioWorklet", "AudioWorklet"],
  ["webCodecsAudioDecoder", "WebCodecs 音频解码"],
  ["webCodecsAudioEncoder", "WebCodecs 音频编码"],
  ["wasmSimd", "WebAssembly 能力"],
];

export function App() {
  const [caps, setCaps] = useState<RuntimeCapabilities | null>(null);
  const [status, setStatus] = useState<EngineStatus>("idle");
  const [heartbeat, setHeartbeat] = useState<ClientHeartbeat>({
    blocks: 0,
    samples: 0,
  });
  const [gain, setGain] = useState(0.3);
  const [error, setError] = useState<string | null>(null);
  const [projectCheck, setProjectCheck] = useState<string | null>(null);
  const clientRef = useRef<RenderSessionClient | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    setCaps(detectCapabilities());
    return () => {
      void clientRef.current?.stop();
      clientRef.current = null;
      audioCtxRef.current = null;
    };
  }, []);

  async function startEngine() {
    setError(null);
    setStatus("compiling");
    try {
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const client = new RenderSessionClient();
      clientRef.current = client;
      client.onHeartbeat(setHeartbeat);
      await client.start({ audioContext: ctx });
      client.setGain(gain);
      setStatus("ready");
    } catch (err) {
      setStatus("failed");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function stopEngine() {
    await clientRef.current?.stop();
    clientRef.current = null;
    audioCtxRef.current = null;
    setStatus("idle");
    setHeartbeat({ blocks: 0, samples: 0 });
  }

  function changeGain(value: number) {
    setGain(value);
    clientRef.current?.setGain(value);
  }

  async function refreshHeartbeat() {
    const client = clientRef.current;
    if (!client) return;
    setHeartbeat(await client.requestHeartbeat());
  }

  function selfTestProject() {
    try {
      const bytes = packProject({ scene: buildSampleScene() });
      const unpacked = unpackProject(bytes);
      setProjectCheck(
        `打包解包通过：${bytes.byteLength} 字节，声源 ${unpacked.scene.sources.length} 个，CRC 校验正常`,
      );
    } catch (err) {
      setProjectCheck(`失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">spatial-audio-studio</h1>
        <p className="text-neutral-400 text-sm mt-1">
          M0 自检：环境能力、worklet 内 wasm 心跳、工程文件打包解包
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">运行环境</h2>
        <div className="grid grid-cols-2 gap-2 max-w-2xl">
          {caps &&
            CAP_LABELS.map(([key, label]) => (
              <div
                key={key}
                className="flex items-center justify-between rounded border border-neutral-800 px-3 py-2 text-sm"
              >
                <span className="text-neutral-300">{label}</span>
                <span className={caps[key] ? "text-emerald-400" : "text-amber-400"}>
                  {caps[key] ? "可用" : "不可用"}
                </span>
              </div>
            ))}
        </div>
        {caps && !caps.crossOriginIsolated && (
          <p className="text-amber-400 text-sm">
            当前页面没有跨源隔离，SAB ringbuf 通道将降级为消息队列（功能不裁剪）。
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">音频内核（wasm in AudioWorklet）</h2>
        <div className="flex items-center gap-3">
          {status === "idle" || status === "failed" ? (
            <button
              type="button"
              onClick={startEngine}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium hover:bg-emerald-500"
            >
              启动引擎
            </button>
          ) : (
            <button
              type="button"
              onClick={stopEngine}
              className="rounded bg-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-600"
            >
              停止
            </button>
          )}
          <button
            type="button"
            onClick={refreshHeartbeat}
            disabled={status !== "ready"}
            className="rounded border border-neutral-700 px-4 py-2 text-sm disabled:opacity-40"
          >
            查询心跳
          </button>
          <span className="text-sm text-neutral-400">
            状态：<span className="text-neutral-200">{status}</span>
          </span>
        </div>

        <label className="flex max-w-md items-center gap-3 text-sm">
          增益（内核等功率平滑）
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={gain}
            onChange={(e) => changeGain(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-12 text-right tabular-nums">{gain.toFixed(2)}</span>
        </label>

        <div className="rounded border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm tabular-nums">
          已处理块数：{heartbeat.blocks} ｜ 已处理样本：{heartbeat.samples}
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">工程文件（.sasproj）</h2>
        <button
          type="button"
          onClick={selfTestProject}
          className="rounded border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800"
        >
          浏览器内打包 → 解包自检
        </button>
        {projectCheck && (
          <p className="rounded border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm text-neutral-300">
            {projectCheck}
          </p>
        )}
      </section>
    </div>
  );
}
