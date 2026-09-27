import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractModelMetadata } from "./extractModelMetadata";
import { decodeGlb } from "./glb";
import { checkMaterialBudget } from "./materialBudget";
import type { ModelSpatialMetadata } from "../../shared/src/content/modelSpatialMetadata";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const assets = path.join(root, "client/public/assets");
const output = path.join(root, "shared/src/content/generatedModelMetadata.json");

export type ModelCatalogEntry = { file: string; kind: "hull" | "mount"; yaw?: boolean };

/** Catalog contains identity/path only. Spatial data comes exclusively from model nodes. */
export async function compileModelMetadata(catalog: Record<string, ModelCatalogEntry>): Promise<Record<string, ModelSpatialMetadata>> {
  const result: Record<string, ModelSpatialMetadata> = {};
  for (const id of Object.keys(catalog).sort()) {
    if (!/^[a-z][a-z0-9_]*$/.test(id) || ["constructor", "prototype"].includes(id)) throw new Error("Invalid model catalog ID");
    const entry = catalog[id]!;
    if (!entry || !["hull", "mount"].includes(entry.kind) || typeof entry.file !== "string" ||
      !/^(ships|systems)\/[a-zA-Z0-9_-]+\.glb$/.test(entry.file)) throw new Error(`Invalid model catalog entry: ${id}`);
    const bytes = await readFile(path.join(assets, entry.file));
    checkMaterialBudget(bytes, entry.kind);
    const contract = decodeGlb(bytes).document.asset.extras;
    if (contract?.bfaContractVersion !== 2 || contract.units !== "metres" || contract.forward !== "+Z" || contract.up !== "+Y") {
      throw new Error(`Model ${id} must pass through the canonical exporter`);
    }
    result[id] = extractModelMetadata(bytes, { effects: entry.kind === "hull" ? ["wake"] : entry.yaw ? ["muzzle", "yaw"] : ["muzzle"] });
    if (entry.yaw) {
      const pivot = result[id]!.effects.yaw!;
      if ([...Object.values(pivot.position), ...Object.values(pivot.eulerRad!)].some(n => Math.abs(n) > 1e-8)) {
        throw new Error(`Model ${id}: yaw pivot must be identity at model origin`);
      }
    }
  }
  return result;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (!["--write", "--check"].includes(mode ?? "") || process.argv.length !== 3) {
    throw new Error("Usage: buildModelMetadata.ts --write|--check");
  }
  const catalog = JSON.parse(await readFile(path.join(root, "shared/src/content/modelCatalog.json"), "utf8"));
  const generated = JSON.stringify(await compileModelMetadata(catalog), null, 2) + "\n";
  if (mode === "--write") await writeFile(output, generated);
  else if (await readFile(output, "utf8") !== generated) {
    throw new Error("Model metadata is stale. Re-export the model, then run npm run models:build; never edit generated metadata.");
  }
  console.log(`Model metadata ${mode === "--write" ? "generated" : "verified"}: ${Object.keys(catalog).length} models`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error instanceof Error ? error.message : "Model compilation failed"); process.exitCode = 1; });
}
