import { DatabaseZap } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  hint: string;
  action?: ReactNode;
}

export default function EmptyState({ title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-white/15 px-6 py-14 text-center">
      <DatabaseZap size={30} className="mb-1 text-[var(--faint)]" aria-hidden="true" />
      <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
      <p className="max-w-sm text-sm leading-relaxed text-[var(--muted)]">{hint}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
