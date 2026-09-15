export type Landmark = { x: number; y: number; z?: number };
export type HandObservation = { landmarks: Landmark[]; label: string };
export type HandTool = "grab" | "zoom" | "pan" | "explode";
export const HAND_TOOL_HINTS: Record<HandTool, string> = {
  grab: "Pinch over the engine and move to rotate or grab a part.",
  zoom: "Pinch over the engine, then spread thumb and index to zoom in. Close them to zoom out. Lower your hand to stop.",
  pan: "Pinch over the engine and move your hand to reposition it. Release to stop.",
  explode: "Pinch over the engine and lift your hand to separate parts. Move down to bring them together.",
};
export type HandSignal = { x: number; y: number; pinched: boolean; palmOpen: boolean; label: string; pinchRatio: number };
export const length = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);
export function readHand(hand: HandObservation, wasPinched = false): HandSignal | null {
  const p = hand.landmarks;
  if (p.length !== 21 || p.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return null;
  const palmSize = length(p[0], p[9]);
  if (palmSize < 0.025) return null;
  const pinchRatio = length(p[4], p[8]) / palmSize;
  const pinched = pinchRatio < (wasPinched ? 0.43 : 0.30);
  const extended = [8, 12, 16, 20].filter((tip) => length(p[tip], p[0]) > length(p[tip - 2], p[0]) * 1.15).length;
  return { x: Math.max(0, Math.min(1, 1 - p[8].x)), y: Math.max(0, Math.min(1, p[8].y)), pinched, palmOpen: !pinched && extended === 4 && pinchRatio > 0.65, label: hand.label, pinchRatio };
}
export const smooth = (previous: number, current: number, amount = 0.32) => previous + (current - previous) * amount;
export function zoomDelta(previousDistance: number, distance: number) {
  if (!Number.isFinite(previousDistance) || !Number.isFinite(distance)) return 0;
  if (previousDistance < 0.035 || distance < 0.035) return 0;
  return Math.max(-0.16, Math.min(0.16, Math.log(distance / previousDistance)));
}

// Palm-relative finger spacing makes zoom independent of distance to the camera.
// A small dead zone prevents a stationary hand from moving the camera.
export function fingerSpacing(ratio: number) { return Math.max(.15, Math.min(1.8, Number.isFinite(ratio) ? ratio : .15)); }
export function fingerZoomDelta(previousRatio: number, ratio: number) {
  const previous = fingerSpacing(previousRatio), current = fingerSpacing(ratio);
  if (Math.abs(current - previous) < .018) return 0;
  return zoomDelta(previous, current) * .65;
}
