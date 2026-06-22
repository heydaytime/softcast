"use client";

import { useEffect, useState } from "react";
import { defaultLightingState, type LightingState, type ScreenSummary, type ServerMessage, type SessionTarget } from "@softcast/protocol";
import { websocketUnavailableMessage, wsConfigError, wsUrl } from "@/lib/backend";

const baseReconnectDelay = 1000;
const maxReconnectDelay = 15000;
// Stay quiet (status "reconnecting") for brief blips; only escalate to the
// backend-unavailable message — which surfaces the modal — once an outage persists.
const attemptsBeforeUnavailable = 5;

export function useSoftcast(target: SessionTarget | null) {
  const [state, setState] = useState<LightingState>(defaultLightingState);
  const [screens, setScreens] = useState<ScreenSummary[]>([]);
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    if (!target) {
      setStatus("idle");
      return;
    }

    if (wsConfigError) {
      setStatus(wsConfigError);
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    let latestSeq = 0;
    let latestRevision = -1;
    // `terminal` stops the reconnect loop for application-level failures (the
    // subscribed session/screen no longer exists). `disposed` guards the effect cleanup.
    let terminal = false;
    let disposed = false;

    function scheduleReconnect() {
      if (disposed || terminal || reconnectTimer) return;
      attempts += 1;
      setStatus(attempts >= attemptsBeforeUnavailable ? websocketUnavailableMessage : "reconnecting");
      const delay = Math.min(maxReconnectDelay, baseReconnectDelay * 2 ** (attempts - 1));
      const jitter = delay * 0.2 * Math.random();
      reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, delay + jitter);
    }

    function connect() {
      if (disposed || terminal) return;
      latestSeq = 0;
      latestRevision = -1;
      const socket = new WebSocket(wsUrl);
      ws = socket;

      socket.addEventListener("open", () => {
        if (ws !== socket) return;
        attempts = 0;
        setStatus("connected");
        socket.send(JSON.stringify({ type: "subscribe", target }));
      });

      socket.addEventListener("message", (event) => {
        if (ws !== socket) return;
        const message = JSON.parse(event.data) as ServerMessage;
        if (message.seq <= latestSeq) return;
        latestSeq = message.seq;
        if (message.type === "state") {
          if (message.revision <= latestRevision) return;
          latestRevision = message.revision;
          setState(message.state);
        }
        if (message.type === "screens") setScreens(message.screens);
        if (message.type === "error") {
          // The subscribed resource is gone or invalid; reconnecting would just loop
          // against something that no longer exists. Surface it and stop.
          terminal = true;
          setStatus(message.message);
          socket.close();
        }
      });

      socket.addEventListener("close", () => {
        if (ws !== socket || terminal || disposed) return;
        scheduleReconnect();
      });

      socket.addEventListener("error", () => {
        if (ws !== socket) return;
        // An error is normally followed by a close event, which schedules the
        // reconnect. Close defensively in case the socket is left hanging.
        try { socket.close(); } catch { /* already closing */ }
      });
    }

    // A backgrounded tab or sleeping display may have a silently-dead socket;
    // reconnect immediately when it becomes visible or the network returns.
    function reconnectNow() {
      if (disposed || terminal) return;
      const closed = !ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING;
      if (!closed) return;
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      attempts = 0;
      connect();
    }

    function onVisible() {
      if (document.visibilityState === "visible") reconnectNow();
    }

    connect();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", reconnectNow);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", reconnectNow);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [target?.sessionId, target?.screenId]);

  return { state, screens, status };
}
