import {
  BookOpen,
  ExternalLink,
  FlaskConical,
  GitBranch,
  Network,
  Scale,
  Users,
  type LucideIcon,
} from "lucide-react";

/* ============================================================
   Docs — endpoint reference, CRUD↔HTTP↔SQL mapping, and the
   decision records (native driver vs ORM, SQL vs NoSQL).
   ============================================================ */

interface Endpoint {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  desc: string;
}

interface Group {
  title: string;
  icon: LucideIcon;
  endpoints: Endpoint[];
}

const METHOD_STYLE: Record<Endpoint["method"], string> = {
  GET: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  POST: "border-indigo-400/40 bg-indigo-400/10 text-indigo-300",
  PUT: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  PATCH: "border-violet-400/40 bg-violet-400/10 text-violet-300",
  DELETE: "border-rose-400/40 bg-rose-400/10 text-rose-300",
};

const GROUPS: Group[] = [
  {
    title: "Users",
    icon: Users,
    endpoints: [
      { method: "GET", path: "/api/v1/users", desc: "List users — filters role and q (ILIKE with an escaped parameter), page + limit, total count." },
      { method: "POST", path: "/api/v1/users", desc: "Create a user → 201 + Location header." },
      { method: "GET", path: "/api/v1/users/:id", desc: "Fetch one user with their 1:1 profile." },
      { method: "PUT", path: "/api/v1/users/:id", desc: "Full replacement of a user." },
      { method: "PATCH", path: "/api/v1/users/:id", desc: "Partial update of a user." },
      { method: "DELETE", path: "/api/v1/users/:id", desc: "Delete → 204. Profile and enrollments cascade." },
      { method: "GET", path: "/api/v1/users/:id/profile", desc: "Fetch the 1:1 profile (404 when absent)." },
      { method: "PUT", path: "/api/v1/users/:id/profile", desc: "Upsert the 1:1 profile." },
      { method: "GET", path: "/api/v1/users/:id/enrollments", desc: "Every enrollment for one user." },
    ],
  },
  {
    title: "Courses",
    icon: BookOpen,
    endpoints: [
      { method: "GET", path: "/api/v1/courses", desc: "List courses — filters level and q, page + limit." },
      { method: "POST", path: "/api/v1/courses", desc: "Create a course → 201 + Location header." },
      { method: "GET", path: "/api/v1/courses/:id", desc: "Course with its instructor and enrolledCount." },
      { method: "PUT", path: "/api/v1/courses/:id", desc: "Full replacement of a course." },
      { method: "PATCH", path: "/api/v1/courses/:id", desc: "Partial update of a course." },
      { method: "DELETE", path: "/api/v1/courses/:id", desc: "Delete → 204. Rejected when enrollments exist (ON DELETE RESTRICT)." },
    ],
  },
  {
    title: "Enrollments — the M:M junction",
    icon: Network,
    endpoints: [
      { method: "GET", path: "/api/v1/courses/:id/enrollments", desc: "Enrollments for one course." },
      { method: "POST", path: "/api/v1/courses/:id/enrollments", desc: "Enroll { userId } → 201. Capacity is checked in ONE transaction: SELECT … FOR UPDATE, count, then INSERT — 409 when full." },
      { method: "DELETE", path: "/api/v1/courses/:id/enrollments/:userId", desc: "Unenroll → 204." },
    ],
  },
  {
    title: "Meta & lab",
    icon: FlaskConical,
    endpoints: [
      { method: "GET", path: "/api/v1/stats", desc: "JOIN + GROUP BY aggregates: courses per level, seat fill rate, top courses." },
      { method: "GET", path: "/api/v1/schema", desc: "Read-only introspection (information_schema + pg_constraint) powering the Schema screen." },
      { method: "GET", path: "/api/v1/health", desc: "Liveness probe." },
      { method: "GET", path: "/api/v1/ready", desc: "Readiness probe — runs SELECT 1 against the pool." },
      { method: "POST", path: "/api/v1/lab/injection-demo", desc: "Injection lab — executes ONLY the parameterized query, never the naive string." },
    ],
  },
];

const MAPPING = [
  {
    crud: "Create",
    http: "POST",
    sql: "INSERT",
    status: "201 Created",
    note: "Returns a Location header pointing at the new row.",
  },
  {
    crud: "Read",
    http: "GET",
    sql: "SELECT",
    status: "200 OK",
    note: "Safe and idempotent. Filtering, search and pagination ride on query params.",
  },
  {
    crud: "Update",
    http: "PUT / PATCH",
    sql: "UPDATE",
    status: "200 OK",
    note: "PUT replaces the whole row, PATCH merges fields — both are idempotent.",
  },
  {
    crud: "Delete",
    http: "DELETE",
    sql: "DELETE",
    status: "204 No Content",
    note: "No response body. Foreign keys decide: CASCADE wipes children, RESTRICT refuses.",
  },
];

