"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronsRight, Loader2, Check } from "lucide-react";

/**
 * Slide-to-confirm control. Deliberately requires a deliberate drag to the end,
 * so a rider can't punch in or out by brushing the screen in their pocket.
 */
export function SwipeAction({
  label,
  onComplete,
  busy = false,
  done = false,
  doneLabel = "Done",
  tone = "brand",
  disabled = false,
}: {
  label: string;
  onComplete: () => void | Promise<void>;
  busy?: boolean;
  done?: boolean;
  doneLabel?: string;
  tone?: "brand" | "slate";
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [maxX, setMaxX] = useState(0);
  const firedRef = useRef(false);

  const KNOB = 56;

  const measure = useCallback(() => {
    const w = trackRef.current?.offsetWidth ?? 0;
    setMaxX(Math.max(0, w - KNOB - 8));
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // Reset the knob whenever the action finishes or the label changes
  useEffect(() => {
    if (!busy) {
      firedRef.current = false;
      setX(0);
    }
  }, [busy, label]);

  const locked = busy || done || disabled;

  const pointFromEvent = (e: PointerEvent | React.PointerEvent) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return Math.min(maxX, Math.max(0, e.clientX - rect.left - KNOB / 2));
  };

  function start(e: React.PointerEvent) {
    if (locked) return;
    setDragging(true);
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function move(e: React.PointerEvent) {
    if (!dragging || locked) return;
    setX(pointFromEvent(e));
  }

  async function end() {
    if (!dragging || locked) return;
    setDragging(false);
    // Require ~90% of the track to count as a deliberate swipe
    if (x >= maxX * 0.9 && !firedRef.current) {
      firedRef.current = true;
      setX(maxX);
      await onComplete();
    } else {
      setX(0);
    }
  }

  const pct = maxX ? x / maxX : 0;
  const bg =
    tone === "brand"
      ? "from-brand-500/25 to-brand-500/10"
      : "from-ink-500/15 to-ink-500/5";

  return (
    <div
      ref={trackRef}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onPointerLeave={end}
      className={`relative h-16 w-full select-none overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-to-r ${bg} ${
        locked ? "opacity-70" : ""
      }`}
    >
      {/* fill that follows the knob */}
      <div
        className="absolute inset-y-0 left-0 bg-brand-500/20 transition-[width]"
        style={{ width: `${x + KNOB / 2}px`, transitionDuration: dragging ? "0ms" : "220ms" }}
      />

      {/* label */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className="text-sm font-semibold tracking-wide text-[var(--fg)]"
          style={{ opacity: done ? 1 : 1 - pct * 0.85 }}
        >
          {done ? doneLabel : busy ? "Please wait…" : label}
        </span>
      </div>

      {/* knob */}
      <div
        onPointerDown={start}
        role="button"
        aria-label={label}
        tabIndex={0}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !locked && !firedRef.current) {
            firedRef.current = true;
            onComplete();
          }
        }}
        className={`absolute top-1 grid size-14 place-items-center rounded-xl bg-brand-500 text-white shadow-md ${
          locked ? "cursor-default" : "cursor-grab active:cursor-grabbing"
        }`}
        style={{
          left: 4 + x,
          transition: dragging ? "none" : "left 220ms cubic-bezier(.22,1,.36,1)",
          touchAction: "none",
        }}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin" />
        ) : done ? (
          <Check className="size-5" />
        ) : (
          <ChevronsRight className="size-5" />
        )}
      </div>
    </div>
  );
}
