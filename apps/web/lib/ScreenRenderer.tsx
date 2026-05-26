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
      className={preview ? "block h-full min-h-[260px] w-full bg-black" : "block h-dvh min-h-dvh w-full bg-black"}
      style={{ border: 0 }}
    />
  );
}
