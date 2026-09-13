import test from "node:test";
import assert from "node:assert/strict";
import { cameraConstraints, cameraError, frameSize, openCamera, waitForVideo } from "../src/lib/camera";

test("camera retries unsupported capture settings once without switching selected devices", async () => {
  const requests: MediaStreamConstraints[] = [];
  const stream = {} as MediaStream;
  const media = { getUserMedia: async (constraints: MediaStreamConstraints) => {
    requests.push(constraints);
    if (requests.length === 1) throw new DOMException("Capture format unavailable", "OverconstrainedError");
    return stream;
  } };
  assert.equal(await openCamera(media, "laptop-camera"), stream);
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], { audio: false, video: { deviceId: { exact: "laptop-camera" } } });
  assert.equal(cameraConstraints("", true).video, true);
});
test("permission denial and absent or busy cameras are not repeatedly reopened", async () => {
  for (const name of ["NotAllowedError", "NotFoundError", "NotReadableError"]) {
    let calls = 0;
    await assert.rejects(openCamera({ getUserMedia: async () => { calls++; throw new DOMException("Unavailable", name); } }), { name });
    assert.equal(calls, 1);
  }
  assert.match(cameraError({ name: "NotFoundError" }), /No camera was found/);
  assert.match(cameraError({ name: "VideoTimeoutError" }), /did not deliver/);
});
test("camera frame copies are bounded and retain the camera aspect ratio", () => {
  assert.deepEqual(frameSize(1920, 1080), { width: 640, height: 360 });
  assert.deepEqual(frameSize(1080, 1920), { width: 360, height: 640 });
  assert.deepEqual(frameSize(320, 240), { width: 320, height: 240 });
});
function fakeVideo() {
  const video = Object.assign(new EventTarget(), { readyState: 0, videoWidth: 0, videoHeight: 0, play: () => new Promise<void>(() => {}) });
  return video as unknown as HTMLVideoElement;
}
test("camera startup times out when the device opens without delivering video", async () => {
  await assert.rejects(waitForVideo(fakeVideo(), new AbortController().signal, 20), { name: "VideoTimeoutError" });
});
test("stopping camera cancels a pending playback wait", async () => {
  const abort = new AbortController();
  const waiting = waitForVideo(fakeVideo(), abort.signal, 1000); abort.abort();
  await assert.rejects(waiting, { name: "AbortError" });
});
test("the first usable camera frame resolves playback readiness", async () => {
  const video = fakeVideo();
  const waiting = waitForVideo(video, new AbortController().signal, 1000);
  Object.assign(video, { readyState: 2, videoWidth: 1280, videoHeight: 720 });
  video.dispatchEvent(new Event("loadeddata")); await waiting;
});
