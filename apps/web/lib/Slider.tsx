"use client";

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";

type SliderProps = {
  orientation?: "horizontal" | "vertical";
  value: number;
  min: number;
  max: number;
  step: number;
  ariaLabel: string;
  trackStyle?: CSSProperties;
  fillStyle?: CSSProperties;
  onChange: (value: number) => void;
  onCommit?: (value: number) => void;
};

export function Slider({ orientation = "horizontal", value, min, max, step, ariaLabel, trackStyle, fillStyle, onChange, onCommit }: SliderProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const latest = useRef(value);
  const vertical = orientation === "vertical";
  const fraction = max > min ? Math.min(1, Math.max(0, (value - min) / (max - min))) : 0;
  const percent = fraction * 100;

  function commit(next: number) {
    const clamped = Math.min(max, Math.max(min, Math.round(next / step) * step));
    latest.current = clamped;
    onChange(clamped);
  }

  function setFromPointer(event: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const raw = vertical ? 1 - (event.clientY - rect.top) / rect.height : (event.clientX - rect.left) / rect.width;
    commit(min + Math.min(1, Math.max(0, raw)) * (max - min));
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
    onCommit?.(latest.current);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const up = event.key === "ArrowUp" || event.key === "ArrowRight";
    const down = event.key === "ArrowDown" || event.key === "ArrowLeft";
    if (!up && !down) return;
    event.preventDefault();
    commit(value + (up ? step : -step));
    onCommit?.(latest.current);
  }

  // Inset the thumb's travel by half its own size so it never overflows past the ends of
  // the track. Vertical thumb is 16px tall (h-4); horizontal thumb is 14px wide (w-3.5).
  const thumbStyle: CSSProperties = vertical
    ? { left: "50%", bottom: `calc(8px + ${fraction} * (100% - 16px))`, transform: "translate(-50%, 50%)" }
    : { top: "50%", left: `calc(7px + ${fraction} * (100% - 14px))`, transform: "translate(-50%, -50%)" };

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-orientation={orientation}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={onKeyDown}
      className={`relative touch-none cursor-pointer select-none outline-none ${vertical ? "h-full w-16" : "h-14 w-full"}`}
    >
      {vertical ? (
        <div className="absolute inset-y-0 left-1/2 w-14 -translate-x-1/2 overflow-hidden rounded-[18px]" style={trackStyle}>
          {fillStyle ? <div className="absolute inset-x-0 bottom-0" style={{ ...fillStyle, height: `${percent}%` }} /> : null}
        </div>
      ) : (
        <div className="absolute inset-x-0 top-1/2 h-4 -translate-y-1/2 overflow-hidden rounded-full" style={trackStyle}>
          {fillStyle ? <div className="absolute inset-y-0 left-0" style={{ ...fillStyle, width: `${percent}%` }} /> : null}
        </div>
      )}
      <div
        className={`pointer-events-none absolute rounded-full border border-black/20 bg-white shadow-[0_1px_6px_rgba(0,0,0,0.4)] ${vertical ? "h-4 w-10" : "h-8 w-3.5"}`}
        style={thumbStyle}
      />
    </div>
  );
}
