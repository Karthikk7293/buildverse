import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { PARTS, cycleState, pistonMotion, type PartId } from "@/lib/engine";

export function createEngine() {
  const engine = new THREE.Group();
  const parts = {} as Record<PartId, THREE.Group>;
  const materials = {} as Record<PartId, THREE.MeshStandardMaterial[]>;
  const finish = {
    aluminum: { color: 0xb0b9bd, metalness: 0.82, roughness: 0.31 },
    steel: { color: 0x737e85, metalness: 0.92, roughness: 0.25 },
    dark: { color: 0x303b42, metalness: 0.7, roughness: 0.4 },
    orange: { color: 0xd96331, metalness: 0.35, roughness: 0.32 },
    ceramic: { color: 0xf6f2e7, metalness: 0.06, roughness: 0.24 },
    brass: { color: 0xb69a5c, metalness: 0.8, roughness: 0.3 },
    rubber: { color: 0x25292b, metalness: 0.05, roughness: 0.8 },
  };
  for (const part of PARTS) {
    const group = new THREE.Group(); group.name = part.name; group.userData.partId = part.id;
    parts[part.id] = group; materials[part.id] = []; engine.add(group);
  }
  const cache = new Map<string, THREE.MeshStandardMaterial>();
  function mat(id: PartId, kind: keyof typeof finish) {
    const key = `${id}-${kind}`;
    if (!cache.has(key)) { const m = new THREE.MeshStandardMaterial({ ...finish[kind], side: THREE.DoubleSide }); cache.set(key, m); materials[id].push(m); }
    return cache.get(key)!;
  }
  function mesh(id: PartId, geo: THREE.BufferGeometry, position: number[], kind: keyof typeof finish = "aluminum", parent = parts[id]) {
    const m = new THREE.Mesh(geo, mat(id, kind)); m.position.set(position[0], position[1], position[2]); m.castShadow = true; m.receiveShadow = true; m.userData.partId = id; parent.add(m); return m;
  }
  function box(id: PartId, size: number[], p: number[], kind: keyof typeof finish = "aluminum", parent?: THREE.Group) { return mesh(id, new THREE.BoxGeometry(...size as [number, number, number]), p, kind, parent); }
  function cyl(id: PartId, r: number, h: number, p: number[], kind: keyof typeof finish = "aluminum", axis = "y", parent?: THREE.Group, segments = 40) {
    const m = mesh(id, new THREE.CylinderGeometry(r, r, h, segments), p, kind, parent);
    if (axis === "z") m.rotation.x = Math.PI / 2;
    if (axis === "x") m.rotation.z = Math.PI / 2;
    return m;
  }
  function ring(id: PartId, outer: number, inner: number, h: number, p: number[], kind: keyof typeof finish = "aluminum", axis = "y", parent?: THREE.Group) {
    const shape = new THREE.Shape(); shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, inner, 0, Math.PI * 2, true); shape.holes.push(hole);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 32 }); geo.translate(0, 0, -h / 2);
    const m = mesh(id, geo, p, kind, parent);
    if (axis === "y") m.rotation.x = -Math.PI / 2;
    if (axis === "x") m.rotation.y = Math.PI / 2;
    return m;
  }
  function bolt(id: PartId, p: number[], axis = "y", scale = 1, parent?: THREE.Group) {
    cyl(id, .095 * scale, .085 * scale, p, "steel", axis, parent, 6);
    const slot = box(id, [.09 * scale, .004, .017 * scale], [p[0], p[1] + .043 * scale, p[2]], "dark", parent);
    if (axis !== "y") slot.visible = false;
  }
  function tube(id: PartId, points: number[][], r: number, kind: keyof typeof finish) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p as [number, number, number])));
    return mesh(id, new THREE.TubeGeometry(curve, 32, r, 12, false), [0, 0, 0], kind);
  }

  // Cast lower housing, mounting feet, ribs, and bearing bosses.
  box("crankcase", [2.25, .2, 1.75], [0, -.83, 0]);
  for (const x of [-1, 1]) {
    box("crankcase", [.18, 1.8, 1.55], [x, .15, 0]);
    box("crankcase", [.65, .16, 2], [x, -.88, 0]);
    for (const z of [-.75, .75]) { ring("crankcase", .14, .065, .17, [x * 1.16, -.88, z], "steel"); bolt("crankcase", [x * 1.16, -.765, z]); }
    for (let y = -.45; y < .95; y += .27) box("crankcase", [.09, .09, 1.45], [x * 1.115, y, 0]);
  }
  for (const z of [-.75, .75]) {
    box("crankcase", [1.85, 1.65, .13], [0, .13, z]);
    ring("crankcase", .48, .23, .16, [0, .2, z * 1.12], "steel", "z");
    for (const x of [-.78, .78]) for (const y of [-.45, .77]) bolt("crankcase", [x, y, z * 1.11], "z");
  }
  ring("crankcase", 1.11, .69, .17, [0, 1.08, 0]);
  cyl("crankcase", .13, .23, [-.8, .8, .92], "brass", "z");

  // Open-bore finned barrel. It remains hollow in every inspection view.
  ring("cylinder", .79, .65, 1.92, [0, 2.17, 0], "steel");
  for (let i = 0; i < 11; i++) ring("cylinder", i === 0 || i === 10 ? 1.08 : 1.02, .65, .065, [0, 1.27 + i * .18, 0]);
  for (const x of [-.72, .72]) for (const z of [-.72, .72]) cyl("cylinder", .075, 1.86, [x, 2.15, z], "steel");
  ring("gasket", 1.06, .65, .035, [0, 3.23, 0], "rubber");
  for (const x of [-.74, .74]) for (const z of [-.74, .74]) ring("gasket", .18, .085, .035, [x, 3.23, z], "rubber");

  ring("head", .91, .55, .55, [0, 3.54, 0]);
  for (let i = 0; i < 4; i++) ring("head", 1.05, .55, .055, [0, 3.31 + i * .14, 0]);
  for (const x of [-.48, .48]) box("head", [.27, .23, .75], [x, 3.87, 0]);
  for (const x of [-.77, .77]) for (const z of [-.77, .77]) {
    cyl("bolts", .06, .8, [x, 3.56, z], "steel"); ring("bolts", .14, .065, .03, [x, 3.96, z], "steel"); bolt("bolts", [x, 4.02, z]);
  }
  const valves: THREE.Group[] = [];
  const rockers: THREE.Group[] = [];
  for (const x of [-.32, .32]) {
    const valve = new THREE.Group(); valve.position.set(x, 3.5, 0); parts.valves.add(valve); valves.push(valve);
    cyl("valves", .22, .07, [0, -.17, 0], "steel", "y", valve);
    cyl("valves", .042, .64, [0, .15, 0], "steel", "y", valve);
    cyl("valves", .135, .035, [0, .4, 0], "steel", "y", valve);
    const springPoints = Array.from({ length: 101 }, (_, i) => new THREE.Vector3(Math.cos(i / 100 * Math.PI * 12) * .105, i / 100 * .34 + .045, Math.sin(i / 100 * Math.PI * 12) * .105));
    mesh("valves", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(springPoints), 100, .019, 5, false), [0, 0, 0], "dark", valve);
    const rocker = new THREE.Group(); rocker.position.set(x, 4.02, 0); parts.rockers.add(rocker); rockers.push(rocker);
    box("rockers", [.17, .1, .64], [0, .03, 0], "steel", rocker);
    cyl("rockers", .11, .25, [0, 0, 0], "steel", "x", rocker);
    bolt("rockers", [0, .12, .23], "y", .7, rocker);
  }
  cyl("rockers", .05, 1.12, [0, 4.02, 0], "steel", "x");
  box("cover", [1.71, .42, 1.32], [0, 4.42, 0], "orange");
  box("cover", [1.84, .07, 1.45], [0, 4.18, 0], "dark");
  for (let x = -.6; x < .7; x += .2) box("cover", [.055, .05, 1.14], [x, 4.655, 0], "orange");
  box("cover", [.78, .015, .4], [0, 4.69, 0], "dark");
  for (const x of [-.7, .7]) for (const z of [-.48, .48]) bolt("cover", [x, 4.68, z], "y", .7);

  const plug = new THREE.Group(); plug.position.set(.87, 3.82, .23); plug.rotation.z = -.45; parts.plug.add(plug);
  cyl("plug", .082, .36, [0, -.05, 0], "steel", "y", plug);
  cyl("plug", .14, .13, [0, .12, 0], "steel", "y", plug, 6);
  cyl("plug", .08, .4, [0, .37, 0], "ceramic", "y", plug);
  for (let i = 0; i < 5; i++) cyl("plug", .103, .033, [0, .3 + i * .048, 0], "ceramic", "y", plug);
  cyl("plug", .048, .12, [0, .61, 0], "brass", "y", plug);

  cyl("intake", .24, .75, [-1.24, 3.55, 0], "steel", "x");
  cyl("intake", .36, .4, [-1.68, 3.55, 0], "aluminum", "x");
  cyl("intake", .24, .43, [-1.7, 3.18, 0], "aluminum");
  cyl("intake", .54, .36, [-2.12, 3.55, 0], "dark", "x");
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; box("intake", [.32, .045, .045], [-2.12, 3.55 + Math.cos(a) * .54, Math.sin(a) * .54], "rubber"); }
  cyl("intake", .55, .07, [-2.32, 3.55, 0], "orange", "x"); bolt("intake", [-2.37, 3.55, 0], "x", 1.1);
  cyl("intake", .08, .19, [-1.65, 3.99, 0], "brass");
  ring("exhaust", .33, .18, .15, [1.04, 3.54, -.17], "steel", "x");
  tube("exhaust", [[1.1, 3.54, -.17], [1.57, 3.54, -.17], [1.92, 3.29, -.3], [2.04, 2.87, -.67], [2.02, 2.55, -1.15]], .17, "steel");
  ring("exhaust", .19, .14, .07, [2.02, 2.55, -1.17], "dark", "z");

  const piston = new THREE.Group(); parts.piston.add(piston);
  cyl("piston", .614, .54, [0, .1, 0], "aluminum", "y", piston);
  for (let i = 0; i < 3; i++) ring("piston", .628, .595, .031, [0, .29 - i * .075, 0], "dark", "y", piston);
  cyl("piston", .12, 1.22, [0, -.08, 0], "steel", "z", piston);
  const rod = new THREE.Group(); parts.rod.add(rod);
  ring("rod", .23, .125, .25, [0, 0, 0], "steel", "z", rod);
  box("rod", [.19, 1.45, .15], [0, .85, 0], "steel", rod);
  box("rod", [.08, 1.25, .18], [0, .85, 0], "aluminum", rod);
  ring("rod", .165, .105, .2, [0, 1.75, 0], "steel", "z", rod);
  for (const x of [-.17, .17]) bolt("rod", [x, -.07, .15], "z", .65, rod);
  const crank = new THREE.Group(); crank.position.y = .2; parts.crankshaft.add(crank);
  cyl("crankshaft", .21, 2.5, [0, 0, 0], "steel", "z", crank);
  for (const z of [-.32, .32]) {
    cyl("crankshaft", .45, .18, [0, -.24, z], "dark", "z", crank);
    box("crankshaft", [.29, .55, .18], [0, .27, z], "steel", crank);
  }
  cyl("crankshaft", .125, .66, [0, .55, 0], "steel", "z", crank);
  const flywheel = new THREE.Group(); flywheel.position.set(0, .2, 1.24); parts.flywheel.add(flywheel);
  ring("flywheel", 1.1, .83, .28, [0, 0, 0], "dark", "z", flywheel);
  ring("flywheel", 1.11, 1.01, .12, [0, 0, .16], "aluminum", "z", flywheel);
  cyl("flywheel", .3, .32, [0, 0, 0], "aluminum", "z", flywheel);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; const spoke = box("flywheel", [.15, .78, .14], [Math.sin(a) * .55, Math.cos(a) * .55, 0], "steel", flywheel); spoke.rotation.z = -a; }
  for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; const tooth = box("flywheel", [.07, .08, .22], [Math.sin(a) * 1.1, Math.cos(a) * 1.1, 0], "steel", flywheel); tooth.rotation.z = -a; }
  bolt("flywheel", [0, 0, .22], "z", 1.6, flywheel);

  function animate(degrees: number) {
    const angle = degrees * Math.PI / 180, motion = pistonMotion(angle), cycle = cycleState(degrees);
    piston.position.y = motion.pistonY;
    rod.position.set(motion.crankX, motion.crankY, 0); rod.rotation.z = motion.rodAngle;
    crank.rotation.z = -angle; flywheel.rotation.z = -angle;
    valves[0].position.y = 3.5 - cycle.intakeLift; valves[1].position.y = 3.5 - cycle.exhaustLift;
    rockers[0].rotation.x = cycle.intakeLift * 2; rockers[1].rotation.x = cycle.exhaustLift * 2;
  }
  // Batch static geometry within each moving assembly, preserving independent pivots
  // and part IDs. This cuts hundreds of separate draws down to one per finish.
  const groups: THREE.Group[] = [];
  engine.traverse((object) => { if (object instanceof THREE.Group) groups.push(object); });
  for (const group of groups) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const object of [...group.children]) {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) continue;
      if (!object.visible) { group.remove(object); object.geometry.dispose(); continue; }
      const batch = batches.get(object.material) ?? []; batch.push(object); batches.set(object.material, batch);
    }
    for (const [material, objects] of batches) {
      if (objects.length < 2) continue;
      const geometries = objects.map((object) => { object.updateMatrix(); const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone(); geometry.applyMatrix4(object.matrix); return geometry; });
      const geometry = mergeGeometries(geometries);
      geometries.forEach((item) => item.dispose());
      if (!geometry) continue;
      const combined = new THREE.Mesh(geometry, material); combined.castShadow = true; combined.receiveShadow = true; combined.userData.partId = objects[0].userData.partId;
      for (const object of objects) { group.remove(object); object.geometry.dispose(); }
      group.add(combined);
    }
  }
  animate(40);
  return { engine, parts, materials, animate };
}
