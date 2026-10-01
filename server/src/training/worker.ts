import { createInterface } from "node:readline";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { POLICY_ACTIONS, POLICY_FEATURES, POLICY_VERSION, LearnedPolicyStrategy,
  policyLogits, validatePolicyArtifact, botProfile } from "@battlefleet/shared/rules";
import { TrainingArena } from "./TrainingArena.js";

const modelPath = process.argv[2];
if (modelPath && statSync(modelPath).size > 2_000_000) throw new Error("Policy exceeds 2 MB");
const model = modelPath ? new LearnedPolicyStrategy(JSON.parse(readFileSync(modelPath, "utf8"))) : undefined;
const profile = botProfile(process.argv[3] || model?.profile);
if (model && model.profile !== profile) throw new Error("Policy/profile mismatch");
const opponentPath = process.argv[4];
if (opponentPath && statSync(opponentPath).size > 2_000_000) throw new Error("Opponent policy exceeds 2 MB");
const opponentBytes = opponentPath ? readFileSync(opponentPath) : undefined;
const opponent = opponentBytes ? new LearnedPolicyStrategy(JSON.parse(opponentBytes.toString("utf8"))) : undefined;
const opponentContract = opponentBytes ? { sha256: createHash("sha256").update(opponentBytes).digest("hex"), profile: opponent!.profile } : undefined;
const rosterPath = process.argv[5];
if (rosterPath && opponentPath) throw new Error("Use either duel opponent or FFA roster");
let roster: LearnedPolicyStrategy[] | undefined;
let rosterContract: { sha256: string; profile: string }[] | undefined;
if (rosterPath) {
  if (statSync(rosterPath).size > 16_000) throw new Error("Roster exceeds 16 KB");
  const paths: unknown = JSON.parse(readFileSync(rosterPath, "utf8"));
  if (!Array.isArray(paths) || paths.length !== 3 || paths.some(p => typeof p !== "string" || !p))
    throw new Error("FFA roster must contain exactly three local policy paths");
  rosterContract = [];
  roster = paths.map(path => {
    const resolved = resolve(dirname(rosterPath), path);
    if (statSync(resolved).size > 2_000_000) throw new Error("Opponent policy exceeds 2 MB");
    const bytes = readFileSync(resolved);
    const strategy = new LearnedPolicyStrategy(JSON.parse(bytes.toString("utf8")));
    rosterContract!.push({ sha256: createHash("sha256").update(bytes).digest("hex"), profile: strategy.profile });
    return strategy;
  });
}
const arena = new TrainingArena(model, profile, opponent, undefined, roster);
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", line => {
  try {
    if (line.length > 2_000_000) throw new Error("Request too large");
    const request = JSON.parse(line);
    let result: unknown;
    switch (request.op) {
      case "describe": result = { version: POLICY_VERSION, features: POLICY_FEATURES, actions: POLICY_ACTIONS,
        scenario: rosterContract ? { ...arena.specification, opponents: rosterContract } : opponentContract ? { ...arena.specification, opponent: opponentContract } : arena.specification }; break;
      case "reset": result = arena.reset(request.seed); break;
      case "step": result = arena.step(request.action); break;
      case "logits": result = { logits: policyLogits(validatePolicyArtifact(request.artifact), request.observation) }; break;
      case "close": arena.close(); lines.close(); process.stdin.pause(); result = { closed: true }; break;
      default: throw new Error("Unknown training operation");
    }
    process.stdout.write(JSON.stringify({ ok: true, result }) + "\n");
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Worker error" }) + "\n");
  }
});
lines.on("close", () => arena.close());
