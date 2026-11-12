/**
 * 三维视口运行时：房间线框、声源球、听者锥体、门标记的渲染与拾取。
 * 几何仅服务编辑可视化，声学求交以 Rust 侧为唯一权威。
 *
 * 世界坐标约定：x/z 以房间中心为原点，y 从地面（0）到天花板。
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { SceneProject, Vec3 } from "@spatial/scene-model";

export interface ViewportCallbacks {
  onSelect(id: string | null): void;
  /** 拖拽结束提交。 */
  onMoveSource(id: string, pos: Vec3): void;
  /** 拖拽中预览（不产生撤销历史）。 */
  onPreviewSource(id: string, pos: Vec3): void;
  onDragStateChange(dragging: boolean): void;
}

const SOURCE_RADIUS = 0.15;
const DOOR_WIDTH = 0.9;
const DOOR_HEIGHT = 2.1;

function toThree(v: Vec3): THREE.Vector3 {
  return new THREE.Vector3(v.x, v.y, v.z);
}

export class ViewportRuntime {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly orbit: OrbitControls;
  private readonly gizmo: TransformControls;
  private readonly raycaster = new THREE.Raycaster();
  private readonly sourceMeshes = new Map<string, THREE.Mesh>();
  private roomBox: THREE.LineSegments | null = null;
  private listenerMesh: THREE.Mesh | null = null;
  private doorMeshes: THREE.Mesh[] = [];
  private rafId = 0;
  private selectedId: string | null = null;
  private dragging = false;
  /** 拖拽期间屏蔽外部位置同步，避免回环。 */
  private disposed = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: ViewportCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
    this.camera.position.set(6, 5, 8);
    this.camera.lookAt(0, 1, 0);

    this.scene.background = new THREE.Color(0x101014);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(4, 8, 3);
    this.scene.add(dir);
    const grid = new THREE.GridHelper(24, 24, 0x333340, 0x222228);
    this.scene.add(grid);

    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.target.set(0, 1, 0);
    this.orbit.enableDamping = true;

    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setMode("translate");
    this.gizmo.addEventListener("dragging-changed", (event) => {
      const dragging = Boolean((event as unknown as { value: boolean }).value);
      this.orbit.enabled = !dragging;
      this.dragging = dragging;
      this.callbacks.onDragStateChange(dragging);
    });
    this.gizmo.addEventListener("objectChange", () => {
      if (!this.selectedId || !this.dragging) return;
      const mesh = this.sourceMeshes.get(this.selectedId);
      if (!mesh) return;
      const p = mesh.position;
      this.callbacks.onPreviewSource(this.selectedId, { x: p.x, y: p.y, z: p.z });
    });
    this.gizmo.addEventListener("mouseUp", () => {
      if (!this.selectedId) return;
      const mesh = this.sourceMeshes.get(this.selectedId);
      if (!mesh) return;
      const p = mesh.position;
      this.callbacks.onMoveSource(this.selectedId, { x: p.x, y: p.y, z: p.z });
    });
    // three r169+：TransformControls 本体不是 Object3D，要加它的 helper。
    this.scene.add(this.gizmo.getHelper());

    this.renderer.domElement.addEventListener("pointerdown", (e) =>
      this.handlePick(e),
    );

    const resizeObserver = new ResizeObserver(() => this.handleResize());
    resizeObserver.observe(container);
    this.handleResize();

    const animate = () => {
      if (this.disposed) return;
      this.rafId = requestAnimationFrame(animate);
      this.orbit.update();
      this.renderer.render(this.scene, this.camera);
    };
    animate();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.gizmo.detach();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private handleResize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private handlePick(event: PointerEvent): void {
    // gizmo 拖拽中不做拾取切换。
    if (this.dragging) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(
      [...this.sourceMeshes.values()],
      false,
    );
    const hit = hits[0]?.object as THREE.Mesh | undefined;
    this.callbacks.onSelect(
      hit ? ((hit.userData.sourceId as string) ?? null) : null,
    );
  }

  /** 全量同步场景文档到三维视图（编辑操作频繁，做增量 diff）。 */
  syncProject(project: SceneProject, selectedSourceId: string | null): void {
    this.selectedId = selectedSourceId;
    this.syncRoom(project);
    this.syncSources(project, selectedSourceId);
    this.syncListener(project);
    this.syncDoors(project);
  }

