# Buildverse

> Archived instructions for the former construction-game experience. The current `/` route is the engine lab; its standard Next.js commands and Vercel setup are in the main README. The custom local server remains available through `npm run dev:lan` and `npm run start:lan`.

A cozy construction game with **Single player** and **Multiplayer** modes, built with Next.js, TypeScript, Three.js, Socket.IO, and WebRTC. Explore a low-poly forest, gather scattered blocks, and build a cabin, A-frame retreat, or watchtower on your own or with a friend.

## Run the game

Requires Node.js 18.19 or newer and npm. Node.js 22 LTS is recommended for a new setup.

```bash
npm install
npm run dev
```

Open **http://localhost:3000** and choose a game mode above the blueprints.

**Single player:** choose a blueprint, enter your name, and click **Start solo build**. The ten-minute challenge starts immediately with one builder. Solo uses the same resources, six-block backpack, construction requirements, and strict >95% win condition. Nobody can join a solo session; invitations and voice are available only in Multiplayer. Refreshing resumes your solo game without resetting the clock. Build again returns to your solo blueprint selection, and Leave solo build returns to the mode selector. The local game server is still required for solo play.

**Multiplayer:** the terminal prints your computer’s LAN address, such as `http://192.168.1.20:3000`. Both computers must open the **same running server**, not separate copies of the app. Room invitation links automatically select Multiplayer.

1. Connect both computers to the same Wi-Fi or wired local network.
2. The host enters a name, selects a blueprint, and creates a room.
3. Use **Invite friend** to copy the LAN invitation link, or expand **Network details** and copy an address manually.
4. The second player opens that link, enters a name, and joins using the six-character room code.
5. Both players click **I’m ready to build**. The server starts the ten-minute clock only after both are connected and ready.

Only two players can occupy a room. A third player receives a room-full message. The server accepts loopback and IPv4 peers on its directly connected private subnet; it rejects public remote addresses and incompatible subnets. It uses the actual socket address, not client-supplied forwarded headers. If your router enables client isolation or your firewall blocks port 3000, allow communication between the two computers on your private network.

## How to play

| Action | Control |
| --- | --- |
| Move | W, A, S, D; arrow keys; or click/tap the ground |
| Gather blocks | Stand near crates, rocks, or crystals and press E, or use Collect nearby blocks |
| Construct | Return to the arrow-marked site and press E, or use Place blocks |
| Zoom | + / − buttons in the forest |
| Reset view | Compass button |
| Fullscreen | Expand button |
| Learn the rules | Field guide |

Your backpack holds **six blocks**. One collection action gathers nearby blocks of one material until the backpack is full. Delivery places all carried materials the blueprint still needs. Construction and resource collection are shared and validated by the server, including distance checks, inventory limits, movement speed, blueprint limits, and the deadline.

| Blueprint | Wood | Stone | Glass | Total |
| --- | ---: | ---: | ---: | ---: |
| Woodland cabin | 28 | 12 | 8 | 48 |
| A-frame retreat | 36 | 16 | 12 | 64 |
| Forest watchtower | 40 | 24 | 16 | 80 |

**In either mode, you win only if completion is strictly above 95% when the ten-minute timer expires.** Exactly 95% is a loss. Completing the building early does not shorten the round. In Multiplayer, both players see the same result; the host can choose Build again to return everyone to the ready lobby. In Single player, Build again keeps your game in solo mode.

Before starting, the scene displays the finished blueprint as a preview. During the game it becomes a faint construction guide, and delivered blocks make the real building appear.

## Two-way voice chat

Both players enable their microphone using the room’s microphone button or Settings → Voice chat. WebRTC provides simultaneous, direct, bidirectional audio, with echo cancellation and noise suppression. The mic button mutes/unmutes; the adjacent close button stops voice and releases the microphone. Leaving the room also releases it.

Browsers permit microphone capture on **localhost or a trusted HTTPS origin**. Plain HTTP at a LAN IP address supports gameplay but does not support microphone permission. This is a [browser requirement for getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), not a game setting.

The server supports HTTPS directly. Provide a trusted certificate and its private key:

```bash
HTTPS_CERT=./certs/lan-cert.pem HTTPS_KEY=./certs/lan-key.pem npm run dev
```

The certificate must cover the LAN IP or hostname used by both players, and its issuing CA must be trusted on **both computers**. One development option is [mkcert](https://github.com/FiloSottile/mkcert): install its local CA, generate a certificate covering `localhost`, `127.0.0.1`, and your LAN IP, and install only its **public root CA certificate** on the other computer. Keep all private keys private. Merely clicking through an untrusted-certificate warning is not a reliable microphone setup. Certificates are ignored by Git.

No external STUN or TURN server is used: voice stays on the local network. Both browsers must allow direct peer communication. Use headphones for the best experience. The app reports denied permission, missing microphones, insecure origins, and connection failures inline.

## Production and checks

```bash
npm run typecheck
npm test
npm run build
npm start
```

For a different port, prefix the command with `PORT=3001`. The custom Node server is required for multiplayer; `next start` alone does not attach Socket.IO. Deploy as a long-running Node process on your LAN. A static export or ordinary serverless deployment will not preserve the in-memory rooms.

Development and production have separate build directories (`.next-dev` and `.next`), so a production build does not interfere with the development server.

With the game server already running, the browser smoke test checks the rendered forest, blueprint changes, settings, room creation/joining, the two-player limit, readiness, timer synchronization, session resumption, leaving, and mobile overflow:

```bash
# Uses /opt/google/chrome/chrome by default; override for your installation.
BROWSER_PATH=/path/to/chrome npm run test:browser
```

The server integration check exercises real Socket.IO clients, authoritative movement, collection, shared construction, reconnection, and room restrictions:

```bash
node tests/multiplayer-smoke.mjs
```

This integration check also verifies solo starting immediately, refusing joins, collecting and placing blocks, and preserving the solo session on reconnect. The mode-specific browser check covers both options, solo controls, the running timer, reload/leave behavior, invitation routing, and mobile layout:

```bash
BROWSER_PATH=/path/to/chrome node tests/modes-smoke.mjs
```

The voice check uses Chromium’s synthetic microphone, verifying a real WebRTC connection and outbound/inbound audio packets for both peers without recording system audio:

```bash
BROWSER_PATH=/path/to/chrome node tests/voice-smoke.mjs
```

## Project layout

- `server.ts` — Next.js server, LAN restrictions, rooms, socket events, authoritative simulation, voice signaling.
- `src/lib/game.ts` — shared types, deterministic resources, blueprint requirements, movement, collection, progress, and win/loss rules.
- `src/lib/network.ts` — private network validation using the server’s interface netmasks.
- `src/components/World.tsx` — procedural Three.js island, forest, buildings, resource meshes, characters, and camera.
- `src/components/Game.tsx` — lobby, live HUD, voice controls, timer, guide, settings, and results.
- `src/hooks/useGame.ts` — room connection, tab-scoped reconnect token, shared state, server clock synchronization.
- `src/hooks/useVoice.ts` — direct WebRTC audio and microphone lifecycle.
- `tests/` — game-rule, network, browser, multiplayer, and voice checks.

Rooms live in memory. Restarting the server closes them. Refreshing a browser resumes its seat using a token in that tab’s session storage; a network interruption keeps its seat reserved, with the shared timer continuing. Use Leave room explicitly to release a seat. New players cannot join an already-started game. The initial forest is a preview, not a simulated second player. The scene uses procedural geometry and locally bundled fonts, so no external art or font service is needed at runtime.
