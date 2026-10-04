import { useState } from "react";
import { motion } from "motion/react";
import {
  CheckCircle2,
  Database,
  FlaskConical,
  Lock,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import {
  ApiError,
  api,
  humanizeError,
  type Course,
  type InjectionDemoResult,
  type Role,
  type User,
} from "../api";
import Field from "../components/Field";
import { toast } from "../components/Toasts";
import { useReducedMotion } from "../lib/fx";

/* ============================================================
   Security — Injection Lab + "database is the final source of
   truth" demos. The naive query string is DISPLAYED ONLY and is
   never sent to the database; only the parameterized query runs.
   ============================================================ */

const PRESETS = ["' OR '1'='1", "' OR 1=1 --", "'; DROP TABLE users; --", "admin'--"];

function VaultDoor({ attempts, held }: { attempts: number; held: boolean }) {
  const reduced = useReducedMotion();
  return (
    <div className="flex flex-col items-center gap-3">
      <div style={{ perspective: "900px" }} aria-hidden="true">
        <motion.div
          key={attempts}
          initial={false}
          animate={attempts > 0 && !reduced ? { rotateY: [0, -14, 10, -6, 3, 0] } : { rotateY: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative flex h-44 w-32 items-center justify-center rounded-2xl border border-emerald-400/40"
          style={{
            transformStyle: "preserve-3d",
            background:
              "linear-gradient(150deg, rgb(52 211 153 / 0.16), rgb(11 13 18 / 0.6) 60%)",
            boxShadow:
              "0 0 32px -6px rgb(52 211 153 / 0.45), inset 1px 1px 0 rgb(255 255 255 / 0.12)",
          }}
        >
          {["top-2 left-2", "top-2 right-2", "bottom-2 left-2", "bottom-2 right-2"].map((pos) => (
            <span key={pos} className={`absolute ${pos} h-1.5 w-1.5 rounded-full bg-emerald-300/70`} />
          ))}
          <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-300/70 bg-black/40">
            <Lock size={22} className="text-emerald-300" />
          </span>
        </motion.div>
      </div>
      <p
        className={
          "chip " + (held ? "chip-check !text-[12px]" : "!text-[12px]")
        }
        role="status"
      >
        <ShieldCheck size={13} aria-hidden="true" />
        {held ? "HELD — injection blocked" : "Vault sealed — run a payload"}
      </p>
    </div>
  );
}

interface DemoDef {
  key: string;
  title: string;
  desc: string;
  req: string;
}

const DEMOS: DemoDef[] = [
  {
    key: "unique",
    title: "UNIQUE — duplicate email",
    desc: "Create a user with an email that is already registered. Postgres fires unique_violation → 409.",
    req: 'POST /users { "email": "<already registered>" }',
  },
  {
    key: "notnull",
    title: "NOT NULL — missing name",
    desc: "POST /users without a name. The API's Zod gate rejects it first (400) — syntactic validation, before SQL ever runs.",
    req: 'POST /users { "email": "noname@example.com", "role": "learner" }  (no name)',
  },
  {
    key: "check",
    title: "CHECK — impossible age",
    desc: "Upsert a profile with age 200. Postgres fires check_violation → 422. The database is the final source of truth.",
    req: 'PUT /users/:id/profile { "age": 200 }',
  },
  {
    key: "fk",
    title: "FOREIGN KEY — ghost user",
    desc: "Enroll a user id that does not exist. Postgres fires foreign_key_violation → 422.",
    req: 'POST /courses/:id/enrollments { "userId": "00000000-0000-…" }',
  },
];

const STATUS_TONE: Record<number, string> = {
  200: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  400: "border-indigo-400/40 bg-indigo-400/10 text-indigo-300",
  409: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  422: "border-violet-400/40 bg-violet-400/10 text-violet-300",
};

export default function Security() {
  const [payload, setPayload] = useState(PRESETS[1]);
  const [result, setResult] = useState<InjectionDemoResult | null>(null);
  const [running, setRunning] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const [demoRunning, setDemoRunning] = useState<string | null>(null);
  const [demoResults, setDemoResults] = useState<Record<string, { status: number; detail: string }>>({});

  const naive = `SELECT id, name, email FROM users WHERE email ILIKE '%${payload}%'`;

  const runInjection = async () => {
    setRunning(true);
    try {
      const r = await api.lab.injectionDemo(payload);
      setResult(r);
      setAttempts((a) => a + 1);
      toast("Parameterized query executed safely — vault held", "success");
    } catch (e) {
      toast(humanizeError(e), "error");
    } finally {
      setRunning(false);
    }
  };

  /* Seed helpers — the demos need at least one user and one course. */
  const ensureUser = async (): Promise<User> => {
    const list = await api.users.list({ limit: 1 });
    if (list.data.length > 0) return list.data[0];
    return api.users.create({
      name: "Demo Learner",
      email: `demo-${Date.now()}@example.com`,
      role: "learner",
    });
  };
  const ensureCourse = async (): Promise<Course> => {
    const list = await api.courses.list({ limit: 1 });
    if (list.data.length > 0) return list.data[0];
    const instructors = await api.users.list({ role: "instructor", limit: 1 });
    const instructor =
      instructors.data[0] ??
      (await api.users.create({
        name: "Demo Instructor",
        email: `instructor-${Date.now()}@example.com`,
        role: "instructor",
      }));
    return api.courses.create({
      instructorId: instructor.id,
      title: `Demo Course ${Date.now()}`,
      level: "beginner",
      seats: 50,
      startDate: new Date().toISOString().slice(0, 10),
    });
  };

  const runDemo = async (def: DemoDef) => {
    setDemoRunning(def.key);
    try {
      if (def.key === "unique") {
        const u = await ensureUser();
        await api.users.create({ name: "Copycat", email: u.email, role: "learner" });
      } else if (def.key === "notnull") {
        await api.users.create({
          email: "noname@example.com",
          role: "learner",
        } as unknown as { name: string; email: string; role: Role });
      } else if (def.key === "check") {
        const u = await ensureUser();
        await api.users.upsertProfile(u.id, { age: 200 });
      } else {
        const c = await ensureCourse();
        await api.courses.enroll(c.id, "00000000-0000-0000-0000-000000000000");
      }
      setDemoResults((r) => ({
        ...r,
        [def.key]: { status: 200, detail: "Unexpectedly accepted — this should not happen." },
      }));
    } catch (e) {
      if (e instanceof ApiError) {
        setDemoResults((r) => ({
          ...r,
          [def.key]: { status: e.status, detail: e.problem.detail ?? e.problem.title },
        }));
        toast(`Rejected with ${e.status} — as designed`, "success");
      } else {
        setDemoResults((r) => ({ ...r, [def.key]: { status: 0, detail: humanizeError(e) } }));
        toast(humanizeError(e), "error");
      }
    } finally {
      setDemoRunning(null);
    }
  };

  return (
    <section className="page mx-auto w-full max-w-6xl pt-24 md:pt-28" aria-labelledby="security-title">
      <p className="chip mb-3">
        <ShieldCheck size={12} aria-hidden="true" /> Injection lab
      </p>
      <h1 id="security-title" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Attack the vault. <span className="text-emerald-400">Watch it hold.</span>
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] text-[var(--muted)]">
        The vulnerable query is <strong className="text-[var(--ink)]">displayed only</strong> — it
        is never sent to the database. Only the parameterized query executes.
      </p>

      {/* payload picker */}
      <div className="glass mt-5 p-5 sm:p-6" data-reveal>
        <Field label="Injection payload" htmlFor="sec-payload">
          <input
            id="sec-payload"
            className="input font-mono"
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Payload presets">
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPayload(p)}
              aria-pressed={payload === p}
              className={
                "chip !normal-case !tracking-normal hover:!border-indigo-400/60 " +
                (payload === p ? "!border-indigo-400/70 !text-indigo-200" : "")
              }
            >
              <span className="font-mono text-[11px]">{p}</span>
            </button>
          ))}
        </div>
        <div className="mt-4">
          <button type="button" className="btn btn-primary" onClick={runInjection} disabled={running}>
            <FlaskConical size={16} aria-hidden="true" />
            {running ? "Testing…" : "Run attack test"}
          </button>
        </div>
      </div>

      {/* split view */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="glass border-[color-mix(in_oklch,var(--rose)_30%,transparent)] p-5 sm:p-6" data-reveal aria-label="Vulnerable pattern">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <TriangleAlert size={17} className="text-[var(--rose)]" aria-hidden="true" />
              Vulnerable pattern
            </h2>
            <span className="chip !border-[color-mix(in_oklch,var(--rose)_50%,transparent)] !text-[var(--rose)]">displayed — never executed</span>
          </div>
          <pre className="mt-4 overflow-x-auto rounded-2xl border border-[color-mix(in_oklch,var(--rose)_25%,transparent)] bg-[color-mix(in_oklch,var(--rose)_10%,transparent)] p-4 font-mono text-[13px] leading-relaxed">
            <code className="text-[var(--ink)] opacity-90 font-bold">
              {naive.split(payload).map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && payload !== "" && (
                    <mark className="rounded bg-[color-mix(in_oklch,var(--rose)_30%,transparent)] px-0.5 text-[var(--rose)]">{payload}</mark>
                  )}
                </span>
              ))}
            </code>
          </pre>
          <p className="mt-3 flex items-start gap-2 text-sm leading-relaxed text-[var(--ink)] opacity-80">
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-[var(--rose)]" aria-hidden="true" />
            <span>
              String concatenation lets the payload rewrite the query — this would return{" "}
              <strong>every row</strong> in users, or worse. It never reaches Postgres here.
            </span>
          </p>
        </div>

        <div className="glass border-[color-mix(in_oklch,var(--emerald)_30%,transparent)] p-5 sm:p-6" data-reveal aria-label="Parameterized query">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-base font-bold">
              <ShieldCheck size={17} className="text-[var(--emerald)]" aria-hidden="true" />
              Parameterized query
            </h2>
            <span className="chip chip-check">executed safely</span>
          </div>
          <pre className="mt-4 overflow-x-auto rounded-2xl border border-[color-mix(in_oklch,var(--emerald)_25%,transparent)] bg-[color-mix(in_oklch,var(--emerald)_10%,transparent)] p-4 font-mono text-[13px] leading-relaxed">
            <code className="text-[var(--ink)] opacity-90 font-bold">
              {`SELECT id, name, email\nFROM users\nWHERE email ILIKE $1;`}
            </code>
          </pre>
          <p className="mt-2 font-mono text-xs break-all text-[var(--muted)]">
            params: {JSON.stringify(result ? result.params : [`%${payload}%`])}
          </p>
          <div className="mt-3 flex items-center gap-6" aria-live="polite">
            <VaultDoor attempts={attempts} held={result !== null} />
            <div className="text-sm">
              <p className="font-mono text-xs text-[var(--faint)]">executed: parameterized</p>
              <p className="mt-1 font-display text-2xl font-bold tabular-nums">
                {result ? result.rowsReturned : "—"}
                <span className="ml-1 text-sm font-medium text-[var(--muted)]">rows returned</span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                The payload is data, never code — <code className="font-mono">$1</code> is bound by
                the driver, so <code className="font-mono">OR 1=1</code> matches nothing.
              </p>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-[var(--faint)]">
        The naive string is never sent to the database. Only <code className="font-mono">$1</code>-style
        parameters leave this page.
      </p>

      {/* final source of truth */}
      <div className="glass mt-6 p-5 sm:p-6" data-reveal aria-label="Constraint demos">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <Database size={18} className="text-violet-300" aria-hidden="true" />
          The database is the final source of truth
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
          Validation happens twice — Zod at the API, constraints in Postgres. These buttons fire
          real requests at the real API and show the database rejecting each one.{" "}
          <strong className="text-[var(--ink)]">400</strong> = syntactic (the API gate),{" "}
          <strong className="text-[var(--ink)]">422 / 409</strong> = the constraint itself fired.
        </p>
        <ul className="mt-5 grid gap-3 md:grid-cols-2">
          {DEMOS.map((d) => {
            const res = demoResults[d.key];
            const busy = demoRunning === d.key;
            return (
              <li key={d.key} className="rounded-3xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold">{d.title}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{d.desc}</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm shrink-0"
                    onClick={() => runDemo(d)}
                    disabled={busy || demoRunning !== null}
                  >
                    {busy ? "Trying…" : "Try it"}
                  </button>
                </div>
                <p className="mt-3 font-mono text-[11px] break-all text-[var(--faint)]">{d.req}</p>
                {res && (
                  <div className="mt-3 space-y-2" aria-live="polite">
                    <p>
                      <span className={"chip " + (STATUS_TONE[res.status] ?? "chip-check")}>
                        {res.status === 0 ? "network error" : `HTTP ${res.status}`}
                      </span>
                    </p>
                    <pre className="overflow-x-auto rounded-xl bg-black/30 p-3 font-mono text-[11px] leading-relaxed break-all whitespace-pre-wrap text-[var(--muted)]">
                      {res.detail}
                    </pre>
                    {res.status >= 400 && (
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                        <CheckCircle2 size={14} aria-hidden="true" />
                        Rejected — the database is the final source of truth.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
