"use client";

import { rendererHtml, type LightingState } from "@softcast/protocol";
import { useEffect, useRef } from "react";

export function ScreenRenderer({ state, preview = false }: { state: LightingState; preview?: boolean }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const initialHtmlRef = useRef(rendererHtml(state));

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify(state), "*");
  }, [state]);

  return (
    <iframe
      ref={frameRef}
      srcDoc={initialHtmlRef.current}
      title="Softcast renderer"
      tabIndex={-1}
      // The renderer is display-only. Disabling pointer events keeps keyboard focus on the
      // parent window (so Enter/Space/F keep working) and lets taps fall through to the page
      // overlay toggle, instead of the iframe silently capturing focus and swallowing keys.
      className={preview ? "pointer-events-none block h-full min-h-[260px] w-full bg-black" : "pointer-events-none block h-dvh min-h-dvh w-full bg-black"}
      style={{ border: 0 }}
    />
  );
}
