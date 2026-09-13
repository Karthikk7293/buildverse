export type Material = "wood" | "stone" | "glass";
export type BlueprintId = "cabin" | "aframe" | "tower";
export type GameMode = "solo" | "multiplayer";
export type Position = { x: number; z: number };
export type Inventory = Record<Material, number>;
export type Player = Position & {
  id: string;
  name: string;
  slot: number;
  ready: boolean;
  connected: boolean;
  inventory: Inventory;
  delivered: number;
};
export type Resource = Position & { id: number; kind: Material; collected: boolean };
export type Blueprint = {
  id: BlueprintId;
  name: string;
  subtitle: string;
  difficulty: string;
  materials: Inventory;
};
export type GameState = {
  mode: GameMode;
  code: string;
  hostId: string;
  blueprint: BlueprintId;
  status: "lobby" | "playing" | "won" | "lost";
  players: Player[];
  resources: Resource[];
  built: Inventory;
  startedAt: number | null;
  endsAt: number | null;
  serverNow: number;
  message: string;
};
export const DURATION = 10 * 60 * 1000;
export const CARRY_LIMIT = 6;
export const SITE = { x: 1, z: 0 };
export const BLUEPRINTS: Blueprint[] = [
  { id: "cabin", name: "Woodland cabin", subtitle: "A cozy place to call home.", difficulty: "Easy", materials: { wood: 28, stone: 12, glass: 8 } },
  { id: "aframe", name: "A-frame retreat", subtitle: "A little closer to nature.", difficulty: "Medium", materials: { wood: 36, stone: 16, glass: 12 } },
  { id: "tower", name: "Forest watchtower", subtitle: "Good things take a little height.", difficulty: "Challenging", materials: { wood: 40, stone: 24, glass: 16 } },
];
export const emptyInventory = (): Inventory => ({ wood: 0, stone: 0, glass: 0 });
export const total = (inventory: Inventory) => inventory.wood + inventory.stone + inventory.glass;
export const blueprintFor = (id: BlueprintId) => BLUEPRINTS.find((b) => b.id === id) ?? BLUEPRINTS[0];
export const completion = (state: GameState) => total(state.built) / total(blueprintFor(state.blueprint).materials) * 100;
export const distance = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z);
export function seededRandom(seed: number) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function createResources(): Resource[] {
  const random = seededRandom(84);
  const result: Resource[] = [];
  const clusters: [number, number, Material, number][] = [
    [-6, 5, "wood", 13], [7, -5, "wood", 13], [-4, -7, "wood", 13], [8, 8, "wood", 13],
    [6, 4, "stone", 10], [-6, -3, "stone", 10], [2, -9, "stone", 10],
    [-3, 8, "glass", 8], [10, -1, "glass", 8], [7, -9, "glass", 8],
  ];
  for (const [x, z, kind, count] of clusters) {
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2;
      const r = Math.sqrt(random()) * 1.45;
      result.push({ id: result.length, x: x + Math.cos(angle) * r, z: z + Math.sin(angle) * r, kind, collected: false });
    }
  }
  return result;
}
export function createState(code: string, hostId: string, blueprint: BlueprintId, now = Date.now(), mode: GameMode = "multiplayer"): GameState {
  return { mode, code, hostId, blueprint, status: "lobby", players: [], resources: createResources(), built: emptyInventory(), startedAt: null, endsAt: null, serverNow: now, message: mode === "solo" ? "Your own little adventure is ready." : "Waiting for your building buddy." };
}
export function createPlayer(id: string, name: string, slot: number): Player {
  return { id, name: name.trim().slice(0, 18) || `Builder ${slot + 1}`, slot, x: slot === 0 ? -3 : 4, z: 4, ready: false, connected: true, inventory: emptyInventory(), delivered: 0 };
}
export function tryStart(state: GameState, now = Date.now()): boolean {
  const requiredPlayers = state.mode === "solo" ? 1 : 2;
  if (state.status !== "lobby" || state.players.length !== requiredPlayers || !state.players.every((p) => p.ready && p.connected)) return false;
  state.status = "playing";
  state.startedAt = now;
  state.endsAt = now + DURATION;
  state.serverNow = now;
  state.message = state.mode === "solo" ? "Your solo adventure has begun. Gather blocks and bring your blueprint to life!" : "Your adventure has begun. Collect blocks and build together!";
  return true;
}
export function tickDeadline(state: GameState, now = Date.now()): boolean {
  state.serverNow = now;
  if (state.status !== "playing" || state.endsAt === null || now < state.endsAt) return false;
  state.status = completion(state) > 95 ? "won" : "lost";
  state.message = state.status === "won" ? state.mode === "solo" ? "You made a little forest magic. All your own." : "You made a little forest magic. Together." : "Time flew. Your next great build is waiting.";
  return true;
}
export function interact(state: GameState, playerId: string, now = Date.now()): string {
  tickDeadline(state, now);
  const player = state.players.find((p) => p.id === playerId);
  if (!player || state.status !== "playing") return state.mode === "solo" ? "Start your solo build to begin collecting." : "The build starts when both players are ready.";
  if (distance(player, SITE) < 4.1) {
    const needed = blueprintFor(state.blueprint).materials;
    let deposited = 0;
    let returned = 0;
    for (const kind of ["wood", "stone", "glass"] as Material[]) {
      const amount = Math.min(player.inventory[kind], needed[kind] - state.built[kind]);
      state.built[kind] += amount;
      player.inventory[kind] -= amount;
      player.delivered += amount;
      deposited += amount;
      // Teammates may finish a material while it is in your backpack. Unload
      // those spare blocks too, so a full backpack can never trap a builder.
      if (state.built[kind] >= needed[kind] && player.inventory[kind]) {
        let spare = player.inventory[kind];
        returned += spare;
        for (const resource of state.resources) {
          if (spare && resource.collected && resource.kind === kind) { resource.collected = false; spare--; }
        }
        player.inventory[kind] = 0;
      }
    }
    if (deposited) return `Placed ${deposited} block${deposited === 1 ? "" : "s"}. Looking good!`;
    if (returned) return "Spare blocks unloaded. Your backpack is ready for the materials you still need.";
  }
  if (total(player.inventory) >= CARRY_LIMIT) return "Your backpack is full. Head to the marked building site.";
  const needed = blueprintFor(state.blueprint).materials;
  const nearest = state.resources.filter((r) => !r.collected && distance(player, r) < 2 && state.built[r.kind] < needed[r.kind]).sort((a, b) => distance(player, a) - distance(player, b))[0];
  if (!nearest) return distance(player, SITE) < 4.1 ? "Find wood, stone, or glass in the forest, then bring it here." : "Get closer to a glowing resource and press E to collect.";
  let count = 0;
  for (const resource of state.resources) {
    if (!resource.collected && resource.kind === nearest.kind && distance(player, resource) < 2 && total(player.inventory) < CARRY_LIMIT) {
      resource.collected = true;
      player.inventory[resource.kind]++;
      count++;
    }
  }
  return `Collected ${count} ${nearest.kind} block${count === 1 ? "" : "s"}.`;
}
export function movePlayer(player: Player, direction: Position, deltaSeconds: number) {
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.z)) return;
  const length = Math.hypot(direction.x, direction.z);
  if (length < 0.01) return;
  const step = Math.min(1, length) * 4.8 * Math.min(deltaSeconds, 0.1);
  player.x = Math.max(-8.5, Math.min(12.5, player.x + direction.x / length * step));
  player.z = Math.max(-11.5, Math.min(11.5, player.z + direction.z / length * step));
  // The completed cabin is solid; its surrounding foundation remains reachable.
  if (Math.abs(player.x - SITE.x) < 2.25 && Math.abs(player.z - SITE.z) < 1.65) {
    const dx = player.x - SITE.x;
    const dz = player.z - SITE.z;
    if (Math.abs(dx) / 2.25 > Math.abs(dz) / 1.65) player.x = SITE.x + Math.sign(dx || 1) * 2.25;
    else player.z = SITE.z + Math.sign(dz || 1) * 1.65;
  }
}
