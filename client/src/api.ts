/* ============================================================
   CourseVault API client.
   - Same-origin fetch wrapper (Vite proxies /api in dev;
     Express serves client/dist in production).
   - ALWAYS appends ?inspect=1; the server only honors it when
     DEMO_SQL_INSPECTOR=true. Returned meta.queries feed the
     Query Inspector (lastQueries store).
   - Dispatches window CustomEvents the animated background
     listens to: db:insert / db:update / db:delete / db:error.
   - Recent mutations are kept in mutationFeed (newest first).
   - Non-2xx responses throw ApiError { status, problem }
     (RFC 9457 problem+json) — SQL text is never exposed.
   ============================================================ */

const BASE = "/api/v1";

/* ---------------- types ---------------- */

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ListResponse<T> {
  data: T[];
  meta: PageMeta;
}

export type Role = "learner" | "instructor";
export type Level = "beginner" | "intermediate" | "advanced";
export type EnrollmentStatus = "active" | "completed" | "dropped";

export interface Profile {
  bio: string | null;
  country: string | null;
  age: number | null;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
  profile?: Profile | null;
}

export interface Course {
  id: string;
  instructorId: string;
  title: string;
  description: string | null;
  level: Level;
  seats: number;
  startDate: string;
  createdAt: string;
  updatedAt: string;
  instructor?: { id: string; name: string; email: string } | null;
  enrolledCount?: number;
}

export interface Enrollment {
  userId: string;
  courseId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  user?: { id: string; name: string; email: string } | null;
  course?: { id: string; title: string; level: Level } | null;
}

export interface Stats {
  totals: { users: number; courses: number; enrollments: number };
  coursesPerLevel: { level: string; count: number }[];
  fillRate: { totalSeats: number; activeEnrollments: number; ratePct: number };
  topCourses: { id: string; title: string; enrolledCount: number }[];
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
  isPrimaryKey: boolean;
}

export interface SchemaForeignKey {
  name: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  onDelete: string;
}

export interface SchemaUnique {
  name: string;
  columns: string[];
}

export interface SchemaCheck {
  name: string;
  definition: string;
}

export interface SchemaIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
  primaryKey: string[];
  foreignKeys: SchemaForeignKey[];
  uniques: SchemaUnique[];
  checks: SchemaCheck[];
  indexes: SchemaIndex[];
}

export interface SchemaInfo {
  tables: SchemaTable[];
}

export interface SqlQuery {
  sql: string;
  params: unknown[];
  durationMs: number;
}

export interface QueryLog {
  id: number;
  at: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  queries: SqlQuery[];
  requestId: string | null;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors: { field?: string; message: string }[];
}

export class ApiError extends Error {
  status: number;
  problem: ProblemDetail;

  constructor(status: number, problem: ProblemDetail) {
    super(problem.detail || problem.title || `Request failed (${status})`);
    this.name = "ApiError";
    this.status = status;
    this.problem = problem;
  }
}

export interface MutationEvent {
  id: number;
  type: "insert" | "update" | "delete";
  table: string;
  label: string;
  at: string;
}

export interface InjectionDemoResult {
  naiveQueryWouldBe: string;
  parameterizedQuery: string;
  params: unknown[];
  executed: string;
  rowsReturned: number;
  rows: Record<string, unknown>[];
}

/* ---------------- stores ---------------- */

type Listener<T> = (value: T) => void;

