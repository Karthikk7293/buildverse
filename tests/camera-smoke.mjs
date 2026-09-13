import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const base = process.env.BASE_URL || "http://localhost:3000";
const launch = { executablePath: process.env.BROWSER_PATH || "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] };
const browser = await chromium.launch(launch);
const issues = [];
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: .5 });
  page.on("pageerror", (error) => issues.push(error.message));
  const modelRequests = [];
  page.on("request", (request) => { if (/mediapipe|hand-worker|hand_landmarker/.test(request.url())) modelRequests.push(request.url()); });
  await page.goto(`${base}/camera-check`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Test camera", exact: true }).click();
  await page.locator(".camera-preview.live").waitFor();
  assert.equal(await page.locator("canvas").count(), 0);
  assert.deepEqual(modelRequests, []);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  assert.equal(await page.locator("video").evaluate((video) => video.srcObject), null);
  for (const [name, message] of [["NotFoundError", "No camera was found"], ["NotAllowedError", "Camera permission was denied"], ["NotReadableError", "busy or unavailable"]]) {
    await page.evaluate((name) => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Unavailable", name); }; }, name);
    await page.getByRole("button", { name: "Test camera", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: message }).waitFor();
  }
  console.log("Camera-only preview, no ML/3D dependency, cleanup, missing-camera, permission and busy-device feedback passed");
  await page.reload({ waitUntil: "networkidle" });
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (...args) => {
      const stream = await original(...args); window.lateStream = stream;
      await new Promise((resolve) => { window.releaseCamera = resolve; }); return stream;
    };
  });
  await page.getByRole("button", { name: "Test camera", exact: true }).click();
  await page.waitForFunction(() => window.releaseCamera);
  await page.getByRole("button", { name: "Stop camera", exact: true }).click();
  await page.evaluate(() => window.releaseCamera());
  await page.waitForFunction(() => window.lateStream.getTracks().every((track) => track.readyState === "ended"));
  assert.equal(await page.locator("video").evaluate((video) => video.srcObject), null);
  console.log("Cancelling an outstanding camera request releases its late stream");
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator('.engine-canvas[data-ready="true"]').waitFor();
  await page.route("**/hand-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: "self.onmessage=()=>self.postMessage({type:'error',message:'Test worker failure'});" }));
  await page.getByRole("button", { name: "Enable hand controls", exact: false }).click();
  await page.getByRole("button", { name: "Retry hand tracking", exact: true }).waitFor();
  assert.equal(await page.locator(".camera-preview.live").count(), 1);
  assert.equal(await page.locator(".camera-preview video").evaluate((video) => video.srcObject.getVideoTracks()[0].readyState), "live");
  console.log("A tracker error preserves the working camera preview");
  await page.unroute("**/hand-worker.js");
  await page.evaluate(() => { window.createImageBitmap = async () => { throw new Error("Simulated bitmap transfer incompatibility"); }; });
  await page.getByRole("button", { name: "Retry hand tracking", exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.hand-panel')?.getAttribute('data-camera-status') === 'ready', null, { timeout: 60000 });
  await page.getByRole("status").filter({ hasText: "Camera works · bring a well-lit hand into view" }).waitFor({ timeout: 20000 });
  assert.equal(await page.locator(".camera-error").count(), 0);
  await page.getByRole("button", { name: "Stop camera", exact: false }).click();
  console.log("Real MediaPipe processes ImageData when bitmap transfer is unavailable; retry reuses the open camera");
  assert.deepEqual(issues, []);
} finally { await browser.close(); }
