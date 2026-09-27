import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Keep unknown/new fields: only explicitly visual labels and binary GLB hashes
// are excluded. A texture-only re-export must not invalidate gameplay content.
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");

export function fingerprintCombatContent({ ships, models, spatial }) {
  const result = {};
  for (const [id, profile] of Object.entries(ships)) {
    const { labelDe: _label, ...rules } = profile;
    result[`ships/${id}.json`] = hash(rules);
  }
  result["modelCatalog.json"] = hash(models);
  const transforms = Object.fromEntries(Object.entries(spatial).map(([id, metadata]) => {
    const { sourceSha256: _binaryHash, ...pose } = metadata;
    return [id, pose];
  }));
  result["modelSpatialMetadata"] = hash(transforms);
  return result;
}

export function readCombatContent() {
  const read = relative => JSON.parse(readFileSync(new URL(`../shared/src/${relative}`, import.meta.url), "utf8"));
  return { ships: Object.fromEntries(["fac", "destroyer", "cruiser"].map(id => [id, read(`data/ships/${id}.json`)])),
    models: read("content/modelCatalog.json"), spatial: read("content/generatedModelMetadata.json") };
}
