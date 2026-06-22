"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { hsvToCssColor } from "@softcast/protocol";

// Hue 0 (red) sits at the top and increases clockwise to match the CSS conic-gradient.
const wheelBackground =
  "radial-gradient(circle at center, #ffffff 0%, rgba(255,255,255,0) 70%), " +
  "conic-gradient(from 0deg, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))";

type ColorWheelProps = {
  hue: number;
  saturation: number;
  onChange: (hue: number, saturation: number) => void;
  onCommit?: (hue: number, saturation: number) => void;
};

export function ColorWheel({ hue, saturation, onChange, onCommit }: ColorWheelProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const latest = useRef({ hue, saturation });

  function setFromPointer(event: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const dx = event.clientX - rect.left - rect.width / 2;
    const dy = event.clientY - rect.top - rect.height / 2;
    const radius = Math.min(rect.width, rect.height) / 2;
    const nextHue = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    const nextSat = radius > 0 ? Math.min(1, Math.hypot(dx, dy) / radius) : 0;
    latest.current = { hue: nextHue, saturation: nextSat };
    onChange(nextHue, nextSat);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    setFromPointer(event);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (event.buttons !== 1) return;
    setFromPointer(event);
  }

  function onPointerUp() {
    onCommit?.(latest.current.hue, latest.current.saturation);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let nextHue = hue;
    let nextSat = saturation;
    if (event.key === "ArrowLeft") nextHue = (hue - 2 + 360) % 360;
    else if (event.key === "ArrowRight") nextHue = (hue + 2) % 360;
    else if (event.key === "ArrowUp") nextSat = Math.min(1, saturation + 0.02);
    else if (event.key === "ArrowDown") nextSat = Math.max(0, saturation - 0.02);
    else return;
    event.preventDefault();
    latest.current = { hue: nextHue, saturation: nextSat };
    onChange(nextHue, nextSat);
    onCommit?.(nextHue, nextSat);
  }

  const hueRad = (hue * Math.PI) / 180;
  const puckLeft = 50 + saturation * 50 * Math.sin(hueRad);
  const puckTop = 50 - saturation * 50 * Math.cos(hueRad);

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label="Color hue and saturation"
      aria-valuetext={`Hue ${Math.round(hue)}°, saturation ${Math.round(saturation * 100)}%`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className="relative aspect-square w-full max-h-full max-w-full touch-none cursor-pointer select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/40"
      style={{ background: wheelBackground }}
    >
      <div
        className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_1px_6px_rgba(0,0,0,0.5)]"
        style={{ left: `${puckLeft}%`, top: `${puckTop}%`, background: hsvToCssColor(hue, saturation, 1) }}
      />
    </div>
  );
}
