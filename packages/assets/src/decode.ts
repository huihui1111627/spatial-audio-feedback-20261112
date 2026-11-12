/**
 * 音频解码：任意浏览器可解码的音频文件 → 48k 单声道 f32 PCM。
 * 重采样交给 OfflineAudioContext（不在实时热路径，精度足够）。
 */
export const ENGINE_SAMPLE_RATE = 48_000;

export async function decodeToMono48k(data: ArrayBuffer): Promise<Float32Array> {
  const ctx = new OfflineAudioContext(1, 128, ENGINE_SAMPLE_RATE);
  const buf = await ctx.decodeAudioData(data);
  const out = new Float32Array(buf.length);
  const channels = buf.numberOfChannels;
  for (let ch = 0; ch < channels; ch += 1) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i += 1) {
      out[i]! += d[i]! / channels;
    }
  }
  return out;
}
