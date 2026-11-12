/**
 * TransportBar：走带控制、时间显示、主增益、引擎状态。
 */
import type { EngineStatus } from "@spatial/state";

export interface TransportBarProps {
  status: EngineStatus;
  playing: boolean;
  /** 走带时间（秒）。 */
  timeSeconds: number;
  masterGain: number;
  onTogglePlay(): void;
  onMasterGain(gain: number): void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m.toString().padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

const STATUS_LABEL: Record<EngineStatus, string> = {
  idle: "未启动",
  compiling: "启动中",
  ready: "就绪",
  failed: "失败",
};

export function TransportBar(props: TransportBarProps) {
  return (
    <div className="flex items-center gap-4 px-3 py-2">
      <button
        type="button"
        onClick={props.onTogglePlay}
        disabled={props.status === "compiling"}
        className={`rounded px-4 py-1.5 text-sm font-medium ${
          props.playing
            ? "bg-amber-600 hover:bg-amber-500"
            : "bg-emerald-600 hover:bg-emerald-500"
        } disabled:opacity-40`}
      >
        {props.playing ? "停止" : "播放"}
      </button>
      <span data-testid="transport-time" className="text-sm tabular-nums text-neutral-300">
        {formatTime(props.timeSeconds)}
      </span>
      <label className="flex w-56 items-center gap-2 text-xs text-neutral-400">
        主增益
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={props.masterGain}
          onChange={(e) => props.onMasterGain(Number(e.target.value))}
          className="flex-1"
        />
        <span className="w-8 text-right tabular-nums">
          {props.masterGain.toFixed(2)}
        </span>
      </label>
      <span data-testid="engine-status" className="ml-auto text-xs text-neutral-500">
        引擎：{STATUS_LABEL[props.status]}
      </span>
    </div>
  );
}
