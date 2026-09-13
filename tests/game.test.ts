import test from "node:test";
import assert from "node:assert/strict";
import { BLUEPRINTS, CARRY_LIMIT, DURATION, SITE, completion, createPlayer, createResources, createState, interact, movePlayer, tickDeadline, total, tryStart } from "../src/lib/game";
import { compatibleNetworks, networkGroup } from "../src/lib/network";

function room() {
  const state = createState("ABC123", "p1", "cabin", 1000);
  state.players.push(createPlayer("p1", "Oak", 0), createPlayer("p2", "Pine", 1));
  return state;
}
function start() { const state = room(); state.players.forEach((p) => { p.ready = true; }); tryStart(state, 1000); return state; }

test("the timer only starts when exactly two connected players are ready", () => {
  const state = room();
  assert.equal(tryStart(state, 1000), false);
  state.players[0].ready = true;
  assert.equal(tryStart(state, 1000), false);
  state.players[1].ready = true;
  state.players[1].connected = false;
  assert.equal(tryStart(state, 1000), false);
  state.players[1].connected = true;
  assert.equal(tryStart(state, 1000), true);
  assert.equal(state.endsAt, 1000 + DURATION);
  assert.equal(tryStart(state, 3000), false);
  assert.equal(state.endsAt, 1000 + DURATION);
});
test("a single ready builder cannot start a multiplayer game", () => {
  const state = room(); state.players.pop(); state.players[0].ready = true;
  assert.equal(tryStart(state), false);
  assert.equal(state.endsAt, null);
});
test("solo starts with exactly one ready, connected builder and the same deadline", () => {
  const state = createState("SOLO01", "p1", "cabin", 1000, "solo");
  assert.equal(state.mode, "solo");
  assert.equal(tryStart(state, 1000), false);
  const player = createPlayer("p1", "Oak", 0); state.players.push(player);
  assert.equal(tryStart(state, 1000), false);
  player.ready = true; player.connected = false;
  assert.equal(tryStart(state, 1000), false);
  player.connected = true;
  assert.equal(tryStart(state, 1000), true);
  assert.equal(state.endsAt, 1000 + DURATION);
  assert.equal(tryStart(state, 5000), false);
  assert.equal(state.startedAt, 1000);
});
test("solo rejects a two-player state and uses the same strict win threshold", () => {
  const invalid = room(); invalid.mode = "solo"; invalid.players.forEach((p) => { p.ready = true; });
  assert.equal(tryStart(invalid, 1000), false);
  for (const [glass, expected] of [[12, "lost"], [13, "won"]] as const) {
    const state = createState("SOLO01", "p1", "tower", 1000, "solo");
    const player = createPlayer("p1", "Oak", 0); player.ready = true; state.players.push(player);
    tryStart(state, 1000); state.built = { wood: 40, stone: 24, glass };
    tickDeadline(state, state.endsAt!); assert.equal(state.status, expected);
  }
});
test("the server enforces a strict greater-than-95% win at the deadline", () => {
  const state = start(); state.blueprint = "tower";
  state.built = { wood: 40, stone: 24, glass: 12 };
  assert.equal(completion(state), 95);
  assert.equal(tickDeadline(state, state.endsAt! - 1), false);
  assert.equal(state.status, "playing");
  assert.equal(tickDeadline(state, state.endsAt!), true);
  assert.equal(state.status, "lost");
  const winning = start(); winning.blueprint = "tower"; winning.built = { wood: 40, stone: 24, glass: 13 };
  assert.equal(tickDeadline(winning, winning.endsAt!), true);
  assert.equal(winning.status, "won");
});
test("finishing early keeps the shared clock running until the result deadline", () => {
  const state = start(); state.built = { ...BLUEPRINTS[0].materials };
  tickDeadline(state, 4000); assert.equal(state.status, "playing");
  tickDeadline(state, state.endsAt!); assert.equal(state.status, "won");
});
test("resources cannot be collected remotely or by both players", () => {
  const state = start(); const [first, second] = state.players;
  first.x = 12; first.z = 11;
  interact(state, first.id, 2000); assert.equal(total(first.inventory), 0);
  const resource = state.resources[0]; first.x = resource.x; first.z = resource.z;
  second.x = resource.x; second.z = resource.z;
  interact(state, first.id, 2000);
  const collected = state.resources.filter((r) => r.collected).length;
  assert.ok(collected > 0); assert.ok(collected <= CARRY_LIMIT);
  interact(state, second.id, 2000);
  assert.equal(state.resources.filter((r) => r.collected).length, total(first.inventory) + total(second.inventory));
  interact(state, first.id, 2000);
  assert.ok(total(first.inventory) <= CARRY_LIMIT);
});
test("only carried blocks delivered near the site add shared progress", () => {
  const state = start(); const player = state.players[0];
  player.inventory = { wood: 3, stone: 2, glass: 1 }; player.x = 12; player.z = 11;
  interact(state, player.id, 2000); assert.equal(total(state.built), 0);
  player.x = SITE.x; player.z = 3;
  interact(state, player.id, 2000);
  assert.deepEqual(state.built, { wood: 3, stone: 2, glass: 1 });
  assert.equal(player.delivered, 6); assert.equal(total(player.inventory), 0);
});
test("deposits cannot exceed a blueprint and blocks cannot be placed after timeout", () => {
  const state = start(); const player = state.players[0];
  state.built = { wood: 27, stone: 12, glass: 8 }; player.inventory.wood = 6;
  player.x = 1; player.z = 3;
  interact(state, player.id, 2000); assert.equal(state.built.wood, 28); assert.equal(player.inventory.wood, 0);
  const expired = start(); expired.players[0].inventory.wood = 6; expired.players[0].x = 1; expired.players[0].z = 3;
  interact(expired, "p1", expired.endsAt!);
  assert.equal(expired.status, "lost"); assert.equal(total(expired.built), 0);
});
test("a teammate finishing a material cannot leave a full backpack stuck", () => {
  const state = start(); const player = state.players[0];
  state.built.wood = 28; player.inventory.wood = 6; player.x = 1; player.z = 3;
  state.resources.filter((r) => r.kind === "wood").slice(0, 6).forEach((r) => { r.collected = true; });
  assert.match(interact(state, player.id, 2000), /Spare blocks unloaded/);
  assert.equal(total(player.inventory), 0); assert.equal(state.built.wood, 28);
});
test("world generation is deterministic and supplies every blueprint", () => {
  const resources = createResources(); assert.deepEqual(resources, createResources());
  assert.equal(new Set(resources.map((r) => r.id)).size, resources.length);
  for (const blueprint of BLUEPRINTS) for (const kind of ["wood", "stone", "glass"] as const) assert.ok(resources.filter((r) => r.kind === kind).length >= blueprint.materials[kind]);
});
test("movement normalizes speed, prevents teleporting and rejects non-finite input", () => {
  const player = createPlayer("p", "Builder", 0); const initial = { x: player.x, z: player.z };
  movePlayer(player, { x: 1000, z: 1000 }, 100);
  assert.ok(Math.hypot(player.x - initial.x, player.z - initial.z) <= 0.481);
  const previous = { x: player.x, z: player.z };
  movePlayer(player, { x: NaN, z: Infinity }, 0.1); assert.equal(player.x, previous.x); assert.equal(player.z, previous.z);
  for (let i = 0; i < 500; i++) movePlayer(player, { x: 1, z: 1 }, 0.1);
  assert.ok(player.x <= 12.5 && player.z <= 11.5);
});
test("network restrictions reject public addresses and mismatched LANs", () => {
  assert.equal(networkGroup("127.0.0.1"), "loopback");
  assert.equal(networkGroup("::1"), "loopback");
  assert.equal(networkGroup("::ffff:127.0.0.1"), "loopback");
  assert.equal(networkGroup("8.8.8.8"), null);
  assert.equal(networkGroup("not-an-address"), null);
  assert.equal(compatibleNetworks("v4:123/24", "v4:456/24"), false);
  assert.equal(compatibleNetworks("loopback", "v4:123/24"), true);
});