  private syncRoom(project: SceneProject): void {
    const d = project.room.dimensions;
    if (this.roomBox) {
      this.scene.remove(this.roomBox);
      this.roomBox.geometry.dispose();
    }
    const geo = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(d.x, d.y, d.z),
    );
    this.roomBox = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0x4a4a5a }),
    );
    this.roomBox.position.set(0, d.y / 2, 0);
    this.scene.add(this.roomBox);
  }

  private syncSources(project: SceneProject, selectedSourceId: string | null): void {
    const seen = new Set<string>();
    for (const src of project.sources) {
      seen.add(src.id);
      let mesh = this.sourceMeshes.get(src.id);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(SOURCE_RADIUS, 24, 16),
          new THREE.MeshStandardMaterial({ color: 0x38bdf8 }),
        );
        mesh.userData.sourceId = src.id;
        this.sourceMeshes.set(src.id, mesh);
        this.scene.add(mesh);
      }
      if (!(this.dragging && src.id === selectedSourceId)) {
        mesh.position.copy(toThree(src.position));
      }
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.color.set(src.id === selectedSourceId ? 0xf59e0b : 0x38bdf8);
    }
    for (const [id, mesh] of this.sourceMeshes) {
      if (!seen.has(id)) {
        if (this.gizmo.object === mesh) this.gizmo.detach();
        this.scene.remove(mesh);
        mesh.geometry.dispose();
        this.sourceMeshes.delete(id);
      }
    }

    // gizmo 跟随选中
    const selectedMesh = selectedSourceId
      ? this.sourceMeshes.get(selectedSourceId)
      : undefined;
    if (selectedMesh) {
      if (this.gizmo.object !== selectedMesh) this.gizmo.attach(selectedMesh);
    } else {
      this.gizmo.detach();
    }
  }

  private syncListener(project: SceneProject): void {
    if (!this.listenerMesh) {
      const geo = new THREE.ConeGeometry(0.18, 0.45, 20);
      geo.rotateX(Math.PI / 2); // 锥尖朝 +z，下面用 lookAt 对齐 forward
      this.listenerMesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({ color: 0xa78bfa }),
      );
      this.scene.add(this.listenerMesh);
    }
    const l = project.listener;
    this.listenerMesh.position.copy(toThree(l.position));
    const target = toThree(l.position).add(toThree(l.forward));
    this.listenerMesh.up.copy(toThree(l.up));
    this.listenerMesh.lookAt(target);
  }

  private syncDoors(project: SceneProject): void {
    for (const m of this.doorMeshes) {
      this.scene.remove(m);
      m.geometry.dispose();
    }
    this.doorMeshes = [];
    const d = project.room.dimensions;
    for (const door of project.room.doors) {
      const geo = new THREE.PlaneGeometry(DOOR_WIDTH, DOOR_HEIGHT);
      const mat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        // 开得越大门越“空”
        opacity: 0.85 - door.open_fraction * 0.65,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      const eps = 0.01;
      switch (door.wall) {
        case 0: // -x
          mesh.position.set(-d.x / 2 + eps, DOOR_HEIGHT / 2, 0);
          mesh.rotation.y = Math.PI / 2;
          break;
        case 1: // +x
          mesh.position.set(d.x / 2 - eps, DOOR_HEIGHT / 2, 0);
          mesh.rotation.y = -Math.PI / 2;
          break;
        case 2: // -y（地板）
          mesh.position.set(0, eps, 0);
          mesh.rotation.x = -Math.PI / 2;
          break;
        case 3: // +y（天花板）
          mesh.position.set(0, d.y - eps, 0);
          mesh.rotation.x = Math.PI / 2;
          break;
        case 4: // -z
          mesh.position.set(0, DOOR_HEIGHT / 2, -d.z / 2 + eps);
          break;
        default: // 5: +z
          mesh.position.set(0, DOOR_HEIGHT / 2, d.z / 2 - eps);
          mesh.rotation.y = Math.PI;
          break;
      }
      this.doorMeshes.push(mesh);
      this.scene.add(mesh);
    }
  }
}
