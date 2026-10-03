import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "../lib/fx";

interface StatProps {
  value: number;
  label: string;
  suffix?: string;
}

/** Animated count-up number. Jumps straight to the value when the user
 *  prefers reduced motion. */
export default function Stat({ value, label, suffix = "" }: StatProps) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const from = prev.current;
    const delta = value - from;
    if (delta === 0) return;
    let raf = 0;
    const start = performance.now();
    const dur = 900;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + delta * eased);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prev.current = value;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);

  return (
    <div>
      <div className="font-display text-3xl font-bold tracking-tight tabular-nums sm:text-4xl">
        {Math.round(display).toLocaleString("en-US")}
        {suffix && <span className="text-[0.65em] font-semibold text-[var(--muted)]">{suffix}</span>}
      </div>
      <div className="mt-1 text-sm text-[var(--muted)]">{label}</div>
    </div>
  );
}
