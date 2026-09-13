"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { blueprintFor, createResources, seededRandom, SITE, type BlueprintId, type GameState, type Material, type Position } from "@/lib/game";

export type WorldHandle = { zoom: (delta: number) => void; reset: () => void; rotate: () => void };
type Props = { state: GameState | null; blueprint: BlueprintId; playerId: string | null; onMove: (position: Position) => void; quality: boolean };
type BuildingPart = { mesh: THREE.Mesh; material: Material; original: THREE.Material | THREE.Material[] };
const colors = { grass: 0x91ad68, pine: 0x477851, bark: 0x89633f, wood: 0xc7995f, stone: 0xb5b6a6, glass: 0x8dd3cf };

function makeWorld(container: HTMLDivElement, onMove: (p: Position) => void, quality: boolean) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8eddf);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality ? 1.7 : 1));
  renderer.shadowMap.enabled = quality;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.28;
  renderer.domElement.setAttribute("aria-label", "Interactive 3D forest. Click the ground to move, or use WASD. Press E near resources or the building site.");
  renderer.domElement.setAttribute("role", "img");
  container.appendChild(renderer.domElement);
  const camera = new THREE.OrthographicCamera(-25, 25, 17, -17, 0.1, 180);
  let angle = Math.PI / 4;
  const setCamera = () => { camera.position.set(Math.sin(angle) * 38, 32, Math.cos(angle) * 38); camera.lookAt(0, 0.3, 0); camera.updateProjectionMatrix(); };
  setCamera();
  const ambient = new THREE.HemisphereLight(0xf8f5df, 0x668066, 2.65);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xfff0cc, 3.8);
  sun.position.set(-16, 30, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 85 });
  sun.shadow.normalBias = 0.055;
  sun.shadow.bias = -0.0002;
  scene.add(sun);
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometries = new Set<THREE.BufferGeometry>();
  const material = (color: THREE.ColorRepresentation, flat = true) => {
    const key = String(color) + flat;
    if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.86, flatShading: flat }));
    return materials.get(key)!;
  };
  const make = (geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, x: number, y: number, z: number, parent: THREE.Object3D = scene): THREE.Mesh => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation, x: number, y: number, z: number, parent?: THREE.Object3D) => make(new THREE.BoxGeometry(w, h, d), color, x, y, z, parent);
  const random = seededRandom(438);
  // A small, tangible island: layered soil, softly varied grass and a winding creek.
  const ground = box(200, 0.1, 200, 0xe8eddf, 0, -2.05, 0);
  ground.castShadow = false;
  box(28, 1.0, 26, 0x9c9874, 0, -0.78, 0);
  box(28.15, 0.4, 26.15, 0xc4b68b, 0, -0.19, 0);
  box(28.35, 0.27, 26.35, colors.grass, 0, 0.14, 0);
  for (let x = -13; x <= 13; x += 2) for (let z = -12; z <= 12; z += 2) {
    const grassColors = [0x9db775, 0x91ab68, 0x96b06f, 0x99b372, 0x8eab66];
    const tile = box(2, 0.025, 2, grassColors[Math.floor(random() * grassColors.length)], x, 0.286, z);
    tile.castShadow = false;
  }
  for (let i = 0; i < 32; i++) {
    const front = i < 16;
    const x = front ? -13.4 + i * 1.75 : 14.1;
    const z = front ? 13.15 : -12 + (i - 16) * 1.6;
    box(front ? 0.6 + random() : 0.08, 0.13 + random() * 0.25, front ? 0.08 : 0.65 + random(), [0xe0cba0, 0xb0a07f, 0x8c896c][i % 3], x, -0.7 + random() * 0.4, z);
  }
  const creekPoints: Position[] = [];
  for (let i = 0; i <= 50; i++) { const z = -13.15 + i / 50 * 26.3; creekPoints.push({ x: -10.9 + Math.sin(z * 0.24) * 1.1, z }); }
  const strip = (width: number, color: number, y: number) => {
    const vertices: number[] = [];
    for (let i = 0; i < creekPoints.length - 1; i++) {
      const a = creekPoints[i], b = creekPoints[i + 1];
      vertices.push(a.x - width, y, a.z, a.x + width, y, a.z, b.x - width, y, b.z, a.x + width, y, a.z, b.x + width, y, b.z, b.x - width, y, b.z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const mesh = make(geometry, color, 0, 0, 0);
    (mesh.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
    mesh.castShadow = false;
    return mesh;
  };
  strip(1.65, 0xd1c7a0, 0.315);
  strip(1.3, 0x78b7b3, 0.34);
  strip(0.85, 0x82c3bd, 0.345);
  const ripples: THREE.Mesh[] = [];
  for (let i = 0; i < 27; i++) {
    const z = -12 + random() * 24;
    const x = -10.9 + Math.sin(z * 0.24) * 1.1;
    const ripple = box(0.25 + random() * 0.55, 0.008, 0.035, 0xc4e0d0, x - 0.7 + random() * 1.4, 0.36, z);
    ripple.castShadow = false;
    ripples.push(ripple);
  }
  // Little footbridge, complete with posts and handrails.
  for (let i = 0; i < 12; i++) box(0.36, 0.14, 1.45, i % 2 ? 0xb79562 : 0xc4a374, -12.4 + i * 0.37, 0.54, 4.0);
  for (const z of [3.27, 4.73]) {
    box(4.55, 0.13, 0.12, 0x9c7b50, -10.35, 1.2, z);
    for (const x of [-12.4, -10.3, -8.35]) box(0.15, 0.9, 0.15, 0x92724b, x, 0.92, z);
  }
  const tree = (x: number, z: number, scale = 1) => {
    const group = new THREE.Group();
    scene.add(group);
    group.position.set(x, 0.3, z);
    group.scale.setScalar(scale);
    box(0.27, 1.4, 0.28, 0x7e6542, 0, 0.6, 0, group);
    const pineColors = [0x436e4e, 0x537e51, 0x608d59, 0x6d9660];
    const variation = Math.floor(random() * 2);
    for (let j = 0; j < 3; j++) {
      const mesh = make(new THREE.ConeGeometry(1.25 - j * 0.29, 2.2 - j * 0.24, 5), pineColors[j + variation], 0, 1.9 + j * 0.93, 0, group);
      mesh.rotation.y = j * 0.35 + random() * 0.25;
    }
    return group;
  };
  for (let i = 0; i < 66; i++) {
    let x = -13 + random() * 26;
    let z = -12.4 + random() * 24.8;
    if (i < 21) { x = -7 + (i % 11) * 1.9 + random() * 0.7; z = -10.5 - Math.floor(i / 11) * 1.6; }
    else if (i < 36) { x = 10.8 + random() * 2; z = -9 + (i - 21) * 1.4; }
    else if (i < 44) { x = -13.2 + random() * 0.6; z = -10 + (i - 36) * 2.9; }
    if ((Math.abs(x - 1) < 5.6 && Math.abs(z) < 5.7) || (x < -8.5 && x > -12.9) || (z > 4.5 && x > -5 && x < 8)) continue;
    tree(x, z, 0.65 + random() * 0.55);
  }
  for (const [x, z, size] of [[-6.9, -6, 1.1], [-7.5, 1, 1.05], [-5, 11, 0.85], [9.7, 7, 1.1], [6.8, -7.4, 0.85], [4, -8.4, 1.15]]) tree(x, z, size);
  const rock = (x: number, z: number, s: number) => {
    const mesh = make(new THREE.DodecahedronGeometry(s, 0), [0xa4ab99, 0xc0c3ae, 0x8c9985][Math.floor(random() * 3)], x, 0.28 + s * 0.34, z);
    mesh.scale.set(1.2, 0.65, 0.9);
    mesh.rotation.set(random(), random() * 3, random());
  };
  for (let i = 0; i < 48; i++) {
    const x = -8 + random() * 21, z = -11 + random() * 23;
    if (Math.abs(x - 1) < 4.5 && Math.abs(z) < 4) continue;
    rock(x, z, 0.12 + random() * 0.3);
  }
  // Worn path from the trailhead to the construction clearing.
  for (let i = 0; i < 21; i++) {
    const t = i / 20;
    const x = -1.2 + Math.sin(t * 3.7) * 2.6;
    const z = 12 - t * 9;
    const stone = make(new THREE.CylinderGeometry(0.32 + random() * 0.19, 0.4, 0.055, 6), 0xd0cdb0, x + random() * 0.5, 0.33, z);
    stone.rotation.y = random() * 5;
    stone.scale.z = 0.67;
  }
  // Grass tufts, wildflowers, shrubs, and mushrooms reward a closer look.
  const grassGeometry = new THREE.ConeGeometry(0.10, 0.35, 3);
  geometries.add(grassGeometry);
  for (let i = 0; i < 200; i++) {
    const x = -8.6 + random() * 22, z = -12 + random() * 24;
    if (Math.abs(x - 1) < 4.7 && Math.abs(z) < 3.8) continue;
    const tuft = make(grassGeometry, i % 3 ? 0x7c9b56 : 0xb6c881, x, 0.46, z);
    tuft.rotation.z = -0.3 + random() * 0.6;
    if (i % 9 === 0) {
      const flower = make(new THREE.IcosahedronGeometry(0.09), i % 2 ? 0xf8e6a2 : 0xf8f1d4, x, 0.65, z);
      flower.castShadow = false;
    }
    if (i % 17 === 0) {
      box(0.045, 0.19, 0.045, 0xeadabb, x + 0.2, 0.4, z);
      make(new THREE.ConeGeometry(0.14, 0.12, 6), 0xbf7251, x + 0.2, 0.52, z);
    }
  }
  for (const [x, z] of [[-6.8, 8.2], [9.2, 5.9], [-3.2, -6.2], [6.1, 10.5], [-7.5, -9], [9, -8]]) {
    for (let j = 0; j < 3; j++) {
      const shrub = make(new THREE.IcosahedronGeometry(0.44 + random() * 0.25, 0), j % 2 ? 0x869f58 : 0x6f9250, x + j * 0.4, 0.6, z + j * 0.15);
      shrub.scale.y = 0.8;
    }
  }
  // Trail sign and camp details.
  box(0.14, 1.4, 0.14, 0x89704b, 4.8, 0.98, 6.4);
  const sign = box(1.2, 0.46, 0.12, 0xd8bb81, 4.8, 1.52, 6.4);
  sign.rotation.z = 0.05;
  box(0.55, 0.055, 0.04, 0x736743, 4.7, 1.54, 6.48);
  const signArrow = box(0.22, 0.05, 0.05, 0x736743, 4.99, 1.6, 6.48); signArrow.rotation.z = -0.6;
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; rock(8.6 + Math.cos(a) * 0.65, 2 + Math.sin(a) * 0.65, 0.21); }
  for (let i = 0; i < 3; i++) {
    const log = make(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 7), 0x9d7448, 8.6, 0.49, 2);
    log.rotation.set(Math.PI / 2, 0, i * 2.1);
  }
  const fire = make(new THREE.ConeGeometry(0.2, 0.55, 5), 0xe7aa58, 8.6, 0.73, 2);
  box(1.4, 0.35, 0.45, 0xa48859, 8.8, 0.54, 3.5);
  for (let i = 0; i < 3; i++) {
    const log = make(new THREE.CylinderGeometry(0.17, 0.17, 1.5, 8), 0x976d45, -5.8, 0.5 + (i === 2 ? 0.28 : 0), 2 + (i % 2) * 0.32);
    log.rotation.z = Math.PI / 2;
  }
  // A pale foundation and a dashed green boundary make the objective unmistakable.
  const site = new THREE.Group(); site.position.set(SITE.x, 0, SITE.z); scene.add(site);
  box(6.5, 0.055, 5.4, 0xb4bf8f, 0, 0.33, 0, site);
  for (let i = 0; i < 15; i++) {
    for (const z of [-2.8, 2.8]) box(0.27, 0.018, 0.055, 0xf0edb8, -3.4 + i * 0.48, 0.38, z, site);
  }
  for (let i = 0; i < 12; i++) for (const x of [-3.5, 3.5]) box(0.055, 0.018, 0.26, 0xf0edb8, x, 0.38, -2.6 + i * 0.48, site);
  for (const x of [-3.4, 3.4]) for (const z of [-2.7, 2.7]) {
    box(0.12, 0.55, 0.12, 0xf2e6be, x, 0.6, z, site);
    box(0.2, 0.12, 0.2, 0x718853, x, 0.91, z, site);
  }
  // Batch the stationary forest by material. Hundreds of trees, grass blades,
  // terrain tiles and rocks now take a few dozen draw calls, including shadows.
  scene.updateMatrixWorld(true);
  const staticBatches = new Map<string, { geometries: THREE.BufferGeometry[]; material: THREE.Material; casts: boolean; receives: boolean }>();
  const staticMeshes: THREE.Mesh[] = [];
  const animatedDetails = new Set<THREE.Mesh>([fire, ...ripples]);
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || animatedDetails.has(object)) return;
    const key = `${object.material.uuid}:${object.castShadow}:${object.receiveShadow}`;
    let batch = staticBatches.get(key);
    if (!batch) { batch = { geometries: [], material: object.material, casts: object.castShadow, receives: object.receiveShadow }; staticBatches.set(key, batch); }
    const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
    // Primitives have different UV layouts but all provide position and normal.
    geometry.deleteAttribute("uv");
    batch.geometries.push(geometry.index ? geometry.toNonIndexed() : geometry);
    if (geometry.index) geometry.dispose();
    staticMeshes.push(object);
  });
  for (const batch of staticBatches.values()) {
    const geometry = mergeGeometries(batch.geometries, false);
    batch.geometries.forEach((g) => g.dispose());
    if (!geometry) continue;
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, batch.material); mesh.castShadow = batch.casts; mesh.receiveShadow = batch.receives; scene.add(mesh);
  }
  staticMeshes.forEach((mesh) => mesh.removeFromParent());
  const arrowGroup = new THREE.Group(); scene.add(arrowGroup); arrowGroup.position.set(SITE.x, 6.4, SITE.z);
  const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xe4b743, depthTest: false });
  const arrowStem = make(new THREE.CylinderGeometry(0.14, 0.14, 0.65, 6), 0xeadd83, 0, 0.3, 0, arrowGroup);
  const arrowHead = make(new THREE.ConeGeometry(0.4, 0.46, 4), 0xeadd83, 0, -0.2, 0, arrowGroup); arrowHead.rotation.z = Math.PI;
  arrowStem.material = arrowMaterial; arrowHead.material = arrowMaterial;
  arrowStem.renderOrder = 20; arrowHead.renderOrder = 20; arrowGroup.scale.setScalar(1.15);

  const resourceGroup = new THREE.Group(); scene.add(resourceGroup);
  const resourceMeshes = new Map<number, THREE.Group>();
  for (const resource of createResources()) {
    const group = new THREE.Group(); group.position.set(resource.x, 0.35, resource.z); resourceGroup.add(group);
    group.rotation.y = random() * Math.PI;
    if (resource.kind === "wood") {
      box(0.43, 0.35, 0.43, 0xc79d65, 0, 0.17, 0, group);
      for (const y of [0.07, 0.28]) box(0.445, 0.04, 0.445, 0x99764c, 0, y, 0, group);
      const slash = box(0.04, 0.43, 0.035, 0xe3bd82, 0, 0.17, 0.223, group); slash.rotation.z = 0.7;
    } else if (resource.kind === "stone") {
      const mesh = make(new THREE.DodecahedronGeometry(0.27), 0xbfc4b2, 0, 0.16, 0, group); mesh.scale.set(1.1, 0.8, 1);
    } else {
      const crystal = make(new THREE.CylinderGeometry(0, 0.18, 0.52, 5), 0x9bd3d1, 0, 0.28, 0, group);
      (crystal.material as THREE.MeshStandardMaterial).emissive.set(0x153435);
      make(new THREE.ConeGeometry(0.10, 0.3, 5), 0xc1e2d9, 0.17, 0.14, 0.05, group).rotation.z = -0.4;
    }
    resourceMeshes.set(resource.id, group);
  }
  // Repeated resource blocks are GPU instances. Each can disappear independently
  // while the entire field costs only a handful of draw calls.
  scene.updateMatrixWorld(true);
  type ResourceInstance = { mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4 };
  const resourceInstances = new Map<number, ResourceInstance[]>();
  const instanceBatches = new Map<string, { geometry: THREE.BufferGeometry; material: THREE.Material; entries: { id: number; matrix: THREE.Matrix4 }[] }>();
  for (const [id, group] of resourceMeshes) group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
    const geometry = object.geometry as THREE.BufferGeometry & { parameters?: object };
    const key = `${geometry.type}:${JSON.stringify(geometry.parameters)}:${object.material.uuid}`;
    let batch = instanceBatches.get(key);
    if (!batch) { batch = { geometry, material: object.material, entries: [] }; instanceBatches.set(key, batch); }
    batch.entries.push({ id, matrix: object.matrixWorld.clone() });
  });
  for (const batch of instanceBatches.values()) {
    const mesh = new THREE.InstancedMesh(batch.geometry, batch.material, batch.entries.length);
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.entries.forEach((entry, index) => {
      mesh.setMatrixAt(index, entry.matrix);
      if (!resourceInstances.has(entry.id)) resourceInstances.set(entry.id, []);
      resourceInstances.get(entry.id)!.push({ mesh, index, matrix: entry.matrix });
    });
    mesh.computeBoundingSphere(); scene.add(mesh);
  }
  resourceGroup.visible = false;
  const resourceVisibility = new Map<number, boolean>();
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const building = new THREE.Group(); building.position.set(SITE.x, 0.4, SITE.z); scene.add(building);
  let buildingParts: BuildingPart[] = [];
  let currentBlueprint: BlueprintId | null = null;
  const ghostMaterial = new THREE.MeshStandardMaterial({ color: 0xb6cf96, transparent: true, opacity: 0.1, wireframe: false, depthWrite: false });
  const addBuilding = (id: BlueprintId) => {
    building.clear(); buildingParts = [];
    const part = (kind: Material, w: number, h: number, d: number, color: number, x: number, y: number, z: number) => {
      const mesh = box(w, h, d, color, x, y, z, building);
      buildingParts.push({ mesh, material: kind, original: mesh.material });
      return mesh;
    };
    if (id === "cabin") {
      for (let i = 0; i < 4; i++) part("stone", 1.25, 0.3, 3.9, 0xb0ae95, -1.87 + i * 1.25, 0.15, 0);
      for (let j = 0; j < 7; j++) {
        const color = j % 2 ? 0xc49359 : 0xd2a36b;
        part("wood", 4.6, 0.3, 0.23, color, 0, 0.47 + j * 0.32, -1.55);
        for (const x of [-2.16, 2.16]) part("wood", 0.26, 0.3, 3.35, color, x, 0.47 + j * 0.32, 0);
        part("wood", 1.5, 0.3, 0.25, color, -1.4, 0.47 + j * 0.32, 1.55);
        part("wood", 1.6, 0.3, 0.25, color, 1.38, 0.47 + j * 0.32, 1.55);
      }
      part("wood", 0.88, 1.83, 0.1, 0x6c5b3e, -0.05, 1.23, 1.58);
      part("wood", 0.06, 1.67, 0.06, 0x97825b, 0.23, 1.23, 1.65);
      part("stone", 0.065, 0.09, 0.08, 0xddc887, 0.20, 1.15, 1.7);
      for (const [x, z, side] of [[1.4, 1.71, false], [-1.4, 1.71, false], [2.31, 0, true]] as const) {
        const frame = part("glass", side ? 0.09 : 0.89, 0.99, side ? 1.2 : 0.09, 0xf1d9a3, x, 1.62, z);
        void frame;
        part("glass", side ? 0.10 : 0.68, 0.77, side ? 0.96 : 0.10, 0x9cbfb1, x + (side ? 0.03 : 0), 1.62, z + (side ? 0 : 0.03));
        part("wood", side ? 0.14 : 0.055, 0.85, side ? 0.06 : 0.14, 0xe3c78f, x + (side ? 0.08 : 0), 1.62, z + (side ? 0 : 0.08));
        part("wood", side ? 0.15 : 0.81, 0.055, side ? 1.05 : 0.15, 0xe3c78f, x + (side ? 0.08 : 0), 1.62, z + (side ? 0 : 0.08));
      }
      const triangle = new THREE.Shape(); triangle.moveTo(-2.3, 0); triangle.lineTo(2.3, 0); triangle.lineTo(0, 1.62); triangle.closePath();
      for (const z of [-1.57, 1.57]) {
        const mesh = make(new THREE.ExtrudeGeometry(triangle, { depth: 0.12, bevelEnabled: false }), 0xc7985d, 0, 2.56, z, building);
        buildingParts.push({ mesh, material: "wood", original: mesh.material });
      }
      for (const sign of [-1, 1]) {
        const roof = part("wood", 3.05, 0.18, 4.05, sign === 1 ? 0x536d5a : 0x647c61, sign * 1.2, 3.34, 0);
        roof.rotation.z = sign * -0.61;
        for (let i = 0; i < 9; i++) {
          const seam = part("wood", 3.05, 0.055, 0.045, 0x405d4c, sign * 1.2, 3.45, -1.96 + i * 0.49);
          seam.rotation.z = sign * -0.61;
        }
      }
      part("wood", 0.19, 0.2, 4.17, 0x405646, 0, 4.23, 0);
      part("stone", 0.57, 1.5, 0.58, 0xb6b4a0, 1.17, 3.85, -0.87);
      part("stone", 0.72, 0.17, 0.72, 0x8d9586, 1.17, 4.65, -0.87);
      part("wood", 4.9, 0.16, 1.05, 0xc8a877, 0, 0.24, 2.15);
      part("stone", 1.45, 0.15, 0.44, 0xc7bea0, 0, 0.10, 2.88);
      for (const x of [-2.17, 2.17]) {
        part("wood", 0.15, 2.0, 0.15, 0xab8859, x, 1.25, 2.53);
        part("wood", 0.2, 0.17, 1.0, 0xd4b785, x, 1.02, 2.12);
      }
      const porch = part("wood", 4.95, 0.16, 1.28, 0x667b5e, 0, 2.29, 2.07); porch.rotation.x = 0.17;
    } else if (id === "aframe") {
      for (let i = 0; i < 6; i++) part("stone", 0.82, 0.32, 4.3, 0xb4b3a0, -2.05 + i * 0.82, 0.16, 0);
      for (const sign of [-1, 1]) {
        const roof = part("wood", 4.8, 0.19, 4.5, sign === 1 ? 0x61765e : 0x4d6754, sign * 1.12, 2.25, 0); roof.rotation.z = sign * -1.02;
        for (let i = 0; i < 9; i++) { const seam = part("wood", 4.87, 0.06, 0.06, 0x3e5b49, sign * 1.14, 2.36, -2.18 + i * 0.54); seam.rotation.z = sign * -1.02; }
      }
      for (const z of [-2.12, 2.12]) {
        const shape = new THREE.Shape(); shape.moveTo(-2.22, 0); shape.lineTo(2.22, 0); shape.lineTo(0, 4.1); shape.closePath();
        const mesh = make(new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false }), 0x9dc6b6, 0, 0.32, z, building);
        buildingParts.push({ mesh, material: "glass", original: mesh.material });
        part("wood", 0.12, 4.1, 0.18, 0xd7bd8d, 0, 2.37, z + 0.14);
        for (let i = 0; i < 3; i++) part("wood", 3.5 - i * 0.95, 0.11, 0.18, 0xd7bd8d, 0, 1.2 + i, z + 0.14);
      }
      part("wood", 0.9, 1.6, 0.14, 0x6a684e, 0.1, 1.16, 2.32);
      for (let i = 0; i < 6; i++) part("wood", 4.95, 0.13, 0.23, 0xc5a67b, 0, 0.27, 2.35 + i * 0.26);
      part("stone", 1.6, 0.18, 0.5, 0xc0b69b, 0, 0.08, 4.0);
    } else {
      for (const x of [-1.6, 1.6]) for (const z of [-1.5, 1.5]) {
        part("stone", 0.75, 0.35, 0.75, 0xb1b29e, x, 0.18, z);
        part("wood", 0.26, 4.3, 0.26, 0xa58553, x, 2.35, z);
      }
      for (const z of [-1.5, 1.5]) for (const direction of [-1, 1]) { const beam = part("wood", 0.15, 4.5, 0.18, 0xb79862, 0, 2.35, z); beam.rotation.z = direction * 0.78; }
      for (let i = 0; i < 8; i++) part("wood", 4.25, 0.17, 0.5, 0xc5a26b, 0, 4.5, -1.75 + i * 0.5);
      for (const x of [-1.6, 1.6]) part("wood", 0.17, 1.7, 3.3, 0xcba46b, x, 5.4, 0);
      for (const z of [-1.5, 1.5]) part("wood", 3.35, 1.7, 0.17, 0xd2b580, 0, 5.4, z);
      for (const x of [-0.85, 0.85]) part("glass", 0.85, 0.83, 0.1, 0x9dc6bc, x, 5.63, 1.62);
      part("glass", 0.1, 0.83, 1.6, 0x9dc6bc, 1.72, 5.63, 0);
      for (const direction of [-1, 1]) { const roof = part("wood", 2.5, 0.19, 4.25, 0x5b7256, direction * 0.98, 6.75, 0); roof.rotation.z = direction * -0.52; }
      for (let i = 0; i < 12; i++) part("wood", 0.8, 0.11, 0.17, 0xd1b77e, -0.8, 0.55 + i * 0.33, 1.78 + (12 - i) * 0.06);
      for (const x of [-1.24, -0.36]) { const rail = part("wood", 0.09, 4.45, 0.10, 0xb09461, x, 2.35, 2.17); rail.rotation.x = -0.18; }
    }
  };
  const playerMeshes = new Map<string, THREE.Group>();
  const playerLabel = (name: string, isYou: boolean) => {
    const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 80;
    const context = canvas.getContext("2d")!;
    context.fillStyle = isYou ? "#f8f8ea" : "#e0edf0";
    context.beginPath(); context.roundRect(8, 10, 240, 52, 20); context.fill();
    context.fillStyle = "#354637"; context.font = "600 25px sans-serif"; context.textAlign = "center";
    context.fillText(`${name.slice(0, 13)}${isYou ? " · you" : ""}`, 128, 45);
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false }));
    sprite.scale.set(2.4, 0.75, 1); sprite.position.y = 2.7;
    return sprite;
  };
  const addPlayer = (id: string, name: string, slot: number, isYou: boolean) => {
    const group = new THREE.Group(); scene.add(group);
    const body = new THREE.Group(); group.add(body); group.userData.body = body;
    const shirt = slot === 0 ? 0xe9b756 : 0x81aeb8;
    box(0.52, 0.57, 0.33, shirt, 0, 0.95, 0, body);
    box(0.42, 0.39, 0.40, 0xe1b48a, 0, 1.44, 0, body);
    box(0.55, 0.17, 0.52, shirt, 0, 1.67, 0, body);
    box(0.60, 0.055, 0.64, shirt, 0, 1.59, 0.08, body);
    for (const x of [-0.14, 0.14]) {
      box(0.17, 0.46, 0.22, 0x4b6253, x, 0.47, 0, body);
      box(0.20, 0.14, 0.32, 0x6e5840, x, 0.26, 0.05, body);
    }
    for (const x of [-0.35, 0.35]) {
      box(0.17, 0.44, 0.23, shirt, x, 0.91, 0, body);
      box(0.15, 0.16, 0.19, 0xe1b48a, x, 0.63, 0, body);
    }
    box(0.36, 0.4, 0.22, 0x8a7850, 0, 1.02, -0.28, body);
    for (const x of [-0.09, 0.09]) box(0.045, 0.055, 0.018, 0x413e30, x, 1.46, 0.21, body);
    const ring = make(new THREE.TorusGeometry(0.49, 0.035, 5, 28), slot === 0 ? 0xe9d88a : 0xb6dde0, 0, 0.035, 0, group); ring.rotation.x = Math.PI / 2;
    group.add(playerLabel(name, isYou));
    group.position.set(slot ? 4 : -3, 0.3, 4);
    playerMeshes.set(id, group);
    return group;
  };
  addPlayer("preview", "Your adventure", 0, false);
  const destinationRing = make(new THREE.TorusGeometry(0.42, 0.045, 6, 32), 0xf0e5b3, 0, 0.4, 0);
  destinationRing.rotation.x = Math.PI / 2; destinationRing.visible = false;
  let ringStart = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.32);
  let down = { x: 0, y: 0 };
  const pointerDown = (event: PointerEvent) => { down = { x: event.clientX, y: event.clientY }; };
  const pointerUp = (event: PointerEvent) => {
    if (event.button !== 0 || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 8) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const target = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(plane, target) && Math.abs(target.x) < 13 && Math.abs(target.z) < 12) {
      onMove({ x: target.x, z: target.z });
      destinationRing.position.set(target.x, 0.4, target.z); destinationRing.visible = true; ringStart = performance.now();
    }
  };
  renderer.domElement.addEventListener("pointerdown", pointerDown);
  renderer.domElement.addEventListener("pointerup", pointerUp);
  const resize = () => {
    const width = container.clientWidth, height = container.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    const half = aspect < 1.3 ? 22 / aspect : 17;
    camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
    camera.updateProjectionMatrix(); renderer.setSize(width, height);
  };
  const observer = new ResizeObserver(resize); observer.observe(container); resize();
  let latestState: GameState | null = null;
  let localPlayer: string | null = null;
  let lastBuildKey = "";
  let animationId = 0;
  let previousFrame = 0;
  const clock = new THREE.Clock();
  const animate = () => {
    animationId = requestAnimationFrame(animate);
    const frameNow = performance.now();
    const frameInterval = latestState?.status === "playing" ? 1000 / 40 : 1000 / 24;
    if (frameNow - previousFrame < frameInterval || document.hidden) return;
    previousFrame = frameNow;
    const time = clock.getElapsedTime();
    arrowGroup.position.y = (currentBlueprint === "tower" ? 8.1 : 5.8) + Math.sin(time * 2) * 0.16;
    arrowGroup.rotation.y = time * 0.45;
    fire.scale.y = 1 + Math.sin(time * 13) * 0.13;
    ripples.forEach((r, i) => { r.scale.x = 0.8 + Math.sin(time * 0.8 + i) * 0.25; });
    if (destinationRing.visible) { const t = (performance.now() - ringStart) / 1000; destinationRing.scale.setScalar(1 + t * 0.4); if (t > 0.9) destinationRing.visible = false; }
    for (const player of latestState?.players ?? []) {
      let mesh = playerMeshes.get(player.id);
      if (!mesh) mesh = addPlayer(player.id, player.name, player.slot, player.id === localPlayer);
      const dx = player.x - mesh.position.x, dz = player.z - mesh.position.z;
      const moving = Math.hypot(dx, dz) > 0.02;
      if (moving) renderer.shadowMap.needsUpdate = true;
      mesh.position.x += dx * 0.2; mesh.position.z += dz * 0.2;
      const body = mesh.userData.body as THREE.Group;
      body.position.y = moving ? Math.sin(time * 17) * 0.055 : Math.sin(time * 2.1) * 0.012;
      if (moving) body.rotation.y = Math.atan2(dx, dz);
    }
    renderer.render(scene, camera);
  };
  animate();
  return {
    update(state: GameState | null, blueprint: BlueprintId, playerId: string | null) {
      latestState = state; localPlayer = playerId;
      const id = state?.blueprint ?? blueprint;
      if (id !== currentBlueprint) { addBuilding(id); currentBlueprint = id; lastBuildKey = ""; }
      const isPreview = !state || state.status === "lobby";
      const buildKey = `${id}:${isPreview}:${state?.built.wood}:${state?.built.stone}:${state?.built.glass}`;
      if (buildKey !== lastBuildKey) {
        renderer.shadowMap.needsUpdate = true;
        const counts = { wood: 0, stone: 0, glass: 0 };
        const sizes = { wood: 0, stone: 0, glass: 0 };
        for (const p of buildingParts) sizes[p.material]++;
        for (const p of buildingParts) {
          const ratio = (state?.built[p.material] ?? 0) / blueprintFor(id).materials[p.material];
          const built = isPreview || ++counts[p.material] <= Math.ceil(sizes[p.material] * ratio);
          p.mesh.material = built ? p.original : ghostMaterial;
          p.mesh.castShadow = built;
        }
        lastBuildKey = buildKey;
      }
      for (const resource of state?.resources ?? createResources()) {
        if (resourceVisibility.get(resource.id) === !resource.collected) continue;
        resourceVisibility.set(resource.id, !resource.collected);
        renderer.shadowMap.needsUpdate = true;
        for (const entry of resourceInstances.get(resource.id) ?? []) {
          entry.mesh.setMatrixAt(entry.index, resource.collected ? hiddenMatrix : entry.matrix);
          entry.mesh.instanceMatrix.needsUpdate = true;
        }
      }
      for (const [id, mesh] of playerMeshes) {
        mesh.visible = id === "preview" ? !state : Boolean(state?.players.some((p) => p.id === id));
      }
      arrowGroup.visible = true;
    },
    zoom(delta: number) { camera.zoom = Math.max(0.7, Math.min(2.3, camera.zoom + delta)); camera.updateProjectionMatrix(); },
    reset() { camera.zoom = 1; angle = Math.PI / 4; setCamera(); },
    rotate() { angle += Math.PI / 2; setCamera(); },
    destroy() {
      cancelAnimationFrame(animationId); observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointerup", pointerUp);
      geometries.forEach((g) => g.dispose()); materials.forEach((m) => m.dispose()); ghostMaterial.dispose(); arrowMaterial.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Sprite) { object.material.map?.dispose(); object.material.dispose(); }
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    },
  };
}

