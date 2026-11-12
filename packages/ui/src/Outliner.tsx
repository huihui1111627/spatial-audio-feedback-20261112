/**
 * Outliner：声源列表（选择/新增/删除）。
 */
import type { SceneProject } from "@spatial/scene-model";

export interface OutlinerProps {
  project: SceneProject;
  selectedSourceId: string | null;
  onSelect(id: string | null): void;
  onAddSource(): void;
  onRemoveSource(id: string): void;
}

export function Outliner(props: OutlinerProps) {
  const { project, selectedSourceId } = props;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <h2 className="text-sm font-medium text-neutral-200">声源</h2>
        <button
          type="button"
          onClick={props.onAddSource}
          className="rounded bg-emerald-700 px-2 py-1 text-xs hover:bg-emerald-600"
        >
          添加声源
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {project.sources.map((s) => (
          <li
            key={s.id}
            className={`group flex cursor-pointer items-center justify-between px-3 py-2 text-sm ${
              s.id === selectedSourceId
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-300 hover:bg-neutral-900"
            }`}
            onClick={() => props.onSelect(s.id)}
          >
            <span className="truncate">{s.name}</span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-neutral-500">
                {s.asset_hash ? "素材" : "测试音"}
              </span>
              <button
                type="button"
                aria-label={`删除 ${s.name}`}
                className="hidden rounded px-1 text-neutral-500 hover:text-red-400 group-hover:block"
                onClick={(e) => {
                  e.stopPropagation();
                  props.onRemoveSource(s.id);
                }}
              >
                ×
              </button>
            </span>
          </li>
        ))}
        {project.sources.length === 0 && (
          <li className="px-3 py-4 text-sm text-neutral-500">
            还没有声源，点右上角添加。
          </li>
        )}
      </ul>
      <div className="border-t border-neutral-800 px-3 py-2 text-xs text-neutral-500">
        听者 ({project.listener.position.x.toFixed(1)},{" "}
        {project.listener.position.y.toFixed(1)},{" "}
        {project.listener.position.z.toFixed(1)})
      </div>
    </div>
  );
}
