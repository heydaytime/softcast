"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { defaultLightingState, type LightingState, type ServerMessage, type SessionTarget } from "@softcast/protocol";
import { wsUrl } from "@/lib/backend";

export function useSoftcast(target: SessionTarget | null) {
  const [state, setState] = useState<LightingState>(defaultLightingState);
  const [subSessionIds, setSubSessionIds] = useState<string[]>([]);
  const [status, setStatus] = useState("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const latestSeqRef = useRef(0);
  const latestRevisionRef = useRef(-1);

  useEffect(() => {
    if (!target) {
      setStatus("idle");
      return;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    latestSeqRef.current = 0;
    latestRevisionRef.current = -1;
    ws.addEventListener("open", () => {
      if (wsRef.current !== ws) return;
      setStatus("connected");
      ws.send(JSON.stringify({ type: "subscribe", target }));
    });
    ws.addEventListener("close", () => {
      if (wsRef.current !== ws) return;
      setStatus("disconnected");
    });
    ws.addEventListener("error", () => {
      if (wsRef.current !== ws) return;
      setStatus("error");
    });
    ws.addEventListener("message", (event) => {
      if (wsRef.current !== ws) return;
      const message = JSON.parse(event.data) as ServerMessage;
      if (message.seq <= latestSeqRef.current) return;
      latestSeqRef.current = message.seq;
      if (message.type === "state") {
        if (message.revision <= latestRevisionRef.current) return;
        latestRevisionRef.current = message.revision;
        setState(message.state);
      }
      if (message.type === "subsessions") setSubSessionIds(message.subSessionIds);
      if (message.type === "error") setStatus(message.message);
    });
    return () => {
      if (wsRef.current === ws) wsRef.current = null;
      ws.close();
    };
  }, [target?.sessionId, target?.subSessionId]);

  const sendState = useCallback((nextState: LightingState) => {
    if (!target || wsRef.current?.readyState !== WebSocket.OPEN) return false;
    wsRef.current.send(JSON.stringify({ type: "admin:update", target, state: nextState }));
    return true;
  }, [target]);

  return { state, subSessionIds, status, sendState };
}
