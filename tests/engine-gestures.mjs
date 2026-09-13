// Deterministic hand-landmark fixtures verify UI gesture routing. The main smoke
// test separately runs the real MediaPipe model with a synthetic webcam.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1050 }, deviceScaleFactor: .5 });
  await page.addInitScript(() => {
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker { constructor(...args) { super(...args); if (String(args[0]).includes("hand-worker.js")) { window.fixtureWorker = this; this.addEventListener("message", ({ data }) => { if (data.sequence) window.fixtureSequence = data.sequence; }); } } };
  });
  await page.route("**/hand-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: `let hands=[];self.onmessage=({data})=>{if(data.type==='init')self.postMessage({type:'ready'});if(data.type==='fixture'){hands=data.hands;self.postMessage({type:'hands',hands,sequence:data.sequence});}if(data.type==='frame'){data.bitmap.close();self.postMessage({type:'hands',hands});}};` }));
  await page.goto(process.env.BASE_URL || "http://localhost:3000", { waitUntil: "networkidle" });
  await page.locator('.engine-canvas[data-ready="true"]').waitFor();
  await page.getByRole("button", { name: "Enable hand controls", exact: false }).click();
  await page.locator(".camera-preview.live").waitFor();
  function hand(x, y, pinch = false, palm = false, label = "Right") {
    const p = Array.from({ length: 21 }, () => ({ x: .5, y: .55, z: 0 }));
    p[0] = { x: .5, y: .8 }; p[9] = { x: .5, y: .5 };
    p[8] = { x: 1 - x, y }; p[4] = { x: p[8].x + (pinch ? .02 : .25), y };
    if (palm) for (const tip of [8,12,16,20]) { p[tip] = { x: .5, y: .15 }; p[tip-2] = { x: .5, y: .5 }; }
    return { landmarks: p, label };
  }
  let sequence = 0;
  async function feed(hands, delay = 260) {
    const id = ++sequence;
    await page.evaluate(({ hands, sequence }) => window.fixtureWorker.postMessage({ type: "fixture", hands, sequence }), { hands, sequence: id });
    try { await page.waitForFunction((id) => window.fixtureSequence === id, id, { timeout: 10000 }); }
    catch (error) { console.log(await page.evaluate(() => ({ sequence: window.fixtureSequence, hint: document.querySelector('.gesture-title')?.textContent, error: document.querySelector('.camera-error')?.textContent, cursor: document.querySelector('.hand-cursor')?.getAttribute('style'), hover: document.querySelector('.hand-hover')?.textContent }))); throw error; }
    await page.waitForTimeout(delay);
  }
  async function pinchClick(locator) {
    await locator.scrollIntoViewIfNeeded(); const bounds = await locator.boundingBox();
    const x = (bounds.x + bounds.width / 2) / 1280, y = (bounds.y + bounds.height / 2) / 1050;
    await feed([]); await feed([hand(x, y)]); await feed([hand(x, y, true)]); await feed([hand(x, y)]); await feed([]);
  }
  await pinchClick(page.getByRole("button", { name: "Cutaway", exact: true }));
  assert.equal(await page.getByRole("button", { name: "Cutaway", exact: true }).getAttribute("aria-pressed"), "true");
  await pinchClick(page.getByRole("button", { name: "Assemble", exact: true }));
  assert.equal(await page.getByRole("button", { name: "Assemble", exact: true }).getAttribute("aria-pressed"), "true");
  await pinchClick(page.getByTestId("part-action"));
  assert.match(await page.getByTestId("installed-count").textContent(), /14/);
  console.log("Pinch clicks route to view, mode, and validated assembly actions");
  // Losing tracking during a held button cancels the pending click.
  const action = page.getByTestId("part-action"), b = await action.boundingBox();
  const x = (b.x + b.width/2)/1280, y = (b.y + b.height/2)/1050;
  await feed([hand(x,y)]); await feed([hand(x,y,true)]); await feed([]); await feed([hand(x,y)]); await feed([]);
  assert.match(await page.getByTestId("installed-count").textContent(), /14/);
  // Open palm pauses/resumes without dropping camera permission.
  for (let i = 0; i < 9; i++) await feed([hand(.5,.4,false,true)], 150);
  assert.equal(await page.getByRole("button", { name: "Resume controls", exact: true }).count(), 1);
  await feed([]); for (let i = 0; i < 9; i++) await feed([hand(.5,.4,false,true)], 150);
  assert.equal(await page.getByRole("button", { name: "Resume controls", exact: true }).count(), 0);
  await feed([]);
  await page.evaluate(() => scrollTo(0,0));
  await feed([hand(.7,.98)], 900); await feed([]);
  assert.ok(await page.evaluate(() => scrollY) > 50);
  console.log("Lost-hand cancellation, palm pause/resume, and edge scrolling passed");
  await page.getByRole("button", { name: "Stop camera", exact: false }).click();
} finally { await browser.close(); }
