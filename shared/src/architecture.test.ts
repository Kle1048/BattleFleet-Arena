import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
type Edge = { specifier: string; typeOnly: boolean };

/** Parse imports: re-exports, type references and literal dynamic imports also count. */
function edges(source: string): Edge[] {
  const result: Edge[] = [];
  const file = ts.createSourceFile("module.ts", source, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      const typeOnly = ts.isImportDeclaration(node)
        ? !!node.importClause?.isTypeOnly || (!!node.importClause && !node.importClause.name &&
          !!node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings) &&
          node.importClause.namedBindings.elements.length > 0 && node.importClause.namedBindings.elements.every(e => e.isTypeOnly))
        : node.isTypeOnly;
      result.push({ specifier: node.moduleSpecifier.text, typeOnly });
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      assert(node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]!), "protected modules require statically inspectable imports");
      result.push({ specifier: (node.arguments[0] as ts.StringLiteral).text, typeOnly: false });
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      result.push({ specifier: node.argument.literal.text, typeOnly: true });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return result;
}

function resolve(from: string, specifier: string): string {
  let base: string;
  if (specifier.startsWith(".")) base = path.resolve(path.dirname(from), specifier).replace(/\.js$/, "");
  else {
    const aliases: Record<string, string> = {
      "@battlefleet/shared/rules": "shared/src/rules/index",
      "@battlefleet/shared/protocol": "shared/src/protocol/index",
    };
    assert(aliases[specifier], `forbidden dependency ${specifier} from ${path.relative(repo, from)}`);
    base = path.join(repo, aliases[specifier]!);
  }
  const target = [base + ".ts", base + "/index.ts", base].find(p => existsSync(p) && statSync(p).isFile());
  assert(target, `unresolved dependency ${specifier} from ${from}`);
  return path.normalize(target);
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const file = path.join(dir, e.name);
    return e.isDirectory() ? sourceFiles(file) : e.name.endsWith(".ts") && !e.name.endsWith(".test.ts") ? [file] : [];
  });
}

const parsed = new Map<string, Edge[]>();
function dependencies(file: string) {
  if (!parsed.has(file)) parsed.set(file, file.endsWith(".json") ? [] : edges(readFileSync(file, "utf8")));
  return parsed.get(file)!;
}

function check(entry: string, allowed: readonly string[]) {
  const seen = new Set<string>();
  const visit = (file: string) => {
    assert(allowed.some(dir => file.startsWith(path.join(repo, dir) + path.sep)), `layer violation: ${path.relative(repo, entry)} -> ${path.relative(repo, file)}`);
    assert(!/[\\/]schema\.ts$/.test(file), `schema leaked into portable graph: ${file}`);
    if (seen.has(file)) return;
    seen.add(file);
    for (const edge of dependencies(file)) visit(resolve(file, edge.specifier));
  };
  visit(entry);

  // Recursive type references do not execute; actual runtime cycles are prohibited.
  const completed = new Set<string>();
  const runtime = (file: string, stack: string[]) => {
    assert(!stack.includes(file), `runtime cycle: ${[...stack, file].map(p => path.relative(repo, p)).join(" -> ")}`);
    if (completed.has(file)) return;
    for (const edge of dependencies(file)) {
      if (!edge.typeOnly) runtime(resolve(file, edge.specifier), [...stack, file]);
    }
    completed.add(file);
  };
  runtime(entry, []);
}

// Guard the guard: broad barrels and external platform packages cannot slip through aliases.
const probe = path.join(repo, "shared/src/rules/index.ts");
for (const forbidden of ["@battlefleet/shared", "@battlefleet/shared/protocol/schema", "@colyseus/core", "node:fs", "three"]) {
  assert.throws(() => resolve(probe, forbidden), /forbidden dependency/);
}
assert.deepEqual(edges('export * from "./a"; import type { A } from "./b"; import("./c");'), [
  { specifier: "./a", typeOnly: false }, { specifier: "./b", typeOnly: true }, { specifier: "./c", typeOnly: false },
]);
assert.throws(() => edges("import(variable)"), /statically inspectable/);

