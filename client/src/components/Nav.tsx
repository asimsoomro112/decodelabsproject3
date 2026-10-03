import { BookOpen, Database, Network, ShieldCheck, Vault } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { api } from "../api";
import { useSpecular } from "../lib/fx";

/* ============================================================
   ONE navigation component — no duplicated markup.
   The same LINKS array renders the desktop floating pill
   (≥768px) and the mobile slim top pill + bottom tab bar.
   ============================================================ */

const LINKS = [
  { to: "/", label: "Vault", icon: Vault },
  { to: "/schema", label: "Schema", icon: Network },
  { to: "/studio", label: "Data Studio", icon: Database },
  { to: "/security", label: "Security", icon: ShieldCheck },
  { to: "/docs", label: "Docs", icon: BookOpen },
] as const;

const SPRING = { type: "spring", stiffness: 520, damping: 36 } as const;

function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className="shrink-0"
    >
      <defs>
        <linearGradient id="cv-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#818cf8" />
          <stop offset="1" stopColor="#6366f1" />
        </linearGradient>
      </defs>
      <rect x="3" y="3" width="26" height="26" rx="8" fill="url(#cv-logo)" />
      <path
        d="M11 13.2v5.6l5 3 5-3v-5.6l-5-3z"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="16" r="1.7" fill="#f59e0b" />
    </svg>
  );
}

type DbStatus = "checking" | "up" | "down";

function StatusDot() {
  const [status, setStatus] = useState<DbStatus>("checking");

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        await api.ready();
        if (alive) setStatus("up");
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

  const label =
    status === "up"
      ? "Database status: ready"
      : status === "down"
        ? "Database status: unreachable"
        : "Database status: checking";

  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className="relative inline-flex h-2.5 w-2.5 shrink-0"
    >
      <span
        className={
          "absolute inline-flex h-full w-full rounded-full " +
          (status === "up"
            ? "animate-ping bg-emerald-400 opacity-60"
            : status === "down"
              ? "bg-rose-400 opacity-80"
              : "bg-amber-400 opacity-70")
        }
      />
      <span
        className={
          "relative inline-flex h-2.5 w-2.5 rounded-full " +
          (status === "up" ? "bg-emerald-400" : status === "down" ? "bg-rose-400" : "bg-amber-400")
        }
      />
    </span>
  );
}

export default function Nav() {
  const specularRef = useSpecular<HTMLDivElement>();
  const mobileSpecRef = useSpecular<HTMLDivElement>();
  const [condensed, setCondensed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const activeIndex = Math.max(
    0,
    LINKS.findIndex((l) => (l.to === "/" ? location.pathname === "/" : location.pathname.startsWith(l.to))),
  );

  const scrub = (_: unknown, info: { offset: { x: number } }) => {
    if (info.offset.x < -48 && activeIndex < LINKS.length - 1) {
      navigate(LINKS[activeIndex + 1].to, { viewTransition: true });
    } else if (info.offset.x > 48 && activeIndex > 0) {
      navigate(LINKS[activeIndex - 1].to, { viewTransition: true });
    }
  };

  return (
    <>
      {/* ---------- desktop: floating pill (≥768px) ---------- */}
      <nav aria-label="Primary" className="fixed inset-x-0 top-4 z-50 hidden justify-center md:flex">
        <div
          ref={specularRef}
          className={
            "glass specular liquid pill flex w-[min(720px,calc(100%-32px))] items-center gap-1 transition-all duration-300 " +
            (condensed ? "scale-[.97] px-2 py-1.5" : "px-2 py-2.5")
          }
        >
          <Link
            to="/"
            viewTransition
            aria-label="CourseVault home"
            className="mr-1 flex items-center gap-2 rounded-full px-2 py-1"
          >
            <LogoMark />
            <span className="font-display text-[15px] font-bold tracking-tight">
              Course<span className="text-indigo-400">Vault</span>
            </span>
          </Link>

          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              viewTransition
              end={l.to === "/"}
              className={({ isActive }) =>
                "relative flex min-h-[44px] items-center gap-2 rounded-full px-3.5 text-sm font-medium transition-colors " +
                (isActive ? "text-white" : "text-[var(--muted)] hover:text-[var(--ink)]")
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-capsule"
                      transition={SPRING}
                      className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,var(--indigo),color-mix(in_oklch,var(--indigo)_65%,var(--violet)))] shadow-[0_8px_24px_-6px_var(--indigo)]"
                      aria-hidden="true"
                    />
                  )}
                  <l.icon size={16} className="relative z-10" aria-hidden="true" />
                  <span className="relative z-10">{l.label}</span>
                </>
              )}
            </NavLink>
          ))}

          <span className="mx-1 h-5 w-px bg-white/10" aria-hidden="true" />
          <span className="px-2">
            <StatusDot />
          </span>
        </div>
      </nav>

      {/* ---------- mobile: slim top pill ---------- */}
      <header className="fixed inset-x-3 top-3 z-50 md:hidden">
        <div className="glass pill flex h-12 items-center justify-between px-4">
          <Link to="/" viewTransition aria-label="CourseVault home" className="flex items-center gap-2">
            <LogoMark size={26} />
            <span className="font-display text-sm font-bold tracking-tight">
              Course<span className="text-indigo-400">Vault</span>
            </span>
          </Link>
          <StatusDot />
        </div>
      </header>

      {/* ---------- mobile: bottom tab bar ---------- */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-3 bottom-3 z-50 md:hidden"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <motion.div
          ref={mobileSpecRef}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={scrub}
          className="glass specular pill flex h-16 cursor-grab items-stretch px-1.5 active:cursor-grabbing"
        >
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              viewTransition
              end={l.to === "/"}
              className="relative flex min-h-[44px] flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-medium"
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="tab-capsule"
                      transition={SPRING}
                      className="absolute inset-x-1 inset-y-1.5 rounded-full bg-[linear-gradient(135deg,var(--indigo),color-mix(in_oklch,var(--indigo)_65%,var(--violet)))] shadow-[0_8px_24px_-6px_var(--indigo)]"
                      aria-hidden="true"
                    />
                  )}
                  <l.icon
                    size={20}
                    aria-hidden="true"
                    className={"relative z-10 " + (isActive ? "text-white" : "text-[var(--muted)]")}
                  />
                  <span className={"relative z-10 leading-none " + (isActive ? "text-white" : "text-[var(--muted)]")}>
                    {l.label}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </motion.div>
      </nav>
    </>
  );
}
