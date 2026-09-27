import assert from "node:assert/strict";
import * as THREE from "three";
import { bindRendererResize } from "./rendererLifecycle";
import { installGlobalRuntimeErrorHandlers } from "./runtimeErrors";
import { installMobileBrowserChromeGuards } from "./mobileBrowserGuards";

class TrackedTarget extends EventTarget {
  listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  override addEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: AddEventListenerOptions | boolean) {
    super.addEventListener(type, callback, options);
    if (callback) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type)!.add(callback);
    }
  }
  override removeEventListener(type: string, callback: EventListenerOrEventListenerObject | null, options?: EventListenerOptions | boolean) {
    super.removeEventListener(type, callback, options);
    if (callback) this.listeners.get(type)?.delete(callback);
  }
  count() { return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}
const names = ["window", "document", "navigator", "ResizeObserver"] as const;
const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const win = Object.assign(new TrackedTarget(), { innerWidth: 1280, innerHeight: 720, matchMedia: () => ({ matches: true }) });
let viewport: string | null = "original-viewport";
const meta = {
  getAttribute: () => viewport,
  setAttribute: (_name: string, value: string) => { viewport = value; },
  removeAttribute: () => { viewport = null; },
};
const doc = Object.assign(new TrackedTarget(), { querySelector: () => meta });
let observerCallback = () => {}, disconnects = 0, failObserve = false;
class FakeResizeObserver {
  constructor(callback: () => void) { observerCallback = callback; }
  observe() { if (failObserve) throw new Error("intentional observer startup failure"); }
  disconnect() { disconnects++; }
}
for (const [name, value] of Object.entries({ window: win, document: doc, navigator: { maxTouchPoints: 1 }, ResizeObserver: FakeResizeObserver })) {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}
try {
  const camera = new THREE.PerspectiveCamera();
  let sizes = 0;
  const renderer = { setSize() { sizes++; return undefined as unknown as THREE.WebGLRenderer; } };
  const root = { clientWidth: 640, clientHeight: 320 } as HTMLElement;
  for (let i = 0; i < 20; i++) {
    const release = bindRendererResize(camera, renderer, root);
    assert.equal(camera.aspect, 2);
    const before = sizes;
    win.dispatchEvent(new Event("resize")); assert.equal(sizes, before + 1);
    release(); release();
    observerCallback(); win.dispatchEvent(new Event("resize"));
    assert.equal(sizes, before + 1, "queued observer cannot resize disposed renderer");
    assert.equal(win.count(), 0);
  }
  assert.equal(disconnects, 20);
  failObserve = true;
  assert.throws(() => bindRendererResize(camera, renderer, root), /observer startup failure/);
  assert.equal(win.count(), 0); assert.equal(disconnects, 21);

  let errors = 0;
  const releaseErrors = installGlobalRuntimeErrorHandlers({ update() { errors++; } });
  const queuedError = [...win.listeners.get("unhandledrejection")!][0] as EventListener;
  releaseErrors(); releaseErrors();
  queuedError(Object.assign(new Event("unhandledrejection"), { reason: "late error" }));
  assert.equal(errors, 0); assert.equal(win.count(), 0);

  for (let i = 0; i < 20; i++) {
    const release = installMobileBrowserChromeGuards();
    assert.equal(doc.count(), 4); assert.notEqual(viewport, "original-viewport");
    const gesture = new Event("gesturestart", { cancelable: true });
    doc.dispatchEvent(gesture); assert(gesture.defaultPrevented);
    release(); release();
    assert.equal(doc.count(), 0); assert.equal(viewport, "original-viewport");
  }
  const release = installMobileBrowserChromeGuards();
  viewport = "later-owner-viewport"; release();
  assert.equal(viewport, "later-owner-viewport");
} finally {
  for (const name of names) {
    const descriptor = originals.get(name);
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
}
console.log("browser binding release/rebind, late observer/error suppression and startup rollback ok");
