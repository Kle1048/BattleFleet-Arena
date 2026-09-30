import * as THREE from "three";

/** Tileable two-scale foam density. Generated once per wake system, shared by every ship. */
export function createWakeFoamTexture(): THREE.DataTexture {
  const size = 128, data = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number, period: number) => {
    const n = Math.sin(((x % period + period) % period) * 127.1 + ((y % period + period) % period) * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const noise = (u: number, v: number, period: number) => {
    const x = u * period, y = v * period, ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy, period), b = hash(ix + 1, iy, period), c = hash(ix, iy + 1, period), d = hash(ix + 1, iy + 1, period);
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, offset = (y * size + x) * 4;
    data[offset] = Math.round(255 * (noise(u, v, 8) * .65 + noise(u, v, 16) * .35));
    data[offset + 1] = Math.round(255 * noise(u, v, 32));
    data[offset + 2] = 255; data[offset + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}
