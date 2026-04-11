#!/usr/bin/env node
/**
 * Hängt einen Eintrag an docs/DEV-LOG.md an (Commit-Metadaten + Twitter/X-Vorschlag für #Vibejam).
 * Aufruf: post-commit-Hook oder: npm run devlog:append
 */
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

function git(fmt) {
  return execSync(`git log -1 --format=${fmt}`, { encoding: "utf-8" }).trim();
}

function shortHash() {
  return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
}

function fullHash() {
  return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
}

function isMergeCommit() {
  const parents = execSync("git log -1 --format=%P", { encoding: "utf-8" }).trim().split(/\s+/).filter(Boolean);
  return parents.length > 1;
}

/** Rotierende Kurz-Vorschläge (≤ ~260 Zeichen), angepasst an Commit-Betreff. */
function twitterSuggestion(subject) {
  const s = subject.replace(/\s+/g, " ").trim().slice(0, 120);
  const h = parseInt(fullHash().slice(0, 8), 16);
  const variants = [
    () =>
      `⚓ ${s}${subject.length > 120 ? "…" : ""} — BattleFleet Arena nimmt Fahrt auf für #Vibejam: KI-unterstütztes Naval-RTS. Wer baut noch mit am Jam? #gamedev #AIgames`,
    () =>
      `Shipped: ${s}${subject.length > 120 ? "…" : ""} 🚢 Wir hacken an einem AI-collab Wettkampfspiel — #Vibejam #indiedev`,
    () =>
      `Update: ${s}${subject.length > 120 ? "…" : ""} | Naval Arena WIP · #Vibejam · wenn Code & KI zusammenlaufen ⚔️🎮`,
  ];
  const text = variants[h % variants.length]();
  return text.length > 280 ? `${text.slice(0, 276)}…` : text;
}

function main() {
  let root;
  try {
    root = execSync("git rev-parse --show-toplevel", { encoding: "utf-8" }).trim();
  } catch {
    console.warn("[dev-log] not a git repo, skip");
    process.exit(0);
  }

  if (isMergeCommit()) {
    console.log("[dev-log] skip merge commit");
    process.exit(0);
  }

  const logPath = join(root, "docs", "DEV-LOG.md");
  if (!existsSync(logPath)) {
    console.warn("[dev-log] docs/DEV-LOG.md missing, skip");
    process.exit(0);
  }

  const hash = shortHash();
  const subject = git("%s");
  const body = git("%b");
  const date = git("%ci");
  const author = git("%an");
  const day = date.split(/\s+/)[0] ?? date;
  const tw = twitterSuggestion(subject);

  const bodyBlock =
    body.length > 0
      ? `\n**Details:**\n\n${body
          .split("\n")
          .map((l) => (l.trim() ? `- ${l}` : ""))
          .filter(Boolean)
          .join("\n")}\n`
      : "";

  const block = `---

## ${day} — \`${hash}\`

- **Autor:** ${author}
- **Commit:** ${subject}
${bodyBlock}
### Vorschlag Twitter / X (#Vibejam)

> ${tw}

`;

  let prev = readFileSync(logPath, "utf-8");
  if (!prev.endsWith("\n")) prev += "\n";
  appendFileSync(logPath, block, "utf-8");
  console.log(`[dev-log] appended entry ${hash} → docs/DEV-LOG.md`);
}

main();
