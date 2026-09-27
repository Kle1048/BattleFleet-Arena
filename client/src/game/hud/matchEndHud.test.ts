import assert from "node:assert/strict";
import { createMatchEndHud } from "./matchEndHud";

class Element extends EventTarget {
  className = "";
  classList = { add: (name: string) => { this.className += ` ${name}`; } };
  hidden = false;
  innerHTML = "";
  children: Element[] = [];
  removed = false;
  set textContent(_value: string) { this.children = []; }
  setAttribute() {}
  appendChild(child: Element) { this.children.push(child); }
  remove() { this.removed = true; }
  querySelector(selector: string) {
    if (selector === ".match-end-tbody") return tbody;
    if (selector === ".match-end-replay") return replay;
    throw new Error(`Unexpected result UI element: ${selector}`);
  }
}
const body = new Element(), tbody = new Element(), replay = new Element();
const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
Object.defineProperty(globalThis, "document", { configurable: true,
  value: { body, createElement: () => new Element() } });
try {
  let continues = 0;
  const hud = createMatchEndHud(() => { continues++; });
  const root = body.children[0]!;
  assert.equal(root.hidden, true);
  assert.equal((root.innerHTML.match(/<table\b/g) ?? []).length, 1, "only the current round's table is rendered");
  assert(!/overall|leaderboard/i.test(root.innerHTML));
  hud.show([{ sessionId: "me", displayName: "<img>", shipClass: "fac", level: 1, score: 30, kills: 2 }], "me");
  assert.equal(root.hidden, false);
  assert.equal(tbody.children.length, 1);
  assert(tbody.children[0]!.className.includes("match-end-row-me"));
  assert(tbody.children[0]!.innerHTML.includes("&lt;img&gt;"));
  assert(tbody.children[0]!.innerHTML.endsWith("<td>2</td><td>30</td>"));
  replay.dispatchEvent(new Event("click"));
  assert.equal(continues, 1);
  hud.hide();
  assert.equal(root.hidden, true);
  assert.equal(tbody.children.length, 0);
  hud.show([], "me");
  hud.dispose(); hud.dispose();
  assert(root.removed);
  replay.dispatchEvent(new Event("click"));
  assert.equal(continues, 1, "Continue handler is released on disposal");
} finally {
  if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
  else Reflect.deleteProperty(globalThis, "document");
}
console.log("Match-end UI: round results only, escaped names, Continue and cleanup preserved");
