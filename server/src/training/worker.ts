import { createInterface } from "node:readline";
import { readFileSync, statSync } from "node:fs";
import { POLICY_ACTIONS, POLICY_FEATURES, POLICY_VERSION, LearnedPolicyStrategy,
  policyLogits, validatePolicyArtifact, botProfile } from "@battlefleet/shared/rules";
import { TrainingArena } from "./TrainingArena.js";

const modelPath = process.argv[2];
if (modelPath && statSync(modelPath).size > 2_000_000) throw new Error("Policy exceeds 2 MB");
const model = modelPath ? new LearnedPolicyStrategy(JSON.parse(readFileSync(modelPath, "utf8"))) : undefined;
const profile = botProfile(process.argv[3] || model?.profile);
if (model && model.profile !== profile) throw new Error("Policy/profile mismatch");
const arena = new TrainingArena(model, profile);
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", line => {
  try {
    if (line.length > 2_000_000) throw new Error("Request too large");
    const request = JSON.parse(line);
    let result: unknown;
    switch (request.op) {
      case "describe": result = { version: POLICY_VERSION, features: POLICY_FEATURES, actions: POLICY_ACTIONS, scenario: arena.specification }; break;
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
