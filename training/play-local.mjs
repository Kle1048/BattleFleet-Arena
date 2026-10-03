import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { networkInterfaces } from "node:os";
import { isIP } from "node:net";

const root = fileURLToPath(new URL("../", import.meta.url));
const { values } = parseArgs({ options: { profile: { type: "string", default: "standard" }, lan: { type: "string" } } });
const profile = values.profile;
if (!["standard", "aggressive", "cautious", "objective", "mixed"].includes(profile))
  throw new Error("Usage: node training/play-local.mjs [--profile standard|aggressive|cautious|objective|mixed] [--lan private-local-IPv4]");
const host = values.lan ?? "127.0.0.1";
if (values.lan) {
  const parts = host.split('.').map(Number);
  const privateAddress = parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
  if (isIP(host) !== 4 || !privateAddress || !Object.values(networkInterfaces()).flat().some(row => row && !row.internal && row.address === host))
    throw new Error("--lan must name a private IPv4 address assigned to this computer");
}
for (const port of [2567, 5173]) {
  await new Promise((accept, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`Port ${port} is occupied. Stop the existing local server first.`)));
    probe.listen(port, host, () => probe.close(accept));
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
const clientEnv = { ...process.env, VITE_COLYSEUS_URL: `ws://${host}:2567`, VITE_BASE_PATH: "/" };
const vite = resolve(root, "node_modules/vite/bin/vite.js");
const lanOutput = resolve(root, "training/runs/local-play/lan-client");
if (values.lan) {
  await new Promise((accept, reject) => {
    const build = spawn(process.execPath, [vite, "build", "--outDir", lanOutput, "--emptyOutDir"],
      { cwd: resolve(root, "client"), env: clientEnv, stdio: "inherit", windowsHide: true });
    build.on("error", reject);
    build.on("exit", code => code === 0 ? accept() : reject(new Error(`LAN client build failed: ${code}`)));
  });
}
start(["--conditions=bfa-source", "--import", "tsx", "training/play-local-server.mts", profile], root,
  { ...process.env, BFA_LOCAL_PLAY_HOST: host });
start([vite, ...(values.lan ? ["preview", "--outDir", lanOutput] : []), "--host", host, "--port", "5173", "--strictPort"],
  resolve(root, "client"), clientEnv);
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
console.log(`Trained-bot game: http://${host}:5173 (Ctrl+C stops both services).`);
