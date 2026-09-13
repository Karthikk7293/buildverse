"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { BLUEPRINTS, CARRY_LIMIT, SITE, blueprintFor, completion, distance, total, type BlueprintId, type GameMode, type Material, type Position } from "@/lib/game";
import { useGame } from "@/hooks/useGame";
import { useVoice } from "@/hooks/useVoice";
import { Icon } from "./Icon";
import BlueprintArt from "./BlueprintArt";
import type { WorldHandle } from "./World";

const World = dynamic(() => import("./World"), { ssr: false, loading: () => <div className="forest-loading"><span className="loading-tree"><Icon name="trees" size={40}/></span><strong>Finding a little forest magic…</strong><span>Your adventure is taking shape.</span></div> });
type Modal = "guide" | "settings" | "leave" | null;
const materials: Material[] = ["wood", "stone", "glass"];

function MiniMap({ players }: { players: { x: number; z: number; slot: number }[] }) {
  return <svg viewBox="0 0 130 94" className="minimap" aria-label="Forest minimap">
    <rect x="1" y="1" width="128" height="92" rx="11" fill="#f5f6e8" fillOpacity=".92"/>
    <rect x="8" y="8" width="114" height="78" rx="4" fill="#a3b886"/>
    <path d="M26 8c-9 15 10 23 1 39S25 71 27 86" stroke="#b7dcd5" strokeWidth="9"/>
    {[40, 54, 69, 83, 97, 111].map((x) => <path key={x} d={`m${x} 13-4 8h8l-4-8Zm4 8-4 8h8l-4-8Z`} fill="#5d825a"/>)}
    <path d="m108 34-5 10h10l-5-10Zm0 14-5 10h10l-5-10ZM45 65l-5 10h10l-5-10Zm51 0-5 10h10l-5-10Z" fill="#688b60"/>
    <rect x="56" y="37" width="27" height="20" rx="2" fill="#ebd69c" stroke="#f6f3d5" strokeWidth="2" strokeDasharray="3 2"/>
    <rect x="62" y="41" width="15" height="12" rx="1" fill="#728368"/>
    {players.map((p) => <circle key={p.slot} cx={65 + p.x * 3.6} cy={47 + p.z * 2.8} r="3.8" fill={p.slot ? "#639da9" : "#ecc064"} stroke="white" strokeWidth="1.5"/>)}
  </svg>;
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const elements = ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href], [tabindex="0"]');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", handleKey); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={ref}>
    <div className="modal-heading"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close"/></button></div>{children}
  </div></div>;
}

