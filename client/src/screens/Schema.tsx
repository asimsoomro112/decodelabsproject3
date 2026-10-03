import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyRound, Lock } from "lucide-react";
import { api, humanizeError, type SchemaTable } from "../api";
import Drawer from "../components/Drawer";
import EmptyState from "../components/EmptyState";
import { toast } from "../components/Toasts";
import { useSpecular } from "../lib/fx";

interface Rel {
  id: string;
  fromTable: string;
  toTable: string;
  cardinality: "1:1" | "1:M" | "M:M";
  note: string;
}

interface Beam {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  mx: number;
  my: number;
  cardinality: Rel["cardinality"];
  note: string;
}

const TABLE_ORDER = ["users", "user_profiles", "courses", "enrollments"];
const JUNCTION = "enrollments";

function relationsFor(tables: SchemaTable[]): Rel[] {
  const names = new Set(tables.map((t) => t.name));
  const rels: Rel[] = [];
  if (names.has("users") && names.has("user_profiles"))
    rels.push({
      id: "rel-11",
      fromTable: "users",
      toTable: "user_profiles",
      cardinality: "1:1",
      note: "one user ↔ one profile (the PK doubles as the FK)",
    });
  if (names.has("users") && names.has("courses"))
    rels.push({
      id: "rel-1m",
      fromTable: "users",
      toTable: "courses",
      cardinality: "1:M",
      note: "one instructor → many courses (courses.instructor_id)",
    });
  if (names.has("users") && names.has("enrollments"))
    rels.push({
      id: "rel-mm-a",
      fromTable: "users",
      toTable: "enrollments",
      cardinality: "M:M",
      note: "many-to-many leg: enrollments.user_id",
    });
  if (names.has("courses") && names.has("enrollments"))
    rels.push({
      id: "rel-mm-b",
      fromTable: "courses",
      toTable: "enrollments",
      cardinality: "M:M",
      note: "many-to-many leg: enrollments.course_id",
    });
  return rels;
}

function fkColumns(table: SchemaTable): Set<string> {
  const s = new Set<string>();
  for (const fk of table.foreignKeys) for (const c of fk.columns) s.add(c);
  return s;
}

function uniqueColumns(table: SchemaTable): Set<string> {
  const s = new Set<string>();
  for (const u of table.uniques) for (const c of u.columns) s.add(c);
  return s;
}

