import { Matrix4, Quaternion, Vector3 } from "three";
import { decodeGlb, encodeGlb, type GltfNode } from "./glb";
import { extractModelMetadata, visitModelNodes } from "./extractModelMetadata";

export type CanonicalExportOptions = {
  /** Explicit authoring-unit → game-metre conversion, baked only at export. */
  metresPerUnit: number;
  kind: "hull" | "mount";
  /** Weapon root is the yaw pivot; fixed systems need no pivot. */
  rotating?: boolean;
};

/**
 * Static-asset export boundary. Preserve geometry/material/image bytes, bake the scene
 * hierarchy into node transforms, and export rigid marker transforms in metres.
 * Animated/skinned assets need a deliberate extension of the contract, not silent flattening.
 */
export function canonicalizeModel(bytes: Buffer, options: CanonicalExportOptions): Buffer {
  const { document, bin } = decodeGlb(bytes);
  if (!Number.isFinite(options.metresPerUnit) || options.metresPerUnit <= 0) throw new Error("Invalid export unit scale");
  if (document.animations || document.skins) throw new Error("Canonical static model cannot contain animations/skins");
  if (document.asset.extras?.bfaContractVersion === 2 && options.metresPerUnit !== 1) {
    throw new Error("Model already uses metres; do not apply authoring-unit conversion twice");
  }
  // Validate the source hierarchy/markers BEFORE changing the unit scale. Scaled markers
  // are not auto-corrected: authors must apply their transforms.
  const sourceMetadata = extractModelMetadata(bytes, { effects: options.kind === "hull" ? ["wake"] : ["muzzle"] });
  const yaw = sourceMetadata.effects.yaw;
  if (yaw && (!options.rotating || Object.values(yaw.position).some(n => Math.abs(n) > 1e-8) ||
    Object.values(yaw.eulerRad!).some(n => Math.abs(n) > 1e-8))) {
    throw new Error("bf_yaw must be the identity pivot at a rotating weapon's origin");
  }
  const nodes: GltfNode[] = [];
  const unitScale = new Matrix4().makeScale(options.metresPerUnit, options.metresPerUnit, options.metresPerUnit);
  visitModelNodes(document, (source, world) => {
    if (source.name === "bf_yaw") return; // Recreated at the weapon origin below.
    const matrix = unitScale.clone().multiply(world);
    const position = new Vector3(), rotation = new Quaternion(), scale = new Vector3();
    matrix.decompose(position, rotation, scale);
    const rebuilt = new Matrix4().compose(position, rotation, scale);
    if (rebuilt.elements.some((n, i) => Math.abs(n - matrix.elements[i]!) > 1e-5)) {
      throw new Error(`Apply sheared transform before export: ${source.name ?? "unnamed node"}`);
    }
    const { children, matrix: oldMatrix, translation, rotation: oldRotation, scale: oldScale, ...node } = source;
    const marker = /^(SOCKET_|RAIL_|bf_)/.test(node.name ?? "");
    nodes.push({ ...node, translation: position.toArray(), rotation: rotation.normalize().toArray(),
      ...(marker ? {} : { scale: scale.toArray() }) });
  });
  let roots = nodes.map((_, i) => i);
  if (options.rotating) {
    if (options.kind !== "mount") throw new Error("Only mounts can have a yaw pivot");
    nodes.push({ name: "bf_yaw", children: roots });
    roots = [nodes.length - 1];
  }
  document.nodes = nodes;
  document.scenes[0]!.nodes = roots;
  document.asset.extras = { ...document.asset.extras, bfaContractVersion: 2, units: "metres", forward: "+Z", up: "+Y" };
  const result = encodeGlb(document, bin);
  extractModelMetadata(result, { effects: options.kind === "hull" ? ["wake"] : options.rotating ? ["muzzle", "yaw"] : ["muzzle"] });
  return result;
}
