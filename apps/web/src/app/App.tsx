import { useCallback, useEffect, useRef } from "react";
import { RenderSessionClient } from "@spatial/audio-client";
import { packProject, unpackProject } from "@spatial/project";
import { decodeToMono48k, getAsset, putAsset, sha256Hex } from "@spatial/assets";
import {
  addDoor,
  addSource,
  bindEngine,
  loadProject,
  markSaved,
  newProject,
  redo,
  registerAsset,
  removeDoor,
  removeSource,
  renameSource,
  selectSource,
  setDoorOpen,
  setRoomDimensions,
  setSourceAsset,
  setSourceGain,
  setSourcePosition,
  setWallMaterial,
  undo,
  useDocumentStore,
  usePlaybackStore,
} from "@spatial/state";
import { materialFromPreset, validateSceneSemantics } from "@spatial/scene-model";
import { Viewport } from "@spatial/three-view";
import { Inspector, Outliner, TransportBar } from "@spatial/ui";

// e2e 与调试用的只读挂钩。
declare global {
  interface Window {
    __sasGetProject?: () => unknown;
  }
}

export function App() {
  const project = useDocumentStore((s) => s.project);
  const selectedSourceId = useDocumentStore((s) => s.selectedSourceId);
  const dirty = useDocumentStore((s) => s.dirty);
  const status = usePlaybackStore((s) => s.status);
  const playing = usePlaybackStore((s) => s.playing);
  const samples = usePlaybackStore((s) => s.samples);
  const masterGain = usePlaybackStore((s) => s.masterGain);

  const clientRef = useRef<RenderSessionClient | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const openFileRef = useRef<HTMLInputElement>(null);
  const importAudioRef = useRef<HTMLInputElement>(null);

  // 引擎就绪后绑定文档同步；心跳轮询走带时钟。
  const ensureEngine = useCallback(async (): Promise<RenderSessionClient> => {
    if (clientRef.current) return clientRef.current;
    const pb = usePlaybackStore.getState();
    pb.setStatus("compiling");
    const ctx = new AudioContext({ sampleRate: 48000 });
    audioCtxRef.current = ctx;
    // 自动播放策略：首次启动在用户手势里，显式 resume 兜底。
    await ctx.resume();
    const client = new RenderSessionClient();
    await client.start({ audioContext: ctx });
    clientRef.current = client;
    // 先装配素材再同步场景，Wav 播放器才能立刻出声的。
    const { project: p } = useDocumentStore.getState();
    for (const ref of p.assets) {
      const bytes = await getAsset(ref.hash);
      if (bytes) {
        const pcm = await decodeToMono48k(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
        );
        client.loadAsset(ref.hash, pcm);
      }
    }
    bindEngine(client);
    client.setGain(usePlaybackStore.getState().masterGain);
    usePlaybackStore.getState().setStatus("ready");
    return client;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const client = clientRef.current;
      if (!client) return;
      void client.requestHeartbeat().then((h) => {
        usePlaybackStore.getState().setSamples(h.samples);
      });
    }, 500);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    window.__sasGetProject = () => useDocumentStore.getState().project;
    return () => {
      delete window.__sasGetProject;
    };
  }, []);

  // 卸载时停引擎。
  useEffect(() => {
    return () => {
      void clientRef.current?.stop();
      clientRef.current = null;
    };
  }, []);

  // 撤销重做快捷键。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const togglePlay = useCallback(async () => {
    const pb = usePlaybackStore.getState();
    try {
      const client = await ensureEngine();
      await audioCtxRef.current?.resume();
      const next = !pb.playing;
      client.setPlaying(next);
      pb.setPlaying(next);
    } catch (err) {
      usePlaybackStore.getState().setStatus("failed");
      console.error("引擎启动失败", err);
    }
  }, [ensureEngine]);

  const changeMasterGain = useCallback((gain: number) => {
    usePlaybackStore.getState().setMasterGain(gain);
    clientRef.current?.setGain(gain);
  }, []);

  const saveProject = useCallback(async () => {
    const { project: p } = useDocumentStore.getState();
    const files: Array<{ path: string; data: Uint8Array }> = [];
    for (const ref of p.assets) {
      const data = await getAsset(ref.hash);
      if (data) files.push({ path: `assets/${ref.hash}`, data });
    }
    const bytes = packProject({ scene: p, files });
    const blob = new Blob([bytes as unknown as BlobPart], {
      type: "application/x-sasproj+zip",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "scene.sasproj";
    a.click();
    URL.revokeObjectURL(url);
    markSaved();
  }, []);

  const openProjectFile = useCallback(async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const unpacked = unpackProject(bytes);
    const semanticError = validateSceneSemantics(unpacked.scene);
    if (semanticError) {
      alert(`工程校验失败：${semanticError}`);
      return;
    }
    // 素材回写 OPFS 并装配到引擎。
    for (const [path, data] of unpacked.files) {
      if (!path.startsWith("assets/")) continue;
      const hash = path.slice("assets/".length);
      await putAsset(hash, data);
      const client = clientRef.current;
      if (client) {
        const pcm = await decodeToMono48k(
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer,
        );
        client.loadAsset(hash, pcm);
      }
    }
    loadProject(unpacked.scene);
  }, []);

  const importAudio = useCallback(async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = await sha256Hex(bytes);
    await putAsset(hash, bytes);
    registerAsset({
      hash,
      name: file.name,
      mime: file.type || "application/octet-stream",
      byte_length: bytes.byteLength,
    });
    const client = clientRef.current;
    if (client) {
      client.loadAsset(hash, await decodeToMono48k(bytes.buffer as ArrayBuffer));
    }
    const { selectedSourceId: sel } = useDocumentStore.getState();
    if (sel) {
      setSourceAsset(sel, hash);
    } else {
      const id = addSource();
      setSourceAsset(id, hash);
    }
  }, []);

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <h1 className="mr-4 text-sm font-semibold">Spatial Audio Studio</h1>
        <button
          type="button"
          onClick={() => newProject()}
          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
        >
          新建
        </button>
        <button
          type="button"
          onClick={() => openFileRef.current?.click()}
          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
        >
          打开…
        </button>
        <button
          type="button"
          onClick={() => void saveProject()}
          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
        >
          保存{dirty ? " *" : ""}
        </button>
        <button
          type="button"
          onClick={() => importAudioRef.current?.click()}
          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
        >
          导入音频…
        </button>
        <span className="mx-2 h-4 w-px bg-neutral-800" />
        <button
          type="button"
          onClick={() => undo()}
          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
        >
          撤销
        </button>
        <button
          type="button"
          onClick={() => redo()}
          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800"
        >
          重做
        </button>
        <input
          ref={openFileRef}
          type="file"
          accept=".sasproj"
          data-testid="open-project-input"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void openProjectFile(f);
            e.target.value = "";
          }}
        />
        <input
          ref={importAudioRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importAudio(f);
            e.target.value = "";
          }}
        />
      </header>

      <div className="border-b border-neutral-800">
        <TransportBar
          status={status}
          playing={playing}
          timeSeconds={samples / 48000}
          masterGain={masterGain}
          onTogglePlay={() => void togglePlay()}
          onMasterGain={changeMasterGain}
        />
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-56 border-r border-neutral-800">
          <Outliner
            project={project}
            selectedSourceId={selectedSourceId}
            onSelect={selectSource}
            onAddSource={() => addSource()}
            onRemoveSource={removeSource}
          />
        </aside>
        <main className="min-w-0 flex-1">
          <Viewport
            project={project}
            selectedSourceId={selectedSourceId}
            onSelect={selectSource}
            onMoveSource={setSourcePosition}
            // 拖拽中的位置预览不进文档（避免撤销历史刷屏），
            // 网格位置由 gizmo 直接驱动，拖拽结束一次性提交。
            onPreviewSource={() => {}}
            onDragStateChange={() => {}}
          />
        </main>
        <aside className="w-72 border-l border-neutral-800">
          <Inspector
            project={project}
            selectedSourceId={selectedSourceId}
            onRenameSource={renameSource}
            onSetSourceGain={setSourceGain}
            onSetSourcePosition={setSourcePosition}
            onSetRoomDimensions={setRoomDimensions}
            onSetWallPreset={(wall, preset) =>
              setWallMaterial(wall, materialFromPreset(preset))
            }
            onSetWallBand={(wall, band, absorption) => {
              const w = project.room.walls[wall];
              if (!w) return;
              const bands = [...w.absorption] as typeof w.absorption;
              bands[band] = absorption;
              setWallMaterial(wall, { ...w, absorption: bands });
            }}
            onSetDoorOpen={setDoorOpen}
            onAddDoor={addDoor}
            onRemoveDoor={removeDoor}
          />
        </aside>
      </div>
    </div>
  );
}
