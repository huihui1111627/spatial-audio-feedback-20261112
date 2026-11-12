/**
 * 文档 actions：每个 action 一次 setState（= 一条撤销历史）。
 * actions 不直接碰音频引擎；引擎同步由 engine-bridge 订阅文档变化完成。
 */
import {
  buildSampleScene,
  constantAutomParam,
  type SceneProject,
  type Vec3,
  type WallMaterial,
} from "@spatial/scene-model";
import { useDocumentStore } from "./store.js";

let sourceCounter = 0;

function nextSourceId(existing: { id: string }[]): string {
  for (;;) {
    sourceCounter += 1;
    const id = `src_${sourceCounter}`;
    if (!existing.some((s) => s.id === id)) return id;
  }
}

function mutate(fn: (project: SceneProject) => SceneProject): void {
  const { project } = useDocumentStore.getState();
  useDocumentStore.setState({ project: fn(project), dirty: true });
}

export function addSource(position?: Vec3): string {
  const { project } = useDocumentStore.getState();
  const id = nextSourceId(project.sources);
  mutate((p) => ({
    ...p,
    sources: [
      ...p.sources,
      {
        id,
        name: `声源 ${id.replace("src_", "")}`,
        asset_hash: "",
        position: position ?? { x: 0, y: 1.5, z: 0 },
        gain: constantAutomParam(0.8),
      },
    ],
  }));
  useDocumentStore.setState({ selectedSourceId: id });
  return id;
}

export function removeSource(id: string): void {
  mutate((p) => ({ ...p, sources: p.sources.filter((s) => s.id !== id) }));
  const { selectedSourceId } = useDocumentStore.getState();
  if (selectedSourceId === id) {
    useDocumentStore.setState({ selectedSourceId: null });
  }
}

export function selectSource(id: string | null): void {
  useDocumentStore.setState({ selectedSourceId: id });
}

function updateSource(id: string, fn: (s: SceneProject["sources"][number]) => SceneProject["sources"][number]): void {
  mutate((p) => ({
    ...p,
    sources: p.sources.map((s) => (s.id === id ? fn(s) : s)),
  }));
}

export function renameSource(id: string, name: string): void {
  updateSource(id, (s) => ({ ...s, name }));
}

/** 拖拽结束提交（一条历史）；拖拽中的连续预览见 previewSourcePosition。 */
export function setSourcePosition(id: string, position: Vec3): void {
  updateSource(id, (s) => ({ ...s, position }));
}

/** 拖拽中的预览：直接改文档但不产生历史（调用方负责 pause/resume）。 */
export function previewSourcePosition(id: string, position: Vec3): void {
  updateSource(id, (s) => ({ ...s, position }));
}

export function setSourceGain(id: string, value: number): void {
  updateSource(id, (s) => ({ ...s, gain: constantAutomParam(value) }));
}

export function setSourceAsset(id: string, assetHash: string): void {
  updateSource(id, (s) => ({ ...s, asset_hash: assetHash }));
}

export function setRoomDimensions(dimensions: Vec3): void {
  mutate((p) => ({ ...p, room: { ...p.room, dimensions } }));
}

export function setWallMaterial(wall: number, material: WallMaterial): void {
  mutate((p) => {
    const walls = [...p.room.walls] as SceneProject["room"]["walls"];
    walls[wall] = material;
    return { ...p, room: { ...p.room, walls } };
  });
}

export function setDoorOpen(doorIndex: number, openFraction: number): void {
  mutate((p) => ({
    ...p,
    room: {
      ...p.room,
      doors: p.room.doors.map((d, i) =>
        i === doorIndex ? { ...d, open_fraction: openFraction } : d,
      ),
    },
  }));
}

export function addDoor(wall: number): void {
  mutate((p) => ({
    ...p,
    room: {
      ...p.room,
      doors: [...p.room.doors, { wall, open_fraction: 0 }],
    },
  }));
}

export function removeDoor(doorIndex: number): void {
  mutate((p) => ({
    ...p,
    room: {
      ...p.room,
      doors: p.room.doors.filter((_, i) => i !== doorIndex),
    },
  }));
}

export function setListenerPosition(position: Vec3): void {
  mutate((p) => ({ ...p, listener: { ...p.listener, position } }));
}

/** 登记素材引用（导入素材时调用，随工程一起打包）。 */
export function registerAsset(ref: SceneProject["assets"][number]): void {
  mutate((p) => {
    if (p.assets.some((a) => a.hash === ref.hash)) return p;
    return { ...p, assets: [...p.assets, ref] };
  });
}

/** 打开工程：整体替换文档（作为一条历史），清空选中。 */
export function loadProject(project: SceneProject): void {
  useDocumentStore.setState({ project, selectedSourceId: null, dirty: false });
}

/** 新建工程：回到样例场景。 */
export function newProject(): void {
  useDocumentStore.setState({
    project: buildSampleScene(),
    selectedSourceId: null,
    dirty: false,
  });
}

/** 保存成功后清除脏标记。 */
export function markSaved(): void {
  useDocumentStore.setState({ dirty: false });
}
