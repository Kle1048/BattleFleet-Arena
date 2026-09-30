import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { spawn } from "node:child_process";
const directory = dirname(fileURLToPath(import.meta.url));
const python = join(directory, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
if (!existsSync(python)) {
  console.error("Training environment missing. See training/README.md (setup.ps1)."); process.exit(1);
}
const [command = "--help", ...rest] = process.argv.slice(2);
const args = command === "dashboard"
  ? ["-m", "tensorboard.main", "--logdir", join(directory, "runs"), "--host", "127.0.0.1", ...rest]
  : [join(directory, "camp.py"), command, ...rest];
const child = spawn(python, args, { cwd: join(directory, ".."), stdio: "inherit", windowsHide: true });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
