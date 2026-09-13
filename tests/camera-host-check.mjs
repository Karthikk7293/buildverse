// Explicit host-camera diagnostic. Unlike the smoke tests, this asks the real
// camera for a stream and immediately releases it. No frames are read or saved.
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--use-fake-ui-for-media-stream"] });
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.BASE_URL || "http://localhost:3000"}/camera-check`, { waitUntil: "networkidle" });
  const result = await page.evaluate(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const result = { secureContext: isSecureContext, cameraInputs: devices.filter((device) => device.kind === "videoinput").length };
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const tracks = stream.getVideoTracks().length; stream.getTracks().forEach((track) => track.stop());
      return { ...result, opened: true, videoTracks: tracks };
    } catch (error) { return { ...result, opened: false, error: error.name, message: error.message }; }
  });
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
