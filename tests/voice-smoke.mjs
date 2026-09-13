import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const base = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.BROWSER_PATH || "/opt/google/chrome/chrome", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
try {
  const pages = [];
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ permissions: ["microphone"], viewport: { width: 1100, height: 1000 } });
    await context.addInitScript(() => {
      const Original = window.RTCPeerConnection;
      window.__testPeers = [];
      window.RTCPeerConnection = class extends Original {
        constructor(...args) { super(...args); window.__testPeers.push(this); }
      };
    });
    pages.push(await context.newPage());
  }
  const [host, guest] = pages;
  await host.goto(base, { waitUntil: "networkidle" });
  await host.getByLabel("What should we call you?").fill("Voice Oak");
  await host.getByRole("button", { name: "Let’s build together" }).click();
  await host.locator(".invite-code strong").waitFor();
  const code = await host.locator(".invite-code strong").textContent();
  await guest.goto(`${base}/?room=${code}`, { waitUntil: "networkidle" });
  await guest.getByLabel("What should we call you?").fill("Voice Pine");
  await guest.getByRole("button", { name: "Join the adventure" }).click();
  await guest.getByRole("button", { name: "Enable voice chat", exact: true }).waitFor();
  await host.getByRole("button", { name: "Enable voice chat", exact: true }).click();
  await guest.getByRole("button", { name: "Enable voice chat", exact: true }).click();
  for (const page of pages) await page.getByText("Voice connected", { exact: true }).waitFor({ timeout: 15000 });
  await host.waitForTimeout(1700);
  const stats = [];
  for (const page of pages) stats.push(await page.evaluate(async () => {
    const peer = window.__testPeers.at(-1);
    const reports = [...(await peer.getStats()).values()];
    return { state: peer.connectionState, inbound: reports.find((r) => r.type === "inbound-rtp" && r.kind === "audio")?.packetsReceived ?? 0, outbound: reports.find((r) => r.type === "outbound-rtp" && r.kind === "audio")?.packetsSent ?? 0 };
  }));
  for (const peer of stats) { assert.equal(peer.state, "connected"); assert.ok(peer.inbound > 0); assert.ok(peer.outbound > 0); }
  await host.getByRole("button", { name: "Mute microphone", exact: true }).click();
  assert.equal(await host.evaluate(() => window.__testPeers.at(-1).getSenders()[0].track.enabled), false);
  await host.getByRole("button", { name: "Unmute microphone", exact: true }).click();
  assert.equal(await host.evaluate(() => window.__testPeers.at(-1).getSenders()[0].track.enabled), true);
  await host.getByRole("button", { name: "Disconnect voice chat" }).click();
  assert.equal(await host.evaluate(() => window.__testPeers.at(-1).connectionState), "closed");
  // Reconnect with the opposite player enabling first.
  await guest.getByRole("button", { name: "Disconnect voice chat" }).click();
  await guest.getByRole("button", { name: "Enable voice chat", exact: true }).click();
  await host.getByRole("button", { name: "Enable voice chat", exact: true }).click();
  for (const page of pages) await page.getByText("Voice connected", { exact: true }).waitFor({ timeout: 15000 });
  console.log(JSON.stringify({ status: "passed", checks: ["direct WebRTC connection", "bidirectional audio packets", "mute", "unmute", "microphone stop", "voice reconnection in reverse order"], peers: stats }, null, 2));
} finally { await browser.close(); }
