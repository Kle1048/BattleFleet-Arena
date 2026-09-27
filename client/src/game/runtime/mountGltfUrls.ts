import { MODEL_CATALOG, modelDefinition } from "@battlefleet/shared";

const BASE = import.meta.env?.BASE_URL ?? "/";

/** Explicit model IDs from equipment, independent of hull and weapon rules. */
export function resolveMountGltfUrl(modelId: string): string {
  return `${BASE}assets/${modelDefinition(modelId, "mount").file}`;
}

export function uniqueMountVisualUrls(): string[] {
  return [...new Set(Object.entries(MODEL_CATALOG)
    .filter(([, model]) => model.kind === "mount")
    .map(([id]) => resolveMountGltfUrl(id)))];
}
