import test from "node:test";
import assert from "node:assert/strict";
import { PARTS, applyAssembly, canInstall, canRemove, cycleState, nextInstallation, nextRemoval, pistonMotion, type PartId } from "../src/lib/engine";
import { readHand, zoomDelta, type Landmark } from "../src/lib/hand-gestures";

test("assemblies dismantle and rebuild through the complete dependency graph", () => {
  let removed: PartId[] = [];
  const history: PartId[] = [];
  for (let i = 0; i < PARTS.length; i++) {
    const id = nextRemoval(removed); assert.ok(id, "DAG should always have a removable part");
    assert.equal(canRemove(id, removed), true);
    removed = applyAssembly(removed, { type: "remove", id }); history.push(id);
    assert.equal(new Set(removed).size, i + 1);
  }
  assert.equal(nextRemoval(removed), null);
  for (let i = 0; i < PARTS.length; i++) {
    const id = nextInstallation(removed); assert.ok(id);
    assert.equal(canInstall(id, removed), true);
    removed = applyAssembly(removed, { type: "install", id });
  }
  assert.deepEqual(removed, []); assert.equal(nextInstallation(removed), null);
  assert.equal(history.length, 15);
});
test("blocked, duplicate and premature actions cannot change assembly state", () => {
  assert.deepEqual(applyAssembly([], { type: "remove", id: "head" }), []);
  const state: PartId[] = ["cover", "rockers"];
  assert.equal(canInstall("cover", state), false);
  assert.deepEqual(applyAssembly(state, { type: "install", id: "cover" }), state);
  assert.deepEqual(applyAssembly(state, { type: "remove", id: "cover" }), state);
  assert.deepEqual(applyAssembly(state, { type: "install", id: "piston" }), state);
  assert.deepEqual(state, ["cover", "rockers"], "Reducer never mutates its input");
});
test("independent accessories can be removed in different valid orders", () => {
  let removed: PartId[] = [];
  for (const id of ["flywheel", "exhaust", "intake", "plug", "cover", "bolts", "rockers"] as PartId[]) removed = applyAssembly(removed, { type: "remove", id });
  assert.equal(canRemove("head", removed), true);
  assert.equal(canRemove("crankshaft", removed), false);
  assert.equal(canInstall("flywheel", removed), true);
});
test("slider crank preserves rod length, alignment and stroke at every crank angle", () => {
  for (let degrees = 0; degrees <= 720; degrees += 3) {
    const p = pistonMotion(degrees * Math.PI / 180);
    assert.ok(Math.abs(Math.hypot(p.crankX, p.pistonY - p.crankY) - 1.75) < 1e-9);
    assert.ok(Math.abs(p.crankX - Math.sin(p.rodAngle) * 1.75) < 1e-9);
    assert.ok(p.pistonY >= 1.4 - 1e-9 && p.pistonY <= 2.5 + 1e-9);
  }
  assert.equal(pistonMotion(0).pistonY, 2.5);
  assert.ok(Math.abs(pistonMotion(Math.PI).pistonY - 1.4) < 1e-9);
});
test("four stroke timing repeats after 720 degrees and closes valves on compression and power", () => {
  assert.deepEqual([0,180,360,540,720].map((a) => cycleState(a).stroke), [0,1,2,3,0]);
  assert.equal(cycleState(-90).stroke, 3);
  assert.equal(cycleState(90).intakeLift, .18);
  assert.equal(cycleState(630).exhaustLift, .18);
  for (const degrees of [200,270,360,400,500]) { assert.equal(cycleState(degrees).intakeLift, 0); assert.equal(cycleState(degrees).exhaustLift, 0); }
});
function hand(ratio: number): Landmark[] {
  const points = Array.from({ length: 21 }, () => ({ x: .5, y: .4 }));
  points[0] = { x: .5, y: .8 }; points[9] = { x: .5, y: .5 };
  points[8] = { x: .5, y: .2 }; points[4] = { x: .5 + .3 * ratio, y: .2 };
  return points;
}
test("pinch recognition uses hysteresis and rejects unusable observations", () => {
  assert.equal(readHand({ label: "Right", landmarks: hand(.29) })?.pinched, true);
  assert.equal(readHand({ label: "Right", landmarks: hand(.35) })?.pinched, false);
  assert.equal(readHand({ label: "Right", landmarks: hand(.35) }, true)?.pinched, true);
  assert.equal(readHand({ label: "Right", landmarks: hand(.44) }, true)?.pinched, false);
  assert.equal(readHand({ label: "Right", landmarks: [] }), null);
  const invalid = hand(.2); invalid[4].x = NaN; assert.equal(readHand({ label: "Right", landmarks: invalid }), null);
  assert.equal(readHand({ label: "Right", landmarks: Array.from({ length: 21 }, () => ({ x: .1, y: .1 })) }), null);
});
test("zoom follows hand separation with bounded steps and no divide-by-zero", () => {
  assert.equal(zoomDelta(0, .3), 0); assert.equal(zoomDelta(.3, 0), 0);
  assert.ok(zoomDelta(.3, .33) > 0); assert.ok(zoomDelta(.33, .3) < 0);
  assert.equal(zoomDelta(.1, .9), .16); assert.equal(zoomDelta(.9, .1), -.16);
});
