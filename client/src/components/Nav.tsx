import { BookOpen, Database, Network, ShieldCheck, Vault, Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState, useRef } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router";
import { api } from "../api";
import { useSpecular } from "../lib/fx";
import { useTheme } from "./ThemeProvider";

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

function StatusPill({ showText }: { showText: boolean }) {
  const [status, setStatus] = useState<DbStatus>("checking");

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

  const isUp = status === "up";
  const isDown = status === "down";

  const colorConfig = isUp
    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_-2px_rgba(52,211,153,0.3)]"
    : isDown
      ? "bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_12px_-2px_rgba(251,113,133,0.3)]"
      : "bg-amber-500/15 border-amber-500/30 text-amber-400 shadow-[0_0_12px_-2px_rgba(245,158,11,0.3)]";

  const dotColor = isUp ? "bg-emerald-400" : isDown ? "bg-rose-400" : "bg-amber-400";
  const text = isUp ? "DB Ready" : isDown ? "Offline" : "Checking";

  return (
    <div
      title={`Database: ${status}`}
      className={`flex items-center justify-center rounded-full border backdrop-blur-md transition-colors duration-300 ${colorConfig} ${showText ? "px-2.5 py-1.5" : "h-[34px] w-[34px]"}`}
    >
      <span className="relative flex h-2 w-2 shrink-0">
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dotColor}`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
      </span>
      <AnimatePresence>
        {showText && (
          <motion.span
            initial={{ width: 0, opacity: 0, marginLeft: 0 }}
            animate={{ width: "auto", opacity: 1, marginLeft: 8 }}
            exit={{ width: 0, opacity: 0, marginLeft: 0 }}
            transition={{ duration: 0.2 }}
            className="font-mono text-[10px] font-bold tracking-wider uppercase whitespace-nowrap overflow-hidden"
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

function ThemeToggle({ showText }: { showText: boolean }) {
  const { actualTheme, setTheme } = useTheme();
  const isDark = actualTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={`flex items-center justify-center rounded-full border border-[var(--glass-border)] bg-[var(--input-bg)] text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--hover-bg)] backdrop-blur-md transition-colors duration-300 ${showText ? "px-2.5 py-1.5 gap-2" : "h-[34px] w-[34px]"}`}
      aria-label="Toggle theme"
    >
      <div className="relative flex items-center justify-center h-4 w-4 shrink-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {isDark ? (
            <motion.div key="dark" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ duration: 0.2 }}>
              <Moon size={16} />
            </motion.div>
          ) : (
            <motion.div key="light" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }} transition={{ duration: 0.2 }}>
              <Sun size={16} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence>
        {showText && (
          <motion.span
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="font-mono text-[10px] font-bold tracking-wider uppercase whitespace-nowrap overflow-hidden"
          >
            {isDark ? "Dark" : "Light"}
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  );
}

export default function Nav() {
  const specularRef = useSpecular<HTMLDivElement>();
  const mobileSpecRef = useSpecular<HTMLDivElement>();
  const [condensed, setCondensed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  const condensedRef = useRef(condensed);
  condensedRef.current = condensed;
  const lockedToSidebarRef = useRef(false);

  useEffect(() => {
    // When navigating, if we are currently in sidebar mode, lock it so it doesn't pop up to navbar on scroll=0
    if (condensedRef.current) {
      lockedToSidebarRef.current = true;
    } else {
      lockedToSidebarRef.current = false;
    }
  }, [location.pathname]);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY > 24) {
        setCondensed(true);
        lockedToSidebarRef.current = false; // release lock once they scroll down manually
      } else {
        if (!lockedToSidebarRef.current) {
          setCondensed(false);
        }
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isTop = !condensed;
  const isSideMin = condensed && !isHovered;
  const isSideExp = condensed && isHovered;
  
  const showText = isTop || isSideExp;

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
      {/* ---------- desktop: floating pill -> minimizable sidebar (≥768px) ---------- */}
      <nav 
        aria-label="Primary" 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={"fixed z-50 hidden md:flex pointer-events-none transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] " + 
          (isTop ? "inset-x-0 top-6 justify-center" : "inset-y-0 left-6 flex-col justify-center")
        }
      >
        <motion.div
          layout
          transition={SPRING}
          ref={specularRef}
          className={
            "bg-transparent backdrop-blur-[64px] border border-white/[0.08] flex shadow-[0_32px_64px_-12px_rgb(0,0,0,0.6)] pointer-events-auto " +
            (isTop 
              ? "flex-row items-center gap-1 rounded-full px-3 py-3 w-auto max-w-[calc(100%-48px)]" 
              : isSideExp 
                ? "flex-col items-stretch gap-2 rounded-[32px] px-3 py-6 w-[200px]" 
                : "flex-col items-center gap-3 rounded-[40px] px-3 py-6 w-[70px]")
          }
        >
          <Link
            to="/"
            viewTransition
            aria-label="CourseVault home"
            className={
              "flex items-center rounded-full transition-transform active:scale-95 overflow-hidden " + 
              (isTop ? "mr-1 gap-2.5 px-3 py-1.5" : isSideExp ? "mb-4 gap-2.5 px-3 py-1.5" : "mb-2 justify-center px-1 py-1")
            }
          >
            <motion.div layout>
              <LogoMark size={isTop ? 28 : 34} />
            </motion.div>
            <AnimatePresence>
              {showText && (
                <motion.span 
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="font-display font-black tracking-widest uppercase text-[var(--ink)] opacity-90 whitespace-nowrap text-[15px]"
                >
                  Course<span className="text-indigo-400">Vault</span>
                </motion.span>
              )}
            </AnimatePresence>
          </Link>

          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              viewTransition
              title={isSideMin ? l.label : undefined}
              end={l.to === "/"}
              className={({ isActive }) =>
                "relative flex items-center rounded-full transition-colors " +
                (isActive ? "text-[var(--ink)] shadow-sm " : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--hover-bg)] ") +
                (isTop ? "min-h-[46px] px-4" : isSideExp ? "min-h-[46px] px-4" : "h-[46px] w-[46px] justify-center")
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-capsule"
                      transition={SPRING}
                      className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,var(--indigo),color-mix(in_oklch,var(--indigo)_65%,var(--violet)))] shadow-[0_8px_24px_-6px_var(--indigo)] ring-1 ring-white/20"
                      aria-hidden="true"
                    />
                  )}
                  <motion.div layout className="relative z-10 shrink-0 flex items-center justify-center">
                    <l.icon size={isSideMin ? 20 : 16} strokeWidth={1.75} aria-hidden="true" />
                  </motion.div>
                  <AnimatePresence>
                    {showText && (
                      <motion.span 
                        initial={{ width: 0, opacity: 0, marginLeft: 0 }}
                        animate={{ width: "auto", opacity: 1, marginLeft: 10 }}
                        exit={{ width: 0, opacity: 0, marginLeft: 0 }}
                        transition={{ duration: 0.2 }}
                        className="relative z-10 whitespace-nowrap font-semibold tracking-wide uppercase text-[13px] overflow-hidden"
                      >
                        {l.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </>
              )}
            </NavLink>
          ))}

          <motion.span 
            layout 
            className={
              "bg-[var(--hover-bg)] shrink-0 " + 
              (isTop ? "mx-1 h-6 w-px" : isSideExp ? "my-3 h-px w-full opacity-50" : "my-1 w-6 h-px")
            } 
            aria-hidden="true" 
          />
          <motion.div layout className={"flex shrink-0 gap-2 " + (isTop ? "px-1" : isSideExp ? "px-2 pb-2 flex-col" : "mb-1 flex-col items-center")}>
            <ThemeToggle showText={showText} />
            <StatusPill showText={showText} />
          </motion.div>
        </motion.div>
      </nav>

      {/* ---------- mobile: slim top pill ---------- */}
      <header className="fixed inset-x-3 top-3 z-50 md:hidden">
        <div className="bg-transparent backdrop-blur-[64px] border border-white/[0.08] pill flex h-14 items-center justify-between px-4 shadow-[0_16px_40px_-8px_rgb(0,0,0,0.5)]">
          <Link to="/" viewTransition aria-label="CourseVault home" className="flex items-center gap-2.5">
            <LogoMark size={24} />
            <span className="font-display text-sm font-black tracking-widest uppercase text-[var(--ink)] opacity-90">
              Course<span className="text-indigo-400">Vault</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle showText={false} />
            <StatusPill showText={false} />
          </div>
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
          className="bg-transparent backdrop-blur-[64px] border border-white/[0.08] pill flex h-[72px] cursor-grab items-stretch px-2 active:cursor-grabbing shadow-[0_16px_40px_-8px_rgb(0,0,0,0.5)]"
        >
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              viewTransition
              end={l.to === "/"}
              className="relative flex min-h-[44px] flex-1 touch-manipulation flex-col items-center justify-center gap-1 rounded-full text-[10px] font-bold tracking-wide uppercase"
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="tab-capsule"
                      transition={SPRING}
                      className="absolute inset-x-1 inset-y-1.5 rounded-full bg-[linear-gradient(135deg,var(--indigo),color-mix(in_oklch,var(--indigo)_65%,var(--violet)))] shadow-[0_8px_24px_-6px_var(--indigo)] ring-1 ring-white/20"
                      aria-hidden="true"
                    />
                  )}
                  <l.icon
                    size={22}
                    strokeWidth={1.5}
                    aria-hidden="true"
                    className={"relative z-10 transition-transform " + (isActive ? "text-[var(--ink)] scale-110" : "text-[var(--muted)]")}
                  />
                  <span className={"relative z-10 leading-none transition-colors " + (isActive ? "text-[var(--ink)]" : "text-[var(--muted)]")}>
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
