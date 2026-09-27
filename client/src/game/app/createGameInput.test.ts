import assert from "node:assert/strict";
import { PerspectiveCamera } from "three";
import { createGameInput } from "./createGameInput";
import { t } from "../../locale/t";
import { applyFollowCameraTuning, getFollowCameraTuning, resetFollowCameraTuning } from "../runtime/followCameraTuning";

class Target extends EventTarget {
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
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0); }
}
class Element extends Target {
  children: Element[] = [];
  parent: Element | undefined;
  style: Record<string, string> = {};
  className = "";
  textContent = "";
  setAttribute() {}
  appendChild(child: Element) { this.children.push(child); child.parent = this; return child; }
  append(...children: Element[]) { children.forEach(child => this.appendChild(child)); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; }
  setPointerCapture() {}
  hasPointerCapture() { return false; }
  releasePointerCapture() {}
}
const names = ["window", "document", "navigator", "localStorage"] as const;
const originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
const win = Object.assign(new Target(), { location: { search: "?mobileControls=0" } });
const body = new Element(), head = new Element(), canvas = new Element();
const created: Element[] = [];
const doc = { body, head, createElement: () => { const element = new Element(); created.push(element); return element; }, getElementById: () => null };
for (const [name, value] of Object.entries({ window: win, document: doc, navigator: { maxTouchPoints: 0 },
  localStorage: { getItem: () => null, setItem() {} } })) {
  Object.defineProperty(globalThis, name, { configurable: true, value });
}
try {
  const controls = createGameInput(canvas as unknown as HTMLCanvasElement, new PerspectiveCamera());
  for (let cycle = 0; cycle < 20; cycle++) {
    const session = controls.startSession();
    assert.equal(win.count(), 5);
    assert.equal(canvas.count(), 11);
    assert.equal(body.children.length, 1);
    assert.equal(session.input.sample().throttle, 0);
    assert.equal(session.input.sample().primaryFire, false);
    win.dispatchEvent(Object.assign(new Event("keydown"), { code: "KeyW" }));
    win.dispatchEvent(Object.assign(new Event("keydown"), { code: "Space" }));
    assert.equal(session.input.sample().throttle, 1);
    assert.equal(session.input.sample().primaryFire, true);
    session.mobileHudActions.onNextFireControlTarget = () => { throw new Error("stale session action"); };
    controls.stopSession(); controls.stopSession();
    assert.equal(win.count(), 0);
    assert.equal(canvas.count(), 0);
    assert.equal(body.children.length, 0);
    assert.equal(session.mobileHudActions.onNextFireControlTarget, undefined);
    assert.equal(session.input.sample().primaryFire, false);
  }
  applyFollowCameraTuning({ mode: "thirdPerson" });
  const orbitSession = controls.startSession();
  canvas.dispatchEvent(Object.assign(new Event("pointerdown", { cancelable: true }), {
    pointerId: 7, button: 0, altKey: true, clientX: 100, clientY: 100,
  }));
  assert.equal(orbitSession.input.sample().primaryFire, false, "orbit gesture does not fire");
  canvas.dispatchEvent(Object.assign(new Event("pointermove", { cancelable: true }), {
    pointerId: 7, clientX: 160, clientY: 140,
  }));
  assert.equal(getFollowCameraTuning().orbitPitchDeg, 24);
  const distance = getFollowCameraTuning().orbitDistance;
  const wheel = Object.assign(new Event("wheel", { cancelable: true }), { deltaY: -100, deltaMode: 0 });
  canvas.dispatchEvent(wheel);
  assert(wheel.defaultPrevented);
  assert(getFollowCameraTuning().orbitDistance < distance);
  win.dispatchEvent(new Event("blur"));
  const pitchAfterBlur = getFollowCameraTuning().orbitPitchDeg;
  canvas.dispatchEvent(Object.assign(new Event("pointermove", { cancelable: true }), {
    pointerId: 7, clientX: 200, clientY: 200,
  }));
  assert.equal(getFollowCameraTuning().orbitPitchDeg, pitchAfterBlur, "blur ends dragging");
  canvas.dispatchEvent(Object.assign(new Event("pointerdown", { cancelable: true }), { pointerId: 8, button: 0 }));
  assert.equal(orbitSession.input.sample().primaryFire, true, "normal click still fires in orbit mode");
  controls.stopSession();
  assert.equal(win.count(), 0); assert.equal(canvas.count(), 0);
  resetFollowCameraTuning();
  win.location.search = "?mobileControls=1";
  for (let cycle = 0; cycle < 20; cycle++) {
    const before = created.length;
    const session = controls.startSession();
    assert.equal(win.count(), 5);
    assert.equal(canvas.count(), 12); // Includes the session's mobile aim reticle.
    assert.equal(body.children.length, 2);
    assert.equal(session.input.sample().primaryFire, false);
    const primary = created.slice(before).find(element => element.textContent === t("mobile.btnFire"))!;
    primary.dispatchEvent(Object.assign(new Event("pointerdown"), { pointerId: 1 }));
    assert.equal(session.input.sample().primaryFire, true);
    controls.stopSession();
    assert.equal(win.count(), 0);
    assert.equal(canvas.count(), 0);
    assert.equal(body.children.length, 0);
    assert.equal(primary.count(), 0, "detached mobile buttons release their listeners");
    primary.dispatchEvent(Object.assign(new Event("pointerdown"), { pointerId: 1 }));
    assert.equal(session.input.sample().primaryFire, false);
  }
  assert.equal(head.children.length, 1, "shared control stylesheet is installed once, not once per session");
  controls.dispose(); controls.dispose();
  assert.throws(() => controls.startSession(), /disposed/);
} finally {
  resetFollowCameraTuning();
  for (const name of names) {
    const previous = originals.get(name);
    if (previous) Object.defineProperty(globalThis, name, previous);
    else Reflect.deleteProperty(globalThis, name);
  }
}
console.log("App input: 20 desktop + 20 mobile rejoin cycles, neutral controls and listener/DOM release ok");
