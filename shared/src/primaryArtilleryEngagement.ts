/**
 * Prüft, ob die Primär-Artillerie (mindestens ein Mount) mit gegebenem Aim
 * servernah feuern könnte — gleiche Geometrie wie `BattleRoom.tryPrimaryFire`, deterministisches RNG.
 */

import { shipLocalToWorldXZ } from "./aswm";
import { ARTILLERY_MAX_RANGE, ARTILLERY_MIN_RANGE, tryComputeArtillerySalvo } from "./artillery";
import { getShipClassProfile, normalizeShipClassId, type ShipClassId } from "./shipClass";
import { getAuthoritativeShipHullProfile } from "./shipProfiles";
import { listPrimaryArtilleryMountConfigs } from "./shipVisualLayout";

const neutralRng = (): number => 0.5;

/**
 * @returns `true`, wenn mindestens ein Primär-Mount den Aim-Punkt **im Feuersektor und in der Nominalreichweite**
 * (Mündung→Ziel, nicht nur geklemmter Einschlag) treffen kann.
 * Hinweis: `tryComputeArtillerySalvo` klemmt Distanzen — ohne diese Prüfung wäre „zu weit“ trotzdem `ok`.
 */
export function canPrimaryArtilleryEngageAimAtWorldPoint(
  shipX: number,
  shipZ: number,
  headingRad: number,
  shipClass: string,
  aimWorldX: number,
  aimWorldZ: number,
): boolean {
  const cid = normalizeShipClassId(shipClass) as ShipClassId;
  const classProf = getShipClassProfile(cid);
  const hull = getAuthoritativeShipHullProfile(cid);
  const mounts = listPrimaryArtilleryMountConfigs(hull, classProf.artilleryArcHalfAngleRad);
  for (const m of mounts) {
    const w = shipLocalToWorldXZ(shipX, shipZ, headingRad, m.socket.x, m.socket.z);
    const distToAim = Math.hypot(aimWorldX - w.x, aimWorldZ - w.z);
    if (distToAim < ARTILLERY_MIN_RANGE - 1e-6 || distToAim > ARTILLERY_MAX_RANGE + 1e-6) {
      continue;
    }
    const salvo = tryComputeArtillerySalvo(
      shipX,
      shipZ,
      headingRad,
      aimWorldX,
      aimWorldZ,
      neutralRng,
      m.sector,
      w.x,
      w.z,
    );
    if (salvo.ok) return true;
  }
  return false;
}
