import { describe, expect, it } from "vitest";
import { buildSampleScene } from "@spatial/scene-model";
import { packProject, unpackProject } from "../src/index.js";

describe(".sasproj 打包解包", () => {
  it("最小工程往返后场景不变", () => {
    const scene = buildSampleScene();
    const bytes = packProject({ scene });
    const unpacked = unpackProject(bytes);
    expect(unpacked.scene).toEqual(scene);
    expect(unpacked.files.size).toBe(0);
    expect(unpacked.manifest.scene_crc32).toBeGreaterThan(0);
  });

  it("素材与 HRTF 文件按路径原样往返", () => {
    const scene = buildSampleScene();
    const wav = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const hrtf = new Uint8Array(256).fill(7);
    const bytes = packProject({
      scene,
      files: [
        { path: "assets/abc123.wav", data: wav },
        { path: "hrtf/kemar.hrtf", data: hrtf },
      ],
    });
    const unpacked = unpackProject(bytes);
    expect(unpacked.files.size).toBe(2);
    expect([...unpacked.files.get("assets/abc123.wav")!]).toEqual([...wav]);
    expect(unpacked.files.get("hrtf/kemar.hrtf")!.byteLength).toBe(256);
  });

  it("重复路径直接拒绝", () => {
    const scene = buildSampleScene();
    expect(() =>
      packProject({
        scene,
        files: [
          { path: "assets/x.wav", data: new Uint8Array([1]) },
          { path: "assets/x.wav", data: new Uint8Array([2]) },
        ],
      }),
    ).toThrow(/重复/);
  });

  it("篡改 scene 内容会被 CRC 拦下", () => {
    // 存储模式（level 0）下篡改字节能存活到解包后的 CRC 校验环节。
    const bytes = packProject({ scene: buildSampleScene(), level: 0 });
    // 紧凑 JSON 里房间宽度 8 写作 "x":8，把 8 改成 9。
    const corrupted = new Uint8Array(bytes);
    const marker = new TextEncoder().encode('"x":8');
    const idx = findSequence(corrupted, marker);
    expect(idx).toBeGreaterThan(-1);
    const eight = new TextEncoder().encode("8")[0];
    const valueIdx = idx + marker.length - 1;
    expect(corrupted[valueIdx]).toBe(eight);
    // "9" 的 ASCII 码 0x39。
    corrupted[valueIdx] = 0x39;
    expect(() => unpackProject(corrupted)).toThrow(/CRC32/);
  });

  it("非 sasproj 容器被拒绝", () => {
    expect(() => unpackProject(new Uint8Array([1, 2, 3, 4]))).toThrow();
  });
});

describe("CRC32 标准向量", () => {
  it("'123456789' 的 CRC32 = 0xCBF43926（与 zip 工具链同多项式）", async () => {
    const { crc32 } = await import("../src/index.js");
    const got = crc32(new TextEncoder().encode("123456789"));
    expect(got).toBe(0xcbf43926);
  });

  it("打包结果可复现（同输入同字节）", () => {
    const scene = buildSampleScene();
    expect(packProject({ scene })).toEqual(packProject({ scene }));
  });
});

function findSequence(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}
