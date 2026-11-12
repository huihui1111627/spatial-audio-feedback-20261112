/**
 * 全局编辑态 store：文档（可撤销）与播放态（不可撤销）分离。
 *
 * - 文档 store 走 zundo temporal，撤销重做只跟踪 project 字段；
 * - 播放态（引擎状态/走带时钟/主增益）不进历史；
 * - actions 只改文档，引擎同步由 engine-bridge 的订阅统一完成。
 */
import { create } from "zustand";
import { temporal } from "zundo";
import { buildSampleScene, type SceneProject } from "@spatial/scene-model";

export interface DocumentState {
  project: SceneProject;
  selectedSourceId: string | null;
  /** 有未保存修改。 */
  dirty: boolean;
}

export const useDocumentStore = create<DocumentState>()(
  temporal(
    (): DocumentState => ({
      project: buildSampleScene(),
      selectedSourceId: null,
      dirty: false,
    }),
    {
      limit: 100,
      // 历史只跟踪工程文档；选中态/脏标记撤销时不回滚。
      partialize: (state) => ({ project: state.project }),
      equality: (a, b) => a.project === b.project,
    },
  ),
);

/** 拖拽等连续操作期间暂停历史记录，结束时 resume 并手动补一条。 */
export function pauseHistory(): void {
  useDocumentStore.temporal.getState().pause();
}

export function resumeHistory(): void {
  useDocumentStore.temporal.getState().resume();
}

export function undo(): void {
  useDocumentStore.temporal.getState().undo();
}

export function redo(): void {
  useDocumentStore.temporal.getState().redo();
}

export type EngineStatus = "idle" | "compiling" | "ready" | "failed";

export interface PlaybackState {
  status: EngineStatus;
  playing: boolean;
  /** 内核已处理样本数（走带时钟，48k）。 */
  samples: number;
  masterGain: number;
  setStatus: (status: EngineStatus) => void;
  setPlaying: (playing: boolean) => void;
  setSamples: (samples: number) => void;
  setMasterGain: (gain: number) => void;
}

export const usePlaybackStore = create<PlaybackState>()((set) => ({
  status: "idle",
  playing: false,
  samples: 0,
  masterGain: 0.8,
  setStatus: (status) => set({ status }),
  setPlaying: (playing) => set({ playing }),
  setSamples: (samples) => set({ samples }),
  setMasterGain: (masterGain) => set({ masterGain }),
}));
