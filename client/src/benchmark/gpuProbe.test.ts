import assert from "node:assert/strict";
import type { WebGLRenderer } from "three";
import { measureGpuFrames } from "./gpuProbe";

const requestBefore = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
const cancelBefore = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
const callbacks = new Map<number, () => void>();
let sequence = 0, allocated = 0, deleted = 0, renders = 0, supported = true, disjoint = false;
let valid = true;
Object.defineProperty(globalThis, "requestAnimationFrame", { configurable: true, value: (run: () => void) => {
  const id = ++sequence; callbacks.set(id, run); return id;
} });
Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: (id: number) => callbacks.delete(id) });
const context = {
  QUERY_RESULT_AVAILABLE: 1, QUERY_RESULT: 2,
  getExtension: () => supported ? { TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 } : null,
  isContextLost: () => false, getParameter: () => disjoint,
  createQuery: () => ({ id: ++allocated }), deleteQuery: () => { deleted++; }, beginQuery() {}, endQuery() {},
  getQueryParameter: (_query: unknown, name: number) => name === 1 ? true : valid ? 2_000_000 : NaN,
};
const renderer = { getContext: () => context } as unknown as WebGLRenderer;
const pump = () => {
  for (let frame = 0; callbacks.size && frame < 300; frame++) {
    const ready = [...callbacks.values()]; callbacks.clear(); for (const run of ready) run();
  }
};
try {
  const result = measureGpuFrames(renderer, () => { renders++; }, new AbortController().signal);
  pump();
  assert.deepEqual(await result, { supported: true, gpuMs: { count: 120, p50: 2, p95: 2, max: 2 }, warmupFrames: 60 });
  assert.equal(renders, 180); assert.equal(allocated, deleted); assert.equal(callbacks.size, 0);
  supported = false;
  assert.deepEqual(await measureGpuFrames(renderer, () => {}, new AbortController().signal), { supported: false });
  supported = true; disjoint = true;
  const invalid = assert.rejects(measureGpuFrames(renderer, () => {}, new AbortController().signal), /disjoint/);
  pump(); await invalid;
  disjoint = false; valid = false;
  const nan = assert.rejects(measureGpuFrames(renderer, () => {}, new AbortController().signal), /Invalid GPU query/);
  pump(); await nan; assert.equal(allocated, deleted);
  const abort = new AbortController();
  const cancelled = assert.rejects(measureGpuFrames(renderer, () => {}, abort.signal), /cancelled/);
  abort.abort(); await cancelled; assert.equal(callbacks.size, 0);
} finally {
  if (requestBefore) Object.defineProperty(globalThis, "requestAnimationFrame", requestBefore); else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
  if (cancelBefore) Object.defineProperty(globalThis, "cancelAnimationFrame", cancelBefore); else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
}
console.log("GPU probe query ownership, warmup/sample counts, unsupported/disjoint/invalid results and cancellation ok");
