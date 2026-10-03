import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "../lib/useDialog";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export default function Drawer({ open, onClose, title, children }: DrawerProps) {
  const { ref, titleId } = useDialog(open, onClose);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.aside
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="glass-2 absolute top-0 right-0 flex h-full w-full max-w-md flex-col !rounded-none !rounded-l-3xl outline-none"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
              <h2 id={titleId} className="font-display text-lg font-bold tracking-tight">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="btn-ghost btn btn-sm !min-h-[36px] !rounded-full !px-3"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
