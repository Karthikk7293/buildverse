/* Local MediaPipe inference stays off the rendering thread. No camera frames are uploaded. */
importScripts("/mediapipe/vision_bundle.js");
let landmarker = null;
self.onmessage = async ({ data }) => {
  if (data.type === "init") {
    try {
      const files = await Vision.FilesetResolver.forVisionTasks("/mediapipe/wasm");
      landmarker = await Vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "CPU" },
        runningMode: "VIDEO", numHands: 2, minHandDetectionConfidence: .6,
        minHandPresenceConfidence: .6, minTrackingConfidence: .6,
      });
      self.postMessage({ type: "ready" });
    } catch (error) { self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) }); }
  } else if (data.type === "frame") {
    try {
      if (!landmarker) throw new Error("Hand tracker is not ready.");
      const result = landmarker.detectForVideo(data.bitmap, data.timestamp);
      self.postMessage({ type: "hands", hands: result.landmarks.map((landmarks, i) => ({ landmarks, label: result.handedness[i]?.[0]?.categoryName || String(i) })) });
    } catch (error) { self.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) }); }
    finally { if (typeof data.bitmap?.close === "function") data.bitmap.close(); }
  }
};
