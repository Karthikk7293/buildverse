import { chromium } from "@playwright/test";
import { io } from "socket.io-client";
import assert from "node:assert/strict";

const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const base = process.env.BASE_URL || "http://localhost:3000";
const issues = [];
try {
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 1040 } });
  const host = await hostContext.newPage();
  host.on("pageerror", (error) => issues.push(error.message));
  await host.goto(base, { waitUntil: "networkidle" });
  await host.locator("canvas").waitFor();
  await host.evaluate(() => document.fonts.ready);
  await host.waitForTimeout(1500);
  await host.screenshot({ path: "/tmp/buildverse-desktop.png", fullPage: true });
  console.log("Desktop forest rendered");
  assert.equal(await host.getByRole("heading", { name: "Better built together." }).count(), 1);
  await host.getByRole("button", { name: "Select A-frame retreat" }).click();
  await host.getByRole("button", { name: "Select A-frame retreat" }).getAttribute("aria-pressed").then((value) => assert.equal(value, "true"));
  await host.getByRole("button", { name: "Select Woodland cabin" }).click();
  await host.getByRole("button", { name: "How to play", exact: true }).click();
  await host.getByRole("dialog").waitFor();
  await host.keyboard.press("Escape");
  await host.getByRole("button", { name: "Open settings" }).click();
  await host.getByRole("switch", { name: "Detailed shadows" }).click();
  await host.getByRole("switch", { name: "Detailed shadows" }).click();
  // Use the supported low-detail mode while several software-rendered test
  // clients share one GPU process. The desktop capture above uses full detail.
  await host.getByRole("switch", { name: "Detailed shadows" }).click();
  await host.getByRole("button", { name: "All set" }).click();
  await host.getByLabel("What should we call you?").fill("Oak");
  await host.getByRole("button", { name: "Let’s build together" }).click();
  await host.locator(".invite-code strong").waitFor();
  const code = await host.locator(".invite-code strong").textContent();
  console.log("Host room created");
  assert.match(code, /^[A-F0-9]{6}$/);
  await host.getByRole("button", { name: "I’m ready to build" }).click();
  await host.waitForTimeout(1100);
  assert.equal(await host.locator(".game-timer>strong").textContent(), "10:00");

  const guestContext = await browser.newContext({ viewport: { width: 1440, height: 1040 } });
  await guestContext.addInitScript(() => localStorage.setItem("buildverse-quality", "low"));
  const guest = await guestContext.newPage();
  guest.on("pageerror", (error) => issues.push(error.message));
  await guest.goto(`${base}/?room=${code}`, { waitUntil: "networkidle" });
  await guest.getByLabel("What should we call you?").fill("Pine");
  await guest.getByRole("button", { name: "Join the adventure" }).click();
  await guest.getByRole("button", { name: "I’m ready to build" }).waitFor();
  console.log("Second builder joined");
  assert.equal(await guest.getByRole("button", { name: "Select A-frame retreat" }).isDisabled(), true);

  const third = io(base, { transports: ["websocket"], forceNew: true });
  await new Promise((resolve, reject) => { third.once("connect", resolve); third.once("connect_error", reject); });
  const rejected = await new Promise((resolve) => third.emit("join-room", { name: "Third", code }, resolve));
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /already has two/);
  third.disconnect();
  console.log("Third builder rejected");

  await host.screenshot({ path: "/tmp/buildverse-lobby.png", fullPage: true });
  await guest.getByRole("button", { name: "I’m ready to build" }).click();
  await host.getByRole("heading", { name: "Taking shape." }).waitFor();
  await guest.getByRole("heading", { name: "Taking shape." }).waitFor();
  console.log("Both builders started together");
  await host.waitForTimeout(1500);
  assert.notEqual(await host.locator(".game-timer>strong").textContent(), "10:00");
  const timers = await Promise.all([host.locator(".game-timer>strong").textContent(), guest.locator(".game-timer>strong").textContent()]);
  const seconds = (timer) => { const [m, s] = timer.split(":").map(Number); return m * 60 + s; };
  assert.ok(Math.abs(seconds(timers[0]) - seconds(timers[1])) <= 1);
  await host.locator("canvas").click({ position: { x: 300, y: 320 } });
  await host.keyboard.press("e");
  await host.getByRole("button", { name: "Enable voice chat", exact: true }).click();
  await host.waitForTimeout(800);
  await host.screenshot({ path: "/tmp/buildverse-playing.png", fullPage: true });
  await guestContext.close();
  await host.reload({ waitUntil: "networkidle" });
  await host.getByRole("heading", { name: "Taking shape." }).waitFor();
  assert.ok((await host.locator(".player-row strong").allTextContents()).some((text) => text.includes("Oak")));
  await host.getByRole("button", { name: "Leave room", exact: true }).click();
  await host.getByRole("dialog").getByRole("button", { name: "Leave room" }).click();
  await host.getByRole("button", { name: "Let’s build together" }).waitFor();
  await hostContext.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const mobile = await mobileContext.newPage();
  mobile.on("pageerror", (error) => issues.push(error.message));
  await mobile.goto(base, { waitUntil: "networkidle" });
  await mobile.locator("canvas").waitFor();
  await mobile.waitForTimeout(1000);
  assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await mobile.screenshot({ path: "/tmp/buildverse-mobile.png", fullPage: true });
  console.log(JSON.stringify({ status: "passed", checks: ["3D rendering", "blueprint selection", "guide and settings", "create and join rooms", "one player cannot start", "third player rejected", "host-only blueprint selection", "synchronized timer", "reconnect room", "leave room", "mobile overflow"], pageErrors: issues }, null, 2));
  assert.deepEqual(issues, []);
} finally { await browser.close(); }
