import * as THREE from "three";
import type { ShipVisual } from "./shipVisual";

const MAX_SHIPS = 64, SEGMENTS = 6;
/** Two low, curved spray sheets per bow, batched into one draw. No particle allocations. */
export function createBowFoam(scene: THREE.Scene, texture: THREE.Texture) {
  const vertices = MAX_SHIPS * 2 * (SEGMENTS + 1) * 2;
  const positions = new Float32Array(vertices * 3), uvs = new Float32Array(vertices * 2), strengths = new Float32Array(vertices);
  const indices = new Uint16Array(MAX_SHIPS * 2 * SEGMENTS * 6);
  for (let wing = 0; wing < MAX_SHIPS * 2; wing++) for (let i = 0; i < SEGMENTS; i++) {
    const a = wing * (SEGMENTS + 1) * 2 + i * 2, j = (wing * SEGMENTS + i) * 6;
    indices.set([a, a + 1, a + 2, a + 1, a + 3, a + 2], j);
  }
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const uv = new THREE.BufferAttribute(uvs, 2);
  const strength = new THREE.BufferAttribute(strengths, 1).setUsage(THREE.DynamicDrawUsage);
  for (let wing = 0; wing < MAX_SHIPS * 2; wing++) for (let i = 0; i <= SEGMENTS; i++) {
    const v = (wing * (SEGMENTS + 1) + i) * 2;
    uvs.set([i / SEGMENTS, 0, i / SEGMENTS, 1], v * 2);
  }
  geometry.setAttribute("position", position); geometry.setAttribute("uv", uv); geometry.setAttribute("strength", strength);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1)); geometry.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), foamMap: { value: texture }, time: { value: 0 } },
    vertexShader: `
      attribute float strength;
      varying vec2 vUv; varying vec2 vWorld; varying float vStrength;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vWorld = position.xz; vStrength = strength;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform sampler2D foamMap; uniform float time;
      varying vec2 vUv; varying vec2 vWorld; varying float vStrength;
      #include <fog_pars_fragment>
      void main() {
        vec2 grain = texture2D(foamMap, vWorld * .075 + vec2(time * .035, 0.0)).rg;
        float edge = smoothstep(0.0, .2, vUv.y) * (1.0 - smoothstep(.65, 1.0, vUv.y));
        float envelope = smoothstep(0.0, .12, vUv.x) * (1.0 - smoothstep(.5, 1.0, vUv.x));
        float foam = smoothstep(.2, .75, grain.r + grain.g * .2);
        gl_FragColor = vec4(mix(vec3(.58,.77,.79), vec3(.94,.98,1.0), foam), edge * envelope * (.35 + foam * .65) * vStrength);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "shipBowFoam"; mesh.frustumCulled = false; mesh.renderOrder = 2; mesh.visible = false;
  let ships = 0, disposed = false;
  return {
    begin(time: number) { if (disposed) return; ships = 0; material.uniforms.time!.value = time; },
    add(vis: ShipVisual, speed: number) {
      if (disposed || ships >= MAX_SHIPS || speed < 2) return;
      const box = vis.profile?.collisionHitbox;
      if (!box) return;
      // Group matrices are refreshed by the ribbon before this call; mirror and hull roll are preserved.
      const m = vis.group.matrixWorld.elements;
      const beam = box.halfExtents.x, nose = box.center.z + box.halfExtents.z;
      const length = Math.min(box.halfExtents.z * .7, beam * 5);
      const power = THREE.MathUtils.clamp((speed - 2) / 24, 0, 1);
      for (let side = 0; side < 2; side++) for (let i = 0; i <= SEGMENTS; i++) {
        const t = i / SEGMENTS, sign = side ? 1 : -1;
        const localZ = nose - length * t;
        const localX = box.center.x + sign * beam * (.12 + 1.8 * t + .55 * t * t);
        const width = beam * (.07 + .24 * t) * (.45 + power * .55);
        for (let edge = 0; edge < 2; edge++) {
          const v = ((ships * 2 + side) * (SEGMENTS + 1) + i) * 2 + edge;
          const x = localX + (edge ? width : -width);
          positions[v * 3] = m[0]! * x + m[8]! * localZ + m[12]!;
          positions[v * 3 + 1] = .09 + Math.sin(t * Math.PI) * Math.min(.6, beam * .08) * power;
          positions[v * 3 + 2] = m[2]! * x + m[10]! * localZ + m[14]!;
          strengths[v] = power * .7;
        }
      }
      ships++;
    },
    end() {
      if (disposed) return;
      // Lazily attach, and detach empty batches so missing players leave no scene objects.
      if (ships && !mesh.parent) scene.add(mesh);
      if (!ships) mesh.removeFromParent();
      mesh.visible = ships > 0; geometry.setDrawRange(0, ships * 2 * SEGMENTS * 6);
      if (ships) {
        position.clearUpdateRanges(); position.addUpdateRange(0, ships * 2 * (SEGMENTS + 1) * 6); position.needsUpdate = true;
        strength.clearUpdateRanges(); strength.addUpdateRange(0, ships * 2 * (SEGMENTS + 1) * 2); strength.needsUpdate = true;
      }
    },
    dispose() { if (disposed) return; disposed = true; mesh.removeFromParent(); geometry.dispose(); material.dispose(); },
  };
}
