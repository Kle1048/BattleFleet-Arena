import assert from "node:assert/strict";
import { waitForDialog } from "./dialogLifetime";

class Element extends EventTarget {
  mounted = false;
  focuses = 0;
  remove() { this.mounted = false; }
  focus() { this.focuses++; }
}
const original = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.defineProperty(globalThis, "document", { configurable: true, value: {
  body: { appendChild(root: Element) { root.mounted = true; } },
} });
try {
  for (let i = 0; i < 20; i++) {
    const root = new Element(), button = new Element(), input = new Element();
    const controller = new AbortController();
    const pending = waitForDialog(root as unknown as HTMLElement, button as unknown as HTMLElement,
      { signal: controller.signal, enterInput: input as unknown as HTMLElement });
    assert.equal(root.mounted, true);
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.equal(root.mounted, false);
    assert.equal(input.focuses, 0, "queued focus must not steal focus after cancellation");
    button.dispatchEvent(new Event("click"));
  }
  const root = new Element(), button = new Element(), input = new Element();
  const pending = waitForDialog(root as unknown as HTMLElement, button as unknown as HTMLElement,
    { enterInput: input as unknown as HTMLElement });
  await Promise.resolve();
  assert.equal(input.focuses, 1);
  input.dispatchEvent(Object.assign(new Event("keydown"), { key: "Enter" }));
  await pending;
  assert.equal(root.mounted, false);
  button.dispatchEvent(new Event("click"));
} finally {
  if (original) Object.defineProperty(globalThis, "document", original);
  else Reflect.deleteProperty(globalThis, "document");
}
console.log("Dialog cancellation, queued focus, keyboard submission and repeated cleanup ok");
