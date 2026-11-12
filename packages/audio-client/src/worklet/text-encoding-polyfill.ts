/**
 * AudioWorkletGlobalScope 的 API 面极小：没有 TextDecoder/TextEncoder
 * （它不是 WorkerGlobalScope）。而 wasm-bindgen 0.2.100+ 生成的胶水
 * 在模块顶层就 `new TextDecoder()` / `new TextEncoder()`，求值即抛异常，
 * 导致整个 worklet 模块静默加载失败（addModule 照样 resolve）。
 *
 * 本模块必须在 sa_wasm.js 之前求值（import 顺序保证），
 * 给全局补上最小够用的 UTF-8 实现。只覆盖胶水用到的形态：
 * decode(view)、encode(string)、encodeInto(string, view)。
 */

const g = globalThis as unknown as Record<string, unknown>;

/** UTF-8 编码（与原生 TextEncoder 逐字节一致）。 */
export function utf8Encode(str: string): Uint8Array {
  const out: number[] = [];
  for (const ch of str) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      out.push(cp);
    } else if (cp < 0x800) {
      out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp < 0x10000) {
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

/** UTF-8 解码（非法/截断序列按 WHATWG 规则给 U+FFFD，与原生非 fatal 模式一致）。 */
export function utf8Decode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const b0 = bytes[i]!;
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
      continue;
    }
    let cp: number;
    let need: number; // 需要的后续字节数
    if ((b0 & 0xe0) === 0xc0) {
      cp = b0 & 0x1f;
      need = 1;
    } else if ((b0 & 0xf0) === 0xe0) {
      cp = b0 & 0x0f;
      need = 2;
    } else if ((b0 & 0xf8) === 0xf0) {
      cp = b0 & 0x07;
      need = 3;
    } else {
      // 非法前导字节（含孤立 continuation）
      out += "�";
      i += 1;
      continue;
    }
    // 吃掉连续的合法 continuation 字节
    let got = 0;
    while (got < need && i + 1 + got < len && (bytes[i + 1 + got]! & 0xc0) === 0x80) {
      cp = (cp << 6) | (bytes[i + 1 + got]! & 0x3f);
      got += 1;
    }
    if (got < need) {
      // 序列不完整：被流尾截断或被非法字节打断。
      // 前导+已吃掉的 continuation 合并为一个 U+FFFD；
      // 打断它的非法字节留给下一轮重新处理。
      out += "�";
      i += 1 + got;
      continue;
    }
    i += 1 + need;
    if (cp > 0xffff) {
      const c = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 0x3ff));
    } else {
      out += String.fromCharCode(cp);
    }
  }
  return out;
}

if (typeof g.TextDecoder === "undefined") {
  g.TextDecoder = class {
    decode(input?: ArrayBufferView | ArrayBuffer): string {
      if (!input) return "";
      const bytes =
        input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      return utf8Decode(bytes);
    }
  };
}

if (typeof g.TextEncoder === "undefined") {
  g.TextEncoder = class {
    encode(str = ""): Uint8Array {
      return utf8Encode(str);
    }
    encodeInto(str: string, view: Uint8Array): { read: number; written: number } {
      let read = 0;
      let written = 0;
      for (const ch of str) {
        const bytes = utf8Encode(ch);
        if (written + bytes.length > view.length) break;
        view.set(bytes, written);
        written += bytes.length;
        read += ch.length; // UTF-16 码元数（代理对为 2）
      }
      return { read, written };
    }
  };
}
