import * as THREE from "three";

/**
 * Sonnenrichtung (normalisiert, von der Szene aus zur Lichtquelle) aus
 * Elevationswinkel über dem Horizont und Azimut (°), Y = oben.
 */
export function sunDirectionFromAngles(elevationDeg: number, azimuthDeg: number): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

/** Umgekehrt: aus einem Licht-Positionsvektor (beliebige Länge) Winkel ableiten. */
export function sunAnglesFromPosition(pos: readonly [number, number, number]): {
  elevationDeg: number;
  azimuthDeg: number;
} {
  const v = new THREE.Vector3(pos[0], pos[1], pos[2]);
  if (v.lengthSq() < 1e-8) return { elevationDeg: 42, azimuthDeg: 195 };
  v.normalize();
  const sph = new THREE.Spherical().setFromVector3(v);
  const elevationDeg = THREE.MathUtils.radToDeg(Math.PI / 2 - sph.phi);
  const azimuthDeg = THREE.MathUtils.radToDeg(sph.theta);
  return { elevationDeg, azimuthDeg };
}

/** Für Three.js Sky: groß skalierte Sonnenposition (Preetham-Shader). */
export function skySunPositionFromDirection(dir: THREE.Vector3, scale = 400_000): THREE.Vector3 {
  return dir.clone().normalize().multiplyScalar(scale);
}
