"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HandObservation } from "@/lib/hand-gestures";
import { cameraError, errorName, frameSize, openCamera, waitForVideo, type CameraDevice } from "@/lib/camera";

export type CameraStatus = "off" | "requesting" | "loading" | "ready" | "preview" | "error";
const CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
type Resources = { stream?: MediaStream; worker?: Worker; timer?: ReturnType<typeof setTimeout>; timeout?: ReturnType<typeof setTimeout>; abort?: AbortController };

export function useHandTracking(onHands: (hands: HandObservation[]) => void, trackHands = true) {
  const videoRef = useRef<HTMLVideoElement>(null), overlayRef = useRef<HTMLCanvasElement>(null);
  const callback = useRef(onHands); callback.current = onHands;
  const [status, setStatus] = useState<CameraStatus>("off"), [error, setError] = useState("");
  const [previewLive, setPreviewLive] = useState(false), [count, setCount] = useState(0);
  const [devices, setDevices] = useState<CameraDevice[]>([]), [selectedDevice, setSelectedDevice] = useState("");
  const [cameraName, setCameraName] = useState(""), [detail, setDetail] = useState("");
  const resources = useRef<Resources>({}), generation = useRef(0), trackingGeneration = useRef(0), deviceChoice = useRef("");
  const clearTracking = useCallback(() => {
    trackingGeneration.current++;
    const r = resources.current; clearTimeout(r.timer); clearTimeout(r.timeout); r.worker?.terminate(); r.worker = undefined;
    overlayRef.current?.getContext("2d")?.clearRect(0, 0, 320, 240); callback.current([]); setCount(0);
  }, []);
  const cleanup = useCallback(() => {
    generation.current++; clearTracking();
    const r = resources.current; r.abort?.abort(); r.stream?.getTracks().forEach((track) => track.stop()); resources.current = {};
    if (videoRef.current) videoRef.current.srcObject = null;
    setPreviewLive(false); setCameraName(""); setDetail("");
  }, [clearTracking]);
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((device) => device.kind === "videoinput").map((device, index) => ({ id: device.deviceId, label: device.label || `Camera ${index + 1}` })));
    } catch { /* A blocked device list must not stop an already working stream. */ }
  }, []);
  const stop = useCallback(() => { cleanup(); setStatus("off"); setError(""); }, [cleanup]);

  const retryTracking = useCallback(() => {
    const video = videoRef.current;
    if (!video || !resources.current.stream?.active) return;
    clearTracking(); setError(""); setStatus("loading"); setDetail("Camera works · preparing hand tracking…");
    const token = trackingGeneration.current;
    const fail = (message: string) => {
      if (trackingGeneration.current !== token) return;
      clearTracking(); setError(message); setStatus("preview"); setDetail("Camera works · hand tracking unavailable");
    };
    const capture = document.createElement("canvas"), context = capture.getContext("2d", { willReadFrequently: true });
    if (!context || typeof Worker === "undefined") { fail("Your camera works, but this browser cannot start local hand tracking. Try opening Buildverse directly in a current Chrome or Edge browser."); return; }
    let worker: Worker;
    try { worker = new Worker("/hand-worker.js"); resources.current.worker = worker; }
    catch { fail("Your camera works, but hand tracking is blocked in this browser. Open Buildverse directly in another browser tab and retry tracking."); return; }
    let busy = false, sentAt = 0, lastVideoTime = -1, lastFrameAt = performance.now(), failures = 0;
    let pixels = typeof createImageBitmap !== "function", hiddenAt: number | null = null;
    resources.current.timeout = setTimeout(() => fail("The camera is working, but the local hand tracker took too long to load. Retry hand tracking below."), 45000);
    const schedule = (delay = 80) => {
      clearTimeout(resources.current.timer);
      if (trackingGeneration.current === token) resources.current.timer = setTimeout(tick, delay);
    };
    const tick = () => {
      if (trackingGeneration.current !== token) return;
      const now = performance.now();
      // Background tabs suspend workers and video. Do not mistake a tab switch
      // for a broken camera or replay a stale gesture on return.
      if (document.hidden) { hiddenAt ??= now; callback.current([]); schedule(250); return; }
      if (hiddenAt !== null) { hiddenAt = null; sentAt = now; lastFrameAt = now; lastVideoTime = -1; }
      if (busy) { if (now - sentAt > 12000) fail("The camera is working, but hand tracking stopped responding. Retry hand tracking below."); else schedule(100); return; }
      if (video.readyState < 2 || !video.videoWidth || video.currentTime === lastVideoTime) {
        if (now - lastFrameAt > 5000) setDetail("Waiting for camera frames · check the lens shutter or camera switch");
        schedule(100); return;
      }
      const size = frameSize(video.videoWidth, video.videoHeight);
      if (capture.width !== size.width || capture.height !== size.height) { capture.width = size.width; capture.height = size.height; }
      busy = true; sentAt = now; lastVideoTime = video.currentTime; lastFrameAt = now;
      try {
        context.drawImage(video, 0, 0, size.width, size.height);
        if (pixels) {
          const data = context.getImageData(0, 0, size.width, size.height);
          worker.postMessage({ type: "frame", bitmap: data, timestamp: now }, [data.data.buffer]);
        } else {
          createImageBitmap(capture).then((bitmap) => {
            if (trackingGeneration.current !== token) { bitmap.close(); return; }
            worker.postMessage({ type: "frame", bitmap, timestamp: now }, [bitmap]);
          }).catch(() => {
            if (trackingGeneration.current !== token) return;
            // Some laptop/browser combinations cannot transfer a video bitmap.
            // ImageData uses the same worker model without that dependency.
            pixels = true; busy = false; lastVideoTime = -1; schedule(100);
          });
        }
        schedule(100);
      } catch {
        busy = false;
        if (++failures >= 3) fail("Your camera preview works, but frames could not be passed to hand tracking. Retry tracking or try another browser.");
        else schedule(150);
      }
    };
    worker.onmessage = ({ data }) => {
      if (trackingGeneration.current !== token) return;
      if (data.type === "ready") { clearTimeout(resources.current.timeout); setStatus("ready"); setDetail("Hand tracking ready"); schedule(0); }
      else if (data.type === "error") { console.error("Hand tracker:", data.message); fail("Your camera works, but the local hand-tracking model could not run. Retry tracking or try a current Chrome or Edge browser."); }
      else if (data.type === "hands") {
        busy = false; failures = 0;
        const hands = (document.hidden ? [] : data.hands) as HandObservation[];
        setCount(hands.length); callback.current(hands);
        setDetail(hands.length ? `${hands.length} ${hands.length === 1 ? "hand" : "hands"} detected` : "Camera works · bring a well-lit hand into view");
        const canvas = overlayRef.current, ctx = canvas?.getContext("2d");
        if (canvas && ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = "#ffb28c"; ctx.fillStyle = "#ffffff"; ctx.lineWidth = 1.5;
          // Match object-fit: contain even when a laptop sends a 16:9 feed.
          const scale = Math.min(320 / video.videoWidth, 240 / video.videoHeight);
          const w = video.videoWidth * scale, h = video.videoHeight * scale, ox = (320 - w) / 2, oy = (240 - h) / 2;
          for (const hand of hands) {
            if (hand.landmarks.length !== 21) continue;
            for (const [a, b] of CONNECTIONS) { const p = hand.landmarks[a], q = hand.landmarks[b]; ctx.beginPath(); ctx.moveTo(ox + (1 - p.x) * w, oy + p.y * h); ctx.lineTo(ox + (1 - q.x) * w, oy + q.y * h); ctx.stroke(); }
            for (const p of hand.landmarks) { ctx.beginPath(); ctx.arc(ox + (1 - p.x) * w, oy + p.y * h, 2.3, 0, Math.PI * 2); ctx.fill(); }
          }
        }
        schedule(Math.max(0, 80 - (performance.now() - sentAt)));
      }
    };
    worker.onerror = () => fail("Your camera works, but the hand-tracking worker could not start. Retry tracking below.");
    worker.postMessage({ type: "init" });
  }, [clearTracking]);

  const start = useCallback(async (deviceId = deviceChoice.current) => {
    cleanup(); setError(""); setStatus("requesting"); setDetail("Allow camera access in your browser"); const token = generation.current;
    const fail = (message: string) => { if (generation.current !== token) return; cleanup(); setError(message); setStatus("error"); void refreshDevices(); };
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { fail("Camera access needs localhost or HTTPS. Open this page on localhost:3000, or use a trusted HTTPS connection on your network."); return; }
    const abort = new AbortController(); resources.current.abort = abort;
    try {
      const stream = await openCamera(navigator.mediaDevices, deviceId);
      if (generation.current !== token) { stream.getTracks().forEach((track) => track.stop()); return; }
      resources.current.stream = stream;
      const video = videoRef.current; if (!video) { fail("The camera preview could not start. Please try again."); return; }
      const track = stream.getVideoTracks()[0];
      if (!track) { fail("This device did not provide a video track. Choose another camera."); return; }
      track.addEventListener("ended", () => fail("The camera disconnected or access was revoked. Reconnect it and try again."), { signal: abort.signal });
      track.addEventListener("mute", () => { callback.current([]); setDetail("Camera paused by the device · check its shutter or privacy switch"); }, { signal: abort.signal });
      track.addEventListener("unmute", () => setDetail("Camera stream resumed"), { signal: abort.signal });
      setDetail("Camera opened · waiting for the first video frame…"); video.srcObject = stream;
      await waitForVideo(video, abort.signal);
      if (generation.current !== token) return;
      setPreviewLive(true); setCameraName(track.label || "Camera");
      const actualDevice = track.getSettings().deviceId || deviceId;
      deviceChoice.current = actualDevice; setSelectedDevice(actualDevice); void refreshDevices();
      if (trackHands) retryTracking(); else { setStatus("preview"); setDetail(`Live video · ${video.videoWidth} × ${video.videoHeight}`); }
    } catch (reason) {
      if (generation.current !== token || errorName(reason) === "AbortError" && abort.signal.aborted) return;
      fail(cameraError(reason));
    }
  }, [cleanup, refreshDevices, retryTracking, trackHands]);
  const selectDevice = useCallback((id: string) => {
    deviceChoice.current = id; setSelectedDevice(id);
    if (resources.current.stream || status === "requesting") void start(id);
  }, [start, status]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) callback.current([]); };
    document.addEventListener("visibilitychange", hidden);
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    return () => { document.removeEventListener("visibilitychange", hidden); navigator.mediaDevices?.removeEventListener("devicechange", refreshDevices); cleanup(); };
  }, [cleanup, refreshDevices]);
  return { status, error, count, start, stop, retryTracking, videoRef, overlayRef, previewLive, detail, cameraName, devices, selectedDevice, selectDevice, refreshDevices };
}
