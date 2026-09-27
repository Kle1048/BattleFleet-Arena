/** Offline, self-contained GLB tooling. No network requests or image decoding. */
export type GltfNode = {
  name?: string;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
  mesh?: number;
  extras?: Record<string, unknown>;
};
export type GltfDocument = {
  asset: { version: string; generator?: string; extras?: Record<string, unknown> };
  scene?: number;
  scenes: { nodes?: number[]; name?: string; extras?: Record<string, unknown> }[];
  nodes?: GltfNode[];
  buffers?: { uri?: string; byteLength: number }[];
  images?: { uri?: string; bufferView?: number }[];
  [key: string]: unknown;
};

export function decodeGlb(bytes: Buffer): { document: GltfDocument; bin: Buffer | null } {
  if (bytes.length < 20 || bytes.length > 128 * 1024 * 1024 ||
    bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length) throw new Error("Invalid GLB header/size");
  let offset = 12;
  let document: GltfDocument | undefined;
  let bin: Buffer | null = null;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) throw new Error("Truncated GLB chunk header");
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
    if (length % 4 || offset + 8 + length > bytes.length) throw new Error("Invalid GLB chunk length");
    const payload = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a && offset === 12) document = JSON.parse(payload.toString("utf8"));
    else if (type === 0x004e4942 && document && bin === null) bin = payload;
    else throw new Error("Unexpected or duplicate GLB chunk");
    offset += 8 + length;
  }
  if (!document || document.asset?.version !== "2.0" || !Array.isArray(document.scenes) ||
    document.scenes.length !== 1 || (document.scene ?? 0) !== 0) throw new Error("Expected one glTF 2 scene");
  if ((document.buffers?.length ?? 0) > 1 || document.buffers?.some(b => b.uri !== undefined) ||
    document.images?.some(i => i.uri !== undefined)) throw new Error("Models must be self-contained GLBs");
  const byteLength = document.buffers?.[0]?.byteLength ?? 0;
  if (!Number.isSafeInteger(byteLength) || byteLength < 0 || byteLength > (bin?.length ?? 0)) {
    throw new Error("Invalid GLB buffer length");
  }
  return { document, bin };
}

/** Used by exporters/migrations; geometry and embedded image bytes are kept intact. */
export function encodeGlb(document: GltfDocument, bin: Buffer | null = null): Buffer {
  const json = Buffer.from(JSON.stringify(document));
  const jsonLength = (json.length + 3) & ~3;
  const binLength = bin ? (bin.length + 3) & ~3 : 0;
  const result = Buffer.alloc(20 + jsonLength + (bin ? 8 + binLength : 0));
  result.writeUInt32LE(0x46546c67, 0); result.writeUInt32LE(2, 4); result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonLength, 12); result.writeUInt32LE(0x4e4f534a, 16);
  result.fill(0x20, 20, 20 + jsonLength); json.copy(result, 20);
  if (bin) {
    result.writeUInt32LE(binLength, 20 + jsonLength); result.writeUInt32LE(0x004e4942, 24 + jsonLength);
    bin.copy(result, 28 + jsonLength);
  }
  return result;
}
