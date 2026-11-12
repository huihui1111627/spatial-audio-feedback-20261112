/**
 * Inspector：选中对象与房间的属性编辑。
 */
import type { ReactNode } from "react";
import {
  MATERIAL_PRESETS,
  WALL_LABELS,
  materialFromPreset,
  type SceneProject,
  type Vec3,
} from "@spatial/scene-model";

export interface InspectorProps {
  project: SceneProject;
  selectedSourceId: string | null;
  onRenameSource(id: string, name: string): void;
  onSetSourceGain(id: string, gain: number): void;
  onSetSourcePosition(id: string, pos: Vec3): void;
  onSetRoomDimensions(d: Vec3): void;
  onSetWallPreset(wall: number, presetId: string): void;
  onSetWallBand(wall: number, band: number, absorption: number): void;
  onSetDoorOpen(doorIndex: number, open: number): void;
  onAddDoor(wall: number): void;
  onRemoveDoor(doorIndex: number): void;
}

function NumberField(props: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  onChange(v: number): void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-neutral-400">
      <span className="w-4">{props.label}</span>
      <input
        type="number"
        step={props.step ?? 0.1}
        min={props.min}
        value={Number(props.value.toFixed(3))}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) props.onChange(v);
        }}
        className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-200"
      />
    </label>
  );
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-neutral-800 px-3 py-3">
      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
        {props.title}
      </h3>
      <div className="space-y-2">{props.children}</div>
    </section>
  );
}

export function Inspector(props: InspectorProps) {
  const { project, selectedSourceId } = props;
  const source = project.sources.find((s) => s.id === selectedSourceId);
  const room = project.room;

  return (
    <div className="h-full overflow-y-auto">
      {source && (
        <Section title={`声源 · ${source.id}`}>
          <label className="block text-xs text-neutral-400">
            名称
            <input
              type="text"
              value={source.name}
              onChange={(e) => props.onRenameSource(source.id, e.target.value)}
              className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-200"
            />
          </label>
          <label className="block text-xs text-neutral-400">
            增益 {source.gain.keys[0]?.value.toFixed(2)}
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={source.gain.keys[0]?.value ?? 0}
              onChange={(e) =>
                props.onSetSourceGain(source.id, Number(e.target.value))
              }
              className="mt-1 w-full"
            />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <NumberField
              label="x"
              value={source.position.x}
              onChange={(x) =>
                props.onSetSourcePosition(source.id, { ...source.position, x })
              }
            />
            <NumberField
              label="y"
              value={source.position.y}
              onChange={(y) =>
                props.onSetSourcePosition(source.id, { ...source.position, y })
              }
            />
            <NumberField
              label="z"
              value={source.position.z}
              onChange={(z) =>
                props.onSetSourcePosition(source.id, { ...source.position, z })
              }
            />
          </div>
          <p className="text-xs text-neutral-500">
            素材：{source.asset_hash ? source.asset_hash.slice(0, 12) + "…" : "内置测试音"}
          </p>
        </Section>
      )}

      <Section title="房间尺寸（米）">
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="宽"
            min={0.5}
            value={room.dimensions.x}
            onChange={(x) => props.onSetRoomDimensions({ ...room.dimensions, x })}
          />
          <NumberField
            label="高"
            min={0.5}
            value={room.dimensions.y}
            onChange={(y) => props.onSetRoomDimensions({ ...room.dimensions, y })}
          />
          <NumberField
            label="深"
            min={0.5}
            value={room.dimensions.z}
            onChange={(z) => props.onSetRoomDimensions({ ...room.dimensions, z })}
          />
        </div>
      </Section>

      <Section title="墙面材质">
        {room.walls.map((w, i) => (
          <details key={i} className="rounded border border-neutral-800 px-2 py-1">
            <summary className="cursor-pointer text-xs text-neutral-300">
              {WALL_LABELS[i]} · {MATERIAL_PRESETS[w.material_id]?.label ?? w.material_id}
            </summary>
            <div className="mt-2 space-y-2">
              <select
                value={w.material_id}
                onChange={(e) => props.onSetWallPreset(i, e.target.value)}
                className="w-full rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-neutral-200"
              >
                {Object.entries(MATERIAL_PRESETS).map(([id, preset]) => (
                  <option key={id} value={id}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-4 gap-1">
                {w.absorption.map((a, band) => (
                  <label key={band} className="text-[10px] text-neutral-500">
                    {[63, 125, 250, 500, "1k", "2k", "4k", "8k"][band]}
                    <input
                      type="number"
                      min={0}
                      max={1}
                      step={0.01}
                      value={a}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (v >= 0 && v <= 1) props.onSetWallBand(i, band, v);
                      }}
                      className="w-full rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-neutral-200"
                    />
                  </label>
                ))}
              </div>
            </div>
          </details>
        ))}
      </Section>

      <Section title="门">
        {room.doors.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-neutral-300">
            <span className="w-16">{WALL_LABELS[d.wall]}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={d.open_fraction}
              onChange={(e) => props.onSetDoorOpen(i, Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-10 text-right tabular-nums">
              {Math.round(d.open_fraction * 100)}%
            </span>
            <button
              type="button"
              aria-label="删除门"
              onClick={() => props.onRemoveDoor(i)}
              className="rounded px-1 text-neutral-500 hover:text-red-400"
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => props.onAddDoor(0)}
          className="rounded border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          在 -X 墙加门
        </button>
      </Section>
    </div>
  );
}

export { materialFromPreset };
