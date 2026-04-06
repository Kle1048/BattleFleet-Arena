import * as THREE from "three";

type TextureKey = string;

export type AssetManager = {
  loadTexture: (key: TextureKey, url: string) => Promise<THREE.Texture>;
  getTexture: (key: TextureKey) => THREE.Texture | undefined;
  releaseTexture: (key: TextureKey) => void;
  dispose: () => void;
};

export function createAssetManager(): AssetManager {
  const textureLoader = new THREE.TextureLoader();
  const textures = new Map<TextureKey, THREE.Texture>();

  return {
    async loadTexture(key, url) {
      const cached = textures.get(key);
      if (cached) return cached;
      const texture = await textureLoader.loadAsync(url);
      textures.set(key, texture);
      return texture;
    },
    getTexture(key) {
      return textures.get(key);
    },
    releaseTexture(key) {
      const texture = textures.get(key);
      if (!texture) return;
      texture.dispose();
      textures.delete(key);
    },
    dispose() {
      for (const texture of textures.values()) {
        texture.dispose();
      }
      textures.clear();
    },
  };
}
