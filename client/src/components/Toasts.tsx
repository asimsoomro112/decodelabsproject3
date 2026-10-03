import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

export type ToastType = "success" | "error" | "info" | "warn";

interface Toast {
  id: number;
  msg: string;
  type: ToastType;
}

const listeners = new Set<(items: Toast[]) => void>();
let items: Toast[] = [];
let seq = 0;

function emit() {
  const snapshot = [...items];
  listeners.forEach((l) => l(snapshot));
}

/** Show a glass toast. Safe to call before <Toasts/> mounts — it subscribes on mount. */
export function toast(msg: string, type: ToastType = "info") {
  const id = ++seq;
  items = [...items, { id, msg, type }].slice(-5);
  emit();
  window.setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, 4200);
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warn: AlertTriangle,
  info: Info,
} as const;

const ACCENTS: Record<ToastType, string> = {
  success: "text-emerald-400",
  error: "text-rose-400",
  warn: "text-amber-400",
  info: "text-indigo-400",
};

export function Toasts() {
  const [list, setList] = useState<Toast[]>(items);

  useEffect(() => {
    const fn = (next: Toast[]) => setList(next);
    listeners.add(fn);
    setList([...items]);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed right-4 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] z-[90] flex w-[min(360px,calc(100%-32px))] flex-col gap-2 md:bottom-6"
    >
      <AnimatePresence>
        {list.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <motion.div
              key={t.id}
              role="status"
              layout
              initial={{ opacity: 0, x: 60, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="glass pointer-events-auto flex items-start gap-3 !rounded-2xl px-4 py-3"
            >
              <Icon size={18} className={"mt-0.5 shrink-0 " + ACCENTS[t.type]} aria-hidden="true" />
              <p className="text-sm leading-snug">{t.msg}</p>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
