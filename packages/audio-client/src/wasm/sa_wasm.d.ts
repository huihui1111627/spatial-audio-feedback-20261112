/* tslint:disable */
/* eslint-disable */

export class EngineSession {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * 应用场景快照 JSON（解析 + 校验 + diff 应用）。
     */
    applyScene(json: string): void;
    /**
     * 段末导出 checkpoint（M5 分段渲染用）。
     */
    checkpoint(): string;
    /**
     * 装配素材 PCM（48k 单声道 f32），按内容哈希寻址。
     */
    loadAsset(hash: string, pcm: Float32Array | number[]): void;
    constructor(sample_rate: number);
    /**
     * 处理一个 128 帧块，直接写入 worklet 提供的交错立体声缓冲
     * （长度须为 256：L,R,L,R...）。零拷贝、无返回分配。
     */
    process_block(interleaved: Float32Array): void;
    /**
     * 主增益目标值；内核侧 Smoother 做等功率过渡，调用频率不限。
     */
    setGain(gain: number): void;
    /**
     * 细粒度参数写入，路径格式见 RenderSession::set_param。
     */
    setParam(path: string, value: number): void;
    /**
     * 走带启停（暂停时输出静音、时钟不推进）。
     */
    setPlaying(playing: boolean): void;
    readonly blocks: number;
    readonly samples_processed: bigint;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_enginesession_free: (a: number, b: number) => void;
    readonly enginesession_applyScene: (a: number, b: number, c: number) => [number, number];
    readonly enginesession_blocks: (a: number) => number;
    readonly enginesession_checkpoint: (a: number) => [number, number, number, number];
    readonly enginesession_loadAsset: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly enginesession_new: (a: number) => number;
    readonly enginesession_process_block: (a: number, b: number, c: number, d: any) => [number, number];
    readonly enginesession_samples_processed: (a: number) => bigint;
    readonly enginesession_setGain: (a: number, b: number) => void;
    readonly enginesession_setParam: (a: number, b: number, c: number, d: number) => [number, number];
    readonly enginesession_setPlaying: (a: number, b: number) => void;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
