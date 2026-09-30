import assert from "node:assert/strict";
import { POLICY_ACTIONS, POLICY_FEATURES, POLICY_VERSION, policyLogits, validatePolicyArtifact } from "./learnedPolicy";
import { PROFILE_CONTROLLER_VERSION } from "./profiles";

const dimensions = [POLICY_FEATURES.length, 64, 64, POLICY_ACTIONS.length];
const artifact = {
  version: POLICY_VERSION, activation: "tanh", features: [...POLICY_FEATURES], actions: [...POLICY_ACTIONS],
  layers: dimensions.slice(1).map((n, i) => ({ bias: Array(n).fill(0), weight: Array.from({ length: n }, () => Array(dimensions[i]).fill(0)) })),
};
// A known nonzero path verifies matrix orientation, biases and hidden-layer activation.
artifact.layers[0]!.weight[0]![2] = 2;
artifact.layers[0]!.bias[0] = 0.25;
artifact.layers[1]!.weight[3]![0] = -0.5;
artifact.layers[2]!.weight[5]![3] = 3;
const observation = Array(POLICY_FEATURES.length).fill(0);
observation[2] = 0.5;
const logits = policyLogits(validatePolicyArtifact(artifact), observation);
assert(Math.abs(logits[5]! - 3 * Math.tanh(-0.5 * Math.tanh(1.25))) < 1e-12);
assert.throws(() => validatePolicyArtifact({ ...artifact, version: "unknown" }), /contract/);
assert.throws(() => validatePolicyArtifact({ ...artifact, actions: [...artifact.actions].reverse() }), /contract/);
assert.throws(() => validatePolicyArtifact({ ...artifact, features: artifact.features.slice(1) }), /contract/);
assert.throws(() => policyLogits(validatePolicyArtifact(artifact), [NaN]), /observation/);
const invalid = structuredClone(artifact); invalid.layers[0]!.weight[0]![0] = Infinity;
assert.throws(() => validatePolicyArtifact(invalid), /layer/);
assert.throws(() => validatePolicyArtifact({ ...artifact, metadata: { profile: "cautious" } }), /controller version/);
assert.throws(() => validatePolicyArtifact({ ...artifact, metadata: { profile: "cautious", profileControllerVersion: "old" } }), /controller version/);
assert.doesNotThrow(() => validatePolicyArtifact({ ...artifact, metadata: { profile: "cautious", profileControllerVersion: PROFILE_CONTROLLER_VERSION } }));
console.log("Policy inference and contract validation passed");
