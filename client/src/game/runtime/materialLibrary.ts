import * as THREE from "three";
import { WAKE_TRAIL_MAX_POINTS, type WakeTrailState } from "./wakeTrail";

/** Max. gleichzeitige Kielwasser-Spuren im Wasser-Shader (Uniform-Größe / Schleifen). */
export const MAX_SHIP_WAKES = 10;
const WAKE_SHADER_PT_COUNT = MAX_SHIP_WAKES * WAKE_TRAIL_MAX_POINTS;

export const VisualColorTokens = {
  waterBase: 0x5ec8f5,
  waterEmissive: 0x0a3060,
  gridMajor: 0xf0f8ff,
  gridMinor: 0x6ab8e8,
  opsBorder: 0xff5522,
  islandSand: 0xc8b898,
  islandVegetation: 0x3d6b45,
  islandShore: 0xe0d4bc,
  shipHullLocalAlive: 0x6a7a8e,
  shipHullRemoteAlive: 0x8a909e,
  shipHullWreck: 0x2c2830,
  shipHullWreckEmissive: 0x2a1018,
  shipHullShieldedLocal: 0x4a7a88,
  shipHullShieldedRemote: 0x5a8898,
  shipHullShieldedEmissive: 0x00a090,
  shipAimLocal: 0xff9900,
  shipAimRemote: 0x33ddff,
  shipAimShieldLocal: 0xffcc66,
  shipAimShieldRemote: 0x66eeff,
  shipGuideShield: 0x66ffd0,
  shipRudderLine: 0xe02030,
  missileBody: 0xff3355,
  missileEmissive: 0xff1100,
  missileImpactHit: 0xff5533,
  missileImpactWater: 0x88aacc,
  torpedoBody: 0x2d4a5c,
  torpedoEmissive: 0x0a1820,
  torpedoImpactHit: 0xe08250,
  torpedoImpactWater: 0x6ec8e8,
  artilleryShell: 0xffeed0,
  artilleryShellEmissive: 0xffaa55,
  artilleryImpactHitOuter: 0xff5500,
  artilleryImpactHitInner: 0xffcc66,
  artilleryImpactHitBurst: 0xff3300,
  artilleryImpactWaterDark: 0x064b73,
  artilleryImpactWaterMid: 0x0c6ba8,
  artilleryImpactWaterLight: 0x3d9ee8,
  artilleryImpactIslandDark: 0x6b4a2a,
  artilleryImpactIslandMid: 0x8f7350,
} as const;

export function createMissileBodyMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: VisualColorTokens.missileBody,
    emissive: VisualColorTokens.missileEmissive,
    emissiveIntensity: 0.65,
    metalness: 0.35,
    roughness: 0.35,
    fog: false,
  });
}

export function createTorpedoBodyMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: VisualColorTokens.torpedoBody,
    emissive: VisualColorTokens.torpedoEmissive,
    emissiveIntensity: 0.35,
    metalness: 0.5,
    roughness: 0.45,
    fog: false,
  });
}

export function createArtilleryShellMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: VisualColorTokens.artilleryShell,
    emissive: VisualColorTokens.artilleryShellEmissive,
    emissiveIntensity: 0.35,
    metalness: 0.2,
    roughness: 0.45,
    fog: false,
  });
}

export function createShipHullAliveMaterial(isLocal: boolean): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: isLocal ? VisualColorTokens.shipHullLocalAlive : VisualColorTokens.shipHullRemoteAlive,
    metalness: 0.12,
    roughness: 0.72,
    side: THREE.DoubleSide,
    fog: false,
  });
}

type WaterUniforms = {
  uTime: { value: number };
  uDeepColor: { value: THREE.Color };
  uShallowColor: { value: THREE.Color };
  uFoamColor: { value: THREE.Color };
  uIslandCount: { value: number };
  uIslandData: { value: THREE.Vector3[] };
  uShipWakeCount: { value: number };
  uShipWakeTrailLen: { value: number[] };
  uShipWakeStrength: { value: number[] };
  uShipWakePts: { value: THREE.Vector2[] };
};

const MAX_WATER_ISLANDS = 16;

