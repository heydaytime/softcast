"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSoftcast } from "@/lib/use-softcast";
import { ScreenRenderer } from "@/lib/ScreenRenderer";
import { isBackendUnavailableMessage } from "@/lib/backend";
import { BackendUnavailableModal } from "@/lib/BackendUnavailableModal";
import { SecondaryLink, StatusPill } from "@/lib/ui";

export default function ScreenPage() {
  const params = useParams<{ sessionId: string; screenId: string }>();
  const sessionId = params.sessionId;
  const screenId = params.screenId;
  const [overlay, setOverlay] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const { state, status } = useSoftcast({ sessionId, screenId });
  const backendError = isBackendUnavailableMessage(status) ? status : "";

  // Auto-hide the controls overlay ~5s after it appears so the screen reads as a clean
  // fill light. Re-arms whenever the overlay is shown again (click / Enter / Space).
  useEffect(() => {
    if (!overlay || immersive) return;
    const timer = window.setTimeout(() => setOverlay(false), 5000);
    return () => window.clearTimeout(timer);
  }, [overlay, immersive]);

  useEffect(() => {
    async function enterFullscreen() {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      } catch {
        // Browser/TV fullscreen permissions vary; still use Softcast immersive mode.
      }
      setImmersive(true);
      setOverlay(false);
    }

    async function exitFullscreen() {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
      } catch {
        // Ignore fullscreen API failures and restore the UI state.
      }
      setImmersive(false);
      setOverlay(true);
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "f") {
        void (immersive ? exitFullscreen() : enterFullscreen());
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        if (!immersive) setOverlay((value) => !value);
        return;
      }

      if (event.key === "Escape") {
        void exitFullscreen();
      }
    };

    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setImmersive(false);
        setOverlay(true);
      }
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
    };
  }, [immersive]);

  return (
    <main onClick={() => { if (!immersive) setOverlay((value) => !value); }} className={`relative min-h-dvh bg-black ${immersive ? "cursor-none" : ""}`}>
      <ScreenRenderer state={state} />
      {overlay ? (
        <section className="absolute left-4 top-4 w-[min(380px,calc(100vw-32px))] rounded-sc-dialog border border-sc-border bg-sc-panel/90 p-4 text-sc-text shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium text-sc-muted">Softcast screen</p>
              <h1 className="mt-1 text-[18px] font-semibold text-sc-text">{status === "connected" ? "Live fill light" : "Waiting for signal"}</h1>
            </div>
            <StatusPill status={status} />
          </div>
          <p className="mt-3 truncate text-[12px] text-sc-faint">Screen {screenId}</p>
          <div className="mt-4 flex gap-2">
            <SecondaryLink href={`/session/${sessionId}`} className="h-9 px-3 text-[12px]">Choose screen</SecondaryLink>
            <SecondaryLink href="/" className="h-9 px-3 text-[12px]">Enter code</SecondaryLink>
          </div>
          <p className="mt-3 text-[11px] leading-4 text-sc-faint">Press F for fullscreen. Press Enter or Space to hide controls. Escape exits fullscreen.</p>
        </section>
      ) : null}
      {backendError ? <BackendUnavailableModal message={backendError} /> : null}
    </main>
  );
}
