import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {policyLogits, validatePolicyArtifact} from '../../shared/src/bot/learnedPolicy.ts';
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(here, 'course.js'), 'utf8');
const context = vm.createContext({document: {getElementById() {throw new Error('Unexpected DOM access');}}});
vm.runInContext(source.slice(0, source.indexOf('const QUIZZES')) + '\nthis.api = {forward, makeObservation, rewardExample, ppoExample, sensorState};', context);
const api = context.api;
let cases = 0;
for (const profile of ['aggressive', 'cautious', 'objective']) {
  const suffix = profile === 'objective' ? '-final' : '';
  const policy = validatePolicyArtifact(JSON.parse(readFileSync(resolve(here, `../runs/personality-${profile}-balanced${suffix}/policy.json`), 'utf8')));
  for (const scene of ['contact', 'empty', 'esm', 'missile']) for (const hp of [5, 50, 100]) {
    const o = api.makeObservation(policy, scene, hp, 35, 'SEEK_SEA_CONTROL');
    assert.equal(o.length, 37);
    const actual = api.forward(policy, o), expected = policyLogits(policy, o);
    expected.forEach((v, i) => assert.equal(actual.logits[i], v));
    assert.ok(Math.abs(actual.probabilities.reduce((a, b) => a + b, 0) - 1) < 1e-12);
    if (scene === 'empty' || scene === 'esm') for (const [i, f] of policy.features.entries()) if (f.startsWith('target.')) assert.equal(o[i], 0);
    cases++;
  }
}
assert.equal(api.rewardExample(40, 10).score, 220);
[3.92, 4.12, 5.12].forEach((v, i) => assert.ok(Math.abs(api.rewardExample(40, 10).values[i] - v) < 1e-12));
assert.equal(api.ppoExample(0.3, 2).objective, 2.4);
assert.ok(Math.abs(api.ppoExample(0.3, -2).objective + 3) < 1e-12);
assert.equal(api.sensorState(600, 1200, true, false).precise, true);
assert.equal(api.sensorState(650, 1200, true, true).precise, false);
assert.equal(api.sensorState(1200, 1200, false, true).esm, true);
assert.equal(api.sensorState(1250, 1200, false, true).esm, false);
const html = readFileSync(resolve(here, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(new Set(ids).size, ids.length, 'Duplicate element IDs');
for (const [, id] of source.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.includes(id), `Missing element ${id}`);
assert.ok(!html.includes('/* MODELS */') && !html.includes('/* COURSE_SCRIPT */'));
console.log(`${cases} real-model inference comparisons passed; sensor boundaries, PPO signs, reward arithmetic and document bindings passed.`);
