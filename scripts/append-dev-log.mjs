#!/usr/bin/env node
/**
 * Appends an entry to docs/DEV-LOG.md (commit metadata + Twitter/X-style line for #Vibejam).
 * Invoked from post-commit hook or: npm run devlog:append
 */
import { appendFileSync, readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

function git(fmt) {
  return execSync(`git log -1 --format=${fmt}`, { encoding: "utf-8" }).trim();
}

function fullHash() {
  return execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
}

/** Separator between DEV-LOG entries (see docs/DEV-LOG.md). */
const ENTRY_SEP = "\n---\n\n## ";

/**
 * If the last entry has the same one-line subject as the current commit, replace it
 * instead of appending (covers `git commit --amend`: post-commit runs again; `--no-verify`
 * does not disable post-commit).
 */
function replaceLastEntryIfSameCommitSubject(prev, subject, newBlockWithMarker) {
  const idx = prev.lastIndexOf(ENTRY_SEP);
  if (idx === -1) return null;
  const tail = prev.slice(idx + ENTRY_SEP.length);
  const m = tail.match(/- \*\*Commit:\*\* (.+)/);
  if (!m) return null;
  if (m[1].trim() !== subject.trim()) return null;
  return prev.slice(0, idx) + "\n" + newBlockWithMarker;
}

function isMergeCommit() {
  const parents = execSync("git log -1 --format=%P", { encoding: "utf-8" }).trim().split(/\s+/).filter(Boolean);
  return parents.length > 1;
}

/** Rotating short suggestions (≤ ~260 chars), English only. */
function twitterSuggestion(subject) {
  const s = subject.replace(/\s+/g, " ").trim().slice(0, 120);
  const h = parseInt(fullHash().slice(0, 8), 16);
  const variants = [
    () =>
      `⚓ ${s}${subject.length > 120 ? "…" : ""} — BattleFleet Arena, naval RTS for #Vibejam. Who else is shipping? #gamedev #AIgames`,
    () =>
      `Shipped: ${s}${subject.length > 120 ? "…" : ""} 🚢 AI-assisted competitive game — #Vibejam #indiedev`,
    () =>
      `Update: ${s}${subject.length > 120 ? "…" : ""} | Naval arena WIP · #Vibejam · code + play ⚔️🎮`,
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

  const h = fullHash();
  const marker = `\n<!-- devlog-rev:${h} -->\n`;
  const block = `---

## ${day}

- **Author:** ${author}
- **Commit:** ${subject}
${bodyBlock}
### Suggested post (Twitter / X, #Vibejam)

> ${tw}
${marker}`;

  let prev = readFileSync(logPath, "utf-8");
  if (!prev.endsWith("\n")) prev += "\n";

  if (prev.includes(`<!-- devlog-rev:${h} -->`)) {
    console.log("[dev-log] entry already present for HEAD, skip");
    process.exit(0);
  }

  const replaced = replaceLastEntryIfSameCommitSubject(prev, subject, block);
  if (replaced !== null) {
    writeFileSync(logPath, replaced.endsWith("\n") ? replaced : `${replaced}\n`, "utf-8");
    console.log("[dev-log] replaced last entry (same commit subject, e.g. amend) → docs/DEV-LOG.md");
    process.exit(0);
  }

  appendFileSync(logPath, block, "utf-8");
  console.log("[dev-log] appended entry → docs/DEV-LOG.md");
}

main();
