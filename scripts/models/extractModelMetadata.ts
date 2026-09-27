import { createHash } from "node:crypto";
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { ModelSpatialMetadata } from "../../shared/src/content/modelSpatialMetadata";
import type { ShipSocketTransform } from "../../shared/src/shipVisualLayout";
import { decodeGlb, type GltfDocument, type GltfNode } from "./glb";

function tuple(value: number[] | undefined, fallback: number[], label: string): number[] {
  if (value === undefined) return fallback;
  if (!Array.isArray(value) || value.length !== fallback.length || value.some(n => typeof n !== "number" || !Number.isFinite(n))) {
    throw new Error(`Invalid node ${label}`);
  }
  return value;
}

function localMatrix(node: GltfNode): Matrix4 {
  if (node.matrix !== undefined) {
    if (node.translation || node.rotation || node.scale) throw new Error("Node cannot combine matrix and TRS");
    return new Matrix4().fromArray(tuple(node.matrix, new Matrix4().elements, "matrix"));
  }
  const q = new Quaternion().fromArray(tuple(node.rotation, [0, 0, 0, 1], "rotation"));
  if (Math.abs(q.length() - 1) > 1e-5) throw new Error("Node rotation must be a unit quaternion");
  q.normalize(); // Blender float32 export roundoff, not arbitrary input correction.
  return new Matrix4().compose(new Vector3().fromArray(tuple(node.translation, [0, 0, 0], "translation")),
    q, new Vector3().fromArray(tuple(node.scale, [1, 1, 1], "scale")));
}

/** Visit exactly the exported scene. Reject cycles, multiple parents and invalid references. */
export function visitModelNodes(document: GltfDocument, visit: (node: GltfNode, world: Matrix4) => void): void {
  const nodes = document.nodes ?? [];
  const seen = new Set<number>();
  const walk = (id: number, parent: Matrix4, depth: number): void => {
    if (!Number.isSafeInteger(id) || id < 0 || id >= nodes.length || seen.has(id) || depth > 128) {
      throw new Error("Invalid model hierarchy (cycle, duplicate parent, depth or node reference)");
    }
    seen.add(id);
    const node = nodes[id]!;
    const matrix = parent.clone().multiply(localMatrix(node));
    if (matrix.elements.some(n => !Number.isFinite(n)) || Math.abs(matrix.determinant()) < 1e-12) {
      throw new Error("Invalid singular/non-finite model transform");
    }
    visit(node, matrix);
    for (const child of node.children ?? []) walk(child, matrix, depth + 1);
  };
  for (const root of document.scenes[0]!.nodes ?? []) walk(root, new Matrix4(), 0);
}

function rigidTransform(matrix: Matrix4, name: string): ShipSocketTransform {
  const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
  matrix.decompose(position, rotation, scale);
  const reconstructed = new Matrix4().compose(position, rotation, new Vector3(1, 1, 1));
  if (scale.distanceTo(new Vector3(1, 1, 1)) > 1e-5 ||
    reconstructed.elements.some((n, i) => Math.abs(n - matrix.elements[i]!) > 1e-5)) {
    throw new Error(`Marker ${name} must have unit scale and no reflection/shear; apply transforms at export`);
  }
  const euler = new Euler().setFromQuaternion(rotation, "XYZ");
  const clean = (n: number) => Math.abs(n) < 1e-12 ? 0 : n;
  return { position: { x: clean(position.x), y: clean(position.y), z: clean(position.z) },
    eulerRad: { x: clean(euler.x), y: clean(euler.y), z: clean(euler.z) } };
}

export type RequiredModelMarkers = {
  sockets?: readonly string[];
  rails?: readonly string[];
  effects?: readonly string[];
};

export function extractModelMetadata(bytes: Buffer, required: RequiredModelMarkers = {}): ModelSpatialMetadata {
  const { document } = decodeGlb(bytes);
  const result: ModelSpatialMetadata = { contractVersion: 2,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"), sockets: {}, rails: {}, effects: {} };
  visitModelNodes(document, (node, matrix) => {
    const name = node.name ?? "";
    const kind = name.startsWith("SOCKET_") ? "sockets" : name.startsWith("RAIL_") ? "rails" :
      name.startsWith("bf_") ? "effects" : null;
    if (!kind) return;
    const id = kind === "sockets" ? name.slice(7) : kind === "rails" ? name.slice(5) : name.slice(3);
    if (!/^[a-z][a-z0-9_]*$/.test(id) || ["__proto__", "prototype", "constructor"].includes(id)) {
      throw new Error(`Invalid marker ID: ${name}`);
    }
    if (node.mesh !== undefined) throw new Error(`Marker ${name} must be an empty node`);
    if (Object.hasOwn(result[kind], id)) throw new Error(`Duplicate marker: ${name}`);
    result[kind][id] = rigidTransform(matrix, name);
  });
  for (const kind of ["sockets", "rails", "effects"] as const) {
    for (const id of required[kind] ?? []) if (!Object.hasOwn(result[kind], id)) throw new Error(`Missing ${kind} marker: ${id}`);
    result[kind] = Object.fromEntries(Object.entries(result[kind]).sort(([a], [b]) => a.localeCompare(b, "en")));
  }
  return result;
}
