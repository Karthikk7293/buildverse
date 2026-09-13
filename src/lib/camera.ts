export type CameraDevice = { id: string; label: string };

export function cameraConstraints(deviceId = "", relaxed = false): MediaStreamConstraints {
  const device = deviceId ? { deviceId: { exact: deviceId } } : {};
  return {
    audio: false,
    video: relaxed ? (deviceId ? device : true) : {
      ...device,
      width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 },
      ...(deviceId ? {} : { facingMode: { ideal: "user" } }),
    },
  };
}

export async function openCamera(media: Pick<MediaDevices, "getUserMedia">, deviceId = "") {
  try { return await media.getUserMedia(cameraConstraints(deviceId)); }
  catch (error) {
    // Retry unsupported capture settings, but never repeat a denied permission
    // request or silently switch away from the camera the user selected.
    if (errorName(error) !== "OverconstrainedError") throw error;
    return media.getUserMedia(cameraConstraints(deviceId, true));
  }
}

export function errorName(error: unknown) {
  return error && typeof error === "object" && "name" in error ? String(error.name) : "Error";
}

export function cameraError(error: unknown) {
  switch (errorName(error)) {
    case "NotAllowedError": case "PermissionDeniedError":
      return "Camera permission was denied. Allow camera access in this browser’s site settings and your laptop’s privacy settings, then try again. If this page is in an embedded preview, open it directly in a browser tab.";
    case "NotFoundError": case "DevicesNotFoundError":
      return "No camera was found. Connect or enable the laptop camera, check its privacy switch, and refresh the camera list.";
    case "NotReadableError": case "TrackStartError":
      return "Your camera is busy or unavailable. Close other camera apps or tabs, check your laptop’s camera switch, then try again.";
    case "OverconstrainedError":
      return "The selected camera or its capture settings are unavailable. Choose another camera and try again.";
    case "SecurityError":
      return "Camera access is blocked by this browser or page. Open the workbench directly on localhost or trusted HTTPS and check camera permissions.";
    case "VideoTimeoutError":
      return "The camera opened but did not deliver a usable video frame. Check the lens shutter or camera switch, close other camera apps, or choose another camera.";
    default:
      return "The camera could not start. Check its connection and browser permissions, then try again.";
  }
}

export function frameSize(width: number, height: number, maxSide = 640) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function waitForVideo(video: HTMLVideoElement, signal: AbortSignal, timeoutMs = 12000) {
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      video.removeEventListener("loadeddata", check);
      video.removeEventListener("canplay", check);
      signal.removeEventListener("abort", aborted);
      if (error) reject(error); else resolve();
    };
    const check = () => { if (video.readyState >= 2 && video.videoWidth && video.videoHeight) finish(); };
    const aborted = () => finish(new DOMException("Camera startup cancelled", "AbortError"));
    if (signal.aborted) { aborted(); return; }
    timer = setTimeout(() => finish(new DOMException("No camera frames", "VideoTimeoutError")), timeoutMs);
    video.addEventListener("loadeddata", check); video.addEventListener("canplay", check);
    signal.addEventListener("abort", aborted, { once: true });
    video.play().then(check).catch(finish);
  });
}
