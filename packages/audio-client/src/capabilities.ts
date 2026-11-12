/**
 * 运行环境能力探测：跨源隔离、SAB、OPFS、AudioWorklet、WebCodecs、WASM SIMD。
 * 启动时探测一次，参数通道与渲染拓扑据此选择，参考 podcast-repair 的做法。
 */

export interface RuntimeCapabilities {
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
  opfs: boolean;
  opfsSyncAccessHandle: boolean;
  audioWorklet: boolean;
  webCodecsAudioDecoder: boolean;
  webCodecsAudioEncoder: boolean;
  wasmSimd: boolean;
}

export function detectCapabilities(): RuntimeCapabilities {
  return {
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    sharedArrayBuffer: typeof globalThis.SharedArrayBuffer === "function",
    opfs:
      typeof navigator !== "undefined" &&
      !!navigator.storage?.getDirectory &&
      typeof FileSystemFileHandle !== "undefined",
    // createSyncAccessHandle 只在 Worker 里可靠存在，这里只查 API 名义存在，
    // 真正可用性在音频 Worker 内部确认。
    opfsSyncAccessHandle:
      typeof FileSystemFileHandle !== "undefined" &&
      "createSyncAccessHandle" in FileSystemFileHandle.prototype,
    audioWorklet:
      typeof AudioContext !== "undefined" &&
      "audioWorklet" in AudioContext.prototype,
    // TS 5.6 的 DOM 库还没有 WebCodecs 类型，按全局名做名义探测，
    // 不声明全局类型，避免与后续 TS 升级的内置声明冲突。
    webCodecsAudioDecoder: "AudioDecoder" in globalThis,
    webCodecsAudioEncoder: "AudioEncoder" in globalThis,
    // 精确 SIMD 探测要实际编译测试模块；这里先报名义支持，
    // 实例化失败时由 RenderSessionClient 走非 SIMD 兜底构建。
    wasmSimd: typeof WebAssembly === "object" && typeof WebAssembly.validate === "function",
  };
}
