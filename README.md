# Kinetic · Engine Lab

An interactive 3D workbench for a small single-cylinder, four-stroke engine, built with Next.js, TypeScript, Three.js, and local MediaPipe hand tracking. This is the new main experience in the former Buildverse project.

## Start on port 3000

```bash
npm install
npm run dev
```

Open **http://localhost:3000**. The standard Next.js server binds to `0.0.0.0`. Set `PORT` to choose a different port. The existing project requires Node.js 18.19 or newer; use a supported LTS release for deployment.

## Deploy to Vercel and test on a phone

1. Import the **Buildverse** repository into Vercel and deploy the `feat/engine-lab-vercel` branch. Use the **Next.js** framework preset, repository root as the root directory, and `npm run build` as the build command. Leave the output directory at its framework default. If importing defaults to `main`, select this feature branch for the deployment or set it as the project's production branch.
2. No environment variables, database, Socket.IO server, or API keys are needed for the engine lab. `vercel.json` selects Next.js explicitly. The engine, camera page, worker, WASM, and model are all included in this repository.
3. Open the generated **HTTPS** URL directly in your phone's browser. Try `/camera-check`, tap **Test camera**, and allow camera access. Use the camera chooser if your phone has multiple inputs.
4. Return to `/`, prop the phone up with the front camera facing you, and tap **Enable hand controls**. Use good lighting and keep your hands in frame. The initial model download can take a little time on mobile data.

Vercel supplies HTTPS for its deployment domains, which satisfies the browser's secure-origin requirement for camera access. This uses the **phone's own camera** to control the app running on the phone. It does not repair the laptop camera or relay gestures to a separate laptop session. Camera permission is still required, and actual hand-tracking performance depends on the phone and browser. Use a current Chrome browser on Android or Safari on iPhone; touch controls remain available if tracking cannot run.