export default function Game() {
  const game = useGame();
  const voice = useVoice(game.socket, game.state?.mode === "solo" ? null : game.playerId, game.state?.hostId);
  const [selected, setSelected] = useState<BlueprintId>("cabin");
  const [selectedMode, setSelectedMode] = useState<GameMode>("multiplayer");
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [roomMode, setRoomMode] = useState<"create" | "join">("create");
  const [modal, setModal] = useState<Modal>(null);
  const [quality, setQuality] = useState(true);
  const [ambient, setAmbient] = useState(false);
  const [copied, setCopied] = useState(false);
  const [networkExpanded, setNetworkExpanded] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const sceneRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<WorldHandle>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const ambientRef = useRef<{ context: AudioContext; gain: GainNode; source: AudioBufferSourceNode } | null>(null);
  const blueprintId = game.state?.blueprint ?? selected;
  const blueprint = blueprintFor(blueprintId);
  const mode = game.state?.mode ?? selectedMode;
  const solo = mode === "solo";
  const me = game.state?.players.find((p) => p.id === game.playerId);
  const isHost = !game.state || game.state.hostId === game.playerId;
  const playing = game.state?.status === "playing";
  const finished = game.state?.status === "won" || game.state?.status === "lost";
  const progress = game.state ? completion(game.state) : 0;
  const closeModal = useCallback(() => setModal(null), []);
  const doInteract = useCallback(() => { if (playing) game.interact(); }, [playing, game.interact]);
  const clickMove = useCallback((position: Position) => {
    if (playing && !modal) game.move(position, true);
    else if (!game.state) game.setNotice(solo ? "Pick your blueprint, enter a name, and start your solo build to explore." : "Like the view? Create a room and invite a friend to start exploring.");
  }, [playing, modal, solo, game.move, game.state, game.setNotice]);
  useEffect(() => {
    setName(localStorage.getItem("buildverse-name") || "");
    setQuality(localStorage.getItem("buildverse-quality") !== "low");
    setSelectedMode(localStorage.getItem("buildverse-mode") === "solo" ? "solo" : "multiplayer");
    const params = new URLSearchParams(window.location.search);
    const code = params.get("room");
    if (code) { setRoomCode(code.slice(0, 6).toUpperCase()); setRoomMode("join"); setSelectedMode("multiplayer"); }
  }, []);
  useEffect(() => {
    if (!playing || modal || !game.connected) return;
    const pressed = new Set<string>();
    const editable = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
    const update = () => {
      const horizontal = (pressed.has("d") || pressed.has("arrowright") ? 1 : 0) - (pressed.has("a") || pressed.has("arrowleft") ? 1 : 0);
      const vertical = (pressed.has("s") || pressed.has("arrowdown") ? 1 : 0) - (pressed.has("w") || pressed.has("arrowup") ? 1 : 0);
      game.move({ x: (horizontal + vertical) * Math.SQRT1_2, z: (vertical - horizontal) * Math.SQRT1_2 });
    };
    const down = (event: KeyboardEvent) => {
      if (editable(event.target)) return;
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) { event.preventDefault(); if (!pressed.has(key)) { pressed.add(key); update(); } }
      if (key === "e" && !event.repeat) { event.preventDefault(); game.interact(); }
    };
    const up = (event: KeyboardEvent) => { if (pressed.delete(event.key.toLowerCase())) update(); };
    const blur = () => { pressed.clear(); update(); };
    window.addEventListener("keydown", down); window.addEventListener("keyup", up); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); game.move({ x: 0, z: 0 }); };
  }, [playing, modal, game.connected, game.move, game.interact]);
  useEffect(() => {
    const handler = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);
  useEffect(() => () => { void ambientRef.current?.context.close(); }, []);
  const toggleAmbient = async () => {
    try {
      if (ambientRef.current) {
        if (ambient) await ambientRef.current.context.suspend(); else await ambientRef.current.context.resume();
        setAmbient(!ambient); return;
      }
      const context = new AudioContext();
      const buffer = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
      const data = buffer.getChannelData(0); let last = 0;
      for (let i = 0; i < data.length; i++) { last = (last + 0.025 * (Math.random() * 2 - 1)) / 1.025; data[i] = last * 3; }
      const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
      const filter = context.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 900;
      const gain = context.createGain(); gain.gain.value = 0.15;
      source.connect(filter); filter.connect(gain); gain.connect(context.destination); source.start();
      await context.resume(); ambientRef.current = { context, source, gain }; setAmbient(true);
    } catch { game.setNotice("Your browser couldn’t start forest audio. Try again after checking sound permissions."); }
  };
  const chooseBlueprint = (id: BlueprintId) => { if (!isHost || playing || finished) return; setSelected(id); if (game.state) game.selectBlueprint(id); };
  const chooseMode = (next: GameMode) => {
    if (game.state || game.busy) return;
    setSelectedMode(next); localStorage.setItem("buildverse-mode", next);
    setRoomMode("create"); setNetworkExpanded(false); game.setError(""); game.setNotice("");
  };
  const submitRoom = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { nameRef.current?.focus(); return; }
    localStorage.setItem("buildverse-name", name.trim());
    if (solo || roomMode === "create") game.createRoom(name, selected, mode); else game.joinRoom(name, roomCode);
  };
  const copyInvite = async () => {
    if (!game.state || solo) return;
    const url = `${game.networkUrls[0] ?? window.location.origin}/?room=${game.state.code}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); }
    catch { setNetworkExpanded(true); game.setNotice("Copy the room link from the network details below."); }
  };
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await sceneRef.current?.requestFullscreen(); }
    catch { game.setNotice("Fullscreen isn’t available in this browser. You can still zoom into the forest."); }
  };
  const minute = String(Math.floor(game.remaining / 60)).padStart(2, "0");
  const second = String(game.remaining % 60).padStart(2, "0");
  const atSite = Boolean(me && distance(me, SITE) < 4.1);
  const nearby = Boolean(me && game.state?.resources.some((r) => !r.collected && distance(me, r) < 2));

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="/" aria-label="Buildverse home" onClick={(event) => { if (game.state) { event.preventDefault(); setModal("leave"); } }}><span className="brand-mark"><Icon name="cube" size={27}/></span><span>buildverse<span className="brand-period">.</span></span></a>
      <nav className="main-nav" aria-label="Main navigation"><button className={modal !== "guide" ? "nav-link active" : "nav-link"} onClick={() => setModal(null)}><Icon name="trees" size={17}/>Playground</button><button className={modal === "guide" ? "nav-link active" : "nav-link"} onClick={() => setModal("guide")}><Icon name="book" size={17}/>Field guide</button></nav>
      <div className="header-actions"><span className="network-status"><span className={`status-dot ${game.connected ? "" : "offline"}`}/>{game.connected ? solo ? "Solo adventure" : "Local network" : "Connecting…"}</span><span className="header-divider"/><button className="icon-button" aria-label={ambient ? "Mute forest sounds" : "Enable forest sounds"} title="Forest sounds" onClick={() => void toggleAmbient()}><Icon name={ambient ? "volume" : "muted"}/></button><button className="icon-button" aria-label="Open settings" onClick={() => setModal("settings")}><Icon name="settings"/></button><span className="profile-avatar" title={name || "Builder"}>{name ? name[0].toUpperCase() : <Icon name="leaf" size={19}/>}</span></div>
    </header>

    <main>
      <section className="page-intro">
        <div><div className="eyebrow"><span className="tiny-star">✳</span> SMALL WORLD. BIG POSSIBILITIES.</div><h1>{solo ? "Make it your own" : "Better built together"}<span>.</span></h1><p>{solo ? "Just you, the forest, and a ten-minute challenge. Let’s see what you can build." : "A friend, a forest, and a little imagination. Let’s make something great."}</p></div>
        <div className="game-facts"><div><Icon name={solo ? "leaf" : "users"} size={19}/><span><strong>{solo ? "1 player" : "2 players"}</strong><small>{solo ? "Your own adventure" : "One great team"}</small></span></div><span className="fact-divider"/><div><Icon name="clock" size={19}/><span><strong>10 minutes</strong><small>Make them count</small></span></div></div>
      </section>

      <div className="game-layout">
        <section className="field-card" aria-label="Game field">
          <div className={`scene ${fullscreen ? "is-fullscreen" : ""}`} ref={sceneRef}>
            <World ref={worldRef} state={game.state} blueprint={selected} playerId={game.playerId} onMove={clickMove} quality={quality}/>
            <div className="scene-top">
              <div className="location"><span className="location-icon"><Icon name="trees" size={25}/></span><div><h2>Pinewood Valley <span className="map-number">01</span></h2><span><span className="status-dot"/> {playing ? "Build in progress" : finished ? "Adventure complete" : "A good place to begin"}</span></div></div>
              <div className={`game-timer ${game.remaining < 60 ? "urgent" : ""}`} aria-label={`${minute} minutes ${second} seconds remaining`}><span><Icon name="clock" size={13}/>{playing ? "TIME REMAINING" : finished ? "TIME’S UP" : "BUILD TIME"}</span><strong>{minute}<span>:</span>{second}</strong><div className="timer-track"><div style={{ width: `${game.remaining / 600 * 100}%` }}/></div></div>
            </div>
            <div className="scene-badge"><span className={`status-dot ${playing ? "pulse" : ""}`}/>{playing ? solo ? "SOLO ADVENTURE" : "LIVE CO-OP" : finished ? "BUILD COMPLETE" : "EXPLORE YOUR NEXT ADVENTURE"}</div>
            <div className="weather"><Icon name="sun" size={16}/><span>A little sunshine. A fresh start.</span></div>
            <div className="build-site-label"><Icon name="flag" size={12}/>{playing ? `${Math.floor(progress)}% BUILT` : "YOUR BUILDING SITE"}</div>
            <div className="scene-bottom">
              <div className="scene-caption"><span className="preview-pill"><span/>{playing ? solo ? "BUILDING YOUR OWN WAY" : "WORKING TOGETHER" : "WORLD PREVIEW"}</span><p>{playing ? "Good things happen one block at a time." : "Your blank canvas is anything but empty."}</p></div>
              <div className="map-tools"><div className="camera-controls"><button aria-label="Zoom in" title="Zoom in" onClick={() => worldRef.current?.zoom(0.2)}><Icon name="plus" size={17}/></button><button aria-label="Zoom out" title="Zoom out" onClick={() => worldRef.current?.zoom(-0.2)}><Icon name="minus" size={17}/></button><span/><button aria-label="Reset camera" title="Reset camera" onClick={() => worldRef.current?.reset()}><Icon name="compass" size={18}/></button><button aria-label="Toggle fullscreen" title="Fullscreen" onClick={() => void toggleFullscreen()}><Icon name="expand" size={16}/></button></div><MiniMap players={game.state?.players ?? [{ x: -3, z: 4, slot: 0 }]}/></div>
            </div>
            {playing && <div className="interact-prompt"><button onClick={doInteract}><kbd>E</kbd>{atSite && me && total(me.inventory) > 0 ? "Place your blocks" : nearby ? "Collect resources" : "Collect / build"}</button></div>}
            {game.notice && <div className="toast" role="status"><Icon name="sparkles" size={17}/>{game.notice}</div>}
            {game.state && !game.connected && <div className="connection-overlay"><span className="spinner"/><strong>Finding your way back…</strong><p>Reconnecting to your room. The shared timer keeps running.</p></div>}
            {finished && <div className="result-overlay"><div className="result-card"><span className={`result-icon ${game.state?.status === "won" ? "won" : ""}`}><Icon name={game.state?.status === "won" ? "trophy" : "leaf"} size={36}/></span><div className="eyebrow">{game.state?.status === "won" ? "A LITTLE FOREST MAGIC" : "EVERY BUILD IS A NEW BEGINNING"}</div><h2>{game.state?.status === "won" ? "Look what you built." : "So close. Grow again."}</h2><p>{game.state?.status === "won" ? solo ? "From scattered blocks to something beautiful. You made it happen." : "Two builders, one beautiful home. You did it together." : "The clock ran out, but your next great adventure is waiting."}</p><div className="result-stats"><span><strong>{progress.toFixed(1)}%</strong>completed</span><span><strong>{game.state?.players.reduce((sum, p) => sum + p.delivered, 0)}</strong>blocks placed</span></div><p className="result-rule">More than 95% completed at 10:00 wins.</p>{isHost ? <button className="primary-button" onClick={game.rematch}><Icon name="rotate" size={17}/>Build again</button> : <span className="waiting-note">Waiting for the host to start a new build.</span>}<button className="text-button" onClick={() => { voice.stop(); game.leave(); }}>Back to the clearing</button></div></div>}
          </div>
          <div className="field-bottom-bar">
            <div className="movement-help"><span className="key-cluster"><kbd>W</kbd><span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span><div><strong>Find your way</strong><span>Move with keys or click the ground</span></div></div>
            <div className="interact-help"><kbd>E</kbd><div><strong>A little hands-on</strong><span>Collect & place blocks</span></div></div>
            <button className="guide-shortcut" onClick={() => setModal("guide")} aria-label="How to play"><Icon name="help" size={18}/><span>How to play</span></button>
          </div>
        </section>

        <aside className="build-panel">
          <div className="panel-heading"><span className="eyebrow">{playing || finished ? solo ? "YOUR SOLO PROJECT" : "YOUR SHARED PROJECT" : "LET’S MAKE A PLAN"}</span><span className="panel-flower">✳</span><h2>{playing || finished ? "Taking shape." : "Small plans. Big things."}</h2><p>{playing ? "Find your rhythm. Build something real." : finished ? solo ? "A little imagination goes a long way." : "A little teamwork goes a long way." : solo ? "Pick a blueprint. Take on your own challenge." : "Pick a blueprint. Bring your favorite human."}</p></div>
          <div className="play-mode" role="group" aria-label="Game mode">
            <button type="button" className={solo ? "selected" : ""} aria-pressed={solo} disabled={Boolean(game.state) || game.busy} onClick={() => chooseMode("solo")}><Icon name="leaf" size={18}/><span>Single player<small>A solo adventure</small></span></button>
            <button type="button" className={!solo ? "selected" : ""} aria-pressed={!solo} disabled={Boolean(game.state) || game.busy} onClick={() => chooseMode("multiplayer")}><Icon name="users" size={18}/><span>Multiplayer<small>Build with a friend</small></span></button>
          </div>
          <p className="play-mode-note">{game.state ? "Leave this build to choose another mode." : solo ? "Start your challenge whenever you’re ready." : "Two builders, connected on the same network."}</p>
          {!playing && !finished ? <>
            <div className="step-label"><span>01</span> CHOOSE YOUR BUILD <small>3 blueprints</small></div>
            <div className="blueprint-list">{BLUEPRINTS.map((item) => <button key={item.id} className={`blueprint-option ${blueprintId === item.id ? "selected" : ""}`} onClick={() => chooseBlueprint(item.id)} disabled={!isHost} aria-pressed={blueprintId === item.id} aria-label={`Select ${item.name}`}><div className="blueprint-thumbnail"><BlueprintArt kind={item.id}/></div><div className="blueprint-info"><strong>{item.name}</strong><span><span className={`difficulty ${item.id}`}>{item.difficulty}</span><span className="material-count">{total(item.materials)} blocks</span></span></div><span className="selection-circle">{blueprintId === item.id && <Icon name="check" size={11}/>}</span></button>)}</div>
            <div className="resource-summary">{materials.map((kind) => <span key={kind} className={`resource-chip ${kind}`}><Icon name={kind} size={15}/>{blueprint.materials[kind]} <span>{kind}</span></span>)}</div>
            {!isHost && <div className="host-note">Your host chooses the blueprint.</div>}
          </> : <>
            <div className="active-blueprint"><BlueprintArt kind={blueprintId} large/><div><span className="eyebrow">THE BLUEPRINT</span><h3>{blueprint.name}</h3><p>{blueprint.subtitle}</p></div></div>
            <div className="progress-heading"><strong>{solo ? "Your progress" : "Built together"}</strong><span>{Math.floor(progress)}<small>%</small></span></div><div className="build-progress"><div style={{ width: `${progress}%` }}/><span className="win-marker" title="95% win threshold"/></div><div className="progress-note"><span>{total(game.state!.built)} of {total(blueprint.materials)} blocks</span><span>Goal: &gt;95%</span></div>
            <div className="materials-needed">{materials.map((kind) => <div key={kind}><span className={`material-icon ${kind}`}><Icon name={kind} size={19}/></span><span><strong>{kind[0].toUpperCase() + kind.slice(1)}</strong><span className="tiny-progress"><span style={{ width: `${game.state!.built[kind] / blueprint.materials[kind] * 100}%` }}/></span></span><span>{game.state!.built[kind]}<small> / {blueprint.materials[kind]}</small></span></div>)}</div>
            <div className="backpack"><div><Icon name="backpack" size={18}/><strong>Your backpack</strong><span>{me ? total(me.inventory) : 0}/{CARRY_LIMIT}</span></div><div className="backpack-items">{materials.map((kind) => <span key={kind} className={`resource-chip ${kind}`}><Icon name={kind} size={17}/>{me?.inventory[kind] ?? 0}</span>)}</div>{playing && <button className="primary-button compact" onClick={doInteract}><kbd>E</kbd>{atSite ? "Place blocks" : "Collect nearby blocks"}<Icon name="arrow" size={16}/></button>}</div>
          </>}

          <div className="panel-divider"/>
          <div className="step-label"><span>{playing || finished ? <Icon name="users" size={13}/> : "02"}</span> {solo ? playing || finished ? "THE BUILDER" : "YOUR ADVENTURE" : playing || finished ? "YOUR BUILDING CREW" : "BRING A BUDDY"}<small>{game.state?.players.length ?? 0} / {solo ? "1 builder" : "2 builders"}</small></div>
          {!game.state ? <form className="room-form" onSubmit={submitRoom}>
            <label htmlFor="builder-name">What should we call you?</label><div className="name-input-wrap"><span className="mini-avatar"><Icon name="leaf" size={15}/></span><input ref={nameRef} id="builder-name" placeholder="Your builder name" value={name} onChange={(event) => setName(event.target.value)} maxLength={18} autoComplete="nickname" required/><span className="input-hint">YOU</span></div>
            {!solo && <div className="room-mode" role="group" aria-label="Room mode"><button type="button" aria-pressed={roomMode === "create"} className={roomMode === "create" ? "active" : ""} onClick={() => { setRoomMode("create"); game.setError(""); }}>Create a room</button><button type="button" aria-pressed={roomMode === "join"} className={roomMode === "join" ? "active" : ""} onClick={() => { setRoomMode("join"); game.setError(""); }}>Join a friend</button></div>}
            {!solo && roomMode === "join" && <div className="room-code-input"><label htmlFor="room-code">Your friend’s room code</label><input id="room-code" placeholder="ABC123" value={roomCode} onChange={(event) => setRoomCode(event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())} minLength={6} maxLength={6} required autoComplete="off"/></div>}
            {game.error && <p className="inline-error" role="alert">{game.error}</p>}
            <button className="primary-button" type="submit" disabled={game.busy}>{game.busy ? <><span className="spinner"/>{solo ? "Preparing your adventure…" : "Making room…"}</> : <>{solo ? "Start solo build" : roomMode === "create" ? "Let’s build together" : "Join the adventure"}<Icon name="arrow" size={18}/></>}</button><p className="room-footnote"><Icon name={solo ? "leaf" : "wifi"} size={13}/>{solo ? "One builder. Ten minutes. Make it yours." : "Same Wi-Fi. Same world. Better together."}</p>
          </form> : <div className="room-lobby">
            {game.state.players.map((player) => <div className="player-row" key={player.id}><span className={`builder-avatar slot-${player.slot}`}><Icon name="users" size={18}/></span><div><strong>{player.name}{player.id === game.playerId && <small> (you)</small>}</strong><span>{player.connected ? playing ? `${player.delivered} blocks placed` : solo ? "Solo builder" : player.id === game.state?.hostId ? "The trailblazer · Host" : "Your building buddy" : "Reconnecting…"}</span></div><span className={`player-state ${player.ready || playing ? "is-ready" : ""}`}>{!player.connected ? "Away" : playing ? <span className="status-dot"/> : player.ready ? <><Icon name="check" size={12}/>Ready</> : "Not ready"}</span></div>)}
            {!solo && game.state.players.length < 2 && <div className="player-row empty-player"><span className="builder-avatar"><Icon name="plus" size={20}/></span><div><strong>A spot for your person</strong><span>Invite a friend to start the adventure</span></div></div>}
            {!playing && !finished && <>{!solo && <div className="invite-code"><span><small>YOUR ROOM CODE</small><strong>{game.state.code}</strong></span><button className="copy-button" onClick={() => void copyInvite()} aria-label="Copy invite link"><Icon name={copied ? "check" : "copy"} size={16}/>{copied ? "Copied!" : "Invite friend"}</button></div>}<button className={`primary-button ${me?.ready ? "ready-button" : ""}`} onClick={game.ready} disabled={!game.connected}>{solo ? <>Start solo build<Icon name="arrow" size={18}/></> : me?.ready ? <><Icon name="check" size={18}/>Ready! Waiting for your buddy</> : <>I’m ready to build<Icon name="arrow" size={18}/></>}</button><p className="room-footnote">{solo ? "Your ten minutes begin when you start the build." : "The timer starts when both builders are ready."}</p></>}
            {!solo && <div className="voice-controls"><span><span className={`status-dot ${voice.enabled ? "" : "offline"}`}/>{voice.enabled ? voice.muted ? "Microphone muted" : voice.status : "A little conversation helps"}</span><button className={`icon-button ${voice.enabled && !voice.muted ? "mic-active" : ""}`} aria-label={voice.enabled ? voice.muted ? "Unmute microphone" : "Mute microphone" : "Enable voice chat"} title={voice.enabled ? "Toggle microphone" : "Enable voice chat"} onClick={voice.toggleMute} disabled={voice.busy}><Icon name={voice.enabled && !voice.muted ? "mic" : "micOff"} size={17}/></button>{voice.enabled && <button className="icon-button" aria-label="Disconnect voice chat" onClick={voice.stop}><Icon name="close" size={15}/></button>}</div>}
            {!solo && voice.error && <p className="inline-error" role="alert">{voice.error}</p>}
            {game.error && <p className="inline-error" role="alert">{game.error}</p>}
            <div className="lobby-links">{!solo && <button className="text-button" onClick={() => setNetworkExpanded(!networkExpanded)}><Icon name="wifi" size={12}/>Network details</button>}<button className="text-button" onClick={() => setModal("leave")}><Icon name="logOut" size={12}/>{solo ? "Leave solo build" : "Leave room"}</button></div>
            {!solo && networkExpanded && <div className="network-details"><strong>Invite someone on your network</strong><p>Have your friend open a link below and enter room <b>{game.state.code}</b>.</p>{(game.networkUrls.length ? game.networkUrls : [typeof window !== "undefined" ? window.location.origin : ""]).map((url) => <input key={url} readOnly aria-label="Local network invite URL" value={`${url}/?room=${game.state!.code}`} onFocus={(event) => event.target.select()}/>)}<small>Use HTTPS on both devices to enable voice.</small></div>}
          </div>}
        </aside>
      </div>

      <section className="how-it-works" aria-label="Game rules">
        <div className="how-intro"><span className="eyebrow">A SIMPLE LITTLE ADVENTURE</span><h3>{solo ? "Great things start with you." : "Good things take two."}</h3></div>
        <div className="how-step"><span className="how-icon find"><Icon name="wood" size={23}/></span><div><strong><span>01.</span> Find your resources</strong><p>A few useful things are scattered around.</p></div></div>
        <div className="how-step"><span className="how-icon build"><Icon name="cube" size={23}/></span><div><strong><span>02.</span> {solo ? "Bring your blueprint to life" : "Build something together"}</strong><p>Bring your blocks to the marked clearing.</p></div></div>
        <div className="how-step"><span className="how-icon win"><Icon name="flag" size={23}/></span><div><strong><span>03.</span> Beat the clock</strong><p>{solo ? "Build over 95% in 10 minutes. Make it happen." : "Build over 95% in 10 minutes. Win as a team."}</p></div></div>
      </section>
    </main>
    <footer className="site-footer"><span><Icon name="leaf" size={14}/>Less scrolling. More building.</span><span>Made for a little human connection.</span><button onClick={() => setModal("guide")}>A few friendly rules<Icon name="arrow" size={13}/></button></footer>

    {modal === "guide" && <ModalShell title="Every great build starts here." onClose={closeModal}><div className="guide-banner"><Icon name="trees" size={37}/><span>Solo or together. One forest.<br/><strong>Ten minutes of possibility.</strong></span></div><ol className="guide-steps"><li><span>01</span><div><h3>Choose your adventure</h3><p>Select <strong>Single player</strong> for your own challenge, or <strong>Multiplayer</strong> to build with a friend. Pick a blueprint and enter your name. For multiplayer, connect both computers to the same local network and share the room’s invitation link. Multiplayer rooms hold two builders.</p></div></li><li><span>02</span><div><h3>Ready, set, wander</h3><p>In single player, click “Start solo build” to begin immediately. In multiplayer, both players click “I’m ready to build” to start the 10-minute clock. Use <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>, arrow keys, or click the ground to move.</p></div></li><li><span>03</span><div><h3>A little gathering, a little building</h3><p>Get close to wood crates, stone, or glass crystals and press <kbd>E</kbd> to pick up a bundle. Your backpack holds six blocks. Return to the arrow-marked site and press <kbd>E</kbd> to place everything the blueprint needs.</p></div></li><li><span>04</span><div><h3>Make something worth celebrating</h3><p>Complete <strong>more than 95%</strong> of the building before the clock reaches zero to win in either mode. The result is decided at the deadline, so keep building even after you reach the goal.</p></div></li></ol><div className="guide-voice"><Icon name="mic" size={21}/><p>Want to talk it through? Both builders can enable voice chat for an open, two-way conversation. Microphone access requires HTTPS on your network, or localhost.</p></div><button className="primary-button" onClick={closeModal}>Into the forest<Icon name="arrow" size={18}/></button></ModalShell>}
    {modal === "settings" && <ModalShell title="Make yourself at home." onClose={closeModal}><p className="modal-subtitle">A few little things to make your adventure yours.</p><div className="setting-row"><span><strong>Forest ambience</strong><small>A soft breeze through the pines.</small></span><button className={`switch ${ambient ? "on" : ""}`} role="switch" aria-checked={ambient} aria-label="Forest ambience" onClick={() => void toggleAmbient()}><span/></button></div><div className="setting-row"><span><strong>Detailed shadows</strong><small>Turn off for a lighter game on older computers.</small></span><button className={`switch ${quality ? "on" : ""}`} role="switch" aria-checked={quality} aria-label="Detailed shadows" onClick={() => { setQuality(!quality); localStorage.setItem("buildverse-quality", quality ? "low" : "high"); }}><span/></button></div><div className="setting-row"><span><strong>Voice chat</strong><small>{solo ? "Available in Multiplayer mode." : voice.enabled ? voice.status : "Talk with your teammate, hands free."}</small></span><button className={`switch ${voice.enabled ? "on" : ""}`} role="switch" aria-checked={voice.enabled} aria-label="Voice chat" disabled={solo || voice.busy} onClick={() => { if (voice.enabled) voice.stop(); else void voice.enable(); }}><span/></button></div>{voice.error && <p className="inline-error" role="alert">{voice.error}</p>}<div className="setting-row"><span><strong>Camera feeling a little lost?</strong><small>Return to the original view of your clearing.</small></span><button className="secondary-button" onClick={() => { worldRef.current?.reset(); game.setNotice("Back to a fresh perspective."); }}><Icon name="rotate" size={15}/>Reset</button></div><button className="primary-button" onClick={closeModal}>All set<Icon name="check" size={18}/></button></ModalShell>}
    {modal === "leave" && <ModalShell title="Leave the clearing?" onClose={closeModal}><p className="modal-subtitle">{solo ? "Your solo build will end and its progress will be cleared. You can choose either mode for your next adventure." : playing ? "Your teammate’s timer will keep running. Leaving frees your spot, and this build cannot be rejoined." : "You’ll leave this room and return to the building previews."}</p><div className="modal-button-row"><button className="secondary-button" onClick={closeModal}>Stay a little longer</button><button className="primary-button" onClick={() => { voice.stop(); game.leave(); setModal(null); }}>{solo ? "Leave build" : "Leave room"}<Icon name="logOut" size={16}/></button></div></ModalShell>}
  </div>;
}
