/**
 * UTF-8 polyfill 与原生 TextEncoder/TextDecoder 的一致性测试。
 */
import { describe, expect, it } from "vitest";
import { utf8Decode, utf8Encode } from "../src/worklet/text-encoding-polyfill.js";

const SAMPLES = [
  "",
  "hello world",
  "中文测试字符串",
  "混合 ascii 与中文 + emoji 🎧🔊",
  "{\"schema_version\":1,\"name\":\"声源\"}",
  "́组合字符 é",
];

describe("utf8 polyfill", () => {
  it("encode 与原生 TextEncoder 逐字节一致", () => {
    const native = new TextEncoder();
    for (const s of SAMPLES) {
      expect([...utf8Encode(s)]).toEqual([...native.encode(s)]);
    }
  });

  it("decode 与原生 TextDecoder 一致", () => {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    for (const s of SAMPLES) {
      expect(utf8Decode(encoder.encode(s))).toBe(decoder.decode(encoder.encode(s)));
    }
  });

  it("encode → decode 往返无损", () => {
    for (const s of SAMPLES) {
      expect(utf8Decode(utf8Encode(s))).toBe(s);
    }
  });

  it("非法字节序列给 U+FFFD（与原生一致）", () => {
    const native = new TextDecoder();
    for (const bytes of [
      new Uint8Array([0xff, 0xfe]),
      new Uint8Array([0xe4, 0xb8]), // 截断的多字节序列
      new Uint8Array([0x61, 0xff, 0x62]),
    ]) {
      expect(utf8Decode(bytes)).toBe(native.decode(bytes));
    }
  });
});
