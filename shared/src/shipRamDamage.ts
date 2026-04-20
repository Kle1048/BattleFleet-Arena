import type { ShipCollisionHitbox } from "./shipVisualLayout";
import type { ShipCollisionParticipant } from "./shipShipCollision";
import {
  hitboxWorldCenterXZ,
  satOBB2DOverlapMTV,
} from "./shipShipCollision";

/** Länge × Breite der Hitbox-Fußfläche in Schiff lokal XZ (volle Ausdehnung). */
export function hitboxFootprintAreaXZ(hitbox: ShipCollisionHitbox): number {
  const hx = Math.max(0, hitbox.halfExtents.x);
  const hz = Math.max(0, hitbox.halfExtents.z);
  return (2 * hx) * (2 * hz);
}

/**
 * Unterhalb dieser Relativgeschwindigkeit (Betrag \|v⃗_B − v⃗_A\| in XZ) kein Ram-Schaden.
 * Gleiche Einheit wie `ShipMovementState.speed` (≈ „m/s“-Skala im Spiel).
 */
export const SHIP_RAM_MIN_REL_SPEED = 4;

function shipVelocityXZ(ship: { headingRad: number; speed: number }): {
  vx: number;
  vz: number;
} {
  const sh = Math.sin(ship.headingRad);
  const ch = Math.cos(ship.headingRad);
  return { vx: sh * ship.speed, vz: ch * ship.speed };
}

export type ShipRamDamageResult = {
  /** Kumulativer RoHSchaden dieses Ticks pro Spieler (vor Progression / Klassen-Mul). */
  rawDamageBySessionId: Map<string, number>;
  /**
   * Für Kill-Attribution: pro Opfer der Partner mit dem größten Einzel-Schaden aus einem Paar dieses Ticks.
   */
  killerByVictimSessionId: Map<string, string>;
};

/**
 * Ram-Schaden bei überlappenden Hitboxen: Gesamtpool = \|v⃗_rel\| − Minimum,
 * skaliert mit `dt` (Schaden pro Tick ≈ effektive Relativgeschwindigkeit × Zeit).
 * Verteilung B: Schiff i erhält pool × m_anderer / (m_a + m_b).
 * Nur Paare mit `sessionId` auf beiden Seiten; vor `resolveShipShipCollisions` aufrufen.
 */
export function accumulateShipRamDamage(
  participants: ShipCollisionParticipant[],
  dt: number,
): ShipRamDamageResult {
  const rawDamageBySessionId = new Map<string, number>();
  const killerByVictimSessionId = new Map<string, string>();
  const bestSingleHit = new Map<string, { killer: string; dmg: number }>();

  const n = participants.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const A = participants[i]!;
      const B = participants[j]!;
      const idA = A.sessionId;
      const idB = B.sessionId;
      if (!idA || !idB) continue;

      const hbA = A.hitbox;
      const hbB = B.hitbox;
      if (!hbA || !hbB) continue;

      const hxA = Math.max(0, hbA.halfExtents.x);
      const hzA = Math.max(0, hbA.halfExtents.z);
      const hxB = Math.max(0, hbB.halfExtents.x);
      const hzB = Math.max(0, hbB.halfExtents.z);
      const c1 = hitboxWorldCenterXZ(A.ship.x, A.ship.z, A.ship.headingRad, hbA);
      const c2 = hitboxWorldCenterXZ(B.ship.x, B.ship.z, B.ship.headingRad, hbB);
      const mtv = satOBB2DOverlapMTV(
        c1,
        hxA,
        hzA,
        A.ship.headingRad,
        c2,
        hxB,
        hzB,
        B.ship.headingRad,
      );
      if (!mtv) continue;

      const vA = shipVelocityXZ(A.ship);
      const vB = shipVelocityXZ(B.ship);
      const rvx = vB.vx - vA.vx;
      const rvz = vB.vz - vA.vz;
      const vRel = Math.hypot(rvx, rvz);
      const effective = vRel - SHIP_RAM_MIN_REL_SPEED;
      if (effective <= 0) continue;

      const mA = hitboxFootprintAreaXZ(hbA);
      const mB = hitboxFootprintAreaXZ(hbB);
      const mSum = mA + mB;
      if (mSum < 1e-12) continue;

      const pool = effective * dt;
      const dmgA = (pool * mB) / mSum;
      const dmgB = (pool * mA) / mSum;

      if (dmgA > 0) {
        rawDamageBySessionId.set(idA, (rawDamageBySessionId.get(idA) ?? 0) + dmgA);
        const prev = bestSingleHit.get(idA);
        if (!prev || dmgA > prev.dmg) {
          bestSingleHit.set(idA, { killer: idB, dmg: dmgA });
        }
      }
      if (dmgB > 0) {
        rawDamageBySessionId.set(idB, (rawDamageBySessionId.get(idB) ?? 0) + dmgB);
        const prev = bestSingleHit.get(idB);
        if (!prev || dmgB > prev.dmg) {
          bestSingleHit.set(idB, { killer: idA, dmg: dmgB });
        }
      }
    }
  }

  for (const [victim, { killer }] of bestSingleHit) {
    killerByVictimSessionId.set(victim, killer);
  }

  return { rawDamageBySessionId, killerByVictimSessionId };
}

