"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useSoftcast } from "@/lib/use-softcast";
import { ScreenRenderer } from "@/lib/ScreenRenderer";
import { isBackendUnavailableMessage } from "@/lib/backend";
import { BackendUnavailableModal } from "@/lib/BackendUnavailableModal";

export default function ScreenPage() {
  const params = useParams<{ sessionId: string; subSessionId: string }>();
  const sessionId = params.sessionId;
  const subSessionId = params.subSessionId;
  const [overlay, setOverlay] = useState(true);
  const [immersive, setImmersive] = useState(false);
  const { state, status } = useSoftcast({ sessionId, subSessionId });
  const backendError = isBackendUnavailableMessage(status) ? status : "";

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
        <section className={`absolute left-4 top-4 w-[min(360px,calc(100vw-32px))] rounded-[20px] border p-4 text-white shadow-2xl backdrop-blur-xl ${status === "connected" ? "border-emerald-400/20 bg-emerald-950/35" : "border-white/[0.12] bg-black/75"}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] text-white/38">Softcast screen</p>
              <h1 className={status === "connected" ? "mt-1 text-[18px] font-semibold tracking-[-0.03em] text-emerald-100" : "mt-1 text-[18px] font-semibold tracking-[-0.03em]"}>Connected</h1>
            </div>
            <span className={statusPillClass(status)}>{status}</span>
          </div>
          <p className="mt-3 truncate text-[12px] text-white/32">Screen {subSessionId}</p>
          <div className="mt-4 flex gap-2">
            <Link href={`/session/${sessionId}`} className="rounded-full bg-white px-3 py-2 text-[12px] font-semibold text-black">Choose screen</Link>
            <Link href="/" className="rounded-full border border-white/[0.12] px-3 py-2 text-[12px] font-semibold text-white/72">Enter code</Link>
          </div>
          <p className="mt-3 text-[11px] text-white/28">Press F for fullscreen. Press Enter or Space to hide controls. Escape exits fullscreen.</p>
        </section>
      ) : null}
      {backendError ? <BackendUnavailableModal message={backendError} /> : null}
    </main>
  );
}

function statusPillClass(status: string) {
  return status === "connected"
    ? "rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[11px] text-emerald-200"
    : "rounded-full border border-white/[0.1] px-2 py-1 text-[11px] text-white/45";
}
