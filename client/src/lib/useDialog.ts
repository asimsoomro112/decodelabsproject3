import { useEffect, useId, useRef } from "react";

/* Shared dialog behavior for Modal + Drawer:
 * - focus moves inside on open, returns to the trigger on close
 * - Tab is trapped inside
 * - Escape closes
 * - body scroll is locked while open */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const prev = document.activeElement as HTMLElement | null;

    const focusables = (): HTMLElement[] =>
      node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];

    // Move focus inside (first control, else the dialog itself).
    const initial = focusables()[0] ?? node;
    initial?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      prev?.focus();
    };
  }, [open ]);

  return { ref, titleId };
}
