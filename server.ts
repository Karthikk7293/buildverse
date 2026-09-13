import { createServer } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { randomBytes } from "node:crypto";
import next from "next";
import { Server, type Socket } from "socket.io";
import { BLUEPRINTS, SITE, createPlayer, createState, distance, interact, movePlayer, tickDeadline, tryStart, type BlueprintId, type GameState, type Position } from "./src/lib/game";
import { compatibleNetworks, networkGroup } from "./src/lib/network";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname, port });
type Room = { state: GameState; network: string; tokens: Map<string, string>; updated: number };
type Reply = (result: { ok: boolean; error?: string; state?: GameState; playerId?: string; token?: string }) => void;
const rooms = new Map<string, Room>();
const inputs = new Map<string, { direction?: Position; destination?: Position }>();
const connections = new Map<string, string>();

async function main() {
  await app.prepare();
  const handler = app.getRequestHandler();
  const useTls = process.env.HTTPS_CERT && process.env.HTTPS_KEY;
  const server = useTls ? createSecureServer({ cert: readFileSync(process.env.HTTPS_CERT!), key: readFileSync(process.env.HTTPS_KEY!) }, handler) : createServer(handler);
  const io = new Server(server, {
    maxHttpBufferSize: 32 * 1024,
    allowRequest: (request, callback) => {
      const origin = request.headers.origin;
      let sameOrigin = !origin;
      try { if (origin) sameOrigin = new URL(origin).host === request.headers.host; } catch { sameOrigin = false; }
      callback(null, sameOrigin && networkGroup(request.socket.remoteAddress ?? "") !== null);
    },
  });
  const emitState = (room: Room) => { room.state.serverNow = Date.now(); io.to(room.state.code).emit("state", room.state); };
  const currentRoom = (socket: Socket) => rooms.get(socket.data.code);
  function detach(socket: Socket, remove: boolean) {
    const room = currentRoom(socket);
    if (!room || connections.get(socket.data.playerId) !== socket.id) return;
    const player = room.state.players.find((p) => p.id === socket.data.playerId);
    if (!player) return;
    if (remove) {
      // Return carried blocks to the field, so a replacement builder can finish.
      for (const kind of ["wood", "stone", "glass"] as const) {
        let remaining = player.inventory[kind];
        for (const resource of room.state.resources) if (remaining && resource.collected && resource.kind === kind) { resource.collected = false; remaining--; }
      }
      room.state.players = room.state.players.filter((p) => p.id !== player.id);
      for (const [token, id] of room.tokens) if (id === player.id) room.tokens.delete(token);
      if (room.state.hostId === player.id) room.state.hostId = room.state.players[0]?.id ?? "";
      if (!room.state.players.length) rooms.delete(room.state.code);
    } else {
      player.connected = false;
      player.ready = false;
    }
    inputs.delete(player.id);
    connections.delete(player.id);
    socket.leave(room.state.code);
    io.to(room.state.code).emit("peer-left");
    emitState(room);
    socket.data.code = undefined;
    socket.data.playerId = undefined;
  }
  io.on("connection", (socket) => {
    const network = networkGroup(socket.handshake.address)!;
    let requests = 0;
    const rateTimer = setInterval(() => { requests = 0; }, 1000);
    socket.use(([, ..._args], nextPacket) => { if (++requests > 90) return nextPacket(new Error("Too many requests")); nextPacket(); });
    function attach(room: Room, playerId: string, token: string, reply: Reply) {
      const oldConnection = connections.get(playerId);
      if (oldConnection && oldConnection !== socket.id) io.sockets.sockets.get(oldConnection)?.disconnect(true);
      socket.data.code = room.state.code;
      socket.data.playerId = playerId;
      connections.set(playerId, socket.id);
      socket.join(room.state.code);
      const player = room.state.players.find((p) => p.id === playerId)!;
      player.connected = true;
      room.updated = Date.now();
      reply({ ok: true, state: room.state, playerId, token });
      emitState(room);
    }
    socket.on("create-room", (payload: unknown, reply: Reply) => {
      if (typeof reply !== "function") return;
      const { name, blueprint, mode = "multiplayer" } = (payload && typeof payload === "object" ? payload : {}) as { name?: unknown; blueprint?: unknown; mode?: unknown };
      if (typeof name !== "string" || !name.trim() || !BLUEPRINTS.some((b) => b.id === blueprint)) return reply({ ok: false, error: "Choose a name and a blueprint first." });
      if (mode !== "solo" && mode !== "multiplayer") return reply({ ok: false, error: "Choose Single player or Multiplayer." });
      if (rooms.size >= 100) return reply({ ok: false, error: "The local server is full. Try again shortly." });
      detach(socket, true);
      let code: string;
      do { code = randomBytes(3).toString("hex").toUpperCase(); } while (rooms.has(code));
      const playerId = randomBytes(12).toString("hex");
      const token = randomBytes(24).toString("hex");
      const state = createState(code, playerId, blueprint as BlueprintId, Date.now(), mode);
      state.players.push(createPlayer(playerId, name, 0));
      if (mode === "solo") { state.players[0].ready = true; tryStart(state); }
      const room: Room = { state, network, tokens: new Map([[token, playerId]]), updated: Date.now() };
      rooms.set(code, room);
      attach(room, playerId, token, reply);
    });
    socket.on("join-room", (payload: unknown, reply: Reply) => {
      if (typeof reply !== "function") return;
      const { name, code } = (payload && typeof payload === "object" ? payload : {}) as { name?: unknown; code?: unknown };
      if (typeof name !== "string" || !name.trim() || typeof code !== "string") return reply({ ok: false, error: "Enter your name and the six-character room code." });
      const room = rooms.get(code.trim().toUpperCase());
      if (!room) return reply({ ok: false, error: "Room not found. Check the code and use the host’s network address." });
      if (room.state.mode === "solo") return reply({ ok: false, error: "This is a single-player build. Ask your friend to create a Multiplayer room." });
      if (!compatibleNetworks(room.network, network)) return reply({ ok: false, error: "Connect to the same local network as your teammate." });
      if (room.state.players.length >= 2) return reply({ ok: false, error: "This room already has two builders." });
      if (room.state.status !== "lobby") return reply({ ok: false, error: "This build has already started. Ask the host to create a new room." });
      detach(socket, true);
      if (room.network === "loopback" && network !== "loopback") room.network = network;
      const playerId = randomBytes(12).toString("hex");
      const token = randomBytes(24).toString("hex");
      const slot = room.state.players.some((p) => p.slot === 0) ? 1 : 0;
      room.state.players.push(createPlayer(playerId, name, slot));
      room.tokens.set(token, playerId);
      attach(room, playerId, token, reply);
    });
    socket.on("resume-room", (payload: unknown, reply: Reply) => {
      if (typeof reply !== "function") return;
      const { code, token } = (payload && typeof payload === "object" ? payload : {}) as { code?: unknown; token?: unknown };
      const room = typeof code === "string" ? rooms.get(code) : undefined;
      const id = typeof token === "string" ? room?.tokens.get(token) : undefined;
      if (!room || !id || !compatibleNetworks(room.network, network)) return reply({ ok: false, error: "Your previous room has closed. Start a fresh adventure." });
      attach(room, id, token as string, reply);
    });
    socket.on("select-blueprint", (id: BlueprintId) => {
      const room = currentRoom(socket);
      if (!room || room.state.status !== "lobby" || room.state.hostId !== socket.data.playerId || !BLUEPRINTS.some((b) => b.id === id)) return;
      room.state.blueprint = id;
      room.state.players.forEach((p) => { p.ready = false; });
      emitState(room);
    });
    socket.on("ready", () => {
      const room = currentRoom(socket);
      if (!room || room.state.status !== "lobby") return;
      const player = room.state.players.find((p) => p.id === socket.data.playerId);
      if (player) player.ready = !player.ready;
      tryStart(room.state);
      emitState(room);
    });
    socket.on("move", (value: unknown) => {
      const room = currentRoom(socket);
      if (!room || room.state.status !== "playing" || !value || typeof value !== "object") return;
      const { x, z, destination } = value as Position & { destination?: boolean };
      if (typeof x !== "number" || typeof z !== "number" || !Number.isFinite(x) || !Number.isFinite(z)) return;
      inputs.set(socket.data.playerId, destination ? { destination: { x: Math.max(-8.5, Math.min(12.5, x)), z: Math.max(-11.5, Math.min(11.5, z)) } } : { direction: { x, z } });
    });
    socket.on("interact", () => {
      const room = currentRoom(socket);
      if (!room) return;
      socket.emit("notice", interact(room.state, socket.data.playerId));
      emitState(room);
    });
    socket.on("voice-signal", (signal: unknown) => {
      const room = currentRoom(socket);
      if (!room || room.state.mode === "solo" || !signal || typeof signal !== "object") return;
      const type = (signal as { type?: unknown }).type;
      if (!["ready", "offer", "answer", "candidate", "stop"].includes(String(type))) return;
      socket.to(room.state.code).emit("voice-signal", signal);
    });
    socket.on("network-info", (reply: (data: { urls: string[] }) => void) => {
      if (typeof reply !== "function") return;
      const urls = Object.values(networkInterfaces()).flatMap((entries) => (entries ?? []).filter((entry) => entry.family === "IPv4" && !entry.internal).map((entry) => `${useTls ? "https" : "http"}://${entry.address}:${port}`));
      reply({ urls });
    });
    socket.on("leave-room", () => detach(socket, true));
    socket.on("rematch", () => {
      const room = currentRoom(socket);
      if (!room || !["won", "lost"].includes(room.state.status) || room.state.hostId !== socket.data.playerId) return;
      const fresh = createState(room.state.code, room.state.hostId, room.state.blueprint, Date.now(), room.state.mode);
      fresh.players = room.state.players.map((p) => ({ ...createPlayer(p.id, p.name, p.slot), connected: p.connected }));
      room.state = fresh;
      emitState(room);
    });
    socket.on("disconnect", () => { clearInterval(rateTimer); detach(socket, false); });
  });
  let previous = Date.now();
  let frame = 0;
  setInterval(() => {
    const now = Date.now();
    const delta = (now - previous) / 1000;
    previous = now;
    for (const room of rooms.values()) {
      if (room.state.status !== "playing") continue;
      tickDeadline(room.state, now);
      if (room.state.status === "playing") {
        for (const player of room.state.players) {
          if (!player.connected) continue;
          const input = inputs.get(player.id);
          if (input?.destination) {
            if (distance(player, input.destination) < 0.2 || (distance(input.destination, SITE) < 2 && distance(player, SITE) < 2.6)) inputs.delete(player.id);
            else movePlayer(player, { x: input.destination.x - player.x, z: input.destination.z - player.z }, delta);
          } else if (input?.direction) movePlayer(player, input.direction, delta);
        }
      }
      if (frame % 2 === 0 || room.state.status !== "playing") emitState(room);
    }
    frame++;
  }, 50);
  setInterval(() => {
    for (const [code, room] of rooms) if (room.state.players.every((p) => !p.connected) && Date.now() - Math.max(room.updated, room.state.endsAt ?? 0) > 30 * 60 * 1000) rooms.delete(code);
  }, 60000).unref();
  server.listen(port, hostname, () => {
    console.log(`\n  Kinetic Engine Lab is ready at ${useTls ? "https" : "http"}://localhost:${port}\n`);
    for (const entries of Object.values(networkInterfaces())) for (const entry of entries ?? []) if (entry.family === "IPv4" && !entry.internal) console.log(`  Share on your network: ${useTls ? "https" : "http"}://${entry.address}:${port}\n`);
  });
}
main().catch((error) => { console.error(error); process.exit(1); });
