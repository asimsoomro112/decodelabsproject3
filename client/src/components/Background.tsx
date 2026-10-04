import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useScroll, useSpring } from "motion/react";
import { useLocation } from "react-router";
import { useTheme } from "./ThemeProvider";

/* ============================================================
   "The data vault" — fixed full-viewport canvas behind everything.
   An isometric lattice of translucent table-slabs (grids of rows)
   floating at different depths, linked by thin PK→FK key-beams,
   with a faint vault ring / shield at the centre and slow
   orbit + pointer parallax.

   Reacts to REAL crud via window CustomEvents (dispatched by api.ts):
     db:insert → row lights emerald, pulse runs along the beams
     db:update → amber shimmer on the row
     db:delete → row dissolves into rose particles
     db:error  → shield ripples violet with a red edge

   Performance: devicePixelRatio capped at 2, pauses when the tab is
   hidden, reduced detail on mobile, one static frame under
   prefers-reduced-motion.
   ============================================================ */

interface Vec {
  x: number;
  y: number;
}

interface Flash {
  until: number;
  color: string;
}

interface Slab {
  key: string; // table name
  label: string;
  ix: number;
  iy: number;
  rows: number;
  cols: number;
  accent: string;
  flashes: Map<number, Flash>;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface Beam {
  from: string; // slab key
  to: string; // slab key
  kind: string; // "1:1" | "1:M"
  pulses: number[]; // 0..1 progress of travelling pulses
}

interface Ripple {
  t: number; // 0..1
  color: string;
  edge: string;
}

export default function Background() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [media, setMedia] = useState<{ video: string; poster: string } | null>(null);

