import assert from "node:assert/strict";
import { mountBetaFeedback } from "./betaFeedback";

class Element extends EventTarget {
  children: Element[] = [];
  style: Record<string, string> = {};
  textContent = ""; value = ""; removed = false; checked = false;
  hidden = false;
  onclick?: () => void | Promise<void>;
  setAttribute() {}
  append(...children: Element[]) { this.children.push(...children); }
  appendChild(child: Element) { this.children.push(child); }
  remove() { this.removed = true; }
  focus() {}
  select() {}
}
const body = new Element();
const keys = ["document", "window", "navigator", "fetch"];
const originals = keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
let calls = 0, copied = "", requested = "", signal: AbortSignal | undefined;
const submissions: { id: string; diagnostics: unknown }[] = [];
const values: Record<string, unknown> = {
  document: { body, createElement: () => new Element() },
  window: { innerWidth: 800, innerHeight: 600, devicePixelRatio: 1 },
  navigator: { userAgent: "test", clipboard: { writeText: async (value: string) => { copied = value; } } },
  fetch: (url: string, options: RequestInit) => {
    calls++; requested = url;
    assert.equal(options.credentials, "omit");
    if (options.method === "POST") {
      const payload = JSON.parse(String(options.body)) as { id: string; diagnostics: unknown };
      submissions.push(payload);
      if (submissions.length === 1) return Promise.reject(new Error("connection lost"));
      return Promise.resolve({ ok: true, json: async () => ({ id: payload.id }) });
    }
    signal = options.signal as AbortSignal;
    return new Promise((_resolve, reject) => signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  },
};
try {
  for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, value: values[key] });
  const feedback = mountBetaFeedback({ id: "development", dirty: true }, undefined, "wss://example.test/",
    () => ({ roomId: null, fps: null, pingMs: null }));
  assert.equal(calls, 0, "mount must not fetch or report");
  const button = body.children[0]!;
  assert(button.hidden, "hidden during startup/join");
  button.dispatchEvent(new Event("click"));
  assert.equal(calls, 0, "hidden button cannot open the form");
  feedback.setVisible(true); // lobby / round results
  assert(!button.hidden);
  button.dispatchEvent(new Event("click"));
  button.dispatchEvent(new Event("click"));
  assert.equal(calls, 1, "only one modal/request");
  assert.equal(requested, "https://example.test/api/version");
  const modal = body.children[1]!;
  const panel = modal.children[0]!;
  assert.equal(copied, "", "no automatic clipboard writes");
  await panel.children[5]!.onclick!();
  assert.equal(JSON.parse(copied).client.id, "development");
  assert.equal(panel.children[6]!.textContent, "Feedback is stored privately in the project's admin inbox.");
  const fields = panel.children[2]!;
  const send = fields.children[4]!;
  await send.onclick!(); assert.equal(submissions.length, 0, "invalid form never posts");
  fields.children[0]!.children[0]!.value = "bug";
  fields.children[1]!.children[0]!.value = "A test report";
  fields.children[2]!.children[0]!.value = "Reproduce by testing this form";
  await send.onclick!(); await send.onclick!();
  assert.equal(submissions.length, 2);
  assert.equal(submissions[0]!.id, submissions[1]!.id, "retry preserves id");
  assert.equal(submissions[0]!.diagnostics, null, "diagnostics require opt-in");
  await send.onclick!(); assert.equal(submissions.length, 2, "receipt prevents accidental duplicate send");
  await panel.children[7]!.onclick!();
  assert(modal.removed); assert(signal!.aborted);
  button.dispatchEvent(new Event("click"));
  const reopened = body.children.at(-1)!;
  feedback.setVisible(false); // running round / explicit restart
  assert(button.hidden); assert(reopened.removed); assert(signal!.aborted);
  button.dispatchEvent(new Event("click"));
  assert.equal(calls, 4, "running round cannot open feedback");
  feedback.setVisible(true); assert(!button.hidden, "returning to lobby restores button");
  feedback.dispose(); feedback.dispose();
  assert(button.removed);
  button.dispatchEvent(new Event("click"));
  assert.equal(calls, 4, "disposed button cannot start new requests");
  await new Promise(resolve => setTimeout(resolve, 0));
} finally {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
}
console.log("beta feedback opt-in fetch/copy, websocket URL, abort and disposal ok");