check(probe, ["shared/src"]);
check(path.join(repo, "shared/src/protocol/index.ts"), ["shared/src/protocol"]);
const simulation = sourceFiles(path.join(repo, "server/src/simulation"));
assert(simulation.length > 0, "simulation boundary must not become an empty test");
for (const file of simulation) check(file, ["server/src/simulation", "shared/src"]);
for (const file of sourceFiles(path.join(repo, "client/src/game/presentation"))) {
  check(file, ["client/src/game/presentation", "shared/src"]);
}
// Every local adapter edge stays within this layer or the already-guarded presentation layer.
// Checking every adapter also catches indirect imports via another adapter, without allowing
// Three.js/DOM implementations into the transport boundary through a broad runtime barrel.
for (const file of sourceFiles(path.join(repo, "client/src/game/adapters"))) {
  for (const edge of dependencies(file)) {
    if (edge.specifier.startsWith(".")) {
      const target = resolve(file, edge.specifier);
      assert(["client/src/game/adapters", "client/src/game/presentation"].some(dir =>
        target.startsWith(path.join(repo, dir) + path.sep)), `network adapter depends on implementation: ${target}`);
    } else {
      assert(["colyseus.js", "@colyseus/schema", "@battlefleet/shared/protocol", "@battlefleet/shared/protocol/schema",
        "@battlefleet/shared/rules"].includes(edge.specifier), `forbidden network adapter import: ${edge.specifier}`);
    }
  }
}
// Frame phases use narrow outputs, never network/App/Session implementations.
// Renderer helpers remain in World/Cockpit; audio and input must not import them.
const frameImports: Record<string, readonly string[]> = {
  frameContracts: [],
  frameInput: ["./shipDebugTuning"],
  frameFeedback: ["../../locale/t", "./seaControlZoneHud"],
  frameAudioFx: ["../input/telegraphSteps"],
  frameCockpit: ["../../locale/t", "./shipProfileRuntime", "../hud/radarHudMath"],
  frameWorld: ["../scene/shipWreckAnimation", "../scene/shipVisual", "../scene/shipVisualRoll",
    "../network/remoteInterpolation", "./cameraCullRuntime", "./renderCoords", "./shipDebugTuning"],
  frameRuntime: ["./updateCadence", "../scene/shipVisualRoll", "./cameraCullRuntime", "./cameraShakeRuntime",
    "./frameFeedback", "./frameAudioFx", "./frameWorld", "./frameInput", "./frameCockpit"],
};
const frameDir = path.join(repo, "client/src/game/runtime");
for (const [name, permitted] of Object.entries(frameImports)) {
  const file = path.join(frameDir, name + ".ts");
  for (const edge of dependencies(file)) {
    if (edge.specifier === "@battlefleet/shared/rules") continue;
    if (edge.typeOnly) {
      assert(edge.specifier === "three" || edge.specifier.startsWith("."), `unexpected frame type dependency: ${edge.specifier}`);
      if (edge.specifier.startsWith(".")) {
        const target = resolve(file, edge.specifier);
        assert(target.startsWith(path.join(repo, "client/src/game") + path.sep), `frame type leaves client game boundary: ${target}`);
        assert(!/[\\/](adapters|app)[\\/]/.test(target), `frame depends on transport/session type: ${target}`);
      }
      continue;
    }
    assert(permitted.includes(edge.specifier), `${name} imports implementation outside its responsibility: ${edge.specifier}`);
  }
}
// The bootstrap cannot quietly grow another runtime. GameSession owns transport
// and lifetimes; concrete Three/DOM/audio composition belongs to the app factories.
const appBoundaries: Record<string, readonly string[]> = {
  "client/src/main.ts": ["./game/app/createGameApp", "./game/runtime/sessionBootstrap", "./locale/t"],
  "client/src/game/app/GameSession.ts": ["../adapters/battleStateAdapter", "../adapters/roomEventAdapter",
    "../adapters/closeRoomConnection", "../presentation/connectionStatus", "../runtime/lifetime"],
};
for (const [relative, permitted] of Object.entries(appBoundaries)) {
  const file = path.join(repo, relative);
  for (const edge of dependencies(file)) {
    if (!edge.typeOnly) assert(permitted.includes(edge.specifier), `${relative} crosses ownership boundary: ${edge.specifier}`);
  }
}
for (const file of sourceFiles(path.join(repo, "client/src/game/app"))) {
  assert(!/\brequestAnimationFrame\s*\(/.test(readFileSync(file, "utf8")), `unowned app rAF: ${file}`);
}
// Persistence ports/services are not permission to move I/O back into rules.
for (const relative of ["server/src/application/ConfigService.ts", "server/src/application/MatchResultService.ts"]) {
  check(path.join(repo, relative), ["server/src/application", "server/src/persistence", "server/src/simulation", "shared/src"]);
}
for (const relative of ["client/src/game/effects/ParticlePool.ts", "client/src/game/effects/indexHeap.ts"]) {
  check(path.join(repo, relative), ["client/src/game/effects"]);
}
for (const file of sourceFiles(path.join(repo, "server/src/persistence"))) {
  for (const edge of dependencies(file)) {
    assert(!/rooms|adminPanel|storageServices|leaderboardStore|adminConfig/.test(edge.specifier),
      `repository imports host singleton/transport: ${edge.specifier}`);
  }
}
console.log("portable graphs, transport/frame phases and app/session ownership boundaries ok");
