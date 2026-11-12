import { afterEach, describe, expect, it } from "vitest";
import { detectCapabilities } from "../src/capabilities.js";

describe("detectCapabilities", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("在普通 Node 环境下安全降级，不抛异常", () => {
    const caps = detectCapabilities();
    expect(typeof caps.crossOriginIsolated).toBe("boolean");
    expect(caps.audioWorklet).toBe(false);
    expect(caps.webCodecsAudioDecoder).toBe(false);
  });

  it("跨源隔离与 SAB 名义开关能被识别", () => {
    vi.stubGlobal("crossOriginIsolated", true);
    vi.stubGlobal("SharedArrayBuffer", class {});
    const caps = detectCapabilities();
    expect(caps.crossOriginIsolated).toBe(true);
    expect(caps.sharedArrayBuffer).toBe(true);
  });

  it("AudioWorklet 存在时报告可用", () => {
    function FakeAudioContext() {}
    (FakeAudioContext as unknown as { prototype: object }).prototype = {
      audioWorklet: {},
    };
    vi.stubGlobal("AudioContext", FakeAudioContext);
    const caps = detectCapabilities();
    expect(caps.audioWorklet).toBe(true);
  });
});
