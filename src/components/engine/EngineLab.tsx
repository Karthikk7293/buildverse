"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { PARTS, PART_BY_ID, STROKES, applyAssembly, canInstall, canRemove, cycleState, installationBlockers, nextInstallation, nextRemoval, removalBlockers, type PartId, type ViewMode } from "@/lib/engine";
import { LabIcon, type LabIconName } from "./LabIcon";
import type { CameraView, SceneHandle } from "./EngineScene";
import { useEngineGestures } from "@/hooks/useEngineGestures";
import { useHandTracking } from "@/hooks/useHandTracking";
import { HandTools } from "./HandTools";
import type { HandTool } from "@/lib/hand-gestures";

const EngineScene = dynamic(() => import("./EngineScene"), { ssr: false, loading: () => <div className="scene-loading"><span className="loading-ring"/>Opening the engine lab…</div> });
const MODES: { id: ViewMode; label: string; icon: LabIconName }[] = [{ id: "inspect", label: "Inspect", icon: "eye" }, { id: "assemble", label: "Assemble", icon: "tool" }, { id: "run", label: "Simulate", icon: "play" }];
const VIEWS: CameraView[] = ["Perspective", "Front", "Back", "Left", "Right", "Top", "Bottom"];

export default function EngineLab() {
  const scene = useRef<SceneHandle>(null), stage = useRef<HTMLDivElement>(null), guideRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<PartId>("cover"), [removed, setRemoved] = useState<PartId[]>([]);
  const [mode, setMode] = useState<ViewMode>("inspect"), [exploded, setExploded] = useState(0);
  const [cutaway, setCutaway] = useState(false), [xray, setXray] = useState(false), [isolated, setIsolated] = useState(false), [labels, setLabels] = useState(false);
  const [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1), [angle, setAngle] = useState(40);
  const [view, setView] = useState<CameraView>("Perspective"), [notice, setNotice] = useState("");
  const [autoInstall, setAutoInstall] = useState(false), [partsOpen, setPartsOpen] = useState(false), [guideOpen, setGuideOpen] = useState(false);
  const [handHelp, setHandHelp] = useState(false);
  const [handTool, setHandTool] = useState<HandTool>("grab"), [zoomPercent, setZoomPercent] = useState(100);
  const part = PART_BY_ID[selected], isRemoved = removed.includes(selected);
  const blockers = isRemoved ? installationBlockers(selected, removed) : removalBlockers(selected, removed);
  const allowed = isRemoved ? canInstall(selected, removed) : canRemove(selected, removed);
  const installed = PARTS.length - removed.length, cycle = cycleState(angle), stroke = STROKES[cycle.stroke];
  const applyPart = useCallback((id: PartId) => {
    const install = removed.includes(id), missing = install ? installationBlockers(id, removed) : removalBlockers(id, removed);
    setSelected(id); setPlaying(false); setMode("assemble"); setExploded(0); setIsolated(false);
    if (missing.length) { setNotice(`${install ? "Install" : "Remove"} ${missing.map((p) => PART_BY_ID[p].name.toLowerCase()).join(", ")} first.`); return; }
    setRemoved((previous) => applyAssembly(previous, { type: install ? "install" : "remove", id }));
    setNotice(`${PART_BY_ID[id].name} ${install ? "installed" : "removed"}.`);
  }, [removed]);
  const gestures = useEngineGestures({ mode, tool: handTool, exploded, scene, onSelect: setSelected, onPart: applyPart, onPause: () => setPlaying(false), onRange: (name, value) => { if (name === "explode") { setExploded(value); if (value > 0) setPlaying(false); } if (name === "cycle") { setPlaying(false); setAngle(value * 719.9); } } });
  const camera = useHandTracking(gestures.onHands);
  const cameraActive = ["requesting", "loading", "ready", "preview"].includes(camera.status);
  const chooseMode = (next: ViewMode) => {
    if (next === "run" && removed.length) { setNotice("Reassemble all parts before running the engine."); setMode("assemble"); return; }
    setMode(next); setPlaying(false); setIsolated(false);
    if (next !== "inspect") setExploded(0);
    if (next === "run") { setCutaway(true); setXray(false); setAngle(0); if (handTool === "explode") setHandTool("grab"); }
  };
  const chooseView = (next: CameraView) => { setView(next); scene.current?.view(next); };
  const resetView = () => { setView("Perspective"); scene.current?.reset(); };
  const selectPart = (id: PartId) => { setSelected(id); setPartsOpen(false); };
  const resetAssembly = () => { if (removed.length) { setPlaying(false); setAutoInstall(true); setMode("assemble"); setExploded(0); setIsolated(false); } };
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 4500); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => {
    if (!autoInstall) return;
    const next = nextInstallation(removed);
    if (!next) { setAutoInstall(false); setNotice("Engine complete. All 15 assemblies are back in place."); return; }
    const timer = setTimeout(() => { setSelected(next); setRemoved((previous) => applyAssembly(previous, { type: "install", id: next })); }, 250);
    return () => clearTimeout(timer);
  }, [autoInstall, removed]);
  useEffect(() => { if (guideOpen) guideRef.current?.showModal(); else guideRef.current?.close(); }, [guideOpen]);
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).closest("input, select, textarea, button, dialog")) return;
      if (event.code === "Space" && mode === "run" && !removed.length && !exploded) { event.preventDefault(); setPlaying((value) => !value); }
      if (event.key.toLowerCase() === "r") scene.current?.reset();
      if (event.key === "Escape") { setIsolated(false); setGuideOpen(false); }
    };
    window.addEventListener("keydown", keys); return () => window.removeEventListener("keydown", keys);
  }, [mode, removed.length, exploded]);
  const togglePlay = () => { if (removed.length || exploded > 0) { setNotice("Return the engine to its assembled view to simulate."); return; } setPlaying((value) => !value); };
  const fullscreen = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { setNotice("Fullscreen is unavailable in this browser window."); } };

  return <div className="engine-app">
    <header className="lab-header">
      <a className="lab-brand" href="/" aria-label="Kinetic engine lab home"><span className="brand-mark"><LabIcon name="engine" size={23}/></span>kinetic<span className="brand-period">.</span><span className="brand-divider"/><span className="brand-caption">ENGINE LAB</span></a>
      <nav aria-label="Main navigation"><button className="nav-active" onClick={() => setGuideOpen(false)}>Workbench</button><button onClick={() => setGuideOpen(true)}>How it works <LabIcon name="arrow" size={14}/></button></nav>
      <button className={`camera-toggle ${cameraActive ? "enabled" : ""}`} onClick={() => { if (cameraActive) camera.stop(); else { gestures.resume(); void camera.start(); } }}><LabIcon name={cameraActive ? "camera" : "hand"} size={18}/><span>{cameraActive ? "Stop camera" : "Enable hand controls"}</span><span className="beta-tag">BETA</span></button>
    </header>

    <main className="lab-main">
      <section className="lab-intro">
        <div><div className="eyebrow"><span/> AN INTERACTIVE MECHANICAL PLAYGROUND</div><h1>Get to know what moves us.</h1><p>Take it apart. Look a little closer. Put every piece back in motion.</p></div>
        <div className="model-badge"><div className="model-badge-icon"><LabIcon name="engine" size={28}/></div><div><span>ON THE WORKBENCH</span><strong>Single-cylinder engine</strong><small>4-stroke · Air-cooled · SC–01 concept</small></div></div>
      </section>

      <section className="workbench" aria-label="Engine workbench">
        <aside className={`parts-panel ${partsOpen ? "open" : ""}`}>
          <div className="panel-heading"><span><LabIcon name="layers" size={17}/> Components</span><span className="count-pill">15</span><button className="mobile-close icon-button" aria-label="Close parts list" onClick={() => setPartsOpen(false)}><LabIcon name="close" size={16}/></button></div>
          <p className="panel-caption">A whole, made of many parts.</p>
          <div className="parts-list">
            {PARTS.map((item, index) => <button key={item.id} data-part={item.id} className={`part-row ${selected === item.id ? "active" : ""} ${removed.includes(item.id) ? "detached" : ""}`} onClick={() => selectPart(item.id)} aria-pressed={selected === item.id}><span className="part-number">{String(index + 1).padStart(2, "0")}</span><span>{item.name}</span><span className="part-indicator" title={removed.includes(item.id) ? "Removed" : "Installed"}>{removed.includes(item.id) ? <LabIcon name="layers" size={12}/> : <span/>}</span></button>)}
          </div>
          <div className="assembly-meter"><div><span>Assembly status</span><strong data-testid="installed-count">{installed}<em> / 15</em></strong></div><div className="meter-track"><span style={{ width: `${installed / 15 * 100}%` }}/></div><small><span className={`status-dot ${removed.length ? "amber" : ""}`}/>{removed.length ? `${removed.length} ${removed.length === 1 ? "assembly" : "assemblies"} on the bench` : "All systems together"}</small></div>
        </aside>

        <div className="stage-column" ref={stage}>
          <div className="stage-topbar"><button className="mobile-parts icon-button" aria-label="Show components" onClick={() => setPartsOpen(true)}><LabIcon name="layers" size={18}/></button><div className="mode-tabs" aria-label="Workbench mode">{MODES.map((item) => <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => chooseMode(item.id)} aria-pressed={mode === item.id}><LabIcon name={item.icon} size={16}/>{item.label}</button>)}</div><div className="stage-utilities"><span className="live-view"><span/> LIVE 3D</span><button className="icon-button" title="Reset view (R)" aria-label="Reset view" onClick={resetView}><LabIcon name="reset" size={17}/></button><button className="icon-button" title="Fullscreen" aria-label="Fullscreen" onClick={() => void fullscreen()}><LabIcon name="expand" size={17}/></button></div></div>
          <div className="scene-area">
            <EngineScene ref={scene} selected={selected} removed={removed} mode={mode} exploded={exploded} cutaway={cutaway} xray={xray} isolated={isolated} labels={labels} playing={playing} speed={speed} angle={angle} onSelect={selectPart} onAngle={setAngle} onZoom={setZoomPercent}/>
            <div className="scene-heading"><span className="scene-id">SC–01 <span>/</span> {mode === "run" ? "MOTION STUDY" : mode === "assemble" ? "ASSEMBLY STUDY" : "ENGINE STUDY"}</span><span>{isolated ? part.name : exploded > .05 ? "Exploded perspective" : "Single-cylinder, four-stroke"}</span></div>
            <div className="view-controls"><div className="view-cube" aria-hidden="true"><span className="cube-top">Y</span><span className="cube-front">FRONT</span><span className="cube-right">Z</span></div><select aria-label="Camera angle" value={view} onChange={(event) => chooseView(event.target.value as CameraView)}>{VIEWS.map((item) => <option key={item}>{item}</option>)}</select></div>
            <div className="scene-tools"><button className="icon-button" title="Zoom in" aria-label="Zoom in" onClick={() => scene.current?.zoom(.18)}><LabIcon name="zoomIn" size={18}/></button><div className="zoom-readout" data-testid="viewer-zoom" title="Viewer zoom">{zoomPercent}%</div><button className="icon-button" title="Zoom out" aria-label="Zoom out" onClick={() => scene.current?.zoom(-.18)}><LabIcon name="zoomOut" size={18}/></button><span/><button className="icon-button" title="Focus selected part" aria-label="Focus selected part" onClick={() => scene.current?.focus(selected)}><LabIcon name="crosshair" size={18}/></button></div>
            <div className="axis-key"><span className="axis-y">Y</span><span className="axis-z">Z</span><span className="axis-x">X</span><i/></div>
            <div className="scene-scale">EDUCATIONAL MODEL<span>15 INTERACTIVE ASSEMBLIES</span></div>
            {mode !== "run" && <div className="explode-dock"><button className={exploded > 0 ? "active" : ""} aria-label="Toggle exploded view" aria-pressed={exploded > 0} onClick={() => { setExploded(exploded > 0 ? 0 : 1); setPlaying(false); setTimeout(() => scene.current?.reset(), 50); }}><LabIcon name="layers" size={17}/><span>Exploded view</span></button><input aria-label="Exploded view amount" data-hand-range="explode" type="range" min="0" max="1" step="0.01" value={exploded} onChange={(event) => { setExploded(Number(event.target.value)); setPlaying(false); }}/><span className="explode-value">{Math.round(exploded * 100)}%</span></div>}
            {mode === "run" && <div className="simulation-dock"><button className="play-button" aria-label={playing ? "Pause simulation" : "Play simulation"} onClick={togglePlay}><LabIcon name={playing ? "pause" : "play"} size={17}/></button><div><strong style={{ color: stroke.color }}>{stroke.name} stroke</strong><input type="range" aria-label="Crankshaft angle" data-hand-range="cycle" min="0" max="719.9" step="0.1" value={angle} onChange={(event) => { setPlaying(false); setAngle(Number(event.target.value)); }}/></div><span>{Math.round(angle)}°</span><button className="speed-button" aria-label="Change playback speed" onClick={() => setSpeed(speed === .5 ? 1 : speed === 1 ? 2 : .5)}>{speed}×</button></div>}
          </div>
          <HandTools tool={handTool} onTool={setHandTool} ready={camera.status === "ready"} paused={gestures.paused} hint={gestures.hint} simulating={mode === "run"}/>
          <div className="stage-footer"><span><LabIcon name="pointer" size={13}/> Drag to orbit <i/> Pinch / scroll to zoom <i/> Double-click to focus</span><span className="stage-coordinate">{camera.status === "ready" ? <><span className="status-dot"/> HANDS CONNECTED</> : <><LabIcon name="cube" size={12}/> FREE ORBIT</>}</span></div>
        </div>

        <aside className="details-panel">
          <div className="panel-heading"><span>PART INSPECTOR</span><LabIcon name="crosshair" size={16}/></div>
          <div className="part-detail"><div className="detail-overline"><span>{String(PARTS.findIndex((p) => p.id === selected) + 1).padStart(2, "0")} / 15</span><span className={`installed-badge ${isRemoved ? "removed" : ""}`}>{isRemoved ? "On the bench" : "Installed"}</span></div><div className="detail-icon"><LabIcon name={selected === "plug" ? "spark" : selected === "crankshaft" || selected === "flywheel" ? "rotate" : "cube"} size={31}/><span>{part.group}</span></div><h2>{part.name}</h2><p>{part.description}</p><div className="material-line"><span>MATERIAL</span><strong>{part.material}</strong></div><p className="part-explanation">{part.detail}</p>
            <div className="part-actions"><button className="secondary-button" onClick={() => scene.current?.focus(selected)}><LabIcon name="crosshair" size={15}/>Focus</button><button className={`secondary-button ${isolated ? "active" : ""}`} aria-pressed={isolated} onClick={() => { setIsolated(!isolated); if (!isolated) scene.current?.focus(selected); else scene.current?.reset(); }}><LabIcon name="cube" size={15}/>{isolated ? "Show all" : "Isolate"}</button></div>
          </div>
          <div className="view-options"><span className="section-label">LOOK BENEATH THE SURFACE</span><div><button className={cutaway ? "active" : ""} aria-pressed={cutaway} onClick={() => setCutaway(!cutaway)}><LabIcon name="cut" size={17}/>Cutaway</button><button className={xray ? "active" : ""} aria-pressed={xray} onClick={() => setXray(!xray)}><LabIcon name="eye" size={17}/>X-ray</button><button className={labels ? "active" : ""} aria-pressed={labels} onClick={() => setLabels(!labels)}><LabIcon name="grid" size={17}/>Labels</button></div></div>
          {mode === "run" ? <div className="cycle-panel"><span className="section-label">THE FOUR-STROKE CYCLE</span><div className="stroke-steps">{STROKES.map((item, index) => <button key={item.name} className={cycle.stroke === index ? "active" : ""} style={{ "--stroke-color": item.color } as React.CSSProperties} onClick={() => { setAngle(index * 180 + 1); setPlaying(false); }}><span>{index + 1}</span>{item.name}</button>)}</div><p>{stroke.description}</p><small>Slowed motion · simplified valve timing</small></div> : <div className="assembly-guide"><div className="section-label"><LabIcon name="tool" size={14}/> {mode === "assemble" ? "GUIDED ASSEMBLY" : "LEARN BY TAKING IT APART"}</div><p>{allowed ? isRemoved ? "Everything is ready. Return this assembly to its seat." : "This assembly is ready to remove. Give it a closer look." : <>{isRemoved ? "Install" : "Remove"} {blockers.map((id, index) => <span key={id}>{index > 0 ? ", " : ""}<button className="inline-part" onClick={() => selectPart(id)}>{PART_BY_ID[id].name.toLowerCase()}</button></span>)} first.</>}</p><button className="primary-button" data-testid="part-action" disabled={!allowed || autoInstall} onClick={() => applyPart(selected)}><LabIcon name={isRemoved ? "undo" : "layers"} size={16}/>{isRemoved ? "Install part" : "Remove part"}<LabIcon name={allowed ? "arrow" : "lock"} size={15}/></button><div className="sequence-actions"><button disabled={autoInstall || !nextRemoval(removed)} onClick={() => { const id = nextRemoval(removed); if (id) applyPart(id); }}>Remove next <LabIcon name="chevron" size={12}/></button><button disabled={!removed.length} onClick={() => autoInstall ? setAutoInstall(false) : resetAssembly()}>{autoInstall ? "Pause assembly" : "Reassemble all"}</button></div></div>}
        </aside>
      </section>

      <section data-camera-status={camera.status} className={`hand-panel ${cameraActive || camera.status === "error" || handHelp ? "expanded" : ""}`} aria-label="Hand controls">
        <div className="hand-panel-intro"><div className="hand-orbit-icon"><LabIcon name="hand" size={25}/><span/></div><div><div className="hand-title">A more hands-on experience.<span className="mini-beta">EXPERIMENTAL</span></div><p>Your webcam. Your hands. A whole new way to explore.</p></div><button className="text-button" onClick={() => setHandHelp(!handHelp)}>{handHelp ? "Hide gestures" : "Meet hand controls"}<LabIcon name="arrow" size={15}/></button></div>
        <div className="hand-expanded-content">
          <div className={`camera-preview ${camera.previewLive ? "live" : ""}`}><video ref={camera.videoRef} muted playsInline autoPlay/><canvas ref={camera.overlayRef} width="320" height="240"/>{!camera.previewLive && <div className="camera-placeholder"><LabIcon name={camera.status === "error" ? "cameraOff" : "camera"} size={28}/><span>{camera.status === "requesting" ? "Waiting for camera permission…" : camera.detail || "Your camera preview"}</span></div>}<span className="preview-badge"><span className={`status-dot ${camera.status !== "ready" ? "amber" : ""}`}/>{camera.status === "ready" ? `${camera.count} ${camera.count === 1 ? "hand" : "hands"} detected` : camera.previewLive ? "CAMERA ON" : camera.status === "requesting" ? "OPENING CAMERA" : "CAMERA OFF"}</span></div>
          <div className="gesture-instructions"><div className="camera-settings">
            <label>Camera<select aria-label="Choose camera" value={camera.selectedDevice} onChange={(event) => camera.selectDevice(event.target.value)}><option value="">Automatic camera</option>{camera.devices.filter((device) => device.id).map((device) => <option key={device.id} value={device.id}>{device.label}</option>)}</select></label>
            <button className="secondary-button" onClick={() => void camera.refreshDevices()}>Refresh cameras</button>
            <a href="/camera-check" className="camera-check-link">Open camera-only test <LabIcon name="arrow" size={12}/></a>
          </div>{camera.detail && <p className="camera-detail" role="status">{camera.detail}{camera.cameraName ? ` · ${camera.cameraName}` : ""}</p>}<div className="gesture-title"><strong>{camera.status === "ready" ? gestures.hint : "Your hands are the controller."}</strong>{gestures.paused && camera.status === "ready" && <button onClick={gestures.resume}>Resume controls</button>}</div><div className="gesture-grid"><div><span>01</span><strong>Pinch & rotate</strong><p>Choose Rotate / grab. Pinch over the engine and move. Pinch and release over a button to click.</p></div><div><span>02</span><strong>Zoom with your fingers</strong><p>Choose Finger zoom and pinch over the engine. Spread thumb and index to zoom in; close to zoom out. Lower your hand to stop.</p></div><div><span>03</span><strong>Two-hand zoom</strong><p>In any tool, pinch with both hands. Spread hands apart to zoom in, or bring them together to zoom out.</p></div><div><span>04</span><strong>Move the view</strong><p>Choose Pan. Pinch and move your hand left, right, up, or down. Release to stop.</p></div><div><span>05</span><strong>Separate the parts</strong><p>Choose Separate parts. Pinch and lift to spread the assemblies, or lower your hand to bring them together.</p></div><div><span>06</span><strong>Grab an assembly</strong><p>Choose Rotate / grab in Assemble. Pinch a part, move your hand, then release to remove or install.</p></div><div><span>07</span><strong>Focus & reset</strong><p>Point at Focus or Reset view and pinch to click. You can also pinch the + and − buttons for small zoom steps.</p></div><div><span>08</span><strong>Open palm to pause</strong><p>Hold an open palm for one second. Hold again to resume. Losing the hand cancels a grab or finger zoom.</p></div></div><div className="camera-privacy"><LabIcon name="lock" size={13}/>Camera frames are processed on this device. No audio is captured.<span>Point at top / bottom screen edge to scroll</span></div>{camera.error && <p className="camera-error" role="alert">{camera.error}</p>}{camera.status === "preview" && <button className="secondary-button" onClick={camera.retryTracking}><LabIcon name="hand" size={15}/>Retry hand tracking</button>}{!cameraActive && <button className="secondary-button" onClick={() => { gestures.resume(); void camera.start(); }}><LabIcon name="camera" size={15}/>{camera.status === "error" ? "Try camera again" : "Enable camera"}</button>}</div>
        </div>
      </section>

      <section className="discovery-cards" aria-label="Explore the workbench"><button onClick={() => { chooseMode("inspect"); setCutaway(true); }}><span className="discovery-icon"><LabIcon name="eye" size={22}/></span><div><strong>Nothing left unseen.</strong><p>Orbit, isolate, and look inside every part.</p></div><LabIcon name="arrow" size={17}/></button><button onClick={() => chooseMode("assemble")}><span className="discovery-icon"><LabIcon name="layers" size={22}/></span><div><strong>Understand the connections.</strong><p>Follow each step from assembly to insight.</p></div><LabIcon name="arrow" size={17}/></button><button onClick={() => chooseMode("run")}><span className="discovery-icon"><LabIcon name="play" size={22}/></span><div><strong>See the theory in motion.</strong><p>Explore all four strokes, at your own pace.</p></div><LabIcon name="arrow" size={17}/></button></section>
      <footer className="lab-footer"><span><span className="footer-dot"/> Built for curiosity.</span><span>SC–01 is a simplified learning model, not a service or engineering simulator.</span><button onClick={() => setGuideOpen(true)}>Controls & model notes <LabIcon name="arrow" size={12}/></button></footer>
    </main>
    {notice && <div className="lab-toast" role="status"><LabIcon name="info" size={17}/>{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}><LabIcon name="close" size={15}/></button></div>}
    <div className="hand-cursor" ref={gestures.cursorRef} style={{ display: "none" }}><span/></div>
    <dialog className="guide-dialog" ref={guideRef} onCancel={() => setGuideOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) setGuideOpen(false); }}><div className="guide-content"><button className="icon-button guide-close" aria-label="Close guide" onClick={() => setGuideOpen(false)}><LabIcon name="close"/></button><div className="eyebrow">WELCOME TO YOUR WORKBENCH</div><h2>A little curiosity.<br/>A lot to discover.</h2><p>Meet SC–01, a small, air-cooled, single-cylinder engine concept. Every visible component belongs to one of 15 interactive assemblies.</p><div className="guide-sections"><section><h3><LabIcon name="eye" size={20}/>01 / Inspect</h3><p>Drag to rotate freely, including underneath. Scroll or use +/− to zoom. Right-drag to pan. Double-click a part to focus, or select it in the component list. Use the camera menu for front, back, side, top and bottom views.</p><p>Exploded view separates assemblies. Cutaway slices the housing; X-ray makes it transparent. Isolate shows only the selected assembly.</p></section><section><h3><LabIcon name="tool" size={20}/>02 / Assemble</h3><p>Remove parts in a guided order. The inspector explains which connections need to come apart first. “Remove next” takes the next valid step; “Reassemble all” returns each part in reverse dependency order. You can pause this sequence at any point.</p></section><section><h3><LabIcon name="play" size={20}/>03 / Simulate</h3><p>With all parts installed, explore the four-stroke cycle. Play or pause with Space, scrub through 720° of crankshaft rotation, or change the playback speed. Piston and rod positions follow a slider–crank relationship.</p></section><section><h3><LabIcon name="hand" size={20}/>04 / Go hands-free</h3><p>Enable your webcam and allow camera access. Point with your index finger, then pinch and release over a button to click. Pinch and move over the model to orbit in Inspect, or to remove/install a part in Assemble. Choose Finger zoom beneath the viewer: pinch over the engine, then spread your thumb and index finger to zoom in or bring them together to zoom out. Lower your hand to stop. You can also pinch with both hands and change the distance between them to zoom in any tool. Choose Pan to reposition the view, or Separate parts to spread the assemblies by pinching and lifting. Hold an open palm for a second to pause or resume controls.</p><p>Point near the top or bottom screen edge without pinching to scroll. Keep hands well lit and visible. Tracking is experimental; the mouse works at all times. Camera access requires localhost or HTTPS on another device. Frames stay on your device.</p></section></div><div className="model-note"><LabIcon name="info" size={18}/><p>This is a procedural educational model. Fasteners are grouped, valve timing and the timing drive are simplified, and combustion, heat, loads and physical collisions are not calculated. Hand controls manipulate the model on your screen; they do not create a physical hologram.</p></div><button className="primary-button" onClick={() => setGuideOpen(false)}>Back to exploring<LabIcon name="arrow" size={17}/></button></div></dialog>
  </div>;
}
