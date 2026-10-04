import { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  BookOpen,
  Database,
  GraduationCap,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import {
  api,
  humanizeError,
  mutationFeed,
  type MutationEvent,
  type Stats,
} from "../api";
import Stat from "../components/Stat";
import EmptyState from "../components/EmptyState";
import { toast } from "../components/Toasts";
import { useReducedMotion, useSpecular } from "../lib/fx";

type DbState = "checking" | "up" | "down";

/* DB status chip — polls /ready every 30s. Icon + text, never colour alone. */
function DbStatusChip() {
  const [status, setStatus] = useState<DbState>("checking");

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await api.ready();
        if (alive) setStatus(r.status === "ready" ? "up" : "down");
      } catch {
        if (alive) setStatus("down");
      }
    };
    check();
    const t = window.setInterval(check, 30_000);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, []);

  const dot =
    status === "up" ? "bg-emerald-400" : status === "down" ? "bg-rose-400" : "bg-amber-400";
  const label =
    status === "up" ? "Database ready" : status === "down" ? "Database unreachable" : "Checking database…";

  return (
    <p role="status" aria-live="polite" className="chip !text-[13px] !normal-case !tracking-normal">
      <span className="relative flex h-2.5 w-2.5">
        {status === "up" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        )}
        <span className={"relative inline-flex h-2.5 w-2.5 rounded-full " + dot} />
      </span>
      {label}
    </p>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const FEED_STYLE = {
  insert: { Icon: Plus, icon: "text-emerald-400", ring: "border-emerald-400/30 bg-emerald-400/10" },
  update: { Icon: Pencil, icon: "text-amber-400", ring: "border-amber-400/30 bg-amber-400/10" },
  delete: { Icon: Trash2, icon: "text-rose-400", ring: "border-rose-400/30 bg-rose-400/10" },
} as const;

const LEVEL_META = [
  { level: "beginner", label: "Beginner", bar: "from-emerald-400 to-teal-500" },
  { level: "intermediate", label: "Intermediate", bar: "from-indigo-400 to-violet-500" },
  { level: "advanced", label: "Advanced", bar: "from-amber-400 to-orange-500" },
] as const;

