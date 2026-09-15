"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { PARTS, PART_BY_ID, type PartId, type ViewMode } from "@/lib/engine";
import { createEngine } from "./engine-model";

export type CameraView = "Perspective" | "Front" | "Back" | "Left" | "Right" | "Top" | "Bottom";
export type SceneHandle = {
  orbit: (dx: number, dy: number) => void;
  pan: (dx: number, dy: number) => void;
  zoom: (delta: number) => void;
  reset: () => void;
  view: (view: CameraView) => void;
  focus: (id: PartId) => void;
  pick: (x: number, y: number) => PartId | null;
  preview: (id: PartId | null, amount?: number) => void;
};
type Props = {
  selected: PartId | null; removed: PartId[]; mode: ViewMode; exploded: number; cutaway: boolean;
  xray: boolean; isolated: boolean; labels: boolean; playing: boolean; speed: number; angle: number;
  onSelect: (id: PartId) => void; onAngle: (angle: number) => void; onZoom: (percent: number) => void;
};

const EngineScene = forwardRef<SceneHandle, Props>(function EngineScene(props, ref) {
  const mount = useRef<HTMLDivElement>(null), latest = useRef(props), api = useRef<SceneHandle | null>(null);
  const labelRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [error, setError] = useState(""); const [ready, setReady] = useState(false);
  latest.current = props;
  useImperativeHandle(ref, () => ({
    orbit: (x, y) => api.current?.orbit(x, y), pan: (x, y) => api.current?.pan(x, y), zoom: (delta) => api.current?.zoom(delta), reset: () => api.current?.reset(),
    view: (view) => api.current?.view(view), focus: (id) => api.current?.focus(id), pick: (x, y) => api.current?.pick(x, y) ?? null,
    preview: (id, amount) => api.current?.preview(id, amount),
  }), []);
  useEffect(() => {
    const container = mount.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" }); }
    catch { setError("The 3D viewer needs WebGL. Enable hardware acceleration in your browser, then reload."); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    renderer.localClippingEnabled = true; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.03;
    renderer.domElement.setAttribute("aria-label", "Interactive 3D single-cylinder engine. Drag to rotate, scroll to zoom, or select a part.");
    renderer.domElement.setAttribute("data-engine-canvas", "true");
    renderer.domElement.tabIndex = 0; container.prepend(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(37, 1, .05, 100); camera.position.set(8, 6.1, 10.4);
    const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0, 1.7, 0);
    camera.position.sub(controls.target).setLength(13.3).add(controls.target);
    controls.enableDamping = true; controls.dampingFactor = .13; controls.minDistance = 2; controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI; controls.rotateSpeed = .75; controls.zoomSpeed = .8; controls.update();
    // OrbitControls also reports touch pinches and the existing zoom buttons.
    let lastZoom = 0;
    const reportZoom = () => {
      const percent = Math.round(13.3 / camera.position.distanceTo(controls.target) * 100);
      if (percent !== lastZoom) { lastZoom = percent; latest.current.onZoom(percent); }
    };
    controls.addEventListener("change", reportZoom); reportZoom();
    const environment = new RoomEnvironment(); const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromScene(environment, .04); scene.environment = env.texture; environment.dispose(); pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xf2f6ff, 0xa3a096, 1.3));
    const key = new THREE.DirectionalLight(0xfff7ed, 2.8); key.position.set(4, 9, 6); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -8, right: 8, top: 12, bottom: -8, near: .1, far: 35 }); key.shadow.bias = -.001; key.shadow.normalBias = .035; scene.add(key);
    const rim = new THREE.DirectionalLight(0xd8e9ff, 2); rim.position.set(-5, 5, -6); scene.add(rim);
    const model = createEngine(); scene.add(model.engine);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: .12 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -1.005; floor.receiveShadow = true; scene.add(floor);
    const grid = new THREE.GridHelper(24, 48, 0xc8cdc7, 0xe0e3dc); grid.position.y = -1.02;
    (grid.material as THREE.Material).transparent = true; (grid.material as THREE.Material).opacity = .45; scene.add(grid);
    const clipping = new THREE.Plane(new THREE.Vector3(0, 0, -1), .06);
    const ray = new THREE.Raycaster(), pointer = new THREE.Vector2();
    let preview: { id: PartId; amount: number } | null = null;
    function pick(x: number, y: number) {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1); ray.setFromCamera(pointer, camera);
      const intersections = ray.intersectObjects(model.engine.children, true);
      for (const hit of intersections) {
        const id = hit.object.userData.partId as PartId;
        if (!id || !model.parts[id].visible) continue;
        if (latest.current.cutaway && ["cylinder", "head", "crankcase", "cover"].includes(id) && hit.point.z > .06) continue;
        return id;
      }
      return null;
    }
    function setView(view: CameraView) {
      const target = new THREE.Vector3(0, latest.current.exploded > .2 ? 2.75 : 1.7, 0);
      const d = latest.current.exploded > .2 || latest.current.removed.length ? 18 : 13.3;
      const vectors: Record<CameraView, number[]> = { Perspective: [8, 4.4, 10.4], Front: [0, 0, 1], Back: [0, 0, -1], Left: [-1, 0, 0], Right: [1, 0, 0], Top: [0, 1, .001], Bottom: [0, -1, .001] };
      controls.target.copy(target); camera.position.copy(new THREE.Vector3(...vectors[view] as [number, number, number]).normalize().multiplyScalar(d).add(target)); controls.update();
    }
    api.current = {
      pick, reset: () => setView("Perspective"), view: setView,
      orbit: (dx, dy) => { const s = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)); s.theta -= dx * 5; s.phi = THREE.MathUtils.clamp(s.phi - dy * 5, .001, Math.PI - .001); camera.position.copy(new THREE.Vector3().setFromSpherical(s).add(controls.target)); controls.update(); },
      pan: (dx, dy) => {
        const height = 2 * camera.position.distanceTo(controls.target) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
        const shift = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(dx * height * camera.aspect)
          .addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1), -dy * height);
        const target = controls.target.clone().add(shift).clamp(new THREE.Vector3(-10, -8, -10), new THREE.Vector3(10, 12, 10));
        camera.position.add(target.clone().sub(controls.target)); controls.target.copy(target); controls.update();
      },
      zoom: (delta) => { const offset = camera.position.clone().sub(controls.target); offset.setLength(THREE.MathUtils.clamp(offset.length() * Math.exp(-delta), 2, 30)); camera.position.copy(controls.target).add(offset); controls.update(); },
      focus: (id) => { const center = new THREE.Vector3(...PART_BY_ID[id].center).add(model.parts[id].position); const dir = camera.position.clone().sub(controls.target).normalize(); controls.target.copy(center); camera.position.copy(center).addScaledVector(dir, 5); controls.update(); },
      preview: (id, amount = 0) => { preview = id ? { id, amount } : null; },
    };
    let down: { x: number; y: number } | null = null;
    const pointerDown = (event: PointerEvent) => { if (event.button === 0) down = { x: event.clientX, y: event.clientY }; };
    const pointerUp = (event: PointerEvent) => { if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) < 5) { const id = pick(event.clientX, event.clientY); if (id) latest.current.onSelect(id); } down = null; };
    const doubleClick = (event: MouseEvent) => { const id = pick(event.clientX, event.clientY); if (id) api.current?.focus(id); };
    renderer.domElement.addEventListener("pointerdown", pointerDown); renderer.domElement.addEventListener("pointerup", pointerUp); renderer.domElement.addEventListener("dblclick", doubleClick);
    const lostContext = (event: Event) => { event.preventDefault(); setError("The 3D graphics context was interrupted. Reload the page to restart the viewer."); };
    renderer.domElement.addEventListener("webglcontextlost", lostContext);
    const resize = new ResizeObserver(() => { const { width, height } = container.getBoundingClientRect(); if (!width || !height) return; camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height); }); resize.observe(container);
    let frame = 0, last = 0, lastReport = 0, rotation = latest.current.angle, previousAngle = rotation, previousStyle = "", wasPlaying = false;
    const projected = new THREE.Vector3();
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw); if (document.hidden || now - last < 1000 / 30) return;
      const delta = Math.min((now - (last || now)) / 1000, .08); last = now; const p = latest.current;
      if (!p.playing && (previousAngle !== p.angle || wasPlaying)) rotation = p.angle;
      previousAngle = p.angle; wasPlaying = p.playing;
      if (p.playing) { rotation = (rotation + delta * 90 * p.speed) % 720; if (now - lastReport > 100) { p.onAngle(rotation); lastReport = now; } }
      model.animate(rotation);
      const styleKey = `${p.selected}/${p.cutaway}/${p.xray}/${p.isolated}`;
      if (styleKey !== previousStyle) {
        previousStyle = styleKey;
        for (const part of PARTS) {
          model.parts[part.id].visible = !p.isolated || !p.selected || p.selected === part.id;
          for (const material of model.materials[part.id]) {
            material.emissive.set(p.selected === part.id ? 0xb64a1c : 0x000000); material.emissiveIntensity = p.selected === part.id ? .16 : 0;
            const translucent = p.xray && ["crankcase", "head", "cylinder", "cover"].includes(part.id);
            material.transparent = translucent; material.opacity = translucent ? .17 : 1; material.depthWrite = !translucent;
            material.clippingPlanes = p.cutaway && ["crankcase", "head", "cylinder", "cover"].includes(part.id) ? [clipping] : [];
            material.clipShadows = true; material.needsUpdate = true;
          }
        }
        renderer.shadowMap.needsUpdate = true;
      }
      let moving = p.playing;
      for (const part of PARTS) {
        const isRemoved = p.removed.includes(part.id);
        const amount = preview?.id === part.id ? (isRemoved ? 1 - preview.amount : preview.amount) : isRemoved ? 1 : p.exploded;
        const group = model.parts[part.id], dest = new THREE.Vector3(...part.offset).multiplyScalar(amount);
        if (group.position.distanceToSquared(dest) > .00001) { group.position.lerp(dest, .16); moving = true; }
        const label = labelRefs.current[part.id];
        if (label) {
          projected.set(...part.center).add(group.position).project(camera);
          label.style.display = p.labels && group.visible && projected.z < 1 && Math.abs(projected.x) < .95 && Math.abs(projected.y) < .9 ? "block" : "none";
          label.style.left = `${(projected.x + 1) * 50}%`; label.style.top = `${(-projected.y + 1) * 50}%`;
        }
      }
      if (moving) renderer.shadowMap.needsUpdate = true;
      floor.visible = camera.position.y > -1; grid.visible = floor.visible;
      controls.update(); renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(draw); setReady(true);
    return () => {
      cancelAnimationFrame(frame); resize.disconnect(); api.current = null; controls.removeEventListener("change", reportZoom); controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointerup", pointerUp); renderer.domElement.removeEventListener("dblclick", doubleClick); renderer.domElement.removeEventListener("webglcontextlost", lostContext);
      const geometries = new Set<THREE.BufferGeometry>(), mats = new Set<THREE.Material>();
      scene.traverse((obj) => { if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) { geometries.add(obj.geometry); for (const m of Array.isArray(obj.material) ? obj.material : [obj.material]) mats.add(m); } });
      geometries.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); env.dispose(); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);
  return <div className="engine-canvas" ref={mount} data-ready={ready}>
    {!ready && !error && <div className="scene-loading"><span className="loading-ring"/>Preparing your workbench…</div>}
    {error && <div className="scene-error" role="alert">{error}</div>}
    {PARTS.map((part, index) => <button key={part.id} className={`scene-label ${props.selected === part.id ? "selected" : ""}`} ref={(node) => { labelRefs.current[part.id] = node; }} onClick={() => props.onSelect(part.id)} title={part.name} style={{ display: "none" }}>{String(index + 1).padStart(2, "0")}<span>{part.name}</span></button>)}
  </div>;
});
export default EngineScene;
