/**
 * 引擎桥：文档 store 与音频内核之间的唯一同步通道。
 *
 * 方向严格单向：文档变化 → applyScene 全量快照 → 内核 diff。
 * 撤销/重做同样走这条订阅，不需要特殊处理。
 */
import { useDocumentStore } from "./store.js";

export interface EngineBridge {
  applyScene(sceneJson: string): void;
  setParam(path: string, value: number): void;
  setPlaying(playing: boolean): void;
  setGain(gain: number): void;
  loadAsset(hash: string, pcm: Float32Array): void;
}

let unsubscribe: (() => void) | null = null;

/** 绑定引擎：立即全量同步一次，之后订阅文档变化增量推送。返回解绑函数。 */
export function bindEngine(bridge: EngineBridge): () => void {
  unbindEngine();
  bridge.applyScene(JSON.stringify(useDocumentStore.getState().project));
  unsubscribe = useDocumentStore.subscribe((state, prev) => {
    if (state.project !== prev.project) {
      bridge.applyScene(JSON.stringify(state.project));
    }
  });
  return unbindEngine;
}

export function unbindEngine(): void {
  unsubscribe?.();
  unsubscribe = null;
}