The legacy construction-game room server is preserved in `server.ts` for local use (`npm run dev:lan` / `npm run start:lan`). It is not required or deployed by the Vercel engine experience. Reference: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [Vercel HTTPS](https://vercel.com/docs/domains/working-with-ssl), [MediaPipe web requirements](https://developers.google.com/edge/mediapipe/solutions/setup_web).

## Explore the engine

The SC–01 concept has **15 independent assemblies**, from the rocker cover to the crankcase. Select a component in the list or click its 3D geometry.

| Action | Control |
| --- | --- |
| Rotate, including underneath | Left-drag / one-finger drag |
| Pan | Right-drag / two-finger drag |
| Zoom | Scroll / touch pinch / zoom buttons |
| Focus a part | Double-click its geometry or choose Focus |
| Front, back, side, top or bottom view | Camera angle menu |
| Reset the camera | Reset view button / R |
| Separate components visually | Exploded view toggle or slider |
| See inside | Cutaway, X-ray, or Isolate |
| Identify parts in the scene | Labels |

**Assemble** enforces a dependency graph. The inspector lists components that must come off first. Remove an assembly, inspect it on the bench, and reinstall it when its supporting assemblies are in place. “Remove next” performs the next valid removal; “Reassemble all” animates a valid installation sequence that can be paused. Exploded view is a visualization and does not count as removal.

**Simulate** requires every assembly to be installed. Play/pause, scrub through 720° of crankshaft rotation, select a stroke, or change the playback speed. Space toggles playback when focus is in the viewer. Piston and rod positions follow a slider–crank relationship; simplified valves and rocker arms illustrate intake and exhaust. The initial cutaway exposes the moving internals.

State is local to the tab. Reloading restores the assembled model. This engine experience does not use the old game's multiplayer rooms or timer.

## Webcam hand controls (experimental)

If a camera does not work, open **`/camera-check`** on your deployed site (or **http://localhost:3000/camera-check** locally) and press **Test camera**. This page tests live video without the engine or hand tracker and requires no separate camera app. Choose an input or refresh the camera list there.

Click **Enable hand controls**, allow camera access, and keep one or two hands visible in good lighting. The preview shows tracked joints and the current gesture. Mouse and touch remain available.

| Gesture | Action |
| --- | --- |
| Point with the index finger | Move the screen cursor |
| Point near the top / bottom screen edge without pinching | Scroll the page or open guide |
| Pinch and release over a button | Activate it |
| Pinch and move on a slider | Adjust it |
| Pinch and move over the engine in Inspect / Simulate | Rotate |
| Pinch a part in Assemble, move, then release | Remove or reinstall if dependencies permit |
| Pinch with both hands and separate / bring together | Zoom in / out |
| Hold one open palm for about one second | Pause / resume hand controls; pausing also stops playback |

Lost tracking cancels a grab without committing it. Recognition uses palm-relative thresholds, hysteresis, and smoothing. Switching from two-hand zoom to a single hand requires releasing the pinch. **Stop camera** terminates tracking and releases the stream.

A hand-model error now leaves a working camera preview open: use **Retry hand tracking** to restart detection. Camera inputs are capped to a 640-pixel longest edge before inference, with an ImageData fallback for browsers that cannot transfer bitmaps. The camera chooser supports selecting another integrated or USB input.

Detection runs in a separate Web Worker with a CPU delegate. Camera frames are processed on this device; the app does not upload them, capture audio, or use an external inference API. The runtime, WASM, and model are bundled locally. A synthetic camera verifies startup and cleanup; reliable real gestures still depend on the camera, lighting, hands, and computer performance.

Camera access requires **localhost or trusted HTTPS**. Plain HTTP at another computer's LAN IP renders the engine but cannot enable a camera. This is a [browser requirement](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

For local LAN testing with your own trusted certificate, the optional custom server supports HTTPS:

```bash
HTTPS_CERT=./certs/lan-cert.pem HTTPS_KEY=./certs/lan-key.pem npm run dev:lan
```

The certificate must cover the address used to open the app and be trusted by that device. Keep private keys out of source control. Restricted embedded previews may block cameras; open the app directly in a browser.

## Model scope

SC–01 is an original procedural learning model, not a dimensionally accurate production engine or repair guide. Fasteners and fittings are grouped. Removal paths and dependency rules are instructional. The timing drive, valve timing, and head geometry are simplified. Combustion, contact collisions, heat, torque, stress, and fluid flow are not solved. Cutaway surfaces are open visual slices.

Hand gestures provide a hologram-style interaction with the model **on the screen**. A webcam and display do not project a physical hologram. For a particular real engine, the next step is a licensed CAD/GLB model with separated parts, correct pivots, dimensions, and validated assembly relationships.

## Checks and production

```bash
npm run typecheck
npm test
npm run build
npm start
```

Development uses `.next-dev`; production uses `.next`. Stop the development server before starting production on the same port.

With the app running:

```bash
npm run test:browser
# Override the default Chrome location if needed:
BROWSER_PATH=/path/to/chrome npm run test:browser
```

The browser test uses Chromium's synthetic webcam. It checks rendering, all 15 assembly steps and reinstallation, dependency restrictions, camera tools, cutaway/isolation, motion playback, local hand-worker startup, camera cleanup, denied permissions, the guide, and mobile overflow. Screenshots go to `/tmp/kinetic-*.png`. Physical hand accuracy requires testing with a real webcam.

Unit tests cover dependencies, rejected actions, slider–crank geometry, stroke timing, pinch thresholds, invalid observations, and bounded zoom. The previous game's unit tests remain available.

`node tests/engine-gestures.mjs` separately injects deterministic landmark fixtures to verify gesture-driven UI clicks, assembly actions, lost-hand cancellation, palm pause/resume, and page scrolling. These fixtures test interaction logic rather than real hand recognition.

`node tests/camera-smoke.mjs` checks the independent camera page, missing/busy/denied devices, cancellation while permission is pending, a working preview after worker failure, and real MediaPipe inference through the ImageData fallback. It uses a synthetic webcam.

## Main files

- `src/components/engine/EngineLab.tsx` — workbench, inspector, assembly state, camera panel, and guide.
- `src/components/engine/EngineScene.tsx` — renderer, camera, picking, isolation, cutaway, and animation.
- `src/components/engine/engine-model.ts` — procedural geometry and moving assemblies.
- `src/lib/engine.ts` — parts, dependencies, and four-stroke kinematics.
- `src/lib/hand-gestures.ts` — hand signals and zoom calculations.
- `src/hooks/useEngineGestures.ts` — cursor, captures, gesture actions, and tracking loss.
- `src/hooks/useHandTracking.ts` — camera, preview, frame transfer, and worker lifecycle.
- `public/hand-worker.js` — local MediaPipe inference.
- `src/app/engine.css` — responsive workbench styling.

The previous forest-game components, server events, and tests are preserved as source. Its former README is in [docs/forest-game.md](docs/forest-game.md); the main route now renders the engine lab.

## Hand tracking assets

The runtime comes from `@mediapipe/tasks-vision` 1.0.1 (Apache-2.0). The model comes from Google's official [Hand Landmarker model](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task). See the [MediaPipe documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js). On upgrades, copy the package's `vision_bundle.js` and `wasm/` directory into `public/mediapipe` together, then rerun the camera test.
