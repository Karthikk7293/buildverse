export type PartId = "cover" | "plug" | "intake" | "exhaust" | "rockers" | "bolts" | "head" | "valves" | "gasket" | "cylinder" | "piston" | "rod" | "flywheel" | "crankshaft" | "crankcase";
export type ViewMode = "inspect" | "assemble" | "run";
export type Vec3 = [number, number, number];
export type EnginePart = { id: PartId; name: string; group: string; material: string; description: string; detail: string; blockers: PartId[]; offset: Vec3; center: Vec3 };
export const PARTS: EnginePart[] = [
  { id: "cover", name: "Rocker cover", group: "Top end", material: "Cast aluminum", description: "A protective lid for the valve train.", detail: "Keeps oil around the rocker mechanism and shields the moving parts beneath it.", blockers: [], offset: [0, 3.9, 0], center: [0, 4.42, 0] },
  { id: "plug", name: "Spark plug", group: "Ignition", material: "Ceramic & steel", description: "The small spark that starts the power stroke.", detail: "The electrode ignites the compressed mixture. Its ceramic body insulates the central conductor.", blockers: [], offset: [2.2, 3.1, 0], center: [0.95, 4.0, 0.2] },
  { id: "intake", name: "Intake assembly", group: "Air & fuel", material: "Aluminum & polymer", description: "The route into the combustion chamber.", detail: "A simplified carburetor and inlet passage introduce the air–fuel mixture through the intake valve.", blockers: [], offset: [-3.4, 0.8, 0], center: [-1.8, 3.48, 0] },
  { id: "exhaust", name: "Exhaust manifold", group: "Air & fuel", material: "Stainless steel", description: "A path for the spent combustion gases.", detail: "Carries gases away from the exhaust valve. The educational model combines the flange and pipe into one assembly.", blockers: [], offset: [3.6, 0.4, 0], center: [1.8, 3.46, -0.2] },
  { id: "rockers", name: "Rocker mechanism", group: "Valve train", material: "Machined steel", description: "Transfers motion to the engine’s valves.", detail: "The two rocker arms tip to open the intake and exhaust valves. Timing drive details are simplified in this model.", blockers: ["cover"], offset: [-1.5, 3.0, -0.5], center: [0, 4.02, 0] },
  { id: "bolts", name: "Head fasteners", group: "Top end", material: "Steel", description: "Four fasteners hold the cylinder head down.", detail: "This grouped assembly represents the head bolts and washers. They must be removed before lifting the head.", blockers: ["cover"], offset: [1.4, 2.1, 1.7], center: [0, 3.7, 0] },
  { id: "head", name: "Cylinder head", group: "Top end", material: "Cast aluminum", description: "Closes the cylinder and houses its gas passages.", detail: "Contains the top of the combustion chamber. Remove the attached fittings, rocker mechanism, and fasteners before lifting it.", blockers: ["plug", "intake", "exhaust", "rockers", "bolts"], offset: [0, 2.0, 0], center: [0, 3.52, 0] },
  { id: "valves", name: "Valves & springs", group: "Valve train", material: "Steel", description: "Two timed gates control the breathing cycle.", detail: "The intake valve admits the mixture; the exhaust valve releases the gases. Springs return them to the closed position.", blockers: ["head"], offset: [-1.4, 1.5, 1.2], center: [0, 3.51, 0] },
  { id: "gasket", name: "Head gasket", group: "Top end", material: "Composite gasket", description: "A thin seal between the head and cylinder.", detail: "Seals the mating surfaces. The dark ring follows the cylinder bore, with clearance for the four head fasteners.", blockers: ["head"], offset: [0, 1.25, 0], center: [0, 3.23, 0] },
  { id: "cylinder", name: "Cylinder barrel", group: "Cylinder assembly", material: "Aluminum & iron liner", description: "A precisely guided home for the piston.", detail: "The liner guides the piston while the external fins increase the area available for air cooling. Use Cutaway to look inside.", blockers: ["gasket", "valves"], offset: [0, 0.85, -2.8], center: [0, 2.2, 0] },
  { id: "piston", name: "Piston & rings", group: "Rotating assembly", material: "Aluminum & steel rings", description: "Turns combustion pressure into a moving stroke.", detail: "The piston travels inside the bore. Its rings help seal the chamber; the wrist pin joins it to the connecting rod.", blockers: ["cylinder"], offset: [2.55, 1.2, 1.5], center: [0, 2.1, 0] },
  { id: "rod", name: "Connecting rod", group: "Rotating assembly", material: "Forged steel", description: "The link between a straight stroke and a rotating shaft.", detail: "Its small end follows the piston and its big end follows the offset crank pin. The motion follows a slider–crank relationship.", blockers: ["piston"], offset: [-2.5, 0, 1.5], center: [0, 1.0, 0] },
  { id: "flywheel", name: "Flywheel", group: "Rotating assembly", material: "Cast iron", description: "Stores rotational energy between power strokes.", detail: "The flywheel smooths the speed variations of a single-cylinder engine. Its hub and retaining fastener are grouped here.", blockers: [], offset: [0, -0.3, 3.15], center: [0, 0.2, 1.25] },
  { id: "crankshaft", name: "Crankshaft", group: "Rotating assembly", material: "Forged steel", description: "Converts the connecting rod’s movement into rotation.", detail: "An offset crank pin produces the stroke. Counterweights help balance the moving assembly.", blockers: ["rod", "flywheel"], offset: [2.6, -0.4, -1.5], center: [0, 0.2, 0] },
  { id: "crankcase", name: "Crankcase", group: "Bottom end", material: "Cast aluminum", description: "The structural foundation of the engine.", detail: "Supports the crankshaft bearings and joins the cylinder to the mounting base. It is the first assembly to reinstall.", blockers: ["crankshaft"], offset: [0, -0.5, -2.2], center: [0, -0.05, 0] },
];
export const PART_BY_ID = Object.fromEntries(PARTS.map((part) => [part.id, part])) as Record<PartId, EnginePart>;
export function removalBlockers(id: PartId, removed: readonly PartId[]) { return PART_BY_ID[id].blockers.filter((blocker) => !removed.includes(blocker)); }
export function installationBlockers(id: PartId, removed: readonly PartId[]) { return PARTS.filter((part) => part.blockers.includes(id) && removed.includes(part.id)).map((part) => part.id); }
export function canRemove(id: PartId, removed: readonly PartId[]) { return !removed.includes(id) && removalBlockers(id, removed).length === 0; }
export function canInstall(id: PartId, removed: readonly PartId[]) { return removed.includes(id) && installationBlockers(id, removed).length === 0; }
export function nextRemoval(removed: readonly PartId[]) { return PARTS.find((part) => canRemove(part.id, removed))?.id ?? null; }
export function nextInstallation(removed: readonly PartId[]) { return [...PARTS].reverse().find((part) => canInstall(part.id, removed))?.id ?? null; }
export type AssemblyAction = { type: "remove" | "install"; id: PartId };
export function applyAssembly(removed: readonly PartId[], action: AssemblyAction): PartId[] {
  if (action.type === "remove" && canRemove(action.id, removed)) return [...removed, action.id];
  if (action.type === "install" && canInstall(action.id, removed)) return removed.filter((id) => id !== action.id);
  return [...removed];
}
export const STROKES = [
  { name: "Intake", color: "#4c99b0", description: "The piston moves down as the intake valve opens, drawing mixture into the cylinder." },
  { name: "Compression", color: "#b78d47", description: "Both valves close. The rising piston compresses the mixture before ignition." },
  { name: "Power", color: "#e57745", description: "Ignition expands the gases and drives the piston down, turning the crankshaft." },
  { name: "Exhaust", color: "#8c8e9b", description: "The exhaust valve opens while the piston rises to push the spent gases out." },
];
export function pistonMotion(angle: number) {
  const radius = 0.55, rodLength = 1.75;
  const crankX = Math.sin(angle) * radius;
  const crankY = Math.cos(angle) * radius + 0.2;
  const pistonY = crankY + Math.sqrt(rodLength ** 2 - crankX ** 2);
  return { crankX, crankY, pistonY, rodAngle: Math.atan2(crankX, pistonY - crankY) };
}
export function cycleState(degrees: number) {
  const phase = ((degrees % 720) + 720) % 720;
  const stroke = Math.floor(phase / 180);
  const valveLift = Math.sin((phase % 180) / 180 * Math.PI) * 0.18;
  return { phase, stroke, intakeLift: stroke === 0 ? valveLift : 0, exhaustLift: stroke === 3 ? valveLift : 0, firing: phase >= 355 && phase < 385 };
}