/**
 * Ram-Schaden gegen **stehende** Wracks (Geschwindigkeit Wrack = 0): gleiche Pool-Formel wie Schiff–Schiff,
 * Schaden auf das Spieler-Schiff = `pool × m_wrack / (m_spieler + m_wrack)`.
 * Kein Kill-Attribut — Wrack hat keine `sessionId`.
 */
export function accumulateWreckRamDamage(
  participants: ShipCollisionParticipant[],
  wreckList: { length: number; at: (i: number) => { anchorX: number; anchorZ: number; headingRad: number; shipClass: string } | undefined },
  getWreckHitbox: (shipClass: string) => ShipCollisionHitbox | undefined,
  dt: number,
): Map<string, number> {
  const rawDamageBySessionId = new Map<string, number>();
  if (wreckList.length === 0) return rawDamageBySessionId;

  for (const part of participants) {
    const id = part.sessionId;
    if (!id) continue;
    const hbA = part.hitbox;
    if (!hbA) continue;

    const hxA = Math.max(0, hbA.halfExtents.x);
    const hzA = Math.max(0, hbA.halfExtents.z);
    const mA = hitboxFootprintAreaXZ(hbA);

    for (let wi = 0; wi < wreckList.length; wi++) {
      const w = wreckList.at(wi);
      if (!w) continue;
      const hbB = getWreckHitbox(w.shipClass);
      if (!hbB) continue;

      const hxB = Math.max(0, hbB.halfExtents.x);
      const hzB = Math.max(0, hbB.halfExtents.z);
      const c1 = hitboxWorldCenterXZ(part.ship.x, part.ship.z, part.ship.headingRad, hbA);
      const c2 = hitboxWorldCenterXZ(w.anchorX, w.anchorZ, w.headingRad, hbB);
      const mtv = satOBB2DOverlapMTV(
        c1,
        hxA,
        hzA,
        part.ship.headingRad,
        c2,
        hxB,
        hzB,
        w.headingRad,
      );
      if (!mtv) continue;

      const vA = shipVelocityXZ(part.ship);
      const vRel = Math.hypot(vA.vx, vA.vz);
      const effective = vRel - SHIP_RAM_MIN_REL_SPEED;
      if (effective <= 0) continue;

      const mB = hitboxFootprintAreaXZ(hbB);
      const mSum = mA + mB;
      if (mSum < 1e-12) continue;

      const pool = effective * dt;
      const dmgPlayer = (pool * mB) / mSum;
      if (dmgPlayer <= 0) continue;
      rawDamageBySessionId.set(id, (rawDamageBySessionId.get(id) ?? 0) + dmgPlayer);
    }
  }

  return rawDamageBySessionId;
}
