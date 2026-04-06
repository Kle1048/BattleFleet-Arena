import * as THREE from "three";

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

export function createWaterMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: VisualColorTokens.waterBase,
    metalness: 0.08,
    roughness: 0.42,
    emissive: VisualColorTokens.waterEmissive,
    emissiveIntensity: 0.12,
  });
}
