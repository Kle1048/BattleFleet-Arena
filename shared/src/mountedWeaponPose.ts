import { modelSpatialMetadata } from "./content/modelMetadata";
import type { ShipHullVisualProfile, ShipSocketTransform } from "./shipVisualLayout";

type Point = { x: number; y: number; z: number };

/** glTF/Three XYZ Euler means Rx * Ry * Rz; apply the rightmost rotation first. */
export function rotateModelVector(point: Point, euler?: Point): Point {
  if (!euler) return { ...point };
  const cx = Math.cos(euler.x), sx = Math.sin(euler.x);
  const cy = Math.cos(euler.y), sy = Math.sin(euler.y);
  const cz = Math.cos(euler.z), sz = Math.sin(euler.z);
  const x = cz * point.x - sz * point.y, y = sz * point.x + cz * point.y;
  const xx = cy * x + sy * point.z, z = -sy * x + cy * point.z;
  return { x: xx, y: cx * y - sx * z, z: sx * y + cx * z };
}

/** Solve horizontal pointing even with tilted or reflected parent bases. */
export function projectedTrainYaw(xx: number, xz: number, zx: number, zz: number, dx: number, dz: number): number | null {
  const determinant = xx * zz - zx * xz;
  if (Math.abs(determinant) < 1e-10 || Math.hypot(dx, dz) < 1e-10) return null;
  return Math.atan2((dx * zz - dz * zx) / determinant, (dz * xx - dx * xz) / determinant);
}

/** Pure logical pose: cosmetics never change authoritative projectile origins. */
export function mountedMuzzleWorld(
  socket: ShipSocketTransform, modelId: string,
  shipX: number, shipZ: number, headingRad: number,
  target?: { x: number; z: number },
): Point & { headingRad: number } {
  const muzzle = modelSpatialMetadata(modelId).effects.muzzle;
  if (!muzzle) throw new Error(`Missing model muzzle: ${modelId}`);
  const c = Math.cos(headingRad), s = Math.sin(headingRad), p = socket.position;
  let trainYaw = 0;
  if (target) {
    const dx = target.x - shipX - c * p.x - s * p.z;
    const dz = target.z - shipZ + s * p.x - c * p.z;
    const xAxis = rotateModelVector({ x: 1, y: 0, z: 0 }, socket.eulerRad);
    const zAxis = rotateModelVector({ x: 0, y: 0, z: 1 }, socket.eulerRad);
    trainYaw = projectedTrainYaw(xAxis.x, xAxis.z, zAxis.x, zAxis.z, c * dx - s * dz, s * dx + c * dz) ?? 0;
  }
  const train = { x: 0, y: trainYaw, z: 0 };
  const offset = rotateModelVector(rotateModelVector(muzzle.position, train), socket.eulerRad);
  const front = rotateModelVector(rotateModelVector(rotateModelVector({ x: 0, y: 0, z: 1 }, muzzle.eulerRad), train), socket.eulerRad);
  return { x: shipX + c * (p.x + offset.x) + s * (p.z + offset.z), y: p.y + offset.y,
    z: shipZ - s * (p.x + offset.x) + c * (p.z + offset.z),
    headingRad: headingRad + Math.atan2(front.x, front.z) };
}

export function mountSlotMuzzleWorld(
  hull: ShipHullVisualProfile, slotId: string, shipX: number, shipZ: number, headingRad: number,
  target?: { x: number; z: number },
): ReturnType<typeof mountedMuzzleWorld> {
  const slot = hull.mountSlots.find(slot => slot.id === slotId);
  const equipment = hull.defaultLoadout?.[slotId];
  if (!slot || !equipment) throw new Error(`Unoccupied mount: ${slotId}`);
  return mountedMuzzleWorld(slot.socket, equipment.modelId, shipX, shipZ, headingRad, target);
}
