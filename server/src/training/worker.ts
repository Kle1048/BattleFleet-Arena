import { createInterface } from "node:readline";
import { readFileSync, statSync } from "node:fs";
import { POLICY_ACTIONS, POLICY_FEATURES, POLICY_VERSION, LearnedPolicyStrategy,
  policyLogits, validatePolicyArtifact } from "@battlefleet/shared/rules";
import { TrainingArena, TRAINING_SPEC } from "./TrainingArena.js";

const modelPath = process.argv[2];
if (modelPath && statSync(modelPath).size > 2_000_000) throw new Error("Policy exceeds 2 MB");
const model = modelPath ? new LearnedPolicyStrategy(JSON.parse(readFileSync(modelPath, "utf8"))) : undefined;
const arena = new TrainingArena(model);
const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", line => {
  try {
    if (line.length > 2_000_000) throw new Error("Request too large");
    const request = JSON.parse(line);
    let result: unknown;
    switch (request.op) {
      case "describe": result = { version: POLICY_VERSION, features: POLICY_FEATURES, actions: POLICY_ACTIONS, scenario: TRAINING_SPEC }; break;
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
