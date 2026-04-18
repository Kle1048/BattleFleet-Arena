// Alle src-Dateien mit Suffix .test.ts nacheinander mit tsx ausführen (bestehende assert-Skripte).
import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function* walk(dir) {
  for (const name of await readdir(dir)) {
    const p = join(dir, name);
    const st = await stat(p);
    if (st.isDirectory()) {
      yield* walk(p);
    } else if (name.endsWith(".test.ts")) {
      yield p;
    }
  }
}

const files = [];
for await (const f of walk(join(root, "src"))) {
  files.push(f);
}
files.sort();

let failed = false;
for (const file of files) {
  const rel = file.slice(root.length + 1);
  const r = spawnSync(process.execPath, ["--import", "tsx", file], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`[test failed] ${rel}`);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
