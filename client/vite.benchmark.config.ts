import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import gameConfig from "./vite.config";

/** A separate artifact: the normal game build never includes this diagnostic entry. */
export default defineConfig({
  ...gameConfig,
  build: { outDir: "dist-benchmark", rollupOptions: { input: {
    main: path.resolve(fileURLToPath(new URL(".", import.meta.url)), "benchmark.html"),
    particles: path.resolve(fileURLToPath(new URL(".", import.meta.url)), "particle-benchmark.html"),
  } } },
});
