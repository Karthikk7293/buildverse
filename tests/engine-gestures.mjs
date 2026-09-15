// Deterministic hand-landmark fixtures verify UI gesture routing. The main smoke
// test separately runs the real MediaPipe model with a synthetic webcam.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1050 }, deviceScaleFactor: .3 });
  await page.addInitScript(() => {
    const RealWorker = window.Worker;
    window.Worker = class extends RealWorker { constructor(...args) { super(...args); if (String(args[0]).includes("hand-worker.js")) { window.fixtureWorker = this; this.addEventListener("message", ({ data }) => { if (data.sequence) window.fixtureSequence = data.sequence; }); } } };
  });
  // Replay landmarks at a fixed cadence: software WebGL can stall synthetic
  // video frames, which should not interfere with these gesture-routing tests.
  await page.route("**/hand-worker.js", (route) => route.fulfill({ contentType: "application/javascript", body: `let hands=[];setInterval(()=>self.postMessage({type:'hands',hands}),80);self.onmessage=({data})=>{if(data.type==='init')self.postMessage({type:'ready'});if(data.type==='fixture'){hands=data.hands;self.postMessage({type:'hands',hands,sequence:data.sequence});}if(data.type==='frame'&&typeof data.bitmap.close==='function')data.bitmap.close();};` }));
  await page.goto(process.env.BASE_URL || "http://localhost:3000", { waitUntil: "networkidle" });
  await page.locator('.engine-canvas[data-ready="true"]').waitFor();
  await page.getByRole("button", { name: "Enable hand controls", exact: false }).click();
  await page.locator('.hand-panel[data-camera-status="ready"]').waitFor();
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
    try { await page.waitForFunction((id) => window.fixtureSequence === id, id, { timeout: 10000, polling: 50 }); }
    catch (error) { console.log(await page.evaluate(() => ({ sequence: window.fixtureSequence, hint: document.querySelector('.gesture-title')?.textContent, error: document.querySelector('.camera-error')?.textContent, cursor: document.querySelector('.hand-cursor')?.getAttribute('style'), hover: document.querySelector('.hand-hover')?.textContent }))); throw error; }
    await page.waitForTimeout(delay);
  }
  async function pinchClick(locator) {
    await locator.scrollIntoViewIfNeeded(); const bounds = await locator.boundingBox();
    const x = (bounds.x + bounds.width / 2) / 1280, y = (bounds.y + bounds.height / 2) / 1050;
    await feed([]); await feed([hand(x, y)]); await feed([hand(x, y, true)]); await feed([hand(x, y)]); await feed([]);
  }
  function fingers(x, y, ratio) {
    const observation = hand(x, y);
    observation.landmarks[4].x = observation.landmarks[8].x + .3 * ratio;
    return observation;
  }
  const zoomLevel = async () => Number((await page.getByTestId("viewer-zoom").textContent()).replace('%', ''));
  await pinchClick(page.getByRole("button", { name: "Finger zoom tool", exact: true }));
  await page.locator('[data-engine-canvas]').scrollIntoViewIfNeeded();
  const canvas = await page.locator('[data-engine-canvas]').boundingBox();
  const cx = (canvas.x + canvas.width * .45) / 1280, cy = (canvas.y + canvas.height * .52) / 1050;
  const initialZoom = await zoomLevel();
  // Opening fingers without first pinching over the viewer must do nothing.
  await feed([fingers(cx,cy,.6)]); await feed([fingers(cx,cy,1.2)]);
  assert.equal(await zoomLevel(), initialZoom);
  await feed([fingers(cx,cy,.2)]);
  for (const gap of [.4,.6,.8,1.1]) await feed([fingers(cx,cy,gap)]);
  const closer = await zoomLevel();
  assert.ok(closer > initialZoom + 15, 'Spreading thumb and index must zoom the actual camera in');
  for (const gap of [.8,.6,.4,.2]) await feed([fingers(cx,cy,gap)]);
  assert.ok(await zoomLevel() < closer - 15, 'Closing fingers must zoom the actual camera out');
  await feed([]); const afterLoss = await zoomLevel();
  await feed([fingers(cx,cy,1.1)]); assert.equal(await zoomLevel(), afterLoss, 'Tracking loss disarms finger zoom');
  await feed([]);
  await pinchClick(page.getByRole('button', { name: 'Reset view', exact: true }));
  assert.equal(await zoomLevel(), 100);
  // Two-hand zoom works in any tool and tolerates detector order changes.
  await feed([hand(cx-.06,cy,true),hand(cx+.06,cy,true,false,'Left')]);
  await feed([hand(cx+.16,cy,true,false,'Left'),hand(cx-.16,cy,true)]);
  const twoHandCloser = await zoomLevel(); assert.ok(twoHandCloser > 100);
  await feed([hand(cx-.07,cy,true),hand(cx+.07,cy,true,false,'Left')]);
  assert.ok(await zoomLevel() < twoHandCloser);
  const beforeRelease = await zoomLevel();
  await feed([hand(cx,cy,true)]); await feed([hand(cx+.1,cy,true)]);
  assert.equal(await zoomLevel(), beforeRelease, 'A held pinch cannot start a new gesture after two-hand zoom');
  await feed([]);
  await pinchClick(page.getByRole('button', { name: 'Pan tool', exact: true }));
  const beforePan = await page.locator('[data-engine-canvas]').screenshot();
  const panZoom = await zoomLevel();
  await feed([hand(cx,cy)]); await feed([hand(cx,cy,true)]); await feed([hand(cx+.12,cy+.07,true)],500);
  assert.match(await page.getByTestId('hand-tool-feedback').textContent(), /Panning/);
  await feed([]); const afterPan = await page.locator('[data-engine-canvas]').screenshot();
  assert.notDeepEqual(beforePan, afterPan, 'Pan must reposition the rendered model');
  assert.equal(await zoomLevel(), panZoom, 'Pan preserves camera distance');
  await pinchClick(page.getByRole('button', { name: 'Separate parts tool', exact: true }));
  await feed([hand(cx,cy)]); await feed([hand(cx,cy,true)]); await feed([hand(cx,cy-.18,true)],500);
  assert.ok(Number(await page.getByLabel('Exploded view amount').inputValue()) > .25);
  assert.match(await page.getByTestId('installed-count').textContent(), /15/);
  await feed([hand(cx,cy,true)],500);
  assert.ok(Number(await page.getByLabel('Exploded view amount').inputValue()) < .1);
  await feed([]);
  await page.getByRole('button', { name:'Simulate', exact:true }).click();
  assert.equal(await page.getByRole('button', {name:'Separate parts tool',exact:true}).isDisabled(), true);
  assert.equal(await page.getByRole('button', {name:'Rotate / grab tool',exact:true}).getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', {name:'Inspect',exact:true}).click();
  await page.getByRole('button', {name:'Cutaway',exact:true}).click();
  console.log('Finger zoom in/out, two-hand zoom, loss/release guards, pan, and part separation passed');
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
