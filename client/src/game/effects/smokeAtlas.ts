import * as THREE from "three";

/** Four deterministic, shaded density stamps. Generated once, never per frame. */
export function createSmokeAtlas(): THREE.DataTexture {
  const tile = 64, size = tile * 2;
  const data = new Uint8Array(size * size * 4);
  for (let variant = 0; variant < 4; variant++) {
    const lobes = Array.from({ length: 9 }, (_, i) => {
      const angle = i * 2.39996 + variant * 1.7;
      const radius = i === 0 ? 0 : 0.34 + (i % 3) * 0.11;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius,
        width: i === 0 ? .38 : 0.22 + ((i + variant) % 3) * 0.045 };
    });
    for (let y = 0; y < tile; y++) for (let x = 0; x < tile; x++) {
      const u = (x + .5) / tile * 2 - 1, v = (y + .5) / tile * 2 - 1;
      let density = 0, shade = .4;
      for (const lobe of lobes) {
        const nx = (u - lobe.x) / lobe.width, ny = (v - lobe.y) / lobe.width;
        const d2 = nx * nx + ny * ny;
        const d = Math.exp(-d2 * 1.4);
        if (d > density) {
          density = d;
          // Baked lobe normals give depth without real-time volumetric lighting.
          const nz = Math.sqrt(Math.max(0, 1 - d2));
          shade = .32 + .65 * Math.max(0, -.3 * nx + .55 * ny + .7 * nz);
        }
      }
      const grain = Math.sin(u * 29 + Math.sin(v * 17 + variant)) * Math.sin(v * 25 - u * 9);
      const edge = Math.min(1, Math.max(0, (1 - Math.max(Math.abs(u), Math.abs(v))) * 12 - .2));
      const alpha = Math.min(1, density * 1.35) * edge;
      shade = Math.max(.22, Math.min(1, shade + grain * .04));
      const offset = (((variant >> 1) * tile + y) * size + (variant % 2) * tile + x) * 4;
      data[offset] = data[offset + 1] = data[offset + 2] = Math.round(shade * 255);
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}
