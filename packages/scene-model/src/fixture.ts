/**
 * 双端契约样例：同一份 JSON 既被 TS zod 解析，也被 Rust sa-scene 解析。
 * Rust 侧测试读取 tests/fixtures/sample-scene.json（仓库根共享 fixture）。
 */
import { BAND_COUNT, SCHEMA_VERSION, type SceneProject } from "./schema.js";

export function buildSampleScene(): SceneProject {
  const mat = {
    material_id: "plaster",
    absorption: Array(BAND_COUNT).fill(0.15) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ],
    scattering: Array(BAND_COUNT).fill(0.05) as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ],
  };
  return {
    schema_version: SCHEMA_VERSION,
    app_version: "0.0.0",
    room: {
      dimensions: { x: 8, y: 3, z: 5 },
      walls: [mat, mat, mat, mat, mat, mat],
      doors: [{ wall: 0, open_fraction: 0.5 }],
    },
    sources: [
      {
        id: "src_1",
        name: "测试声源",
        asset_hash: "",
        position: { x: 1, y: 1.5, z: -2 },
        gain: { keys: [{ t: 0, value: 0.8, easing: "linear" }] },
      },
    ],
    listener: {
      position: { x: 0, y: 1.6, z: 0 },
      forward: { x: 0, y: 0, z: -1 },
      up: { x: 0, y: 1, z: 0 },
    },
    assets: [],
  };
}
