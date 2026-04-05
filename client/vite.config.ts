import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));

/** Monorepo-Paket mit Schema + shipMovement (ohne vor build zu bundeln). */
export default defineConfig({
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
