import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// CourseVault client — Vite config.
// Dev proxies /api, /openapi.json and /reference to the Express server
// (server default port 4000). Production serves client/dist from Express.
export default defineConfig({
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/openapi.json": "http://localhost:4000",
      "/reference": "http://localhost:4000",
    },
  },
});
