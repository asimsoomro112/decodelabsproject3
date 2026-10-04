import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router";
import Background from "./components/Background";
import Nav from "./components/Nav";
import { Toasts } from "./components/Toasts";
import { ThemeProvider } from "./components/ThemeProvider";

/* Route-level code splitting: each screen is its own chunk. */
const Vault = lazy(() => import("./screens/Vault"));
const Schema = lazy(() => import("./screens/Schema"));
const Studio = lazy(() => import("./screens/Studio"));
const Security = lazy(() => import("./screens/Security"));
const Docs = lazy(() => import("./screens/Docs"));

function RouteFallback() {
  return (
    <div
      className="page mx-auto w-full max-w-6xl pt-24 md:pt-28"
      aria-busy="true"
      aria-label="Loading screen"
    >
      <div className="skeleton h-10 w-56" />
      <div className="skeleton mt-4 h-4 w-96 max-w-full" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-28" />
        ))}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <BrowserRouter>
        <div className="relative z-0 min-h-screen w-full">
        <a href="#main" className="skip-link">
          Skip to main content
        </a>
        <Background />
        <Nav />
        <main id="main" className="pb-12">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Vault />} />
              <Route path="/schema" element={<Schema />} />
              <Route path="/studio" element={<Studio />} />
              <Route path="/security" element={<Security />} />
              <Route path="/docs" element={<Docs />} />
              <Route path="*" element={<Vault />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="border-t border-white/10 px-4 py-6 text-center text-xs text-[var(--muted)] max-md:mb-[calc(80px+env(safe-area-inset-bottom,0px))]">
          Built by Asim — DecodeLabs Industrial Training Kit — Batch 2026
        </footer>
        </div>
        <Toasts />
      </BrowserRouter>
    </ThemeProvider>
  );
}
