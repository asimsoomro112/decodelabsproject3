import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "../lib/useDialog";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** shared-element morph name, e.g. row id → edit modal */
  transitionName?: string;
  wide?: boolean;
}

export default function Modal({ open, onClose, title, children, transitionName, wide }: ModalProps) {
  const { ref, titleId } = useDialog(open, onClose);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-4 sm:items-center">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/55"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            style={transitionName ? { viewTransitionName: transitionName } : undefined}
            className={
              "glass-3 relative max-h-[88dvh] w-full overflow-y-auto p-6 outline-none " +
              (wide ? "max-w-2xl" : "max-w-lg")
            }
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <h2 id={titleId} className="font-display text-xl font-bold tracking-tight">
                {title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close dialog"
                className="btn-ghost btn btn-sm !min-h-[36px] !rounded-full !px-3"
              >
                ✕
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
