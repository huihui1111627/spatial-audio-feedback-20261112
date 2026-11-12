/**
 * 三维视口 React 组件：把 ViewportRuntime 挂进 React 生命周期。
 */
import { useEffect, useRef } from "react";
import type { SceneProject, Vec3 } from "@spatial/scene-model";
import { ViewportRuntime } from "./runtime.js";

export interface ViewportProps {
  project: SceneProject;
  selectedSourceId: string | null;
  onSelect(id: string | null): void;
  onMoveSource(id: string, pos: Vec3): void;
  onPreviewSource(id: string, pos: Vec3): void;
  onDragStateChange(dragging: boolean): void;
}

export function Viewport(props: ViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<ViewportRuntime | null>(null);
  // 回调经 ref 转发，避免父组件重渲染导致 runtime 重建。
  const callbacksRef = useRef(props);
  callbacksRef.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const runtime = new ViewportRuntime(container, {
      onSelect: (id) => callbacksRef.current.onSelect(id),
      onMoveSource: (id, pos) => callbacksRef.current.onMoveSource(id, pos),
      onPreviewSource: (id, pos) => callbacksRef.current.onPreviewSource(id, pos),
      onDragStateChange: (d) => callbacksRef.current.onDragStateChange(d),
    });
    runtimeRef.current = runtime;
    return () => {
      runtime.dispose();
      runtimeRef.current = null;
    };
  }, []);

  useEffect(() => {
    runtimeRef.current?.syncProject(props.project, props.selectedSourceId);
  }, [props.project, props.selectedSourceId]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
