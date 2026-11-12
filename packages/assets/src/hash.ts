/** 内容哈希：素材在 OPFS 与 .sasproj 里的唯一身份。 */
export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    data instanceof Uint8Array
      ? data
      : new Uint8Array(data, 0, data.byteLength);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes as unknown as BufferSource,
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