  // Optional media layer: if /media/bg.mp4 exists it plays beneath the canvas.
  useEffect(() => {
    let alive = true;
    fetch("/media/bg.mp4", { method: "HEAD" })
      .then((r) => {
        if (alive && r.ok) setMedia({ video: "/media/bg.mp4", poster: "/media/bg-poster.jpg" });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctxOrNull = canvas.getContext("2d");
    if (!ctxOrNull) return;
    const ctx: CanvasRenderingContext2D = ctxOrNull;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.innerWidth < 768;
    const detail = mobile ? 0.55 : 1;

    let w = 0;
    let h = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    /* ---------- world ---------- */

    const TILE = mobile ? 20 : 26;
    const cx0 = () => w / 2;
    const cy0 = () => h / 2 - 20;

    const slabs: Slab[] = [
      { key: "users", label: "users", ix: -10, iy: -5, rows: Math.round(6 * detail) || 4, cols: Math.round(7 * detail) || 4, accent: "#6366f1", flashes: new Map() },
      { key: "courses", label: "courses", ix: 4, iy: -6, rows: Math.round(6 * detail) || 4, cols: Math.round(7 * detail) || 4, accent: "#f59e0b", flashes: new Map() },
      { key: "enrollments", label: "enrollments ⬡ junction", ix: -3, iy: 3, rows: Math.round(5 * detail) || 3, cols: Math.round(6 * detail) || 4, accent: "#a855f7", flashes: new Map() },
      { key: "profiles", label: "user_profiles", ix: 8, iy: 2, rows: Math.round(4 * detail) || 3, cols: Math.round(5 * detail) || 4, accent: "#34d399", flashes: new Map() },
    ];
    const slabByKey = new Map(slabs.map((s) => [s.key, s]));

    const beams: Beam[] = [
      { from: "users", to: "enrollments", kind: "1:M", pulses: [] },
      { from: "courses", to: "enrollments", kind: "1:M", pulses: [] },
      { from: "users", to: "profiles", kind: "1:1", pulses: [] },
    ];

    const particles: Particle[] = [];
    const ripples: Ripple[] = [];

    const cam = { ox: 0, oy: 0, tox: 0, toy: 0 };

    function iso(ix: number, iy: number, lift = 0): Vec {
      return {
        x: cx0() + cam.ox + (ix - iy) * TILE * 0.866,
        y: cy0() + cam.oy + (ix + iy) * TILE * 0.5 - lift,
      };
    }

    function slabTopCenter(s: Slab): Vec {
      return iso(s.ix + s.cols / 2, s.iy + s.rows / 2, 26);
    }

    function cellCenter(s: Slab, r: number, c: number): Vec {
      return iso(s.ix + c + 0.5, s.iy + r + 0.5, 26);
    }

    function randomCell(s: Slab): { r: number; c: number } {
      return {
        r: Math.floor(Math.random() * s.rows),
        c: Math.floor(Math.random() * s.cols),
      };
    }

    /* ---------- events ---------- */

    const onInsert = (e: Event) => {
      const table = (e as CustomEvent).detail?.table as string | undefined;
      const s = slabByKey.get(table === "profiles" ? "profiles" : table ?? "");
      if (!s) return;
      const { r, c } = randomCell(s);
      s.flashes.set(r * 64 + c, { until: performance.now() + 1400, color: "#34d399" });
      for (const b of beams) {
        if (b.from === s.key || b.to === s.key) b.pulses.push(0);
      }
    };

    const onUpdate = (e: Event) => {
      const table = (e as CustomEvent).detail?.table as string | undefined;
      const s = slabByKey.get(table === "profiles" ? "profiles" : table ?? "");
      if (!s) return;
      const { r, c } = randomCell(s);
      s.flashes.set(r * 64 + c, { until: performance.now() + 1100, color: "#f59e0b" });
    };

    const onDelete = (e: Event) => {
      const table = (e as CustomEvent).detail?.table as string | undefined;
      const s = slabByKey.get(table === "profiles" ? "profiles" : table ?? "");
      if (!s) return;
      const { r, c } = randomCell(s);
      const p = cellCenter(s, r, c);
      s.flashes.set(r * 64 + c, { until: performance.now() + 500, color: "#fb7185" });
      const n = mobile ? 8 : 16;
      for (let i = 0; i < n && particles.length < 240; i++) {
        particles.push({
          x: p.x + (Math.random() - 0.5) * 14,
          y: p.y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 46,
          vy: -30 - Math.random() * 60,
          life: 0,
          maxLife: 0.9 + Math.random() * 0.7,
          size: 1.5 + Math.random() * 2.5,
          color: "#fb7185",
        });
      }
    };

    const onError = () => {
      ripples.push({ t: 0, color: "#a855f7", edge: "#fb7185" });
    };

    window.addEventListener("db:insert", onInsert);
    window.addEventListener("db:update", onUpdate);
    window.addEventListener("db:delete", onDelete);
    window.addEventListener("db:error", onError);

    /* pointer parallax (rAF-throttled via the render loop targets) */
    const onPointer = (e: PointerEvent) => {
      cam.tox = (e.clientX / w - 0.5) * 44;
      cam.toy = (e.clientY / h - 0.5) * 30;
    };
    window.addEventListener("pointermove", onPointer, { passive: true });

    /* ---------- drawing ---------- */

    function drawSlab(s: Slab, now: number) {
      const lift = 26;
      const p00 = iso(s.ix, s.iy, lift);
      const p10 = iso(s.ix + s.cols, s.iy, lift);
      const p11 = iso(s.ix + s.cols, s.iy + s.rows, lift);
      const p01 = iso(s.ix, s.iy + s.rows, lift);
      const depth = 10;

      // side faces (thickness)
      ctx.beginPath();
      ctx.moveTo(p01.x, p01.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p11.x, p11.y + depth);
      ctx.lineTo(p01.x, p01.y + depth);
      ctx.closePath();
      ctx.fillStyle = "rgba(10,12,20,0.55)";
      ctx.fill();

      // top face — translucent slab
      const grad = ctx.createLinearGradient(p00.x, p00.y, p11.x, p11.y);
      grad.addColorStop(0, "rgba(140,150,255,0.10)");
      grad.addColorStop(1, "rgba(140,150,255,0.03)");
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(p10.x, p10.y);
      ctx.lineTo(p11.x, p11.y);
      ctx.lineTo(p01.x, p01.y);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      const junction = s.key === "enrollments";
      ctx.strokeStyle = junction ? "rgba(168,85,247,0.55)" : "rgba(160,170,255,0.28)";
      ctx.lineWidth = junction ? 1.6 : 1;
      ctx.stroke();

      // row grid
      const gap = 2.5;
      for (let r = 0; r < s.rows; r++) {
        for (let c = 0; c < s.cols; c++) {
          const a = iso(s.ix + c, s.iy + r, lift);
          const b = iso(s.ix + c + 1, s.iy + r, lift);
          const cc = iso(s.ix + c + 1, s.iy + r + 1, lift);
          const d = iso(s.ix + c, s.iy + r + 1, lift);
          const inset = (p: Vec, q: Vec, t: number): Vec => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
          const t = gap / TILE;
          const q1 = inset(a, cc, t);
          const q2 = inset(b, d, t);
          const q3 = inset(cc, a, t);
          const q4 = inset(d, b, t);
          const flash = s.flashes.get(r * 64 + c);
          const active = flash && flash.until > now;
          ctx.beginPath();
          ctx.moveTo(q1.x, q1.y);
          ctx.lineTo(q2.x, q2.y);
          ctx.lineTo(q3.x, q3.y);
          ctx.lineTo(q4.x, q4.y);
          ctx.closePath();
          if (active && flash) {
            const k = 1 - (flash.until - now) / 1400;
            ctx.fillStyle = flash.color;
            ctx.globalAlpha = Math.max(0, 0.85 * (1 - k * 0.6));
            ctx.fill();
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = "rgba(150,160,255,0.07)";
            ctx.fill();
          }
          if (active) {
            ctx.strokeStyle = flash!.color;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }

      // label
      const lp = iso(s.ix + s.cols / 2, s.iy + s.rows + 0.9, lift);
      ctx.font = "600 10px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillStyle = junction ? "rgba(196,141,255,0.85)" : "rgba(170,180,220,0.6)";
      ctx.fillText(s.label, lp.x, lp.y);

      // PK marker on first cell
      const pk = cellCenter(s, 0, 0);
      ctx.fillStyle = s.accent;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawBeams(now: number, dt: number) {
      for (const b of beams) {
        const a = slabByKey.get(b.from);
        const z = slabByKey.get(b.to);
        if (!a || !z) continue;
        const p1 = slabTopCenter(a);
        const p2 = slabTopCenter(z);

        // thin key-beam PK → FK
        const g = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
        g.addColorStop(0, "rgba(99,102,241,0.0)");
        g.addColorStop(0.5, "rgba(99,102,241,0.35)");
        g.addColorStop(1, "rgba(99,102,241,0.0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -now / 60;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.quadraticCurveTo((p1.x + p2.x) / 2, Math.min(p1.y, p2.y) - 46, p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // relation label at midpoint
        const mx = (p1.x + p2.x) / 2;
        const my = Math.min(p1.y, p2.y) - 52;
        ctx.font = "600 9px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(150,160,255,0.5)";
        ctx.fillText(b.kind, mx, my);

        // travelling pulses (insert events)
        for (let i = b.pulses.length - 1; i >= 0; i--) {
          b.pulses[i] += dt / 0.9;
          if (b.pulses[i] >= 1) {
            b.pulses.splice(i, 1);
            continue;
          }
          const t = b.pulses[i];
          // quadratic point
          const qx = (1 - t) * (1 - t) * p1.x + 2 * (1 - t) * t * mx + t * t * p2.x;
          const qy = (1 - t) * (1 - t) * p1.y + 2 * (1 - t) * t * (Math.min(p1.y, p2.y) - 46) + t * t * p2.y;
          const glow = ctx.createRadialGradient(qx, qy, 0, qx, qy, 14);
          glow.addColorStop(0, "rgba(52,211,153,0.9)");
          glow.addColorStop(1, "rgba(52,211,153,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(qx, qy, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#34d399";
          ctx.beginPath();
          ctx.arc(qx, qy, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawShield(now: number, dt: number) {
      const x = cx0() + cam.ox * 0.4;
      const y = cy0() + cam.oy * 0.4 - 120;
      const R = mobile ? 84 : 120;

      // faint vault ring
      ctx.strokeStyle = "rgba(150,160,255,0.10)";
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, Math.PI * 2);
      ctx.stroke();

      // rotating dashed orbit
      ctx.strokeStyle = "rgba(150,160,255,0.22)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 14]);
      ctx.lineDashOffset = -now / 140;
      ctx.beginPath();
      ctx.arc(x, y, R + 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // shield glyph
      const s = 34;
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s * 0.85, y - s * 0.45);
      ctx.lineTo(x + s * 0.85, y + s * 0.25);
      ctx.quadraticCurveTo(x + s * 0.85, y + s * 0.75, x, y + s);
      ctx.quadraticCurveTo(x - s * 0.85, y + s * 0.75, x - s * 0.85, y + s * 0.25);
      ctx.lineTo(x - s * 0.85, y - s * 0.45);
      ctx.closePath();
      ctx.strokeStyle = "rgba(168,85,247,0.35)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // keyhole
      ctx.fillStyle = "rgba(245,158,11,0.5)";
      ctx.beginPath();
      ctx.arc(x, y - 2, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(x - 1.5, y, 3, 12);

      // error ripples: violet with a red edge
      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.t += dt / 1.1;
        if (rp.t >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const rr = 20 + rp.t * (R + 40);
        const alpha = 1 - rp.t;
        ctx.strokeStyle = rp.edge;
        ctx.globalAlpha = alpha * 0.8;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = rp.color;
        ctx.globalAlpha = alpha * 0.5;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(x, y, rr - 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    function drawParticles(dt: number) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life += dt;
        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 26 * dt; // gentle gravity
        const k = 1 - p.life / p.maxLife;
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * k + 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    }

    /* ---------- main loop ---------- */

    let raf = 0;
    let last = performance.now();
    let running = true;

    const frame = (now: number) => {
      if (!running) return;
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      // slow orbit + pointer parallax easing
      const t = now / 1000;
      cam.ox += (cam.tox + Math.sin(t * 0.12) * 12 - cam.ox) * Math.min(1, dt * 3);
      cam.oy += (cam.toy + Math.cos(t * 0.1) * 8 - cam.oy) * Math.min(1, dt * 3);

      ctx.clearRect(0, 0, w, h);

      drawShield(now, dt);
      // far → near painter's order
      const order = [...slabs].sort((a, b) => a.ix + a.iy - (b.ix + b.iy));
      for (const s of order) drawSlab(s, now);
      drawBeams(now, dt);
      drawParticles(dt);

      raf = requestAnimationFrame(frame);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reducedMotion) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    if (reducedMotion) {
      // One static frame — no motion, still shows the full scene.
      cam.ox = 0;
      cam.oy = 0;
      ctx.clearRect(0, 0, w, h);
      drawShield(0, 0);
      const order = [...slabs].sort((a, b) => a.ix + a.iy - (b.ix + b.iy));
      for (const s of order) drawSlab(s, 1);
      drawBeams(0, 0);
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("db:insert", onInsert);
      window.removeEventListener("db:update", onUpdate);
      window.removeEventListener("db:delete", onDelete);
      window.removeEventListener("db:error", onError);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const { scrollYProgress } = useScroll();
  const pathLength = useSpring(scrollYProgress, { stiffness: 100, damping: 30, restDelta: 0.001 });
  const location = useLocation();
  const { actualTheme } = useTheme();
  const isLight = actualTheme === "light";

  const getRouteConfig = () => {
    switch (location.pathname) {
      case "/schema":
        return { 
          color: "#10b981", 
          glow1: `radial-gradient(circle at 20% 50%, rgba(16,185,129,${isLight ? 0.3 : 0.15}), transparent 50%)`,
          glow2: `radial-gradient(circle at 80% 80%, rgba(52,211,153,${isLight ? 0.2 : 0.1}), transparent 50%)`,
          paths: ["M 250,0 L 250,400 L 100,600 L 400,800 L 250,1100"],
          extra: (
            <svg className={`absolute inset-0 w-full h-full ${isLight ? "opacity-40" : "opacity-20"}`} preserveAspectRatio="xMidYMid slice" viewBox="0 0 1000 1000">
              <defs><pattern id="schema-grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="4 4" /></pattern></defs>
              <rect width="100%" height="100%" fill="url(#schema-grid)" />
              <circle cx="20%" cy="30%" r="4" fill="#10b981" className="animate-pulse" />
              <circle cx="80%" cy="70%" r="4" fill="#10b981" className="animate-pulse" />
              <circle cx="40%" cy="60%" r="6" fill="#10b981" className="animate-bounce" />
            </svg>
          )
        };
      case "/studio":
        return { 
          color: "#f59e0b", 
          glow1: `radial-gradient(circle at 80% 20%, rgba(245,158,11,${isLight ? 0.3 : 0.15}), transparent 50%)`,
          glow2: `radial-gradient(circle at 20% 80%, rgba(251,191,36,${isLight ? 0.2 : 0.1}), transparent 50%)`,
          paths: ["M 0,800 Q 250,800 250,500 T 500,200"],
          extra: (
            <div className={`absolute inset-0 flex items-end justify-around px-20 ${isLight ? "opacity-20" : "opacity-10"}`}>
              {[40, 75, 45, 90, 60, 85, 30, 65].map((h, i) => (
                 <div key={i} className="w-16 bg-gradient-to-t from-amber-500 to-transparent rounded-t-sm" style={{ height: `${h}%` }} />
              ))}
            </div>
          )
        };
      case "/security":
        return { 
          color: "#ef4444", 
          glow1: `radial-gradient(circle at 50% 20%, rgba(239,68,68,${isLight ? 0.3 : 0.15}), transparent 50%)`,
          glow2: `radial-gradient(circle at 50% 80%, rgba(248,113,113,${isLight ? 0.2 : 0.1}), transparent 50%)`,
          paths: ["M 0,200 Q 250,600 500,200"],
          extra: (
             <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none ${isLight ? "opacity-20" : "opacity-10"}`}>
                <div className="w-[80vw] h-[80vw] rounded-full border-[2px] border-red-500 animate-[ping_6s_linear_infinite]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] rounded-full border-[4px] border-red-500 animate-[ping_4s_linear_infinite]" />
             </div>
          )
        };
      case "/docs":
        return { 
          color: "#06b6d4", 
          glow1: `radial-gradient(circle at 30% 30%, rgba(6,182,212,${isLight ? 0.3 : 0.15}), transparent 50%)`,
          glow2: `radial-gradient(circle at 70% 70%, rgba(59,130,246,${isLight ? 0.2 : 0.1}), transparent 50%)`,
          paths: ["M 100,0 L 100,1000", "M 400,0 L 400,1000"],
          extra: (
            <div className={`absolute inset-0 flex flex-col justify-around py-32 px-20 ${isLight ? "opacity-30" : "opacity-10"}`}>
              {[...Array(12)].map((_, i) => (
                 <div key={i} className="h-1 bg-cyan-500 rounded-full" style={{ width: `${Math.random() * 40 + 10}%`, marginLeft: `${Math.random() * 20}%` }} />
              ))}
            </div>
          )
        };
      default: // Vault
        return { 
          color: "#8b5cf6", 
          glow1: `radial-gradient(ellipse 80% 50% at 50% -20%, rgba(34,211,238,${isLight ? 0.3 : 0.15}), transparent)`,
          glow2: `radial-gradient(ellipse 60% 60% at 80% 100%, rgba(139,92,246,${isLight ? 0.3 : 0.15}), transparent)`,
          paths: ["M -100,-100 C 300,200 200,800 600,1100"],
          extra: null
        };
    }
  };

  const config = getRouteConfig();
  const isVault = location.pathname === "/";

  return (
    <>
      {media && (
        <div aria-hidden="true" className={"fixed inset-0 -z-[30] overflow-hidden transition-opacity duration-1000 " + (isVault ? "opacity-100" : "opacity-0")}>
          <video
            className="kenburns h-full w-full object-cover opacity-25"
            src={media.video}
            poster={media.poster}
            autoPlay
            muted
            loop
            playsInline
          />
        </div>
      )}

      {/* Dynamic Background Visuals based on Route */}
      <AnimatePresence>
        <motion.div 
          className="fixed inset-0 -z-[25] pointer-events-none"
          style={{ backgroundImage: `${config.glow1}, ${config.glow2}` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          key={location.pathname}
        >
          {config.extra}
        </motion.div>
      </AnimatePresence>

      {/* Persistent Left Sidebar Glass Refraction Glow */}
      <div className="fixed top-0 left-0 w-80 h-full bg-[radial-gradient(ellipse_at_left_center,rgba(99,102,241,0.2),transparent_70%)] opacity-100 -z-[20] pointer-events-none" />

      {/* Scroll-Linked SVG Animation */}
      <svg className="pointer-events-none fixed inset-0 w-full h-full opacity-50 blur-[3px] -z-[15]" preserveAspectRatio="none" viewBox="0 0 500 1000">
        {config.paths.map((p, i) => (
          <motion.path
            key={`blur-${i}`}
            d={p}
            fill="none"
            stroke={config.color}
            strokeWidth="6"
            style={{ pathLength }}
          />
        ))}
      </svg>
      <svg className="pointer-events-none fixed inset-0 w-full h-full opacity-90 -z-[15]" preserveAspectRatio="none" viewBox="0 0 500 1000">
        {config.paths.map((p, i) => (
          <motion.path
            key={`sharp-${i}`}
            d={p}
            fill="none"
            stroke={config.color}
            strokeWidth="2"
            style={{ pathLength }}
          />
        ))}
      </svg>

      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={"pointer-events-none fixed inset-0 -z-10 transition-opacity duration-1000 " + (isVault ? "opacity-100" : "opacity-0")}
      />
    </>
  );
}
