import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
export function buildInfo(root = projectRoot, env = process.env) {
  let revision = "unknown", dirty = null;
  try {
    const gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const normalize = value => process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
    if (normalize(gitRoot) !== normalize(root)) throw new Error("Not the build repository root");
    revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    dirty = !!execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
  } catch { /* Exported release archive: explicit revision needed below. */ }
  if (env.BFA_BUILD_REVISION) {
    if (!/^[a-f0-9]{40,64}$/.test(env.BFA_BUILD_REVISION)) throw new Error("BFA_BUILD_REVISION must be a full Git revision");
    if (revision !== "unknown" && revision !== env.BFA_BUILD_REVISION) throw new Error("Build revision differs from checkout");
    revision = env.BFA_BUILD_REVISION;
  }
  const hash = createHash("sha256");
  const walk = relative => {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true }).sort((a,b) => a.name < b.name ? -1 : 1)) {
      const next = relative + "/" + entry.name;
      if (entry.isSymbolicLink()) throw new Error("Build inputs cannot contain symbolic links");
      if (entry.isDirectory()) walk(next);
      else { hash.update(next + "\0"); hash.update(readFileSync(path.join(root, next))); hash.update("\0"); }
    }
  };
  for (const dir of ["client/src", "client/public", "server/src", "shared/src", "scripts"]) walk(dir);
  for (const file of ["package.json", "package-lock.json", "client/package.json", "server/package.json", "shared/package.json",
    "client/index.html", "client/manual.html", "client/editor.html", "client/island-polygon-editor.html",
    "client/tsconfig.json", "server/tsconfig.json", "shared/tsconfig.json", "client/vite.config.ts"]) {
    hash.update(file + "\0"); hash.update(readFileSync(path.join(root, file))); hash.update("\0");
  }
  const sourceHash = hash.digest("hex");
  return { revision, dirty, sourceHash, id: `${revision.slice(0,12)}-${sourceHash.slice(0,12)}${dirty === null ? "-unverified" : dirty ? "-dirty" : ""}` };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const info = buildInfo();
  const target = path.join(projectRoot, "build-info.json");
  const text = JSON.stringify(info, null, 2) + "\n";
  if (!existsSync(target) || readFileSync(target, "utf8") !== text) writeFileSync(target, text);
  console.log(`Build identity: ${info.id}`);
}