const WATER_VERTEX_SHADER = `
varying vec2 vUv;
varying vec3 vWorldPos;

uniform float uTime;

void main() {
  vUv = uv;
  vec3 p = position;
  float w1 = sin((p.x * 0.012) + uTime * 0.65);
  float w2 = cos((p.y * 0.014) - uTime * 0.52);
  p.z += (w1 + w2) * 0.28;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorldPos = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const WATER_FRAGMENT_SHADER = `
varying vec2 vUv;
varying vec3 vWorldPos;

uniform float uTime;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uFoamColor;
uniform float uIslandCount;
uniform vec3 uIslandData[${MAX_WATER_ISLANDS}];
uniform float uShipWakeCount;
uniform float uShipWakeTrailLen[${MAX_SHIP_WAKES}];
uniform float uShipWakeStrength[${MAX_SHIP_WAKES}];
uniform vec2 uShipWakePts[${WAKE_SHADER_PT_COUNT}];

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    sum += noise(p * freq) * amp;
    freq *= 2.03;
    amp *= 0.5;
  }
  return sum;
}

void main() {
  // Ruhigere, feiner skalierte Grundbewegung ohne blockige zweite Ebene.
  vec2 p0 = vUv * 18.0 + vec2(uTime * 0.032, -uTime * 0.024);
  float n = fbm(p0);
  float depthMix = clamp(0.26 + n * 0.42, 0.0, 1.0);
  vec3 col = mix(uDeepColor, uShallowColor, depthMix);

  // Obere Schicht: kleiner skaliert und deutlich langsamer animiert.
  float ridge = abs(sin((n * 6.8 + uTime * 0.34) * 3.14159));
  float flowMask = smoothstep(0.84, 0.985, ridge);
  col = mix(col, uFoamColor, flowMask * 0.18);

  // Küsten-Schaum: weiches, animiertes Band um Inselradius.
  float shoreFoam = 0.0;
  for (int i = 0; i < ${MAX_WATER_ISLANDS}; i++) {
    if (float(i) >= uIslandCount) break;
    vec3 island = uIslandData[i];
    float d = distance(vWorldPos.xz, island.xy);
    float edge = abs(d - island.z);
    float band = 1.0 - smoothstep(2.0, 15.0, edge);
    float wobble = 0.72 + 0.28 * sin(uTime * 0.55 + d * 0.12 + float(i) * 0.7);
    shoreFoam = max(shoreFoam, band * wobble);
  }
  col = mix(col, uFoamColor, shoreFoam * 0.52);

  // Kielwasser pro Schiff (Polylinie Heck-Spur), bis zu MAX_SHIP_WAKES.
  vec2 Pw = vWorldPos.xz;
  float wakeMaskAll = 0.0;
  float wakeCoreAll = 0.0;
  for (int w = 0; w < ${MAX_SHIP_WAKES}; w++) {
    if (float(w) >= uShipWakeCount) break;
    float wLen = uShipWakeTrailLen[w];
    float wStr = uShipWakeStrength[w];
    if (wLen < 1.5 || wStr < 0.02) continue;
    int base = w * ${WAKE_TRAIL_MAX_POINTS};
    float wakeMask = 0.0;
    float wakeCore = 0.0;
    for (int i = 0; i < ${WAKE_TRAIL_MAX_POINTS - 1}; i++) {
      if (float(i) >= wLen - 1.0) break;
      vec2 a = uShipWakePts[base + i + 1];
      vec2 b = uShipWakePts[base + i];
      vec2 ab = b - a;
      float ab2 = dot(ab, ab);
      if (ab2 < 1e-5) continue;
      float t = clamp(dot(Pw - a, ab) / ab2, 0.0, 1.0);
      vec2 c = a + ab * t;
      float dln = distance(Pw, c);
      float width = max(3.8, 21.0 - float(i) * 0.9);
      float lat = 1.0 - smoothstep(width, width + 11.0, dln);
      float segFade = exp(-0.16 * float(i));
      float nearShipAlong = t * t * (3.0 - 2.0 * t);
      float seg = lat * segFade * (0.08 + 0.92 * nearShipAlong);
      wakeMask = max(wakeMask, seg);
      float coreLat = 1.0 - smoothstep(width * 0.18, width * 0.6, dln);
      wakeCore = max(wakeCore, coreLat * segFade * nearShipAlong * nearShipAlong);
    }
    float rip = fbm(Pw * 0.55 + vec2(uTime * 0.06 + float(w) * 0.17, -uTime * 0.04));
    wakeMaskAll = max(wakeMaskAll, wakeMask * wStr * (0.82 + 0.18 * rip));
    wakeCoreAll = max(wakeCoreAll, wakeCore * wStr);
  }
  col = mix(col, uFoamColor, wakeMaskAll * 0.14);
  col = mix(col, vec3(1.0), wakeCoreAll * 0.72);

  gl_FragColor = vec4(col, 1.0);
}
`;

export function createWaterMaterial(): THREE.ShaderMaterial {
  const uniforms: WaterUniforms = {
    uTime: { value: 0 },
    uDeepColor: { value: new THREE.Color(0x0872ba) },
    uShallowColor: { value: new THREE.Color(0x58dfe3) },
    uFoamColor: { value: new THREE.Color(0xf0ffff) },
    uIslandCount: { value: 0 },
    uIslandData: {
      value: Array.from({ length: MAX_WATER_ISLANDS }, () => new THREE.Vector3(0, 0, 0)),
    },
    uShipWakeCount: { value: 0 },
    uShipWakeTrailLen: { value: Array.from({ length: MAX_SHIP_WAKES }, () => 0) },
    uShipWakeStrength: { value: Array.from({ length: MAX_SHIP_WAKES }, () => 0) },
    uShipWakePts: {
      value: Array.from({ length: WAKE_SHADER_PT_COUNT }, () => new THREE.Vector2()),
    },
  };
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
    fog: false,
    side: THREE.DoubleSide,
  });
}

export function setWaterIslands(
  material: THREE.Material,
  islands: readonly { x: number; z: number; radius: number }[],
): void {
  const shader = material as THREE.ShaderMaterial;
  const uniforms = shader.uniforms as WaterUniforms | undefined;
  if (!uniforms?.uIslandData || !uniforms.uIslandCount) return;
  const count = Math.min(islands.length, MAX_WATER_ISLANDS);
  uniforms.uIslandCount.value = count;
  for (let i = 0; i < count; i++) {
    const is = islands[i]!;
    uniforms.uIslandData.value[i]!.set(is.x, is.z, is.radius);
  }
}

export function updateWaterMaterial(material: THREE.Material, nowMs: number): void {
  const shader = material as THREE.ShaderMaterial;
  const uniforms = shader.uniforms as WaterUniforms | undefined;
  if (!uniforms?.uTime) return;
  uniforms.uTime.value = nowMs * 0.001;
}

export type WaterShipWakeUpload = { trail: WakeTrailState; strength: number };

/**
 * Mehrere Kielwässer: `trail.*` in **Render-XZ** (Heck-Spur), Shader index 0 = neu.
 */
export function updateWaterShipWakes(
  material: THREE.Material,
  wakes: readonly WaterShipWakeUpload[],
): void {
  const shader = material as THREE.ShaderMaterial;
  const uniforms = shader.uniforms as WaterUniforms | undefined;
  if (!uniforms?.uShipWakeCount || !uniforms.uShipWakePts || !uniforms.uShipWakeTrailLen || !uniforms.uShipWakeStrength) {
    return;
  }
  const lenArr = uniforms.uShipWakeTrailLen.value;
  const strArr = uniforms.uShipWakeStrength.value;
  for (let w = 0; w < MAX_SHIP_WAKES; w++) {
    lenArr[w] = 0;
    strArr[w] = 0;
  }
  const n = Math.min(wakes.length, MAX_SHIP_WAKES);
  uniforms.uShipWakeCount.value = n;
  const dstFlat = uniforms.uShipWakePts.value;
  for (let w = 0; w < n; w++) {
    const { trail, strength } = wakes[w]!;
    lenArr[w] = trail.length;
    strArr[w] = strength;
    const base = w * WAKE_TRAIL_MAX_POINTS;
    for (let i = 0; i < trail.length; i++) {
      dstFlat[base + i]!.copy(trail.pool[trail.length - 1 - i]!);
    }
  }
}
