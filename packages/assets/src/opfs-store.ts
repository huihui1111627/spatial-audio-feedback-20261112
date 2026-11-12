/**
 * OPFS 素材仓库：原始文件字节按内容哈希存取。
 * 引擎要的 PCM 是解码后的派生物，不入库；解码结果直接喂给内核。
 */
const DIR_NAME = "assets";

async function assetsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR_NAME, { create: true });
}

export async function putAsset(hash: string, data: Uint8Array): Promise<void> {
  const dir = await assetsDir();
  const handle = await dir.getFileHandle(hash, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data as unknown as BufferSource);
  await writable.close();
}

export async function getAsset(hash: string): Promise<Uint8Array | null> {
  try {
    const dir = await assetsDir();
    const handle = await dir.getFileHandle(hash);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  } catch (err) {
    if (err instanceof DOMException && err.name === "NotFoundError") {
      return null;
    }
    throw err;
  }
}

export async function hasAsset(hash: string): Promise<boolean> {
  return (await getAsset(hash)) !== null;
}

export async function removeAsset(hash: string): Promise<void> {
  const dir = await assetsDir();
  await dir.removeEntry(hash);
}
