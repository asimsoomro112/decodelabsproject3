import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { motion } from "motion/react";
import {
  ArrowDownUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Pencil,
  Plus,
  Search,
  Terminal,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  ApiError,
  api,
  humanizeError,
  lastQueries,
  type Course,
  type Enrollment,
  type EnrollmentStatus,
  type Level,
  type QueryLog,
  type Role,
  type User,
} from "../api";
import Modal from "../components/Modal";
import Field from "../components/Field";
import EmptyState from "../components/EmptyState";
import { toast } from "../components/Toasts";

/* ============================================================
   Data Studio — Users | Courses | Enrollments.
   Search + filters + sorting + pagination, create/edit modals,
   optimistic deletes with rollback, humanized constraint errors,
   and a Query Inspector showing the exact SQL per request.
   ============================================================ */

type TabId = "users" | "courses" | "enrollments";
const TABS: { id: TabId; label: string }[] = [
  { id: "users", label: "Users" },
  { id: "courses", label: "Courses" },
  { id: "enrollments", label: "Enrollments" },
];
const PAGE_SIZE = 8;

const ROLE_BADGE: Record<Role, string> = {
  learner: "border-indigo-400/40 bg-indigo-400/10 text-indigo-300",
  instructor: "border-amber-400/40 bg-amber-400/10 text-amber-300",
};
const LEVEL_BADGE: Record<Level, string> = {
  beginner: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  intermediate: "border-indigo-400/40 bg-indigo-400/10 text-indigo-300",
  advanced: "border-amber-400/40 bg-amber-400/10 text-amber-300",
};
const STATUS_BADGE: Record<EnrollmentStatus, string> = {
  active: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  completed: "border-indigo-400/40 bg-indigo-400/10 text-indigo-300",
  dropped: "border-white/20 bg-white/5 text-[var(--muted)]",
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function sortRows<T>(rows: T[], key: (r: T) => string | number, dir: 1 | -1): T[] {
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    const cmp =
      typeof ka === "number" && typeof kb === "number"
        ? ka - kb
        : String(ka).localeCompare(String(kb));
    return cmp * dir;
  });
}

/* ---------------- generic table + pager ---------------- */

interface Col<T> {
  header: string;
  cell: (row: T) => ReactNode;
}

