import * as THREE from "three";
import type { ShipSocketTransform } from "@battlefleet/shared";

/** Pro `mountSlots[].id` — gleicher Name wie in `mountSockets/*.json`. */
export const SOCKET_GLTF_PREFIX = "SOCKET_";

/** Pro `fixedSeaSkimmerLaunchers[].id`. */
export const RAIL_GLTF_PREFIX = "RAIL_";

export type GltfSocketMarkersRead = {
  sockets: Map<string, ShipSocketTransform>;
  rails: Map<string, ShipSocketTransform>;
};

const _invHull = new THREE.Matrix4();
const _rel = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

/**
 * Liest Position/Orientierung der Blender-Empties aus dem **vorbereiteten** Rumpf (`clonePreparedShipHull`),
 * relativ zum Rumpf-Root — gleicher Raum wie `mountSockets`-Koordinaten.
 *
 * - **Nur Client** — Server/Match nutzen weiter `getAuthoritativeShipHullProfile` (JSON).
 * - Wenn ein Slot im GLB fehlt, gilt das Profil-`socket` wie bisher.
 * - Marker werden unsichtbar geschaltet (reine Layout-Hilfen).
 */
export function readMarkedSocketTransformsFromHullGltf(hullModel: THREE.Object3D): GltfSocketMarkersRead {
  const sockets = new Map<string, ShipSocketTransform>();
  const rails = new Map<string, ShipSocketTransform>();

  hullModel.updateWorldMatrix(true, true);
  _invHull.copy(hullModel.matrixWorld).invert();

  hullModel.traverse((o) => {
    if (o === hullModel) return;
    const name = o.name;
    let target: Map<string, ShipSocketTransform> | null = null;
    let rawId = "";
    if (name.startsWith(SOCKET_GLTF_PREFIX)) {
      target = sockets;
      rawId = name.slice(SOCKET_GLTF_PREFIX.length);
    } else if (name.startsWith(RAIL_GLTF_PREFIX)) {
      target = rails;
      rawId = name.slice(RAIL_GLTF_PREFIX.length);
    } else {
      return;
    }
    if (!rawId || !target) return;

    o.updateWorldMatrix(true, false);
    _rel.multiplyMatrices(_invHull, o.matrixWorld);
    _rel.decompose(_pos, _quat, _scale);
    if (
      Math.abs(_scale.x - _scale.y) > 1e-3 ||
      Math.abs(_scale.y - _scale.z) > 1e-3 ||
      Math.abs(_scale.x - 1) > 0.2 ||
      Math.abs(_scale.y - 1) > 0.2 ||
      Math.abs(_scale.z - 1) > 0.2
    ) {
      console.warn(
        `[BattleFleet] GLB marker "${name}" has non-uniform or unusual scale; ` +
          `using rotation only (scale ${_scale.x.toFixed(3)}, ${_scale.y.toFixed(3)}, ${_scale.z.toFixed(3)}).`,
      );
    }

    _euler.setFromQuaternion(_quat, "XYZ");
    const ex = _euler.x;
    const ey = _euler.y;
    const ez = _euler.z;
    const eulerRad =
      Math.abs(ex) + Math.abs(ey) + Math.abs(ez) < 1e-6 ? undefined : { x: ex, y: ey, z: ez };

    const transform: ShipSocketTransform = {
      position: { x: _pos.x, y: _pos.y, z: _pos.z },
      ...(eulerRad ? { eulerRad } : {}),
    };

    if (target.has(rawId)) {
      console.warn(`[BattleFleet] Duplicate GLB marker id "${rawId}" (${name}) — using last.`);
    }
    target.set(rawId, transform);
    o.visible = false;
  });

  return { sockets, rails };
}
