import assert from "node:assert/strict";
import { showConnectionNotice } from "./connectionNotice";
class Element extends EventTarget {
  children: Element[] = [];
  textContent = ""; disabled = false; removed = false; className = ""; type = "";
  setAttribute() {}
  append(...children: Element[]) { this.children.push(...children); }
  appendChild(child: Element) { this.children.push(child); }
  remove() { this.removed = true; }
  focus() {}
}
const body = new Element();
const originals = ["document", "setInterval", "clearInterval"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
let tick: (() => void) | undefined;
Object.defineProperty(globalThis, "document", { configurable: true, value: { body, createElement: () => new Element() } });
Object.defineProperty(globalThis, "setInterval", { configurable: true, value: (callback: () => void) => { tick = callback; return 1; } });
Object.defineProperty(globalThis, "clearInterval", { configurable: true, value: () => { tick = undefined; } });
try {
  for (const attempt of [1, 2, 3, 20]) {
    const abort = new AbortController();
    const pending = showConnectionNotice("<img onerror=bad>", abort.signal, attempt);
    const root = body.children.at(-1)!;
    const [text, button] = root.children[0]!.children;
    assert.equal(text!.textContent, "<img onerror=bad>");
    assert(button!.disabled);
    button!.dispatchEvent(new Event("click"));
    assert(!root.removed, "cannot skip retry cooldown");
    const seconds = Math.min(8, 2 ** Math.min(attempt, 3));
    for (let i = 0; i < seconds; i++) tick!();
    assert(!button!.disabled);
    button!.dispatchEvent(new Event("click"));
    await pending;
    assert(root.removed); assert.equal(tick, undefined);
  }
  const abort = new AbortController();
  const pending = showConnectionNotice("lost", abort.signal, 1);
  abort.abort();
  await assert.rejects(pending, { name: "AbortError" });
  assert(body.children.at(-1)!.removed); assert.equal(tick, undefined);
} finally {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
}
console.log("connection notice text safety, bounded cooldown, manual retry and abort cleanup ok");
