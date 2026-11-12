/**
 * .sasproj 工程文件：zip 容器（fflate），素材只在本机进出，不上传服务器。
 *
 * 结构：
 *   manifest.json   容器清单：版本、条目列表与 CRC32 校验
 *   scene.json      SceneProject 本体（由 scene-model 校验）
 *   assets/<hash>.<ext>   音频素材，按内容哈希命名
 *   hrtf/<id>.hrtf        预转换的紧凑 HRTF
 *
 * 保存语义走不可变 revision（调用方负责不原地覆盖），本模块只做打包解包。
 */
import { unzipSync, zipSync, strToU8, strFromU8 } from "fflate";
import {
  parseSceneProject,
  type SceneProject,
} from "@spatial/scene-model";

export const SASPROJ_MIME = "application/x-sasproj+zip";
const MANIFEST_PATH = "manifest.json";
const SCENE_PATH = "scene.json";

export interface ProjectFileEntry {
  /** zip 内完整路径，如 assets/ab12...wav、hrtf/kemar.hrtf。 */
  path: string;
  data: Uint8Array;
}

export interface ProjectManifest {
  format: "sasproj";
  format_version: 1;
  app_version: string;
  scene_crc32: number;
  files: Array<{ path: string; crc32: number; byte_length: number }>;
}

export interface PackedProject {
  manifest: ProjectManifest;
  scene: SceneProject;
  files: Map<string, Uint8Array>;
}

export interface PackInput {
  scene: SceneProject;
  files?: ProjectFileEntry[];
  appVersion?: string;
  /** zip 压缩级别，默认 6；测试 CRC 场景可传 0 走存储模式。 */
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

// 标准 CRC32（IEEE 802.3 多项式，与 zip 内部 CRC 同算法）。
// fflate 不公开 crc32，这里自己维护，结果与 zip 工具链一致。
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function checksum(data: Uint8Array): number {
  return crc32(data);
}

/** 标准 CRC32（IEEE 802.3），导出供测试与外部校验复用。 */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** 打包工程为 .sasproj 二进制。 */
export function packProject(input: PackInput): Uint8Array {
  const sceneBytes = strToU8(JSON.stringify(input.scene));
  const files = input.files ?? [];

  const manifest: ProjectManifest = {
    format: "sasproj",
    format_version: 1,
    app_version: input.appVersion ?? input.scene.app_version,
    scene_crc32: checksum(sceneBytes),
    files: files.map((f) => ({
      path: f.path,
      crc32: checksum(f.data),
      byte_length: f.data.byteLength,
    })),
  };

  const zipContent: Record<string, Uint8Array> = {
    [MANIFEST_PATH]: strToU8(JSON.stringify(manifest, null, 2)),
    [SCENE_PATH]: sceneBytes,
  };
  for (const f of files) {
    if (zipContent[f.path]) {
      throw new Error(`工程内文件路径重复：${f.path}`);
    }
    zipContent[f.path] = f.data;
  }
  return zipSync(zipContent, { level: input.level ?? 6 });
}

/** 解包并校验 .sasproj；结构或校验失败抛错。 */
export function unpackProject(bytes: Uint8Array): PackedProject {
  const entries = unzipSync(bytes);

  const manifestBytes = entries[MANIFEST_PATH];
  const sceneBytes = entries[SCENE_PATH];
  if (!manifestBytes || !sceneBytes) {
    throw new Error("工程文件缺少 manifest.json 或 scene.json");
  }

  const manifest = JSON.parse(strFromU8(manifestBytes)) as ProjectManifest;
  if (manifest.format !== "sasproj" || manifest.format_version !== 1) {
    throw new Error(
      `不支持的工程格式 ${manifest.format} v${manifest.format_version}`,
    );
  }

  if (checksum(sceneBytes) !== manifest.scene_crc32) {
    throw new Error("scene.json 校验失败：CRC32 与 manifest 不一致");
  }

  const files = new Map<string, Uint8Array>();
  for (const meta of manifest.files) {
    const data = entries[meta.path];
    if (!data) {
      throw new Error(`工程缺少清单声明的文件：${meta.path}`);
    }
    if (data.byteLength !== meta.byte_length) {
      throw new Error(`文件 ${meta.path} 长度与清单不符`);
    }
    if (checksum(data) !== meta.crc32) {
      throw new Error(`文件 ${meta.path} CRC32 校验失败`);
    }
    files.set(meta.path, data);
  }

  // 结构校验在解包时立即做，调用方拿到的一定是合法场景。
  const scene = parseSceneProject(JSON.parse(strFromU8(sceneBytes)));
  return { manifest, scene, files };
}
