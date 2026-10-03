import { useEffect, useRef, useState } from "react";

/* Pointer-following specular highlight for .glass.specular elements.
 * Updates --mx / --my via requestAnimationFrame (no re-renders). */

export function useSpecular<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    let x = 0;
    let y = 0;
    let scheduled = false;

    const apply = () => {
      scheduled = false;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
    };
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      x = e.clientX - rect.left;
      y = e.clientY - rect.top;
      if (!scheduled) {
        scheduled = true;
        raf = requestAnimationFrame(apply);
      }
    };
    el.addEventListener("pointermove", onMove);
    return () => {
      el.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return ref;
}

/* Magnetic hover for primary buttons — desktop pointers only.
 * The button drifts toward the cursor (max 6px) and springs back. */

export function useMagnetic<T extends HTMLElement>(enabled = true) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const el = ref.current;
    if (!el) return;
    let raf = 0;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(dx, dy);
      const radius = Math.max(rect.width, rect.height);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (dist < radius) {
          const pull = 1 - dist / radius;
          el.style.transform = `translate(${(dx * 0.08 * pull).toFixed(2)}px, ${(dy * 0.08 * pull).toFixed(2)}px)`;
        } else {
          el.style.transform = "";
        }
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.transform = "";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf);
    };
  }, [enabled]);

  return ref;
}

/* Reactive media-query hook. */

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    setMatches(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
