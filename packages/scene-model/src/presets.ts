/**
 * 墙面材质预设：8 频段（63/125/250/500/1k/2k/4k/8k Hz）吸声与散射系数。
 * 数值取常见建筑材料的典型倍频程测量值量级，供快速起步；
 * 精确项目里用户应替换为实测数据。
 */
import type { WallMaterial } from "./schema.js";

type Band8 = WallMaterial["absorption"];

export interface MaterialPreset {
  label: string;
  absorption: Band8;
  scattering: Band8;
}

export const MATERIAL_PRESETS: Record<string, MaterialPreset> = {
  plaster: {
    label: "石膏板",
    absorption: [0.29, 0.1, 0.05, 0.04, 0.07, 0.09, 0.1, 0.1],
    scattering: [0.05, 0.05, 0.05, 0.05, 0.05, 0.06, 0.07, 0.08],
  },
  concrete: {
    label: "混凝土",
    absorption: [0.01, 0.01, 0.02, 0.02, 0.03, 0.03, 0.04, 0.04],
    scattering: [0.1, 0.1, 0.1, 0.1, 0.1, 0.12, 0.14, 0.16],
  },
  wood: {
    label: "木板",
    absorption: [0.15, 0.11, 0.1, 0.07, 0.06, 0.07, 0.07, 0.07],
    scattering: [0.1, 0.1, 0.1, 0.1, 0.1, 0.12, 0.14, 0.16],
  },
  glass: {
    label: "玻璃",
    absorption: [0.35, 0.25, 0.18, 0.12, 0.07, 0.05, 0.04, 0.04],
    scattering: [0.05, 0.05, 0.05, 0.05, 0.05, 0.05, 0.06, 0.07],
  },
  curtain: {
    label: "厚窗帘",
    absorption: [0.14, 0.35, 0.55, 0.7, 0.7, 0.65, 0.6, 0.55],
    scattering: [0.1, 0.12, 0.15, 0.18, 0.2, 0.22, 0.24, 0.26],
  },
  carpet: {
    label: "地毯",
    absorption: [0.02, 0.06, 0.14, 0.37, 0.6, 0.65, 0.7, 0.7],
    scattering: [0.05, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.18],
  },
  acoustic_panel: {
    label: "吸声板",
    absorption: [0.4, 0.75, 0.95, 0.99, 0.99, 0.95, 0.9, 0.85],
    scattering: [0.1, 0.12, 0.14, 0.16, 0.18, 0.2, 0.22, 0.24],
  },
};

export const WALL_LABELS = ["-X 墙", "+X 墙", "地板", "天花板", "-Z 墙", "+Z 墙"];

export function materialFromPreset(presetId: string): WallMaterial {
  const preset = MATERIAL_PRESETS[presetId] ?? MATERIAL_PRESETS["plaster"]!;
  return {
    material_id: presetId,
    absorption: [...preset.absorption] as Band8,
    scattering: [...preset.scattering] as Band8,
  };
}
