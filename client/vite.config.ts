import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

/**
 * GitHub Pages: Projekt-URL ist `https://<user>.github.io/<repo>/` → `base` muss `/Repo-Name/` sein.
 * Lokal/Vercel: nicht setzen oder `/`.
 */
function viteBase(): string {
  const raw = process.env.VITE_BASE_PATH?.trim();
  if (!raw) return "/";
  const withLeading = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

/** Monorepo-Paket mit Schema + shipMovement (ohne vor build zu bundeln). */
export default defineConfig({
  base: viteBase(),
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(root, "index.html"),
        editor: path.resolve(root, "editor.html"),
      },
    },
  },
  resolve: {
    alias: {
      "@battlefleet/shared": path.resolve(root, "../shared/src"),
    },
    /** Eine Schema-Instanz für shared + colyseus.js (sonst kaputte Kodierung). */
    dedupe: ["@colyseus/schema"],
  },
  /** Gleiches @colyseus/schema für colyseus.js und Vite-Graph (ChangeTree / ReferenceTracker). */
  optimizeDeps: {
    include: ["colyseus.js", "@colyseus/schema"],
  },
  server: {
    port: 5173,
    strictPort: true,
    /**
     * Standard ist host „localhost“ → oft nur IPv4. Firefox löst localhost zu ::1 auf,
     * dann ist Port 5173 „nicht erreichbar“. `true` = ohne festen Host binden (IPv4+IPv6).
     */
    host: true,
  },
});
