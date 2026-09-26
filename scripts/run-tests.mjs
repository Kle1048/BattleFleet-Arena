// Alle src-Dateien mit Suffix .test.ts nacheinander mit tsx ausführen (bestehende assert-Skripte).
import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

// npm workspace scripts run with the package directory as cwd.
const root = process.cwd();

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
if (files.length === 0) {
  console.error(`No .test.ts files found in ${join(root, "src")}`);
  process.exit(1);
}
console.log(`Running ${files.length} test files in ${root}`);

let failed = false;
for (const file of files) {
  const rel = relative(root, file);
  const r = spawnSync(process.execPath, ["--conditions=bfa-source", "--import", "tsx", file], {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    timeout: 60_000,
  });
  if (r.status !== 0) {
    console.error(`[test failed] ${rel}`, r.error ?? r.signal ?? r.status);
    failed = true;
  }
}

console.log(`${files.length} test files completed; ${failed ? "FAILED" : "passed"}.`);
process.exit(failed ? 1 : 0);
