import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createAsyncAssetCache, fetchAssetBytes } from "../runtime/asyncAssetCache";
import { disposeVisualResources } from "./shipVisualResources";

/** Ships, mounts and islands share a two-request budget, including parsing. */
export const gltfAssetCache = createAsyncAssetCache({
  async load(url: string, signal) {
    const bytes = await fetchAssetBytes(url, signal);
    // Preserve relative paths for embedded GLTF references; packaged assets are self-contained GLBs.
    const base = new URL(".", new URL(url, window.location.href)).href;
    const gltf = await new GLTFLoader().parseAsync(bytes, base);
    return gltf.scene;
  },
  disposeValue: (scene) => disposeVisualResources(scene, true),
  onError: (url, error) => console.warn("[BattleFleet] GLB unavailable:", url, error),
});