function DataTable<T>({
  cols,
  rows,
  rowKey,
  rowTransitionName,
  empty,
}: {
  cols: Col<T>[];
  rows: T[];
  rowKey: (r: T) => string;
  rowTransitionName?: (r: T) => string | undefined;
  empty: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-white/10">
            {cols.map((c) => (
              <th
                key={c.header}
                scope="col"
                className="px-4 py-3 text-xs font-semibold tracking-wider text-[var(--muted)] uppercase"
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((r) => (
            <tr
              key={rowKey(r)}
              className="transition-colors hover:bg-white/[0.03]"
              style={rowTransitionName ? { viewTransitionName: rowTransitionName(r) } : undefined}
            >
              {cols.map((c) => (
                <td key={c.header} className="px-4 py-3 align-middle">
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <div className="p-4">{empty}</div>}
    </div>
  );
}

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
      <p className="text-xs text-[var(--muted)]" aria-live="polite">
        Page {page} of {totalPages} · {total} total
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-ghost btn-sm !px-3"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm !px-3"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function Toolbar({
  children,
}: {
  children: ReactNode;
}) {
  return <div className="mb-3 flex flex-wrap items-center gap-2">{children}</div>;
}

function SearchBox({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <label className="relative min-w-0 flex-1 sm:max-w-xs">
      <span className="sr-only">{label}</span>
      <Search
        size={15}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[var(--faint)]"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        className="input !pl-9"
      />
    </label>
  );
}

/* ---------------- query inspector ---------------- */

function InspectorBody({ log }: { log: QueryLog | null }) {
  if (!log)
    return (
      <p className="text-sm leading-relaxed text-[var(--muted)]">
        Run any action — list, search, create, edit, delete — and the exact SQL the
        API executed appears here.
      </p>
    );
  return (
    <div className="space-y-3">
      <p className="font-mono text-xs break-all">
        <span className="text-indigo-300">{log.method}</span>{" "}
        <span className="text-[var(--muted)]">{log.path}</span>
        <span className={"ml-2 font-semibold " + (log.status >= 400 ? "text-rose-300" : "text-emerald-300")}>
          → {log.status}
        </span>
        <span className="ml-2 text-[var(--faint)]">{log.durationMs} ms</span>
      </p>
      {log.requestId && (
        <p className="font-mono text-[11px] break-all text-[var(--faint)]">
          x-request-id: {log.requestId}
        </p>
      )}
      {log.queries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-white/15 p-3 text-xs leading-relaxed text-[var(--muted)]">
          No SQL captured for this request. The server only includes{" "}
          <code className="font-mono">meta.queries</code> when{" "}
          <code className="font-mono">DEMO_SQL_INSPECTOR=true</code> — off by default in
          production.
        </p>
      ) : (
        log.queries.map((q, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
            <p className="border-b border-white/10 px-3 py-1.5 font-mono text-[10px] tracking-wider text-[var(--faint)] uppercase">
              query {i + 1} · {q.durationMs} ms
            </p>
            <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-relaxed text-indigo-200">
              {q.sql}
            </pre>
            <p className="border-t border-white/10 px-3 py-1.5 font-mono text-[11px] break-all text-[var(--muted)]">
              params: {JSON.stringify(q.params)}
            </p>
          </div>
        ))
      )}
    </div>
  );
}

/* ---------------- user form ---------------- */

function UserForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: User | null;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [role, setRole] = useState<Role>(initial?.role ?? "learner");
  const [bio, setBio] = useState(initial?.profile?.bio ?? "");
  const [country, setCountry] = useState(initial?.profile?.country ?? "");
  const [age, setAge] = useState(initial?.profile?.age != null ? String(initial.profile.age) : "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const n = name.trim();
    if (n.length < 2 || n.length > 60) e.name = "Name must be 2–60 characters (CHECK constraint).";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Enter a valid email address.";
    if (bio.length > 300) e.bio = "Bio must be at most 300 characters (CHECK constraint).";
    if (age.trim() !== "") {
      const num = Number(age);
      if (!Number.isInteger(num) || num < 16 || num > 100)
        e.age = "Age must be a whole number between 16 and 100 (CHECK constraint).";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const body = { name: name.trim(), email: email.trim().toLowerCase(), role };
      const saved = initial ? await api.users.replace(initial.id, body) : await api.users.create(body);
      if (bio.trim() !== "" || country.trim() !== "" || age.trim() !== "") {
        await api.users.upsertProfile(saved.id, {
          bio: bio.trim() === "" ? null : bio.trim(),
          country: country.trim() === "" ? null : country.trim(),
          age: age.trim() === "" ? null : Number(age),
        });
      }
      onSaved(initial ? `User "${saved.name}" updated` : `User "${saved.name}" created`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const e: Record<string, string> = {};
        for (const fe of err.problem.errors) if (fe.field) e[fe.field] = fe.message;
        if (err.status === 409 && /email/i.test(err.problem.detail ?? ""))
          e.email = "This email is already registered — UNIQUE constraint on lower(email).";
        if (Object.keys(e).length > 0) setErrors(e);
      }
      toast(humanizeError(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Name" htmlFor="uf-name" required error={errors.name}>
        <input id="uf-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
      </Field>
      <Field label="Email" htmlFor="uf-email" required error={errors.email}>
        <input id="uf-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
      </Field>
      <Field label="Role" htmlFor="uf-role">
        <select id="uf-role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          <option value="learner">learner</option>
          <option value="instructor">instructor</option>
        </select>
      </Field>
      <fieldset className="rounded-2xl border border-white/10 p-4">
        <legend className="px-2 text-xs font-semibold tracking-wider text-[var(--muted)] uppercase">
          1:1 profile (optional)
        </legend>
        <div className="space-y-4">
          <Field label="Bio" htmlFor="uf-bio" error={errors.bio}>
            <textarea id="uf-bio" className="input min-h-20" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} placeholder="A line or two…" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Country" htmlFor="uf-country">
              <input id="uf-country" className="input" value={country} onChange={(e) => setCountry(e.target.value)} />
            </Field>
            <Field label="Age" htmlFor="uf-age" error={errors.age}>
              <input id="uf-age" type="number" min={16} max={100} className="input" value={age} onChange={(e) => setAge(e.target.value)} />
            </Field>
          </div>
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create user"}
        </button>
      </div>
    </form>
  );
}

/* ---------------- course form ---------------- */

function CourseForm({
  initial,
  instructors,
  onClose,
  onSaved,
}: {
  initial: Course | null;
  instructors: User[];
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [instructorId, setInstructorId] = useState(initial?.instructorId ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [level, setLevel] = useState<Level>(initial?.level ?? "beginner");
  const [seats, setSeats] = useState(initial ? String(initial.seats) : "30");
  const [startDate, setStartDate] = useState(initial?.startDate.slice(0, 10) ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const t = title.trim();
    if (t.length < 3 || t.length > 80) e.title = "Title must be 3–80 characters (CHECK constraint).";
    if (!instructorId) e.instructorId = "Pick an instructor (FOREIGN KEY to users).";
    const s = Number(seats);
    if (!Number.isInteger(s) || s < 1 || s > 500) e.seats = "Seats must be 1–500 (CHECK constraint).";
    if (!startDate) e.startDate = "Start date is required (NOT NULL).";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const body = {
        instructorId,
        title: title.trim(),
        description: description.trim() === "" ? null : description.trim(),
        level,
        seats: Number(seats),
        startDate,
      };
      const saved = initial ? await api.courses.replace(initial.id, body) : await api.courses.create(body);
      onSaved(initial ? `Course "${saved.title}" updated` : `Course "${saved.title}" created`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const e: Record<string, string> = {};
        for (const fe of err.problem.errors) if (fe.field) e[fe.field] = fe.message;
        if (err.status === 409 && /title/i.test(err.problem.detail ?? ""))
          e.title = "This instructor already has a course with that title — UNIQUE (instructor_id, title).";
        if (Object.keys(e).length > 0) setErrors(e);
      }
      toast(humanizeError(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Title" htmlFor="cf-title" required error={errors.title}>
        <input id="cf-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
      </Field>
      <Field label="Instructor" htmlFor="cf-instructor" required error={errors.instructorId}>
        <select id="cf-instructor" className="input" value={instructorId} onChange={(e) => setInstructorId(e.target.value)}>
          <option value="">Select an instructor…</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} ({i.email})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Description" htmlFor="cf-desc">
        <textarea id="cf-desc" className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What will learners build?" />
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Level" htmlFor="cf-level">
          <select id="cf-level" className="input" value={level} onChange={(e) => setLevel(e.target.value as Level)}>
            <option value="beginner">beginner</option>
            <option value="intermediate">intermediate</option>
            <option value="advanced">advanced</option>
          </select>
        </Field>
        <Field label="Seats" htmlFor="cf-seats" required error={errors.seats}>
          <input id="cf-seats" type="number" min={1} max={500} className="input" value={seats} onChange={(e) => setSeats(e.target.value)} />
        </Field>
        <Field label="Start date" htmlFor="cf-date" required error={errors.startDate}>
          <input id="cf-date" type="date" className="input" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? "Saving…" : initial ? "Save changes" : "Create course"}
        </button>
      </div>
    </form>
  );
}

/* ---------------- enroll form ---------------- */

function EnrollForm({
  learners,
  courses,
  presetCourseId,
  onClose,
  onSaved,
}: {
  learners: User[];
  courses: Course[];
  presetCourseId: string;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const [userId, setUserId] = useState("");
  const [courseId, setCourseId] = useState(presetCourseId);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (!userId) e.userId = "Pick a learner.";
    if (!courseId) e.courseId = "Pick a course.";
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    try {
      await api.courses.enroll(courseId, userId);
      onSaved("Enrollment created");
      onClose();
    } catch (err) {
      toast(humanizeError(err), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field label="Learner" htmlFor="ef-user" required error={errors.userId}>
        <select id="ef-user" className="input" value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Select a learner…</option>
          {learners.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.email})
            </option>
          ))}
        </select>
      </Field>
      <Field label="Course" htmlFor="ef-course" required error={errors.courseId}>
        <select id="ef-course" className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          <option value="">Select a course…</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.enrolledCount ?? "?"} / {c.seats} seats)
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs leading-relaxed text-[var(--muted)]">
        Enrolling runs in <strong className="text-[var(--ink)]">one transaction</strong>: the course
        row is locked, active enrollments are counted, and the insert is rejected with 409 when the
        course is full — no overselling, even under concurrency.
      </p>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
          {saving ? "Enrolling…" : "Enroll learner"}
        </button>
      </div>
    </form>
  );
}

/* ---------------- main screen ---------------- */

export default function Studio() {
  const [tab, setTab] = useState<TabId>("users");
  const [loading, setLoading] = useState(false);
  const [liveMsg, setLiveMsg] = useState("");
  const [inspector, setInspector] = useState<QueryLog | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [uTotal, setUTotal] = useState(0);
  const [uPage, setUPage] = useState(1);
  const [uRole, setURole] = useState("");
  const [uQ, setUQ] = useState("");
  const [uQDeb, setUQDeb] = useState("");
  const [uSort, setUSort] = useState("name");
  const [uDir, setUDir] = useState<1 | -1>(1);

  const [courses, setCourses] = useState<Course[]>([]);
  const [cTotal, setCTotal] = useState(0);
  const [cPage, setCPage] = useState(1);
  const [cLevel, setCLevel] = useState("");
  const [cQ, setCQ] = useState("");
  const [cQDeb, setCQDeb] = useState("");
  const [cSort, setCSort] = useState("title");
  const [cDir, setCDir] = useState<1 | -1>(1);

  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [eCourse, setECourse] = useState("all");
  const [eSort, setESort] = useState("enrolledAt");
  const [eDir, setEDir] = useState<1 | -1>(-1);
  const [courseOptions, setCourseOptions] = useState<Course[]>([]);

  const [userModal, setUserModal] = useState<{ user: User | null } | null>(null);
  const [courseModal, setCourseModal] = useState<{ course: Course | null } | null>(null);
  const [enrollModal, setEnrollModal] = useState(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    body: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [instructors, setInstructors] = useState<User[]>([]);
  const [learners, setLearners] = useState<User[]>([]);

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const courseCache = useRef<Course[] | null>(null);

  /* Track the newest query log after every request for the inspector. */
  const track = async <T,>(promise: Promise<T>): Promise<T> => {
    try {
      const r = await promise;
      setInspector(lastQueries.get()[0] ?? null);
      return r;
    } catch (e) {
      setInspector(lastQueries.get()[0] ?? null);
      throw e;
    }
  };

  const announceSaved = (msg: string) => {
    toast(msg, "success");
    setLiveMsg(msg);
  };

  /* ---------- loaders ---------- */

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await track(
        api.users.list({
          role: (uRole || undefined) as Role | undefined,
          q: uQDeb || undefined,
          page: uPage,
          limit: PAGE_SIZE,
        }),
      );
      setUsers(res.data);
      setUTotal(res.meta.total);
      setLiveMsg(`${res.meta.total} user${res.meta.total === 1 ? "" : "s"} loaded`);
    } catch (e) {
      toast(humanizeError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [uRole, uQDeb, uPage]);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await track(
        api.courses.list({
          level: (cLevel || undefined) as Level | undefined,
          q: cQDeb || undefined,
          page: cPage,
          limit: PAGE_SIZE,
        }),
      );
      setCourses(res.data);
      setCTotal(res.meta.total);
      setLiveMsg(`${res.meta.total} course${res.meta.total === 1 ? "" : "s"} loaded`);
    } catch (e) {
      toast(humanizeError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [cLevel, cQDeb, cPage]);

  const loadEnrollments = useCallback(async () => {
    setLoading(true);
    try {
      if (courseCache.current === null) {
        const r = await track(api.courses.list({ limit: 50 }));
        courseCache.current = r.data;
        setCourseOptions(r.data);
      }
      const opts = courseCache.current;
      const targets = eCourse === "all" ? opts.slice(0, 12) : opts.filter((c) => c.id === eCourse);
      const settled = await Promise.allSettled(
        targets.map((c) => track(api.courses.enrollments(c.id))),
      );
      const merged: Enrollment[] = [];
      settled.forEach((s, i) => {
        if (s.status === "fulfilled") {
          for (const e of s.value.data)
            merged.push({
              ...e,
              course: e.course ?? { id: targets[i].id, title: targets[i].title, level: targets[i].level },
            });
        }
      });
      setEnrollments(merged);
      setLiveMsg(`${merged.length} enrollment${merged.length === 1 ? "" : "s"} loaded`);
    } catch (e) {
      toast(humanizeError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [eCourse]);

  useEffect(() => {
    if (tab === "users") loadUsers();
    else if (tab === "courses") loadCourses();
    else loadEnrollments();
  }, [tab, loadUsers, loadCourses, loadEnrollments]);

  /* Debounced search */
  useEffect(() => {
    const t = window.setTimeout(() => {
      setUQDeb(uQ);
      setUPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [uQ]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setCQDeb(cQ);
      setCPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [cQ]);

  /* ---------- sorted views ---------- */

  const sortedUsers = useMemo(() => {
    const key = (u: User) =>
      uSort === "email" ? u.email.toLowerCase() : uSort === "createdAt" ? u.createdAt : u.name.toLowerCase();
    return sortRows(users, key, uDir);
  }, [users, uSort, uDir]);

  const sortedCourses = useMemo(() => {
    const key = (c: Course) =>
      cSort === "startDate" ? c.startDate : cSort === "seats" ? c.seats : c.title.toLowerCase();
    return sortRows(courses, key, cDir);
  }, [courses, cSort, cDir]);

  const sortedEnrollments = useMemo(() => {
    const key = (e: Enrollment) =>
      eSort === "user"
        ? (e.user?.email ?? e.userId).toLowerCase()
        : eSort === "course"
          ? (e.course?.title ?? "").toLowerCase()
          : e.enrolledAt;
    return sortRows(enrollments, key, eDir);
  }, [enrollments, eSort, eDir]);

  /* ---------- modal openers ---------- */

  const ensureInstructors = async () => {
    if (instructors.length === 0) {
      const r = await track(api.users.list({ role: "instructor", limit: 100 }));
      setInstructors(r.data);
    }
  };
  const ensureLearners = async () => {
    if (learners.length === 0) {
      const r = await track(api.users.list({ role: "learner", limit: 100 }));
      setLearners(r.data);
    }
  };
  const ensureCourseOptions = async () => {
    if (courseCache.current === null) {
      const r = await track(api.courses.list({ limit: 50 }));
      courseCache.current = r.data;
      setCourseOptions(r.data);
    }
  };

  const openCreateUser = () => setUserModal({ user: null });
  const openEditUser = async (u: User) => {
    try {
      const full = await track(api.users.get(u.id));
      setUserModal({ user: full });
    } catch (e) {
      toast(humanizeError(e), "error");
    }
  };
  const openCreateCourse = async () => {
    try {
      await ensureInstructors();
      setCourseModal({ course: null });
    } catch (e) {
      toast(humanizeError(e), "error");
    }
  };
  const openEditCourse = async (c: Course) => {
    try {
      await ensureInstructors();
      const full = await track(api.courses.get(c.id));
      setCourseModal({ course: full });
    } catch (e) {
      toast(humanizeError(e), "error");
    }
  };
  const openEnroll = async () => {
    try {
      await Promise.all([ensureLearners(), ensureCourseOptions()]);
      setEnrollModal(true);
    } catch (e) {
      toast(humanizeError(e), "error");
    }
  };

  /* ---------- optimistic deletes ---------- */

  const askDeleteUser = (u: User) =>
    setConfirm({
      title: `Delete ${u.name}?`,
      body: "The user, their 1:1 profile and their enrollments are removed (ON DELETE CASCADE). This cannot be undone.",
      onConfirm: async () => {
        const prev = users;
        const prevTotal = uTotal;
        setUsers((us) => us.filter((x) => x.id !== u.id));
        setUTotal((t) => Math.max(0, t - 1));
        try {
          await track(api.users.remove(u.id));
          announceSaved(`User "${u.name}" deleted`);
        } catch (e) {
          setUsers(prev);
          setUTotal(prevTotal);
          toast(humanizeError(e), "error");
        }
      },
    });

  const askDeleteCourse = (c: Course) =>
    setConfirm({
      title: `Delete "${c.title}"?`,
      body: "Deleting a course with enrollments is rejected by the database (FOREIGN KEY … ON DELETE RESTRICT). Empty courses delete cleanly.",
      onConfirm: async () => {
        const prev = courses;
        const prevTotal = cTotal;
        setCourses((cs) => cs.filter((x) => x.id !== c.id));
        setCTotal((t) => Math.max(0, t - 1));
        try {
          await track(api.courses.remove(c.id));
          announceSaved(`Course "${c.title}" deleted`);
        } catch (e) {
          setCourses(prev);
          setCTotal(prevTotal);
          toast(humanizeError(e), "error");
        }
      },
    });

  const askUnenroll = (e: Enrollment) =>
    setConfirm({
      title: "Remove enrollment?",
      body: `Unenroll ${e.user?.email ?? e.userId} from "${e.course?.title ?? e.courseId}"? The junction row is deleted.`,
      onConfirm: async () => {
        const prev = enrollments;
        setEnrollments((es) => es.filter((x) => !(x.userId === e.userId && x.courseId === e.courseId)));
        try {
          await track(api.courses.unenroll(e.courseId, e.userId));
          announceSaved("Enrollment removed");
        } catch (err) {
          setEnrollments(prev);
          toast(humanizeError(err), "error");
        }
      },
    });

  /* ---------- tab keyboard ---------- */

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    let n: number | null = null;
    if (e.key === "ArrowRight") n = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") n = (i + TABS.length - 1) % TABS.length;
    else if (e.key === "Home") n = 0;
    else if (e.key === "End") n = TABS.length - 1;
    if (n !== null) {
      e.preventDefault();
      setTab(TABS[n].id);
      tabRefs.current[n]?.focus();
    }
  };

  /* ---------- columns ---------- */

  const userCols: Col<User>[] = [
    {
      header: "Name",
      cell: (u) => (
        <span className="font-medium">
          {u.name}
          {u.profile && <span className="ml-2 text-[11px] text-[var(--faint)]" title="Has a 1:1 profile">◈</span>}
        </span>
      ),
    },
    { header: "Email", cell: (u) => <span className="font-mono text-[13px]">{u.email}</span> },
    {
      header: "Role",
      cell: (u) => <span className={"chip " + ROLE_BADGE[u.role]}>{u.role}</span>,
    },
    { header: "Created", cell: (u) => <span className="text-[var(--muted)]">{fmtDate(u.createdAt)}</span> },
    {
      header: "Actions",
      cell: (u) => (
        <span className="flex gap-1.5">
          <button type="button" className="btn btn-ghost btn-sm !px-3" onClick={() => openEditUser(u)} aria-label={`Edit ${u.name}`}>
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-ghost btn-sm !px-3 hover:!border-rose-400/50" onClick={() => askDeleteUser(u)} aria-label={`Delete ${u.name}`}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </span>
      ),
    },
  ];

  const courseCols: Col<Course>[] = [
    { header: "Title", cell: (c) => <span className="font-medium">{c.title}</span> },
    {
      header: "Level",
      cell: (c) => <span className={"chip " + LEVEL_BADGE[c.level]}>{c.level}</span>,
    },
    {
      header: "Seats",
      cell: (c) => (
        <span className="font-mono tabular-nums">
          {c.enrolledCount ?? "–"} <span className="text-[var(--faint)]">/ {c.seats}</span>
        </span>
      ),
    },
    { header: "Starts", cell: (c) => <span className="text-[var(--muted)]">{fmtDate(c.startDate)}</span> },
    {
      header: "Instructor",
      cell: (c) => <span className="text-[var(--muted)]">{c.instructor?.name ?? "—"}</span>,
    },
    {
      header: "Actions",
      cell: (c) => (
        <span className="flex gap-1.5">
          <button type="button" className="btn btn-ghost btn-sm !px-3" onClick={() => openEditCourse(c)} aria-label={`Edit ${c.title}`}>
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn-ghost btn-sm !px-3 hover:!border-rose-400/50" onClick={() => askDeleteCourse(c)} aria-label={`Delete ${c.title}`}>
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </span>
      ),
    },
  ];

  const enrollmentCols: Col<Enrollment>[] = [
    {
      header: "Learner",
      cell: (e) => <span className="font-mono text-[13px]">{e.user?.email ?? e.userId.slice(0, 8)}</span>,
    },
    { header: "Course", cell: (e) => <span className="font-medium">{e.course?.title ?? e.courseId.slice(0, 8)}</span> },
    {
      header: "Status",
      cell: (e) => <span className={"chip " + STATUS_BADGE[e.status]}>{e.status}</span>,
    },
    { header: "Enrolled", cell: (e) => <span className="text-[var(--muted)]">{fmtDate(e.enrolledAt)}</span> },
    {
      header: "Actions",
      cell: (e) => (
        <button
          type="button"
          className="btn btn-ghost btn-sm !px-3 hover:!border-rose-400/50"
          onClick={() => askUnenroll(e)}
          aria-label={`Unenroll ${e.user?.email ?? ""} from ${e.course?.title ?? ""}`}
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      ),
    },
  ];

  return (
    <section className="page mx-auto w-full max-w-6xl pt-24 md:pt-28" aria-labelledby="studio-title">
      <p className="chip mb-3">CRUD console</p>
      <h1 id="studio-title" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Data <span className="text-indigo-400">Studio</span>
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] text-[var(--muted)]">
        Every row, live from PostgreSQL. Create and edit in modals, delete with
        confirmation — and watch the exact SQL in the inspector.
      </p>
      <div aria-live="polite" className="sr-only">
        {liveMsg}
      </div>

      {/* tabs */}
      <div
        role="tablist"
        aria-label="Data tables"
        className="glass pill mt-5 inline-flex max-w-full gap-1 overflow-x-auto p-1.5"
      >
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
            className={
              "relative min-h-[44px] shrink-0 rounded-full px-5 text-sm font-semibold transition-colors " +
              (tab === t.id ? "text-white" : "text-[var(--muted)] hover:text-[var(--ink)]")
            }
          >
            {tab === t.id && (
              <motion.span
                layoutId="studio-tab"
                transition={{ type: "spring", stiffness: 520, damping: 36 }}
                className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,var(--indigo),color-mix(in_oklch,var(--indigo)_65%,var(--violet)))]"
                aria-hidden="true"
              />
            )}
            <span className="relative z-10">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="mt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_330px] lg:items-start lg:gap-5">
        {/* panels */}
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="min-w-0"
        >
          {tab === "users" && (
            <div role="tabpanel" id="panel-users" aria-labelledby="tab-users">
              <Toolbar>
                <SearchBox value={uQ} onChange={setUQ} label="Search users by name or email…" />
                <select
                  className="input !w-auto"
                  value={uRole}
                  onChange={(e) => {
                    setURole(e.target.value);
                    setUPage(1);
                  }}
                  aria-label="Filter by role"
                >
                  <option value="">All roles</option>
                  <option value="learner">learner</option>
                  <option value="instructor">instructor</option>
                </select>
                <select
                  className="input !w-auto"
                  value={uSort}
                  onChange={(e) => setUSort(e.target.value)}
                  aria-label="Sort users by"
                >
                  <option value="name">Name</option>
                  <option value="email">Email</option>
                  <option value="createdAt">Created</option>
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm !px-3"
                  onClick={() => setUDir((d) => (d === 1 ? -1 : 1))}
                  aria-label={uDir === 1 ? "Sort descending" : "Sort ascending"}
                >
                  <ArrowDownUp size={15} aria-hidden="true" />
                </button>
                <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={openCreateUser}>
                  <Plus size={15} aria-hidden="true" /> New user
                </button>
              </Toolbar>
              <div className="panel overflow-hidden" aria-busy={loading}>
                {loading && users.length === 0 ? (
                  <div className="space-y-2 p-4" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton h-12" />
                    ))}
                  </div>
                ) : (
                  <>
                    <DataTable
                      cols={userCols}
                      rows={sortedUsers}
                      rowKey={(u) => u.id}
                      rowTransitionName={(u) => `user-row-${u.id}`}
                      empty={
                        <EmptyState
                          title="No users found"
                          hint="Try a different search, or create the first user."
                          action={
                            <button type="button" className="btn btn-primary btn-sm" onClick={openCreateUser}>
                              <UserPlus size={15} aria-hidden="true" /> New user
                            </button>
                          }
                        />
                      }
                    />
                    <Pager page={uPage} total={uTotal} onPage={setUPage} />
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "courses" && (
            <div role="tabpanel" id="panel-courses" aria-labelledby="tab-courses">
              <Toolbar>
                <SearchBox value={cQ} onChange={setCQ} label="Search courses by title…" />
                <select
                  className="input !w-auto"
                  value={cLevel}
                  onChange={(e) => {
                    setCLevel(e.target.value);
                    setCPage(1);
                  }}
                  aria-label="Filter by level"
                >
                  <option value="">All levels</option>
                  <option value="beginner">beginner</option>
                  <option value="intermediate">intermediate</option>
                  <option value="advanced">advanced</option>
                </select>
                <select
                  className="input !w-auto"
                  value={cSort}
                  onChange={(e) => setCSort(e.target.value)}
                  aria-label="Sort courses by"
                >
                  <option value="title">Title</option>
                  <option value="startDate">Start date</option>
                  <option value="seats">Seats</option>
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm !px-3"
                  onClick={() => setCDir((d) => (d === 1 ? -1 : 1))}
                  aria-label={cDir === 1 ? "Sort descending" : "Sort ascending"}
                >
                  <ArrowDownUp size={15} aria-hidden="true" />
                </button>
                <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={openCreateCourse}>
                  <Plus size={15} aria-hidden="true" /> New course
                </button>
              </Toolbar>
              <div className="panel overflow-hidden" aria-busy={loading}>
                {loading && courses.length === 0 ? (
                  <div className="space-y-2 p-4" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton h-12" />
                    ))}
                  </div>
                ) : (
                  <>
                    <DataTable
                      cols={courseCols}
                      rows={sortedCourses}
                      rowKey={(c) => c.id}
                      rowTransitionName={(c) => `course-row-${c.id}`}
                      empty={
                        <EmptyState
                          title="No courses found"
                          hint="Try a different search, or publish the first course."
                          action={
                            <button type="button" className="btn btn-primary btn-sm" onClick={openCreateCourse}>
                              <Plus size={15} aria-hidden="true" /> New course
                            </button>
                          }
                        />
                      }
                    />
                    <Pager page={cPage} total={cTotal} onPage={setCPage} />
                  </>
                )}
              </div>
            </div>
          )}

          {tab === "enrollments" && (
            <div role="tabpanel" id="panel-enrollments" aria-labelledby="tab-enrollments">
              <Toolbar>
                <select
                  className="input !w-auto"
                  value={eCourse}
                  onChange={(e) => setECourse(e.target.value)}
                  aria-label="Filter enrollments by course"
                >
                  <option value="all">All courses</option>
                  {courseOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                <select
                  className="input !w-auto"
                  value={eSort}
                  onChange={(e) => setESort(e.target.value)}
                  aria-label="Sort enrollments by"
                >
                  <option value="enrolledAt">Enrolled date</option>
                  <option value="user">Learner</option>
                  <option value="course">Course</option>
                </select>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm !px-3"
                  onClick={() => setEDir((d) => (d === 1 ? -1 : 1))}
                  aria-label={eDir === 1 ? "Sort descending" : "Sort ascending"}
                >
                  <ArrowDownUp size={15} aria-hidden="true" />
                </button>
                <button type="button" className="btn btn-primary btn-sm ml-auto" onClick={openEnroll}>
                  <GraduationCap size={15} aria-hidden="true" /> Enroll learner
                </button>
              </Toolbar>
              <div className="panel overflow-hidden" aria-busy={loading}>
                {loading && enrollments.length === 0 ? (
                  <div className="space-y-2 p-4" aria-hidden="true">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="skeleton h-12" />
                    ))}
                  </div>
                ) : (
                  <DataTable
                    cols={enrollmentCols}
                    rows={sortedEnrollments}
                    rowKey={(e) => `${e.userId}:${e.courseId}`}
                    empty={
                      <EmptyState
                        title="No enrollments"
                        hint="Enroll a learner to fill the junction table."
                        action={
                          <button type="button" className="btn btn-primary btn-sm" onClick={openEnroll}>
                            <GraduationCap size={15} aria-hidden="true" /> Enroll learner
                          </button>
                        }
                      />
                    }
                  />
                )}
              </div>
              <p className="mt-2 text-xs text-[var(--faint)]">
                Rows are the <code className="font-mono">enrollments</code> junction — composite PK
                (user_id, course_id).
              </p>
            </div>
          )}
        </motion.div>

        {/* inspector */}
        <div className="mt-4 lg:mt-0">
          <button
            type="button"
            className="btn btn-ghost btn-sm w-full lg:hidden"
            onClick={() => setInspectorOpen((o) => !o)}
            aria-expanded={inspectorOpen}
          >
            <Terminal size={15} aria-hidden="true" /> Query Inspector
            <ChevronDown size={15} aria-hidden="true" className={inspectorOpen ? "rotate-180" : ""} />
          </button>
          {inspectorOpen && (
            <div className="panel mt-2 p-4 lg:hidden">
              <InspectorBody log={inspector} />
            </div>
          )}
          <aside aria-label="Query inspector" className="panel sticky top-28 hidden p-5 lg:block">
            <h2 className="flex items-center gap-2 font-display text-base font-bold tracking-tight">
              <Terminal size={16} aria-hidden="true" className="text-indigo-300" />
              Query Inspector
            </h2>
            <p className="mt-1 mb-4 text-xs leading-relaxed text-[var(--muted)]">
              The exact parameterized SQL behind each request — served only when{" "}
              <code className="font-mono">DEMO_SQL_INSPECTOR=true</code>.
            </p>
            <InspectorBody log={inspector} />
          </aside>
        </div>
      </div>

      {/* modals */}
      <Modal
        open={userModal !== null}
        onClose={() => setUserModal(null)}
        title={userModal?.user ? `Edit ${userModal.user.name}` : "New user"}
        transitionName={userModal?.user ? `user-row-${userModal.user.id}` : undefined}
      >
        {userModal && (
          <UserForm
            initial={userModal.user}
            onClose={() => setUserModal(null)}
            onSaved={(msg) => {
              announceSaved(msg);
              loadUsers();
            }}
          />
        )}
      </Modal>

      <Modal
        open={courseModal !== null}
        onClose={() => setCourseModal(null)}
        title={courseModal?.course ? `Edit ${courseModal.course.title}` : "New course"}
        transitionName={courseModal?.course ? `course-row-${courseModal.course.id}` : undefined}
        wide
      >
        {courseModal && (
          <CourseForm
            initial={courseModal.course}
            instructors={instructors}
            onClose={() => setCourseModal(null)}
            onSaved={(msg) => {
              announceSaved(msg);
              loadCourses();
            }}
          />
        )}
      </Modal>

      <Modal open={enrollModal} onClose={() => setEnrollModal(false)} title="Enroll learner">
        <EnrollForm
          learners={learners}
          courses={courseOptions}
          presetCourseId={eCourse === "all" ? "" : eCourse}
          onClose={() => setEnrollModal(false)}
          onSaved={(msg) => {
            announceSaved(msg);
            loadEnrollments();
          }}
        />
      </Modal>

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? "Confirm"}
      >
        {confirm && (
          <div>
            <p className="text-sm leading-relaxed text-[var(--muted)]">{confirm.body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => {
                  const fn = confirm.onConfirm;
                  setConfirm(null);
                  void fn();
                }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
