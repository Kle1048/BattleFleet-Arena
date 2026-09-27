import catalog from "./modelCatalog.json";

export type ModelDefinition = { kind: "hull" | "mount"; file: string; yaw?: boolean };
export const MODEL_CATALOG: Readonly<Record<string, Readonly<ModelDefinition>>> = Object.freeze(
  Object.fromEntries(Object.entries(catalog).map(([id, raw]) => {
    const model = raw as ModelDefinition;
    if (!/^[a-z][a-z0-9_]*$/.test(id) || ["constructor", "prototype"].includes(id) ||
      !["hull", "mount"].includes(model.kind) || !/^(ships|systems)\/[a-zA-Z0-9_-]+\.glb$/.test(model.file) ||
      (model.yaw !== undefined && (typeof model.yaw !== "boolean" || model.kind !== "mount"))) {
      throw new Error(`Invalid model catalog entry: ${id}`);
    }
    return [id, Object.freeze(model)];
  })),
);

export function modelDefinition(id: string, kind?: ModelDefinition["kind"]): Readonly<ModelDefinition> {
  if (!Object.hasOwn(MODEL_CATALOG, id)) throw new Error(`Unknown model: ${id}`);
  const model = MODEL_CATALOG[id]!;
  if (kind && model.kind !== kind) throw new Error(`Model ${id} is not a ${kind}`);
  return model;
}
