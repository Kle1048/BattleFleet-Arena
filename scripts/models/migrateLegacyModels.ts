/** One-time V1 → V2 migration. Not part of normal model builds or runtime. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Matrix4, Quaternion, Vector3 } from "three";
import { decodeGlb, encodeGlb, type GltfNode } from "./glb";
import { extractModelMetadata, visitModelNodes } from "./extractModelMetadata";
import { canonicalizeModel } from "./canonicalizeModel";
import catalog from "../../shared/src/content/modelCatalog.json";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const assets = path.join(root, "client/public/assets");

/** Fixed migration constants record the former rendered lengths, not runtime tuning. */
const hullScales: Record<string, number> = {
  gepard: 60.016 / 57.6,
  spruance: 120 / 171.7,
  cruiser: 169.946 / 179.93817138671875,
};

function marker(name: string, position: number[], yaw = 0): GltfNode {
  return { name, translation: position, rotation: new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw).toArray() };
}

export function migrateLegacyModel(id: string, bytes: Buffer): Buffer {
  const entry = (catalog as Record<string, { file: string; kind: "hull" | "mount"; yaw?: boolean }>)[id];
  if (!Object.hasOwn(catalog, id) || !entry) throw new Error(`Unknown migration model ${id}`);
  const { document, bin } = decodeGlb(bytes);
  if (document.asset.extras?.bfaContractVersion === 2) {
    extractModelMetadata(bytes, { effects: entry.kind === "hull" ? ["wake"] : entry.yaw ? ["muzzle", "yaw"] : ["muzzle"] });
    return bytes; // Resumable; never apply the old compensation twice.
  }
  if (document.animations || document.skins) throw new Error("Legacy migration supports only static assets");
  const hullId = entry.kind === "hull" ? id : id.split("_")[0]!;
  const physicalLength = hullId === "gepard" ? 57.6 : 171.7;
  // V1 new weapons carried inverse-normalizer compensation in their exported nodes.
  const undoCompensation = entry.kind === "mount" && hullId !== "cruiser"
    ? physicalLength / 10000 * (entry.yaw ? 100 : 1) : 1;
  const front = id === "cruiser_artillery" ? Math.PI : 0;
  const transform = new Matrix4().makeRotationY(front).multiply(new Matrix4().makeScale(undoCompensation, undoCompensation, undoCompensation));
  const flattened: GltfNode[] = [];
  visitModelNodes(document, (source, world) => {
    const matrix = transform.clone().multiply(world);
    const p = new Vector3(), q = new Quaternion(), s = new Vector3(); matrix.decompose(p, q, s);
    const rebuilt = new Matrix4().compose(p, q, s);
    if (rebuilt.elements.some((v, i) => Math.abs(v - matrix.elements[i]!) > 1e-5)) throw new Error(`Legacy shear in ${id}`);
    const { children, matrix: oldMatrix, translation, rotation, scale, ...node } = source;
    const isMarker = /^(SOCKET_|RAIL_|bf_)/.test(node.name ?? "");
    // V1 marker scale was accidental inherited authoring scale. This explicit one-time
    // migration removes it; the regular exporter rejects such input.
    flattened.push({ ...node, translation: p.toArray(), rotation: q.normalize().toArray(),
      ...(isMarker ? {} : { scale: s.toArray() }) });
  });
  document.nodes = flattened;
  if (entry.kind === "hull") {
    // V1 kept aft base yaw in JSON/heuristics instead of the actual model marker.
    for (const node of flattened) if (node.name === "SOCKET_ciws_aft" || node.name === "SOCKET_sam_aft") {
      node.rotation = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI).toArray();
    }
    const stern = id === "gepard" ? -28.8 : id === "spruance" ? -85.85 : -94.07809448242188;
    flattened.push(marker("bf_wake", [0, 0, stern]));
    if (id === "cruiser") {
      // Import the only missing legacy spatial inputs into the model exactly once.
      // The old JSON source is removed when generated metadata becomes authoritative.
      flattened.push(marker("RAIL_ssm_rail_port", [-4.5, 1.5, 7], -Math.PI / 18));
      flattened.push(marker("RAIL_ssm_rail_starboard", [4.5, 1.5, 7], Math.PI / 18));
    }
  } else if (id === "cruiser_artillery") {
    // Old muzzle marker was metres past the barrel tip and pointed backwards.
    const muzzle = flattened.find(n => n.name === "bf_muzzle");
    if (!muzzle) throw new Error("Missing legacy artillery muzzle");
    Object.assign(muzzle, marker("bf_muzzle", [0, 1.8765195608139038, 8.780136108398438]));
  } else if (id === "cruiser_ciws") {
    flattened.push(marker("bf_muzzle", [0.13898149, 1.34, 2.12864558]));
  } else if (id === "cruiser_sam") {
    flattened.push(marker("bf_muzzle", [0, 3.6, 2.90904987]));
  } else if (id === "cruiser_ssm") {
    flattened.push(marker("bf_muzzle", [0, 0, 2.0999999046325684]));
  }
  document.scenes[0]!.nodes = flattened.map((_, i) => i);
  const gameScale = hullId === "cruiser" && entry.kind === "mount" ? 1 : hullScales[hullId]!;
  return canonicalizeModel(encodeGlb(document, bin), { metresPerUnit: gameScale, kind: entry.kind, rotating: entry.yaw });
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if (!["--check", "--write"].includes(mode ?? "") || process.argv.length !== 3) throw new Error("Usage: migrateLegacyModels.ts --check|--write");
  // Prepare and validate every candidate before touching any delivered file.
  const candidates = await Promise.all(Object.entries(catalog).map(async ([id, entry]) => {
    const file = path.join(assets, entry.file), source = await readFile(file);
    const result = migrateLegacyModel(id, source);
    const metadata = extractModelMetadata(result);
    console.log(`${id}: ${Object.keys(metadata.sockets).length} sockets, ${Object.keys(metadata.rails).length} rails, ${Object.keys(metadata.effects).join(", ")}`);
    return { file, source, result };
  }));
  if (mode === "--write") {
    for (const c of candidates) if (!(await readFile(c.file)).equals(c.source)) throw new Error(`Asset changed during migration: ${c.file}`);
    for (const c of candidates) if (!c.source.equals(c.result)) await writeFile(c.file, c.result);
  }
  console.log(mode === "--write" ? "Canonical models written; now regenerate metadata" : "Dry run passed; no assets changed");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
