import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeModel } from "./canonicalizeModel";
import { modelDefinition } from "../../shared/src/content/models";
import { checkMaterialBudget } from "./materialBudget";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Local authoring command only; the server never loads or accepts a GLB. */
async function main(): Promise<void> {
  const [modelId, input, rawScale] = process.argv.slice(2);
  if (!modelId || !input || process.argv.length !== 5) {
    throw new Error("Usage: exportModel.ts <catalog-model-id> <source.glb> <metres-per-authoring-unit>");
  }
  const model = modelDefinition(modelId);
  const scale = Number(rawScale);
  const source = await readFile(path.resolve(input));
  const result = canonicalizeModel(source, { kind: model.kind, rotating: model.yaw, metresPerUnit: scale });
  checkMaterialBudget(result, model.kind);
  const output = path.join(root, "client/public/assets", model.file);
  // Fully validated before publication. Model paths are fixed by the local catalog.
  await writeFile(output, result);
  console.log(`Exported ${modelId} (${result.length} bytes). Run npm run models:build to refresh derived metadata.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Model export failed"); process.exitCode = 1; });
