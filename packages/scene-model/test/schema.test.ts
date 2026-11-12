import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildSampleScene } from "../src/fixture.js";
import {
  constantAutomParam,
  parseSceneProject,
  validateSceneSemantics,
} from "../src/index.js";

const fixturePath = fileURLToPath(
  new URL("../../../tests/fixtures/sample-scene.json", import.meta.url),
);

describe("场景 schema 双端契约", () => {
  it("共享 fixture 能通过 zod 解析", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    const parsed = parseSceneProject(raw);
    expect(parsed.schema_version).toBe(1);
    expect(parsed.room.walls).toHaveLength(6);
    expect(parsed.sources[0]?.id).toBe("src_1");
  });

  it("TS 内置样例与共享 fixture 语义一致", () => {
    const fixture = parseSceneProject(
      JSON.parse(readFileSync(fixturePath, "utf8")),
    );
    expect(buildSampleScene()).toEqual(fixture);
  });

  it("easing 缺省时补 linear（与 Rust serde default 对齐）", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    delete raw.sources[0].gain.keys[0].easing;
    const parsed = parseSceneProject(raw);
    expect(parsed.sources[0]?.gain.keys[0]?.easing).toBe("linear");
  });

  it("doors/assets 字段可缺省（与 Rust #[serde(default)] 对齐）", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    delete raw.doors;
    delete raw.assets;
    delete raw.room.doors;
    const parsed = parseSceneProject(raw);
    expect(parsed.room.doors).toEqual([]);
    expect(parsed.assets).toEqual([]);
  });

  it("结构解析与语义校验分层：越界系数由语义层拦，错误版本由 schema 拦", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8"));
    raw.room.walls[0].absorption[2] = 1.5;
    // 结构层只查类型，1.5 仍是 number，能解析
    const parsed = parseSceneProject(raw);
    expect(validateSceneSemantics(parsed)).toContain("吸声系数");

    const badVersion = JSON.parse(readFileSync(fixturePath, "utf8"));
    badVersion.schema_version = 99;
    expect(() => parseSceneProject(badVersion)).toThrow();
  });

  it("语义校验与 Rust validate_scene 同规则", () => {
    const ok = parseSceneProject(JSON.parse(readFileSync(fixturePath, "utf8")));
    expect(validateSceneSemantics(ok)).toBeNull();
    const bad = structuredClone(ok);
    bad.room.dimensions.x = -1;
    expect(validateSceneSemantics(bad)).toContain("房间尺寸");
  });

  it("constantAutomParam 产出单关键帧", () => {
    const p = constantAutomParam(0.42);
    expect(p.keys).toHaveLength(1);
    expect(p.keys[0]?.value).toBe(0.42);
  });
});