function createStore<T>(initial: T, cap: number) {
  let value = initial;
  const listeners = new Set<Listener<T>>();
  return {
    get(): T {
      return value;
    },
    push(item: T extends (infer U)[] ? U : never): void {
      value = [item, ...(value as unknown[])] .slice(0, cap) as T;
      listeners.forEach((l) => l(value));
    },
    subscribe(fn: Listener<T>): () => void {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

const queryStore = createStore<QueryLog[]>([], 50);
const feedStore = createStore<MutationEvent[]>([], 30);

/** SQL executed by recent requests (newest first). Populated only when the
 *  server honors ?inspect=1 (DEMO_SQL_INSPECTOR=true). */
export const lastQueries = {
  get: queryStore.get,
  subscribe: queryStore.subscribe,
};

/** Recent successful mutations (newest first, max 30). */
export const mutationFeed = {
  get items(): MutationEvent[] {
    return feedStore.get();
  },
  subscribe: feedStore.subscribe,
};

let seq = 0;
const nextId = () => ++seq;

/* ---------------- helpers ---------------- */

function tableForPath(path: string): string {
  if (path.includes("/enrollments")) return "enrollments";
  if (path.includes("/profile")) return "profiles";
  if (path.includes("/users")) return "users";
  if (path.includes("/courses")) return "courses";
  if (path.includes("/lab/")) return "lab";
  return "unknown";
}

/** Pull a likely id (uuid or composite key tail) out of the path or body. */
function idForPath(path: string, json: unknown): string {
  if (json && typeof json === "object" && "id" in json && typeof (json as { id: unknown }).id === "string") {
    return (json as { id: string }).id.slice(0, 8);
  }
  const segs = path.split("/").filter(Boolean);
  const last = segs[segs.length - 1] ?? "";
  if (/^[0-9a-f-]{8,}$/i.test(last)) return last.slice(0, 8);
  return "";
}

function labelFor(method: string, path: string, body: unknown, json: unknown): string {
  const table = tableForPath(path);
  const id = idForPath(path, json);
  const b = (body ?? {}) as Record<string, unknown>;
  const name =
    typeof b.name === "string"
      ? `"${b.name}"`
      : typeof b.title === "string"
        ? `"${b.title}"`
        : id
          ? `#${id}`
          : "";
  const singular = table.endsWith("s") ? table.slice(0, -1) : table;
  if (method === "POST") return table === "enrollments" ? `Enrolled ${String(b.userId ?? "").slice(0, 8)}` : `Created ${singular} ${name}`.trim();
  if (method === "PUT" || method === "PATCH") return `Updated ${singular} ${name}`.trim();
  if (method === "DELETE") return `Deleted ${singular} ${name}`.trim();
  return `${method} ${path}`;
}

function dispatchDbEvent(name: "db:insert" | "db:update" | "db:delete" | "db:error", detail: Record<string, unknown>) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  }
}

/* ---------------- core request ---------------- */

interface RequestOptions {
  query?: Record<string, string | number | undefined>;
}

async function request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(BASE + path, window.location.origin);
  // The Query Inspector: always ask; the server only answers when
  // DEMO_SQL_INSPECTOR=true. Off by default in production.
  url.searchParams.set("inspect", "1");
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }

  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    // Network-level failure: surface as a 503-style problem + db:error.
    dispatchDbEvent("db:error", { status: 0, path });
    throw new ApiError(0, {
      type: "about:blank",
      title: "Network error",
      status: 0,
      detail: err instanceof Error ? err.message : "Could not reach the server.",
      errors: [],
    });
  }

  const requestId = res.headers.get("X-Request-Id");
  const durationMs = performance.now() - started;
  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  // Feed the Query Inspector side panel.
  const queries: SqlQuery[] =
    json && typeof json === "object" && "meta" in json && json.meta && typeof json.meta === "object" && "queries" in json.meta
      ? ((json.meta as { queries: SqlQuery[] }).queries ?? [])
      : [];
  queryStore.push({
    id: nextId(),
    at: new Date().toISOString(),
    method,
    path,
    status: res.status,
    durationMs: Math.round(durationMs * 10) / 10,
    queries,
    requestId,
  });

  if (res.status >= 400) {
    dispatchDbEvent("db:error", { status: res.status, path });
    const problem: ProblemDetail =
      json && typeof json === "object" && "title" in json
        ? (json as ProblemDetail)
        : {
            type: "about:blank",
            title: `Request failed`,
            status: res.status,
            detail: `The server returned ${res.status} for ${method} ${path}.`,
            errors: [],
          };
    throw new ApiError(res.status, problem);
  }

  // Successful mutation → animate the vault background + feed.
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    const table = tableForPath(path);
    const type = method === "POST" ? "insert" : method === "DELETE" ? "delete" : "update";
    const label = labelFor(method, path, body, json);
    feedStore.push({ id: nextId(), type, table, label, at: new Date().toISOString() });
    dispatchDbEvent(`db:${type}`, { table, id: idForPath(path, json), label });
  }

  if (res.status === 204) return undefined as T;
  if (json && typeof json === 'object' && 'data' in json && !('meta' in json)) {
    return (json as { data: unknown }).data as T;
  }
  return json as T;
}

/* ---------------- public API ---------------- */

export type UserListParams = {
  role?: Role;
  q?: string;
  page?: number;
  limit?: number;
};

export type CourseListParams = {
  level?: Level;
  q?: string;
  page?: number;
  limit?: number;
};

