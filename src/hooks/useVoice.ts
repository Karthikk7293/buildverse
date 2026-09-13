"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Socket } from "socket.io-client";

type VoiceSignal = { type: "ready" | "offer" | "answer" | "candidate" | "stop"; description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
export function useVoice(socket: Socket | null, playerId: string | null, hostId: string | undefined) {
  const [enabled, setEnabled] = useState(false);
  const [muted, setMuted] = useState(false);
  const [status, setStatus] = useState("Voice is off");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const stream = useRef<MediaStream | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const candidates = useRef<RTCIceCandidateInit[]>([]);
  const pendingOffer = useRef<RTCSessionDescriptionInit | null>(null);
  const offering = useRef(false);
  const generation = useRef(0);
  const closePeer = useCallback(() => {
    if (peer.current) { peer.current.onconnectionstatechange = null; peer.current.onicecandidate = null; peer.current.ontrack = null; peer.current.close(); peer.current = null; }
    if (audio.current) { audio.current.pause(); audio.current.srcObject = null; audio.current = null; }
    candidates.current = []; offering.current = false;
  }, []);
  const stop = useCallback(() => {
    generation.current++;
    socket?.emit("voice-signal", { type: "stop" });
    stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null;
    closePeer(); pendingOffer.current = null;
    setEnabled(false); setMuted(false); setBusy(false); setStatus("Voice is off"); setError("");
  }, [socket, closePeer]);
  const getPeer = useCallback(() => {
    if (peer.current) return peer.current;
    // Host ICE candidates connect directly over the LAN; no external relay is used.
    const connection = new RTCPeerConnection({ iceServers: [] });
    peer.current = connection;
    for (const track of stream.current?.getTracks() ?? []) connection.addTrack(track, stream.current!);
    connection.onicecandidate = (event) => { if (event.candidate) socket?.emit("voice-signal", { type: "candidate", candidate: event.candidate.toJSON() }); };
    connection.ontrack = (event) => {
      if (!audio.current) { audio.current = new Audio(); audio.current.autoplay = true; }
      audio.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      audio.current.play().catch(() => setError("Your browser paused voice playback. Use the voice button to reconnect."));
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") { setStatus("Voice connected"); setError(""); }
      else if (connection.connectionState === "failed") { setStatus("Voice interrupted"); setError("Voice couldn’t connect. Turn voice off and on to retry on your local network."); }
      else if (connection.connectionState === "disconnected") setStatus("Reconnecting voice…");
    };
    return connection;
  }, [socket]);
  const handleSignal = useCallback(async (signal: VoiceSignal) => {
    try {
      if (signal.type === "stop") { closePeer(); pendingOffer.current = null; if (stream.current) setStatus("Waiting for teammate’s mic"); return; }
      if (signal.type === "candidate" && signal.candidate) {
        if (peer.current?.remoteDescription) await peer.current.addIceCandidate(signal.candidate);
        else candidates.current.push(signal.candidate);
        return;
      }
      if (!stream.current) { if (signal.type === "offer" && signal.description) pendingOffer.current = signal.description; return; }
      if (signal.type === "ready") {
        // Exactly one player creates an offer, even when both enable voice together.
        if (playerId !== hostId) { if (!peer.current) socket?.emit("voice-signal", { type: "ready" }); return; }
        const connection = getPeer();
        if (offering.current || connection.signalingState !== "stable" || connection.connectionState === "connected") return;
        offering.current = true;
        const offer = await connection.createOffer();
        await connection.setLocalDescription(offer);
        socket?.emit("voice-signal", { type: "offer", description: connection.localDescription?.toJSON() });
        offering.current = false;
      } else if (signal.type === "offer" && signal.description) {
        const connection = getPeer();
        await connection.setRemoteDescription(signal.description);
        for (const candidate of candidates.current.splice(0)) await connection.addIceCandidate(candidate);
        await connection.setLocalDescription(await connection.createAnswer());
        socket?.emit("voice-signal", { type: "answer", description: connection.localDescription?.toJSON() });
      } else if (signal.type === "answer" && signal.description && peer.current?.signalingState === "have-local-offer") {
        await peer.current.setRemoteDescription(signal.description);
        for (const candidate of candidates.current.splice(0)) await peer.current.addIceCandidate(candidate);
      }
    } catch (err) { console.error("Voice connection", err); offering.current = false; setError("Couldn’t connect voice. Turn your mic off and on to retry."); }
  }, [closePeer, getPeer, hostId, playerId, socket]);
  useEffect(() => {
    if (!socket) return;
    const disconnect = () => { closePeer(); if (stream.current) setStatus("Waiting for teammate’s mic"); };
    const reconnect = () => { if (stream.current) setStatus("Reconnect voice to continue"); };
    socket.on("voice-signal", handleSignal); socket.on("peer-left", disconnect); socket.on("disconnect", disconnect); socket.on("connect", reconnect);
    return () => { socket.off("voice-signal", handleSignal); socket.off("peer-left", disconnect); socket.off("disconnect", disconnect); socket.off("connect", reconnect); };
  }, [socket, handleSignal, closePeer]);
  useEffect(() => {
    if (!playerId) stop();
    return () => { generation.current++; stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; closePeer(); };
  }, [playerId, stop, closePeer]);
  const enable = useCallback(async () => {
    if (!playerId) { setError("Create or join a room to talk to your teammate."); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setError("Voice needs a secure connection. Open this game over HTTPS (or localhost) to enable your microphone."); return; }
    setBusy(true); setError("");
    const attempt = ++generation.current;
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (generation.current !== attempt) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media; setEnabled(true); setMuted(false); setStatus("Waiting for teammate’s mic");
      if (pendingOffer.current) { const description = pendingOffer.current; pendingOffer.current = null; await handleSignal({ type: "offer", description }); }
      else socket?.emit("voice-signal", { type: "ready" });
    } catch (err) {
      const name = (err as DOMException).name;
      setError(name === "NotAllowedError" ? "Microphone permission was denied. Allow the microphone in your browser’s site settings, then try again." : name === "NotFoundError" ? "No microphone found. Connect a microphone and try again." : "Your microphone couldn’t start. Check your audio device and try again.");
    } finally { if (generation.current === attempt) setBusy(false); }
  }, [handleSignal, playerId, socket]);
  const toggleMute = useCallback(() => {
    if (!stream.current) { void enable(); return; }
    const nextMuted = !muted; stream.current.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; }); setMuted(nextMuted);
  }, [enable, muted]);
  return { enabled, muted, status, error, busy, enable, stop, toggleMute };
}
