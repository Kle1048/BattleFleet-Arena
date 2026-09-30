import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const options = process.argv.slice(2);
const profile = options.length === 0 ? "standard" : options.length === 2 && options[0] === "--profile" ? options[1] : "invalid";
if (!["standard", "aggressive", "cautious", "objective", "mixed"].includes(profile))
  throw new Error("Usage: node training/play-local.mjs [--profile standard|aggressive|cautious|objective|mixed]");
for (const port of [2567, 5173]) {
  await new Promise((accept, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`Port ${port} is occupied. Stop the existing local server first.`)));
    probe.listen(port, "127.0.0.1", () => probe.close(accept));
  });
}
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}
function start(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, stdio: "inherit", windowsHide: true });
  children.push(child);
  child.on("error", error => { console.error(error.message); stop(1); });
  child.on("exit", code => { if (!stopping) stop(code ?? 1); });
}
start(["--conditions=bfa-source", "--import", "tsx", "training/play-local-server.mts", profile], root, process.env);
start([resolve(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5173", "--strictPort"],
  resolve(root, "client"), { ...process.env, VITE_COLYSEUS_URL: "ws://127.0.0.1:2567", VITE_BASE_PATH: "/" });
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
console.log("Local trained-bot game: http://127.0.0.1:5173 (Ctrl+C stops both services).");
