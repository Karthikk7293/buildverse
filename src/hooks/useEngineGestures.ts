"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { readHand, smooth, zoomDelta, type HandObservation, type HandSignal } from "@/lib/hand-gestures";
import type { PartId, ViewMode } from "@/lib/engine";
import type { SceneHandle } from "@/components/engine/EngineScene";

type Actions = { mode: ViewMode; scene: RefObject<SceneHandle | null>; onSelect: (id: PartId) => void; onPart: (id: PartId) => void; onRange: (name: string, value: number) => void; onPause: () => void };
type Capture = { kind: "orbit" | "part" | "button" | "range"; x: number; y: number; previousX: number; previousY: number; element?: HTMLElement; id?: PartId };
export function useEngineGestures(actions: Actions) {
  const current = useRef(actions); current.current = actions;
  const cursorRef = useRef<HTMLDivElement>(null);
  const [hint, setHint] = useState("Bring a hand into view"), [paused, setPaused] = useState(false);
  const state = useRef({ signals: [] as HandSignal[], capture: null as Capture | null, x: .5, y: .5, lastSeen: 0, palmSince: 0, palmLatched: false, paused: false, zoom: 0, wasZooming: false, hover: null as HTMLElement | null });
  const cancel = useCallback(() => { const s = state.current; s.capture = null; s.signals = []; s.zoom = 0; s.wasZooming = false; s.palmSince = 0; s.palmLatched = false; s.hover?.classList.remove("hand-hover"); s.hover = null; current.current.scene.current?.preview(null); if (cursorRef.current) cursorRef.current.style.display = "none"; }, []);
  const onHands = useCallback((observations: HandObservation[]) => {
    const s = state.current, a = current.current, now = performance.now();
    const signals = observations.map((h) => readHand(h, s.signals.find((p) => p.label === h.label)?.pinched)).filter((h): h is HandSignal => Boolean(h));
    // Keep the same hand in charge when MediaPipe changes detection order.
    signals.sort((left, right) => Number(right.label === s.signals[0]?.label) - Number(left.label === s.signals[0]?.label));
    if (!signals.length) { cancel(); setHint("Bring a hand into view"); return; }
    const primary = signals[0], previous = s.signals[0];
    const elapsed = Math.min((now - s.lastSeen) / 1000, .12); s.lastSeen = now;
    if (previous && previous.label !== primary.label) { s.capture = null; a.scene.current?.preview(null); }
    const palm = signals.length === 1 && primary.palmOpen;
    if (palm) {
      if (!s.palmSince) s.palmSince = now;
      if (now - s.palmSince > 950 && !s.palmLatched) {
        s.paused = !s.paused; setPaused(s.paused); s.palmLatched = true; s.capture = null; a.scene.current?.preview(null);
        if (s.paused) a.onPause();
      }
    } else { s.palmSince = 0; s.palmLatched = false; }
    s.x = previous ? smooth(s.x, primary.x) : primary.x; s.y = previous ? smooth(s.y, primary.y) : primary.y;
    const x = s.x * window.innerWidth, y = s.y * window.innerHeight;
    if (cursorRef.current) { cursorRef.current.style.display = "block"; cursorRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`; cursorRef.current.dataset.pinched = String(primary.pinched); cursorRef.current.dataset.paused = String(s.paused); }
    if (s.paused) { setHint("Paused · hold an open palm to resume"); s.signals = signals; return; }
    const hovered = document.elementFromPoint(x, y)?.closest<HTMLElement>("button, input[type=range], [data-hand-action]") ?? null;
    if (s.hover !== hovered) { s.hover?.classList.remove("hand-hover"); hovered?.classList.add("hand-hover"); s.hover = hovered; }
    if (signals.length === 2 && signals.every((h) => h.pinched)) {
      const distance = Math.hypot(signals[0].x - signals[1].x, signals[0].y - signals[1].y);
      if (s.zoom) a.scene.current?.zoom(zoomDelta(s.zoom, distance) * 1.6);
      s.zoom = distance; s.wasZooming = true; s.capture = null; a.scene.current?.preview(null); setHint("Two-hand zoom · move hands apart or together"); s.signals = signals; return;
    }
    s.zoom = 0;
    if (s.wasZooming) { if (signals.some((h) => h.pinched)) { s.signals = signals; return; } s.wasZooming = false; }
    if (primary.pinched && !previous?.pinched) {
      if (hovered && !(hovered instanceof HTMLButtonElement && hovered.disabled)) {
        s.capture = { kind: hovered instanceof HTMLInputElement ? "range" : "button", element: hovered, x: s.x, y: s.y, previousX: s.x, previousY: s.y };
      } else if (document.elementFromPoint(x, y)?.hasAttribute("data-engine-canvas")) {
        const id = a.scene.current?.pick(x, y); if (id) a.onSelect(id);
        s.capture = { kind: a.mode === "assemble" && id ? "part" : "orbit", id: id ?? undefined, x: s.x, y: s.y, previousX: s.x, previousY: s.y };
      }
    }
    const capture = s.capture;
    if (primary.pinched && capture) {
      if (capture.kind === "orbit") { a.scene.current?.orbit(s.x - capture.previousX, s.y - capture.previousY); setHint("Rotating · release to stop"); }
      if (capture.kind === "part" && capture.id) { const distance = Math.hypot(s.x - capture.x, s.y - capture.y); a.scene.current?.preview(capture.id, Math.min(distance / .13, 1)); setHint(distance > .13 ? "Release to move this assembly" : "Keep pinching and move your hand to lift the part"); }
      if (capture.kind === "range" && capture.element) { const bounds = capture.element.getBoundingClientRect(); a.onRange(capture.element.dataset.handRange ?? "", Math.max(0, Math.min(1, (x - bounds.left) / bounds.width))); }
      capture.previousX = s.x; capture.previousY = s.y;
    } else if (!primary.pinched && previous?.pinched && capture) {
      if (capture.kind === "button" && capture.element === hovered && Math.hypot(s.x - capture.x, s.y - capture.y) < .065) capture.element?.click();
      if (capture.kind === "part" && capture.id && Math.hypot(s.x - capture.x, s.y - capture.y) > .13) a.onPart(capture.id);
      a.scene.current?.preview(null); s.capture = null;
    } else if (!primary.pinched) {
      if (!palm && signals.length === 1 && (s.y < .065 || s.y > .935)) {
        const distance = (s.y < .065 ? -1 : 1) * elapsed * 450;
        const scrollTarget = document.querySelector<HTMLDialogElement>("dialog[open]") ?? document.querySelector<HTMLElement>(".parts-panel.open");
        if (scrollTarget) scrollTarget.scrollBy(0, distance); else window.scrollBy(0, distance);
        setHint("Scrolling · move your finger away from the screen edge to stop");
      } else setHint(palm ? "Hold your open palm to pause" : "Point to aim · pinch to select or grab");
    }
    s.signals = signals;
  }, [cancel]);
  useEffect(() => { const timer = setInterval(() => { if (state.current.signals.length && performance.now() - state.current.lastSeen > 650) { cancel(); setHint("Tracking lost · bring a hand into view"); } }, 250); return () => { clearInterval(timer); cancel(); }; }, [cancel]);
  const resume = useCallback(() => { state.current.paused = false; setPaused(false); setHint("Point to aim · pinch to select or grab"); }, []);
  return { onHands, cursorRef, hint, paused, resume };
}