/* One table card — a real <button> so the diagram is keyboard-operable. */
function TableCard({
  table,
  selected,
  onSelect,
  register,
}: {
  table: SchemaTable;
  selected: boolean;
  onSelect: () => void;
  register: (name: string, el: HTMLButtonElement | null) => void;
}) {
  const specRef = useSpecular<HTMLButtonElement>();
  const fks = fkColumns(table);
  const uniques = uniqueColumns(table);
  const shown = table.columns.slice(0, 7);
  const extra = table.columns.length - shown.length;
  const isJunction = table.name === JUNCTION;

  return (
    <button
      ref={(el) => {
        specRef.current = el;
        register(table.name, el);
      }}
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${table.name} table — open details`}
      className={
        "glass specular group w-full p-4 text-left transition-transform duration-150 hover:-translate-y-0.5 " +
        (isJunction ? "ring-2 ring-amber-400/70 " : "") +
        (selected ? "ring-2 ring-indigo-400/80 " : "")
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate font-mono text-[15px] font-semibold tracking-tight">
          {table.name}
        </span>
        {isJunction && <span className="chip chip-pk !text-[10px]">Junction</span>}
      </div>
      <ul className="space-y-1">
        {shown.map((c) => (
          <li key={c.name} className="flex items-center gap-1.5 text-xs">
            {c.isPrimaryKey ? (
              <Lock size={11} className="shrink-0 text-amber-400" aria-label="primary key" />
            ) : fks.has(c.name) ? (
              <KeyRound size={11} className="shrink-0 text-indigo-400" aria-label="foreign key" />
            ) : (
              <span className="h-[11px] w-[11px] shrink-0" aria-hidden="true" />
            )}
            <span className="truncate font-mono text-[var(--ink)]">{c.name}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--faint)]">
              {c.type}
              {uniques.has(c.name) && !c.isPrimaryKey ? " ✦" : ""}
            </span>
          </li>
        ))}
      </ul>
      {extra > 0 && (
        <p className="mt-1.5 text-[11px] text-[var(--faint)]">+{extra} more columns</p>
      )}
      <p className="mt-2 text-[11px] font-medium text-indigo-300 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        View columns, constraints &amp; indexes →
      </p>
    </button>
  );
}

export default function Schema() {
  const [tables, setTables] = useState<SchemaTable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<SchemaTable | null>(null);
  const [activeRel, setActiveRel] = useState<string | null>(null);
  const [beams, setBeams] = useState<Beam[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLButtonElement | null>());

  useEffect(() => {
    let alive = true;
    api
      .schema()
      .then((s) => {
        if (!alive) return;
        const ordered = [...s.tables].sort(
          (a, b) => TABLE_ORDER.indexOf(a.name) - TABLE_ORDER.indexOf(b.name),
        );
        setTables(ordered);
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

  const rels = useMemo(() => relationsFor(tables), [tables]);
  const relsKey = rels.map((r) => r.id).join(",");

  const register = useCallback((name: string, el: HTMLButtonElement | null) => {
    cardEls.current.set(name, el);
  }, []);

  /* Measure card edges → beam endpoints. Falls back to card centres when a
     measurement is missing, so lines never point at (0,0). */
  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container || rels.length === 0) return;
    const crect = container.getBoundingClientRect();
    const box = (name: string) => {
      const el = cardEls.current.get(name);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        cx: r.left - crect.left + r.width / 2,
        cy: r.top - crect.top + r.height / 2,
        w: r.width,
        h: r.height,
      };
    };
    const edge = (
      from: { cx: number; cy: number; w: number; h: number },
      to: { cx: number; cy: number },
    ) => {
      const dx = to.cx - from.cx;
      const dy = to.cy - from.cy;
      const tx = dx !== 0 ? from.w / 2 / Math.abs(dx) : Number.POSITIVE_INFINITY;
      const ty = dy !== 0 ? from.h / 2 / Math.abs(dy) : Number.POSITIVE_INFINITY;
      const t = Math.min(tx, ty);
      return { x: from.cx + dx * t, y: from.cy + dy * t };
    };
    const next: Beam[] = [];
    for (const rel of rels) {
      const a = box(rel.fromTable);
      const b = box(rel.toTable);
      if (!a || !b) continue;
      const p1 = edge(a, b);
      const p2 = edge(b, a);
      next.push({
        id: rel.id,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        mx: (p1.x + p2.x) / 2,
        my: (p1.y + p2.y) / 2 - 16,
        cardinality: rel.cardinality,
        note: rel.note,
      });
    }
    setBeams(next);
  }, [rels]);

  useEffect(() => {
    measure();
    const t1 = window.setTimeout(measure, 120);
    const t2 = window.setTimeout(measure, 600);
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure, relsKey, tables.length]);

  const selFks = selected ? fkColumns(selected) : new Set<string>();

  return (
    <section className="page mx-auto w-full max-w-6xl pt-24 md:pt-28" aria-labelledby="schema-title">
      <p className="chip mb-3">ER diagram</p>
      <h1 id="schema-title" className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Schema, <span className="text-indigo-400">drawn live</span>
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] text-[var(--muted)]">
        Built from <code className="font-mono text-[13px]">GET /api/v1/schema</code> — real
        introspection of <code className="font-mono text-[13px]">information_schema</code> and{" "}
        <code className="font-mono text-[13px]">pg_constraint</code>. Hover or focus a relation chip
        to light its beam; activate any table for its full definition.
      </p>

      {error && (
        <div role="alert" className="panel mt-4 border-rose-400/40 p-4 text-sm text-rose-300">
          Couldn&apos;t load the schema: {error}
        </div>
      )}

      {/* legend */}
      <ul className="mt-5 flex flex-wrap gap-2" aria-label="Diagram legend" data-reveal>
        <li className="chip chip-pk">
          <Lock size={11} aria-hidden="true" /> Primary key
        </li>
        <li className="chip chip-fk">
          <KeyRound size={11} aria-hidden="true" /> Foreign key
        </li>
        <li className="chip">1:1 — one to one</li>
        <li className="chip">1:M — one to many</li>
        <li className="chip">M:M — via junction table</li>
      </ul>

      {/* diagram */}
      <div ref={containerRef} className="relative mt-4" data-reveal>
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <filter id="beam-glow" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {beams.map((b) => {
            const active = activeRel === b.id;
            return (
              <g key={b.id}>
                <line
                  x1={b.x1}
                  y1={b.y1}
                  x2={b.x2}
                  y2={b.y2}
                  stroke={active ? "var(--amber)" : "var(--indigo)"}
                  strokeOpacity={active ? 0.95 : 0.35}
                  strokeWidth={active ? 3 : 1.5}
                  strokeDasharray={b.cardinality === "M:M" ? "7 5" : undefined}
                  filter={active ? "url(#beam-glow)" : undefined}
                  strokeLinecap="round"
                />
                <circle cx={b.x1} cy={b.y1} r={active ? 4 : 2.5} fill={active ? "var(--amber)" : "var(--indigo)"} opacity={active ? 1 : 0.6} />
                <circle cx={b.x2} cy={b.y2} r={active ? 4 : 2.5} fill={active ? "var(--amber)" : "var(--indigo)"} opacity={active ? 1 : 0.6} />
              </g>
            );
          })}
        </svg>

        <div className="relative grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {tables.length === 0 && !error ? (
            <>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-56" aria-hidden="true" />
              ))}
            </>
          ) : (
            tables.map((t) => (
              <TableCard
                key={t.name}
                table={t}
                selected={selected?.name === t.name}
                onSelect={() => setSelected(t)}
                register={register}
              />
            ))
          )}
        </div>

        {/* relation chips at beam midpoints */}
        {beams.map((b) => (
          <button
            key={b.id}
            type="button"
            onMouseEnter={() => setActiveRel(b.id)}
            onMouseLeave={() => setActiveRel(null)}
            onFocus={() => setActiveRel(b.id)}
            onBlur={() => setActiveRel(null)}
            aria-label={`Relation ${b.cardinality}: ${b.note}`}
            title={b.note}
            className={
              "chip absolute z-10 -translate-x-1/2 -translate-y-1/2 !bg-[var(--panel-bg)] transition-all " +
              (activeRel === b.id ? "!border-amber-400/80 !text-amber-300 shadow-[0_0_18px_-2px_var(--amber)]" : "")
            }
            style={{ left: b.mx, top: b.my }}
          >
            {b.cardinality}
          </button>
        ))}
      </div>

      {tables.length === 0 && error && (
        <div className="mt-6">
          <EmptyState
            title="Schema unavailable"
            hint="The /schema endpoint didn't respond. Start the backend and reload."
          />
        </div>
      )}

      {/* drawer */}
      <Drawer
        open={selected !== null}
        onClose={() => setSelected(null)}
        title={selected ? `Table: ${selected.name}` : "Table"}
      >
        {selected && (
          <div className="space-y-6">
            <section aria-label="Columns">
              <h3 className="mb-2 text-xs font-semibold tracking-widest text-[var(--muted)] uppercase">
                Columns
              </h3>
              <ul className="divide-y divide-white/8 overflow-hidden rounded-2xl border border-white/10">
                {selected.columns.map((c) => (
                  <li key={c.name} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{c.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-[var(--faint)]">{c.type}</span>
                    {c.isPrimaryKey && (
                      <span className="chip chip-pk !py-0.5 !text-[10px]">
                        <Lock size={10} aria-hidden="true" /> PK
                      </span>
                    )}
                    {selFks.has(c.name) && !c.isPrimaryKey && (
                      <span className="chip chip-fk !py-0.5 !text-[10px]">
                        <KeyRound size={10} aria-hidden="true" /> FK
                      </span>
                    )}
                    {!c.nullable && (
                      <span className="chip chip-notnull !py-0.5 !text-[10px]">NOT NULL</span>
                    )}
                    {c.default && (
                      <span className="max-w-28 truncate font-mono text-[10px] text-[var(--faint)]" title={c.default}>
                        = {c.default}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section aria-label="Constraints">
              <h3 className="mb-2 text-xs font-semibold tracking-widest text-[var(--muted)] uppercase">
                Constraints — the final source of truth
              </h3>
              <ul className="space-y-2 text-sm">
                {selected.uniques.map((u) => (
                  <li key={u.name} className="rounded-2xl border border-white/10 p-3">
                    <span className="chip chip-unique">UNIQUE</span>
                    <p className="mt-1.5 font-mono text-xs">{u.columns.join(", ")}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[var(--faint)]">{u.name}</p>
                  </li>
                ))}
                {selected.checks.map((ch) => (
                  <li key={ch.name} className="rounded-2xl border border-white/10 p-3">
                    <span className="chip chip-check">CHECK</span>
                    <p className="mt-1.5 font-mono text-xs break-all">{ch.definition}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-[var(--faint)]">{ch.name}</p>
                  </li>
                ))}
                {selected.foreignKeys.map((fk) => (
                  <li key={fk.name} className="rounded-2xl border border-white/10 p-3">
                    <span className="chip chip-fk">FOREIGN KEY</span>
                    <p className="mt-1.5 font-mono text-xs">
                      {fk.columns.join(", ")} → {fk.refTable}({fk.refColumns.join(", ")})
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-[var(--faint)]">
                      {fk.name} · ON DELETE {fk.onDelete}
                    </p>
                  </li>
                ))}
                {selected.uniques.length === 0 &&
                  selected.checks.length === 0 &&
                  selected.foreignKeys.length === 0 && (
                    <li className="text-sm text-[var(--muted)]">No extra constraints.</li>
                  )}
              </ul>
            </section>

            <section aria-label="Indexes">
              <h3 className="mb-2 text-xs font-semibold tracking-widest text-[var(--muted)] uppercase">
                Indexes
              </h3>
              <ul className="space-y-1.5 text-sm">
                {selected.indexes.map((ix) => (
                  <li key={ix.name} className="flex items-center gap-2 font-mono text-xs">
                    <span className="truncate text-[var(--muted)]">{ix.name}</span>
                    <span className="ml-auto shrink-0 text-[var(--faint)]">({ix.columns.join(", ")})</span>
                    {ix.unique && <span className="chip chip-unique !py-0.5 !text-[10px]">unique</span>}
                  </li>
                ))}
                {selected.indexes.length === 0 && (
                  <li className="text-sm text-[var(--muted)]">No indexes reported.</li>
                )}
              </ul>
            </section>
          </div>
        )}
      </Drawer>
    </section>
  );
}