const World = forwardRef<WorldHandle, Props>(function World({ state, blueprint, playerId, onMove, quality }, ref) {
  const container = useRef<HTMLDivElement>(null);
  const engine = useRef<ReturnType<typeof makeWorld> | null>(null);
  const moveRef = useRef(onMove); moveRef.current = onMove;
  const latest = useRef({ state, blueprint, playerId }); latest.current = { state, blueprint, playerId };
  const [error, setError] = useState(false);
  useImperativeHandle(ref, () => ({ zoom: (delta) => engine.current?.zoom(delta), reset: () => engine.current?.reset(), rotate: () => engine.current?.rotate() }), []);
  useEffect(() => {
    if (!container.current) return;
    try {
      engine.current = makeWorld(container.current, (position) => moveRef.current(position), quality);
      engine.current.update(latest.current.state, latest.current.blueprint, latest.current.playerId);
      setError(false);
    } catch (e) { console.error("Could not create the forest", e); setError(true); }
    return () => { engine.current?.destroy(); engine.current = null; };
  }, [quality]);
  useEffect(() => { engine.current?.update(state, blueprint, playerId); }, [state, blueprint, playerId]);
  return <div className="world-canvas" ref={container}>{error && <div className="world-error"><strong>The forest needs WebGL</strong><p>Enable hardware acceleration in your browser, then reload to explore the 3D world.</p><button className="primary-button" onClick={() => window.location.reload()}>Reload forest</button></div>}</div>;
});
export default World;
