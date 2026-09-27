import { MODEL_CATALOG, modelDefinition } from "@battlefleet/shared";

const BASE = import.meta.env?.BASE_URL ?? "/";

export const HULL_GLTF_URL_BY_ID: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(Object.entries(MODEL_CATALOG)
    .filter(([, model]) => model.kind === "hull")
    .map(([id, model]) => [id, `${BASE}assets/${model.file}`])),
);

export function resolveShipHullGltfUrl(modelId: string): string {
  return `${BASE}assets/${modelDefinition(modelId, "hull").file}`;
}
