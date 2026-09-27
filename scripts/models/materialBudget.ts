import { decodeGlb } from "./glb";
import policy from "../../shared/src/content/modelMaterialPolicy.json";

/** Offline release gate; image headers only, no browser/image decoder required. */
export function checkMaterialBudget(bytes: Buffer, kind: "hull" | "mount") {
  const { document, bin } = decodeGlb(bytes);
  const images = document.images ?? [];
  if (images.length > policy.maxImagesPerModel) throw new Error("Only one colour texture per model is allowed");
  const maxSize = kind === "hull" ? policy.hullTextureSize : policy.mountTextureSize;
  const views = document.bufferViews as { byteOffset?: number; byteLength: number }[] | undefined;
  let textureBytesRgba8WithMips = 0;
  for (const image of images) {
    const view = views?.[image.bufferView ?? -1];
    const offset = view?.byteOffset ?? 0;
    if (!bin || !view || !Number.isSafeInteger(offset) || offset < 0 ||
        !Number.isSafeInteger(view.byteLength) || view.byteLength < 33 || offset + view.byteLength > bin.length) {
      throw new Error("Invalid embedded colour texture");
    }
    const png = bin.subarray(offset, offset + view.byteLength);
    if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || png.toString("ascii", 12, 16) !== "IHDR") {
      throw new Error("Colour textures must be embedded PNGs");
    }
    const width = png.readUInt32BE(16), height = png.readUInt32BE(20);
    if (!width || !height || width > maxSize || height > maxSize) {
      throw new Error(`${kind} colour texture exceeds ${maxSize}px budget`);
    }
    for (let w = width, h = height; ; w = Math.max(1, w >> 1), h = Math.max(1, h >> 1)) {
      textureBytesRgba8WithMips += w * h * 4;
      if (w === 1 && h === 1) break;
    }
  }
  const materials = (document.materials ?? []) as Record<string, any>[];
  for (const material of materials) {
    if (material.normalTexture || material.occlusionTexture || material.emissiveTexture ||
        material.pbrMetallicRoughness?.metallicRoughnessTexture) {
      throw new Error("Clean materials use constant roughness/metallic and no auxiliary texture maps");
    }
  }
  return { images: images.length, maxTextureSize: maxSize, textureBytesRgba8WithMips };
}