export const api = {
  health: () => request<{ status: string; version: string; uptime: number }>("GET", "/health"),
  ready: () => request<{ status: string }>("GET", "/ready"),

  users: {
    list: (params: UserListParams = {}) => request<ListResponse<User>>("GET", "/users", undefined, { query: params }),
    create: (body: { name: string; email: string; role: Role }) => request<User>("POST", "/users", body),
    get: (id: string) => request<User>("GET", `/users/${id}`),
    replace: (id: string, body: { name: string; email: string; role: Role }) => request<User>("PUT", `/users/${id}`, body),
    patch: (id: string, body: Partial<{ name: string; email: string; role: Role }>) =>
      request<User>("PATCH", `/users/${id}`, body),
    remove: (id: string) => request<void>("DELETE", `/users/${id}`),
    getProfile: (id: string) => request<Profile>("GET", `/users/${id}/profile`),
    upsertProfile: (id: string, body: { bio?: string | null; country?: string | null; age?: number | null }) =>
      request<Profile>("PUT", `/users/${id}/profile`, body),
    enrollments: (id: string) => request<ListResponse<Enrollment>>("GET", `/users/${id}/enrollments`),
  },

  courses: {
    list: (params: CourseListParams = {}) => request<ListResponse<Course>>("GET", "/courses", undefined, { query: params }),
    create: (body: {
      instructorId: string;
      title: string;
      description?: string | null;
      level: Level;
      seats: number;
      startDate: string;
    }) => request<Course>("POST", "/courses", body),
    get: (id: string) => request<Course>("GET", `/courses/${id}`),
    replace: (
      id: string,
      body: { instructorId: string; title: string; description?: string | null; level: Level; seats: number; startDate: string },
    ) => request<Course>("PUT", `/courses/${id}`, body),
    patch: (id: string, body: Partial<{ title: string; description: string | null; level: Level; seats: number; startDate: string }>) =>
      request<Course>("PATCH", `/courses/${id}`, body),
    remove: (id: string) => request<void>("DELETE", `/courses/${id}`),
    enrollments: (id: string) => request<ListResponse<Enrollment>>("GET", `/courses/${id}/enrollments`),
    enroll: (courseId: string, userId: string) => request<Enrollment>("POST", `/courses/${courseId}/enrollments`, { userId }),
    unenroll: (courseId: string, userId: string) => request<void>("DELETE", `/courses/${courseId}/enrollments/${userId}`),
  },

  stats: () => request<Stats>("GET", "/stats"),
  schema: () => request<SchemaInfo>("GET", "/schema"),

  lab: {
    injectionDemo: (input: string) => request<InjectionDemoResult>("POST", "/lab/injection-demo", { input }),
  },
};

/* ---------------- humanized errors ---------------- */
/** Turn an ApiError (RFC 9457) into a friendly one-liner that names the
 *  database constraint when one fired. Used by Data Studio toasts/modals. */

export function humanizeError(err: unknown): string {
  if (err instanceof ApiError) {
    const { status, problem } = err;
    const detail = problem.detail ?? "";
    if (status === 0) return "Could not reach the server. Is the backend running?";
    if (status === 400) {
      if (/uuid|invalid_text_representation/i.test(detail)) return "That ID is not a valid identifier.";
      return problem.errors[0]?.message ?? detail ?? "Invalid request — check the highlighted fields.";
    }
    if (status === 404) return "That record no longer exists.";
    if (status === 409) {
      if (/email/i.test(detail) && /unique/i.test(detail)) return "This email is already registered — UNIQUE constraint.";
      if (/unique/i.test(detail)) return `Already exists — ${detail || "UNIQUE constraint"}.`;
      if (/foreign key|restrict/i.test(detail)) return "Cannot delete: other records still reference it — FOREIGN KEY constraint.";
      if (/full|seat|capacity/i.test(detail)) return "This course is full — no seats left.";
      return detail || "Conflict — the database refused the change.";
    }
    if (status === 422) {
      if (/check/i.test(detail)) return `Rejected by the database — ${detail || "CHECK constraint"}.`;
      if (/foreign key|does not exist/i.test(detail)) return "Referenced record does not exist — FOREIGN KEY constraint.";
      return problem.errors.map((e) => e.message).join(" ") || detail || "Business rule violation.";
    }
    if (status === 429) return "Too many requests — slow down and try again.";
    if (status === 503) return "Database is temporarily unavailable — try again in a moment.";
    return detail || problem.title || `Request failed (${status}).`;
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
