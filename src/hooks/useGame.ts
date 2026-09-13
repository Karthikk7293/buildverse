"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { BlueprintId, GameMode, GameState, Position } from "@/lib/game";

type RoomReply = { ok: boolean; error?: string; state?: GameState; playerId?: string; token?: string };
const SESSION_KEY = "buildverse-session";
export function useGame() {
  const socketRef = useRef<Socket | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [state, setState] = useState<GameState | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [networkUrls, setNetworkUrls] = useState<string[]>([]);
  const [remaining, setRemaining] = useState(600);
  const clockOffset = useRef(0);
  const acceptState = useCallback((next: GameState) => {
    clockOffset.current = next.serverNow - Date.now();
    setState(next);
  }, []);
  const acceptReply = useCallback((reply: RoomReply) => {
    setBusy(false);
    if (!reply.ok || !reply.state || !reply.playerId || !reply.token) { setError(reply.error || "Couldn’t connect. Please try again."); return; }
    setError("");
    acceptState(reply.state);
    setPlayerId(reply.playerId);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ code: reply.state.code, token: reply.token }));
  }, [acceptState]);
  useEffect(() => {
    const connection = io({ transports: ["websocket", "polling"], reconnectionDelay: 800, reconnectionDelayMax: 4000 });
    socketRef.current = connection; setSocket(connection);
    connection.on("connect", () => {
      setConnected(true); setError("");
      connection.emit("network-info", (result: { urls: string[] }) => setNetworkUrls(result.urls));
      const saved = sessionStorage.getItem(SESSION_KEY);
      if (saved) {
        try {
          connection.emit("resume-room", JSON.parse(saved), (reply: RoomReply) => {
            if (!reply.ok) { sessionStorage.removeItem(SESSION_KEY); setState(null); setPlayerId(null); setError(reply.error ?? "The room has closed."); }
            else acceptReply(reply);
          });
        } catch { sessionStorage.removeItem(SESSION_KEY); }
      }
    });
    connection.on("disconnect", () => { setConnected(false); setBusy(false); });
    connection.on("connect_error", () => { setConnected(false); setBusy(false); setError("Can’t reach the local game server. Make sure it’s running and you’re on the same network."); });
    connection.on("state", acceptState);
    connection.on("notice", setNotice);
    return () => { connection.removeAllListeners(); connection.disconnect(); socketRef.current = null; };
  }, [acceptState, acceptReply]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const update = () => setRemaining(state?.endsAt ? Math.max(0, Math.ceil((state.endsAt - Date.now() - clockOffset.current) / 1000)) : 600);
    update();
    const timer = setInterval(update, 250);
    return () => clearInterval(timer);
  }, [state?.endsAt]);
  const requestRoom = useCallback((event: string, payload: object) => {
    if (!socketRef.current?.connected) { setError("Waiting for the local game server. Please try again in a moment."); return; }
    setBusy(true); setError("");
    socketRef.current.timeout(7000).emit(event, payload, (err: Error | null, reply: RoomReply) => {
      if (err) { setBusy(false); setError("The connection timed out. Check your network and try again."); }
      else acceptReply(reply);
    });
  }, [acceptReply]);
  const createRoom = useCallback((name: string, blueprint: BlueprintId, mode: GameMode = "multiplayer") => requestRoom("create-room", { name, blueprint, mode }), [requestRoom]);
  const joinRoom = useCallback((name: string, code: string) => requestRoom("join-room", { name, code }), [requestRoom]);
  const leave = useCallback(() => {
    socketRef.current?.emit("leave-room"); sessionStorage.removeItem(SESSION_KEY);
    setState(null); setPlayerId(null); setError(""); setRemaining(600);
  }, []);
  const move = useCallback((position: Position, destination = false) => socketRef.current?.emit("move", { ...position, destination }), []);
  const interact = useCallback(() => socketRef.current?.emit("interact"), []);
  const ready = useCallback(() => socketRef.current?.emit("ready"), []);
  const selectBlueprint = useCallback((id: BlueprintId) => socketRef.current?.emit("select-blueprint", id), []);
  const rematch = useCallback(() => socketRef.current?.emit("rematch"), []);
  return { socket, state, playerId, connected, busy, error, notice, remaining, networkUrls, createRoom, joinRoom, leave, move, interact, ready, selectBlueprint, rematch, setNotice, setError };
}
