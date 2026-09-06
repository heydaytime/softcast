"use client";

import { useEffect, useState } from "react";
import { initialDisplayState, type LightingState, type ScreenSummary, type SessionTarget } from "@softcast/protocol";
import { ApiError, backendUnavailableMessage, getScreenState, getSessionScreens } from "@/lib/backend";

const pollMs = 500;
const hiddenPollMs = 5000;
const attemptsBeforeUnavailable = 5;

export function useSoftcast(target: SessionTarget | null) {
  const [state, setState] = useState<LightingState>(initialDisplayState);
  const [screens, setScreens] = useState<ScreenSummary[]>([]);
  const [status, setStatus] = useState("connecting");

  useEffect(() => {
    if (!target) {
      setStatus("idle");
      return;
    }

    const sessionId = target.sessionId;
    const screenId = target.screenId;
    setState(initialDisplayState);
    setScreens([]);
    setStatus("connecting");

    let disposed = false;
    let terminal = false;
    let attempts = 0;
    let latestRevision = -1;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function schedule(delay: number) {
      if (disposed || terminal || timer) return;
      timer = setTimeout(() => { timer = null; void tick(); }, delay);
    }

    async function tick() {
      if (disposed || terminal) return;
      try {
        if (screenId) {
          const snapshot = await getScreenState(sessionId, screenId);
          if (disposed || terminal) return;
          attempts = 0;
          setStatus("connected");
          if (snapshot.revision > latestRevision) {
            latestRevision = snapshot.revision;
            setState(snapshot.state);
          }
        } else {
          const payload = await getSessionScreens(sessionId);
          if (disposed || terminal) return;
          attempts = 0;
          setStatus("connected");
          setScreens(payload.screens);
        }
        schedule(document.hidden ? hiddenPollMs : pollMs);
      } catch (error) {
        if (disposed || terminal) return;
        if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
          terminal = true;
          setStatus(error.message);
          return;
        }
        attempts += 1;
        setStatus(attempts >= attemptsBeforeUnavailable ? backendUnavailableMessage : "reconnecting");
        const delay = Math.min(hiddenPollMs, pollMs * 2 ** (attempts - 1));
        schedule(delay);
      }
    }

    function onVisible() {
      if (document.visibilityState !== "visible" || disposed || terminal) return;
      if (timer) { clearTimeout(timer); timer = null; }
      attempts = 0;
      void tick();
    }

    void tick();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
      if (timer) clearTimeout(timer);
    };
  }, [target?.sessionId, target?.screenId]);

  return { state, screens, status };
}