export default function Docs() {
  return (
    <section className="page mx-auto w-full max-w-6xl pt-24 md:pt-28" aria-labelledby="docs-title">
      <p className="chip mb-3">Reference</p>
      <h1 id="docs-title" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Docs &amp; <span className="text-indigo-400">decisions</span>
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] text-[var(--muted)]">
        Every endpoint, the CRUD ↔ HTTP ↔ SQL mapping, and why this stack was chosen.
      </p>

      {/* Scalar link */}
      <a
        href="/reference"
        target="_blank"
        rel="noreferrer"
        data-reveal
        className="glass group mt-5 flex items-center gap-4 p-5 transition-transform duration-150 hover:-translate-y-0.5"
        aria-label="Open the interactive Scalar API reference (opens in a new tab)"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300">
          <BookOpen size={22} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-display text-base font-bold">Interactive API reference</span>
          <span className="block truncate font-mono text-xs text-[var(--muted)]">
            /reference — OpenAPI 3.1 generated from the Zod schemas, rendered by Scalar
          </span>
        </span>
        <ExternalLink size={18} className="shrink-0 text-[var(--faint)] transition-colors group-hover:text-indigo-300" aria-hidden="true" />
      </a>

      {/* endpoints */}
      <div className="mt-6 space-y-6">
        {GROUPS.map((g) => (
          <section key={g.title} data-reveal aria-label={`${g.title} endpoints`}>
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold tracking-tight">
              <g.icon size={18} className="text-indigo-300" aria-hidden="true" />
              {g.title}
            </h2>
            <ul className="panel divide-y divide-white/5 overflow-hidden">
              {g.endpoints.map((e) => (
                <li key={e.method + e.path} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-baseline sm:gap-4">
                  <span className={"chip shrink-0 !text-[11px] " + METHOD_STYLE[e.method]}>
                    {e.method}
                  </span>
                  <code className="shrink-0 font-mono text-[13px] text-indigo-200">{e.path}</code>
                  <span className="text-sm leading-relaxed text-[var(--muted)]">{e.desc}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* mapping table */}
      <section className="mt-8" data-reveal aria-label="CRUD to HTTP to SQL mapping">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <GitBranch size={18} className="text-indigo-300" aria-hidden="true" />
          CRUD ↔ HTTP ↔ SQL
        </h2>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {["CRUD", "HTTP", "SQL", "Status", "Note"].map((h) => (
                  <th key={h} scope="col" className="px-4 py-3 text-xs font-semibold tracking-wider text-[var(--muted)] uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {MAPPING.map((m) => (
                <tr key={m.crud} className="align-top">
                  <td className="px-4 py-3 font-semibold">{m.crud}</td>
                  <td className="px-4 py-3">
                    <span className="chip !text-[11px]">{m.http}</span>
                  </td>
                  <td className="px-4 py-3">
                    <code className="font-mono text-[13px] text-amber-300">{m.sql}</code>
                  </td>
                  <td className="px-4 py-3 font-mono text-[13px] text-[var(--muted)]">{m.status}</td>
                  <td className="px-4 py-3 text-[var(--muted)]">{m.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* decision records */}
      <section className="mt-8" data-reveal aria-label="Decision records">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <Scale size={18} className="text-indigo-300" aria-hidden="true" />
          Decision records
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="glass p-6">
            <h3 className="font-display text-base font-bold">Native <code className="font-mono">pg</code> driver vs ORM</h3>
            <p className="mt-1 text-xs font-semibold tracking-wider text-emerald-300 uppercase">
              Decision: native pg Pool — no ORM
            </p>
            <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-[var(--muted)]">
              <p>
                <strong className="text-[var(--ink)]">Why:</strong> this is Project 3 —{" "}
                <em>Database Integration</em>. The point is learning SQL, and an ORM would hide the
                very thing being graded. The native driver gives full control over transactions
                (the enrollment capacity check), zero magic, and the smallest possible dependency
                surface.
              </p>
              <p>
                <strong className="text-[var(--ink)]">Trade-offs:</strong> more boilerplate, and
                every row must be mapped from snake_case to camelCase by hand. Worth it here —
                the mapping is explicit and reviewable.
              </p>
              <p>
                <strong className="text-[var(--ink)]">Migration path:</strong> ALL SQL lives in the
                repository layer. Drizzle or Prisma 7 can replace the repositories later without
                touching a single route.
              </p>
            </div>
          </article>
          <article className="glass p-6">
            <h3 className="font-display text-base font-bold">Why PostgreSQL over NoSQL</h3>
            <p className="mt-1 text-xs font-semibold tracking-wider text-emerald-300 uppercase">
              Decision: PostgreSQL 17 — relational, constraints-first
            </p>
            <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-[var(--muted)]">
              <p>
                <strong className="text-[var(--ink)]">Relations are first-class:</strong> 1:1
                (user ↔ profile), 1:M (instructor → courses) and M:M through a real junction table
                (enrollments) — exactly what this domain is.
              </p>
              <p>
                <strong className="text-[var(--ink)]">Constraints are the final source of truth:</strong>{" "}
                UNIQUE, NOT NULL, CHECK and FOREIGN KEY are enforced by the engine, not by
                application code that can drift. A document store would push all of this into
                hand-rolled validation.
              </p>
              <p>
                <strong className="text-[var(--ink)]">JOINs + ACID:</strong> the /stats dashboard is
                JOIN + GROUP BY, and the last-seat enrollment race is won by a single ACID
                transaction — both awkward without a relational engine.
              </p>
            </div>
          </article>
        </div>
      </section>
    </section>
  );
}
