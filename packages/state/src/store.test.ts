/**
 * 编辑态 store 与撤销重做的行为测试。
 */
import { beforeEach, describe, expect, it } from "vitest";
import { buildSampleScene } from "@spatial/scene-model";
import {
  addSource,
  loadProject,
  removeSource,
  setSourceGain,
  setSourcePosition,
  useDocumentStore,
} from "./index.js";
import { redo, undo } from "./store.js";

function reset(): void {
  useDocumentStore.temporal.getState().clear();
  loadProject(buildSampleScene());
  useDocumentStore.temporal.getState().clear();
}

describe("document store", () => {
  beforeEach(reset);

  it("addSource 追加声源并选中", () => {
    const before = useDocumentStore.getState().project.sources.length;
    const id = addSource();
    const state = useDocumentStore.getState();
    expect(state.project.sources.length).toBe(before + 1);
    expect(state.selectedSourceId).toBe(id);
    expect(state.project.sources.at(-1)?.id).toBe(id);
  });

  it("removeSource 删除并清除选中", () => {
    const id = addSource();
    removeSource(id);
    const state = useDocumentStore.getState();
    expect(state.project.sources.some((s) => s.id === id)).toBe(false);
    expect(state.selectedSourceId).toBeNull();
  });

  it("setSourceGain 写入常量自动化参数", () => {
    const id = addSource();
    setSourceGain(id, 0.3);
    const src = useDocumentStore
      .getState()
      .project.sources.find((s) => s.id === id);
    expect(src?.gain.keys[0]?.value).toBeCloseTo(0.3);
  });

  it("undo/redo 恢复文档", () => {
    const id = addSource();
    setSourcePosition(id, { x: 2, y: 1, z: 1 });
    const countAfterAdd = useDocumentStore.getState().project.sources.length;

    undo(); // 撤销位置修改
    undo(); // 撤销新增
    expect(useDocumentStore.getState().project.sources.length).toBe(
      countAfterAdd - 1,
    );

    redo();
    expect(useDocumentStore.getState().project.sources.length).toBe(
      countAfterAdd,
    );
    const src = useDocumentStore
      .getState()
      .project.sources.find((s) => s.id === id);
    // 位置修改仍被撤销着
    expect(src?.position.x).toBe(0);
    redo();
    const moved = useDocumentStore
      .getState()
      .project.sources.find((s) => s.id === id);
    expect(moved?.position.x).toBe(2);
  });

  it("loadProject 整体替换文档", () => {
    addSource();
    loadProject(buildSampleScene());
    expect(useDocumentStore.getState().project.sources.length).toBe(1);
    expect(useDocumentStore.getState().dirty).toBe(false);
  });
});
