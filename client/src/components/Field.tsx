import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
}

/** Labelled form field with an inline, assertive error slot. */
export default function Field({ label, error, children, htmlFor, required }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--muted)]">
        {label}{" "}
        {required && (
          <span className="text-rose-400" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p role="alert" className="text-[13px] leading-snug text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