export default function Vault() {
  const heroSpec = useSpecular<HTMLDivElement>();
  const reduced = useReducedMotion();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feed, setFeed] = useState<MutationEvent[]>(() => mutationFeed.items);

  useEffect(() => {
    let alive = true;
    api
      .stats()
      .then((s) => {
        if (alive) setStats(s);
      })
      .catch((e) => {
        if (!alive) return;
        const msg = humanizeError(e);
        setError(msg);
        toast(msg, "error");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => mutationFeed.subscribe(() => setFeed([...mutationFeed.items])), []);

  const byLevel = new Map((stats?.coursesPerLevel ?? []).map((e) => [e.level, e.count]));
  const levelMax = Math.max(1, ...LEVEL_META.map((l) => byLevel.get(l.level) ?? 0));
  const fillPct = Math.max(0, Math.min(100, stats?.fillRate.ratePct ?? 0));

  const R = 54;
  const CIRC = 2 * Math.PI * R;

  const totals = stats?.totals;
  const topMax = Math.max(1, ...(stats?.topCourses ?? []).map((c) => c.enrolledCount));

  return (
    <section className="page mx-auto w-full max-w-6xl pt-24 md:pt-28" aria-labelledby="vault-title">
      {/* ---------- hero ---------- */}
      <div
        ref={heroSpec}
        data-reveal
        className="glass-2 specular liquid relative overflow-hidden p-6 sm:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl">
            <p className="chip mb-3">
              <Database size={12} aria-hidden="true" /> Dashboard
            </p>
            <h1
              id="vault-title"
              className="font-display text-3xl font-bold tracking-tight sm:text-4xl"
            >
              The Vault <span className="text-indigo-400">at a glance</span>
            </h1>
            <p className="mt-2 text-[15px] leading-relaxed text-[var(--muted)]">
              Live aggregates straight from PostgreSQL — JOINs, GROUP BYs and a
              transactional capacity check, rendered as glass.
            </p>
          </div>
          <DbStatusChip />
        </div>
      </div>

      {error && (
        <div role="alert" className="panel mt-4 border-rose-400/40 p-4 text-sm text-rose-300">
          Couldn&apos;t load dashboard stats: {error}
        </div>
      )}

      {/* ---------- animated counters ---------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3" data-reveal>
        {[
          { Icon: Users, label: "Registered users", value: totals?.users, tone: "text-indigo-400" },
          { Icon: BookOpen, label: "Published courses", value: totals?.courses, tone: "text-amber-400" },
          { Icon: GraduationCap, label: "Enrollments", value: totals?.enrollments, tone: "text-emerald-400" },
        ].map(({ Icon, label, value, tone }) => (
          <div key={label} className="glass flex items-center gap-4 p-5">
            <span className={"flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/5 " + tone}>
              <Icon size={22} aria-hidden="true" />
            </span>
            {value === undefined ? (
              <div className="flex-1" aria-hidden="true">
                <div className="skeleton h-8 w-24" />
                <div className="skeleton mt-2 h-4 w-32" />
              </div>
            ) : (
              <Stat value={value} label={label} />
            )}
          </div>
        ))}
      </div>

      {/* ---------- levels + fill rate ---------- */}
      <div className="glass mt-4 p-6 sm:p-7" data-reveal aria-label="Course distribution">
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <h2 className="font-display text-lg font-bold tracking-tight">Courses per level</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              <code className="font-mono text-[13px]">GROUP BY level</code> over the courses table.
            </p>
            <ul className="mt-5 space-y-4">
              {LEVEL_META.map(({ level, label, bar }) => {
                const count = byLevel.get(level) ?? 0;
                const pct = Math.round((count / levelMax) * 100);
                return (
                  <li key={level}>
                    <div className="mb-1.5 flex items-baseline justify-between text-sm">
                      <span className="font-medium">{label}</span>
                      <span className="font-mono text-[var(--muted)] tabular-nums" aria-label={`${count} courses`}>
                        {stats ? count : "—"}
                      </span>
                    </div>
                    <div
                      className="h-2.5 overflow-hidden rounded-full bg-white/8"
                      role="img"
                      aria-label={`${label}: ${count} courses`}
                    >
                      <motion.div
                        className={"h-full rounded-full bg-gradient-to-r " + bar}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={reduced ? { duration: 0 } : { duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="flex flex-col items-center gap-3 md:px-4">
            <h2 className="font-display text-lg font-bold tracking-tight">Seat fill rate</h2>
            <div className="relative h-36 w-36">
              <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true">
                <defs>
                  <linearGradient id="vault-fill" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#34d399" />
                    <stop offset="1" stopColor="#6366f1" />
                  </linearGradient>
                </defs>
                <circle cx="64" cy="64" r={R} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="12" />
                <motion.circle
                  cx="64"
                  cy="64"
                  r={R}
                  fill="none"
                  stroke="url(#vault-fill)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={CIRC}
                  initial={{ strokeDashoffset: CIRC }}
                  animate={{ strokeDashoffset: CIRC * (1 - fillPct / 100) }}
                  transition={reduced ? { duration: 0 } : { duration: 1.2, ease: "easeOut", delay: 0.2 }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-display text-3xl font-bold tabular-nums">
                  {stats ? `${Math.round(fillPct)}%` : "—"}
                </span>
                <span className="text-[11px] text-[var(--muted)]">filled</span>
              </div>
            </div>
            <p className="text-center text-xs text-[var(--muted)]" aria-live="polite">
              {stats
                ? `${stats.fillRate.activeEnrollments.toLocaleString()} active enrollments / ${stats.fillRate.totalSeats.toLocaleString()} seats`
                : "Loading capacity…"}
            </p>
          </div>
        </div>
      </div>

      {/* ---------- top courses + mutations ---------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="glass p-6" data-reveal aria-label="Top courses by enrollments">
          <h2 className="font-display text-lg font-bold tracking-tight">Top courses</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">By enrollment count.</p>
          {stats ? (
            stats.topCourses.length > 0 ? (
              <ul className="mt-4 space-y-3">
                {stats.topCourses.map((c, i) => (
                  <li key={c.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate font-medium">
                        <span className="mr-2 font-mono text-xs text-[var(--faint)]">{String(i + 1).padStart(2, "0")}</span>
                        {c.title}
                      </span>
                      <span className="shrink-0 font-mono text-xs text-[var(--muted)] tabular-nums">
                        {c.enrolledCount} enrolled
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/8" aria-hidden="true">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.round((c.enrolledCount / topMax) * 100)}%` }}
                        transition={reduced ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1], delay: i * 0.08 }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-sm text-[var(--muted)]">No enrollments yet.</p>
            )
          ) : (
            <div className="mt-4 space-y-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-8" />
              ))}
            </div>
          )}
        </div>

        <div className="glass p-6" data-reveal aria-label="Recent mutations">
          <h2 className="font-display text-lg font-bold tracking-tight">Recent mutations</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Every INSERT, UPDATE and DELETE you run lands here — and ripples through the background.
          </p>
          {feed.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No mutations yet"
                hint="Head to Data Studio and create a user or a course — this feed (and the vault behind it) reacts live."
              />
            </div>
          ) : (
            <ul className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
              {feed.slice(0, 12).map((m) => {
                const s = FEED_STYLE[m.type];
                return (
                  <li
                    key={m.id}
                    className={"flex items-center gap-3 rounded-2xl border px-3 py-2.5 " + s.ring}
                  >
                    <s.Icon size={16} className={"shrink-0 " + s.icon} aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-sm">{m.label}</span>
                    <span className="shrink-0 text-xs text-[var(--muted)]">{timeAgo(m.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
