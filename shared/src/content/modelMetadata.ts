import generated from "./generatedModelMetadata.json";
import type { ModelSpatialMetadata } from "./modelSpatialMetadata";

function freezeTree<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeTree(child);
    Object.freeze(value);
  }
  return value;
}
const metadata = freezeTree(generated) as Readonly<Record<string, ModelSpatialMetadata>>;

/** Generated from delivered GLBs. There is no runtime override or fallback source. */
export function modelSpatialMetadata(modelId: string): ModelSpatialMetadata {
  if (!Object.hasOwn(metadata, modelId)) throw new Error(`Missing generated metadata: ${modelId}`);
  return metadata[modelId]!;
}
