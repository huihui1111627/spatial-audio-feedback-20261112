/**
 * 场景工程 schema（v1），与 crates/sa-scene 的 serde 模型一一对应。
 *
 * 契约铁律：两侧禁止各自发明字段。CI 用同一份样例 JSON 双端解析，
 * 任何一侧漂移测试就红。字段名保持 Rust 侧的 snake_case，
 * 这样同一份 JSON 不需要任何键名转换。
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;
export const BAND_COUNT = 8;

export const vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});
export type Vec3 = z.infer<typeof vec3Schema>;

export const easingSchema = z.enum(["linear", "step"]);
export type Easing = z.infer<typeof easingSchema>;

export const keyframeSchema = z.object({
  t: z.number(),
  value: z.number(),
  // Rust 侧有 serde default，这里同样可选，缺省按 linear。
  easing: easingSchema.default("linear"),
});
export type Keyframe = z.infer<typeof keyframeSchema>;

export const automParamSchema = z.object({
  keys: z.array(keyframeSchema),
});
export type AutomParam = z.infer<typeof automParamSchema>;

const band8 = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

export const wallMaterialSchema = z.object({
  material_id: z.string().min(1),
  absorption: band8,
  scattering: band8,
});
export type WallMaterial = z.infer<typeof wallMaterialSchema>;

export const doorSchema = z.object({
  wall: z.number().int().min(0).max(5),
  open_fraction: z.number().min(0).max(1),
});
export type Door = z.infer<typeof doorSchema>;

export const roomSchema = z.object({
  dimensions: vec3Schema,
  walls: z.tuple([
    wallMaterialSchema,
    wallMaterialSchema,
    wallMaterialSchema,
    wallMaterialSchema,
    wallMaterialSchema,
    wallMaterialSchema,
  ]),
  doors: z.array(doorSchema).default([]),
});
export type Room = z.infer<typeof roomSchema>;

export const soundSourceSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  asset_hash: z.string().default(""),
  position: vec3Schema,
  gain: automParamSchema,
});
export type SoundSource = z.infer<typeof soundSourceSchema>;

export const listenerSchema = z.object({
  position: vec3Schema,
  forward: vec3Schema,
  up: vec3Schema,
});
export type Listener = z.infer<typeof listenerSchema>;

export const assetRefSchema = z.object({
  hash: z.string(),
  name: z.string(),
  mime: z.string(),
  byte_length: z.number().int().nonnegative(),
});
export type AssetRef = z.infer<typeof assetRefSchema>;

export const sceneProjectSchema = z.object({
  schema_version: z.literal(SCHEMA_VERSION),
  app_version: z.string(),
  room: roomSchema,
  sources: z.array(soundSourceSchema).default([]),
  listener: listenerSchema,
  assets: z.array(assetRefSchema).default([]),
});
export type SceneProject = z.infer<typeof sceneProjectSchema>;

/** 解析未知来源的工程 JSON；校验失败抛 ZodError。 */
export function parseSceneProject(json: unknown): SceneProject {
  return sceneProjectSchema.parse(json);
}

/** 与 Rust validate_scene 对齐的物理语义校验（结构之外的规则）。 */
export function validateSceneSemantics(p: SceneProject): string | null {
  const d = p.room.dimensions;
  if (d.x <= 0 || d.y <= 0 || d.z <= 0) {
    return "房间尺寸必须为正数";
  }
  for (const [i, w] of p.room.walls.entries()) {
    for (const [b, a] of w.absorption.entries()) {
      if (a < 0 || a > 1) return `墙面 ${i} 频段 ${b} 吸声系数 ${a} 超出 0..1`;
    }
    for (const [b, s] of w.scattering.entries()) {
      if (s < 0 || s > 1) return `墙面 ${i} 频段 ${b} 散射系数 ${s} 超出 0..1`;
    }
  }
  for (const s of p.sources) {
    for (const k of s.gain.keys) {
      if (k.value < 0) return `声源 ${s.id} 增益不能为负`;
    }
  }
  return null;
}

export function constantAutomParam(value: number): AutomParam {
  return { keys: [{ t: 0, value, easing: "linear" }] };
}
