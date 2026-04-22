import { ARTILLERY_ARC_HALF_ANGLE_RAD } from "../artillery";
import { aswmSteeringYawErrRad } from "../aswmShipAim";
import { minDistSqPointToPolygonBoundary } from "../islandPolygonGeometry";
import { DEFAULT_MAP_ISLAND_POLYGONS, SHIP_ISLAND_COLLISION_RADIUS } from "../islands";
import type { ActionPlanningInput, BotInputCommand } from "./types";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function wrapPi(a: number): number {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
}

function applyIslandAvoidance(
  self: ActionPlanningInput["snapshot"]["self"],
  baseRudder: number,
  throttle: number,
): number {
  const fx = Math.sin(self.headingRad);
  const fz = Math.cos(self.headingRad);
  const rx = Math.cos(self.headingRad);
  const rz = -Math.sin(self.headingRad);
  const lookAhead = 120 + 130 * Math.max(0, Math.abs(throttle));
  let avoidRudder = 0;
  let bestThreat = 0;

  for (const island of DEFAULT_MAP_ISLAND_POLYGONS) {
    const verts = island.verts;
    let cx = 0;
    let cz = 0;
    for (const v of verts) {
      cx += v.x;
      cz += v.z;
    }
    cx /= verts.length;
    cz /= verts.length;
    const dx = cx - self.x;
    const dz = cz - self.z;
    const along = dx * fx + dz * fz;
    if (along <= 0 || along > lookAhead) continue;

    const lateral = dx * rx + dz * rz;
    const distSelf = Math.sqrt(minDistSqPointToPolygonBoundary(self.x, self.z, verts));
    const alongProbe = Math.min(along, lookAhead * 0.85);
    const lx = self.x + fx * alongProbe;
    const lz = self.z + fz * alongProbe;
    const distLook = Math.sqrt(minDistSqPointToPolygonBoundary(lx, lz, verts));
    const clearance = Math.min(distSelf, distLook);
    const corridor = SHIP_ISLAND_COLLISION_RADIUS + 28;
    if (clearance > corridor) continue;

    const lateralAbs = Math.abs(lateral);
    const nearFactor = 1 - along / lookAhead;
    const centerFactor = 1 - clearance / corridor;
    const threat = clamp(nearFactor * 0.6 + centerFactor * 0.8, 0, 1);
    if (threat <= bestThreat) continue;
    bestThreat = threat;

    if (lateralAbs < 8) {
      avoidRudder = Math.abs(baseRudder) > 0.12 ? -Math.sign(baseRudder) : 1;
    } else {
      avoidRudder = lateral > 0 ? -1 : 1;
    }
  }

  if (bestThreat <= 0) return clamp(baseRudder, -1, 1);
  const mixed = baseRudder * (1 - bestThreat * 0.75) + avoidRudder * bestThreat;
  return clamp(mixed, -1, 1);
}

export function planAction(input: ActionPlanningInput): BotInputCommand {
  const { snapshot, context, intent } = input;
  const self = snapshot.self;
  const target = snapshot.enemies.find((q) => q.id === context.bestTargetId) ?? null;
  const aimWorldX = target?.x ?? self.x + Math.sin(self.headingRad) * 120;
  const aimWorldZ = target?.z ?? self.z + Math.cos(self.headingRad) * 120;
  const yawToAim = Math.atan2(aimWorldX - self.x, aimWorldZ - self.z);
  const yawErr = wrapPi(yawToAim - self.headingRad);
  let rudderYawErr = yawErr;
  if (
    target &&
    (intent === "ATTACK" ||
      intent === "FINISH_TARGET" ||
      intent === "CHASE" ||
      intent === "HOLD_ARC")
  ) {
    rudderYawErr = aswmSteeringYawErrRad(self.shipClass, self.x, self.z, self.headingRad, target.x, target.z);
  }
  const rudderTrack = clamp(rudderYawErr / 0.55, -1, 1);
  const yawToTargetForPrimary = target
    ? Math.atan2(target.x - self.x, target.z - self.z)
    : self.headingRad;
  const relToTarget = target ? Math.abs(wrapPi(yawToTargetForPrimary - self.headingRad)) : 0;
  const inPrimaryArc = !target || relToTarget <= ARTILLERY_ARC_HALF_ANGLE_RAD - 0.04;

  if (intent === "EVADE_MISSILES") {
    const throttle = 1;
    const rudderInput = applyIslandAvoidance(self, yawErr >= 0 ? -1 : 1, throttle);
    return {
      throttle,
      rudderInput,
      aimWorldX,
      aimWorldZ,
      primaryFire: false,
      secondaryFire: false,
      torpedoFire: false,
      radarActive: true,
    };
  }
  if (intent === "RETREAT") {
    const throttle = -0.5;
    const rudderInput = applyIslandAvoidance(self, yawErr >= 0 ? -0.7 : 0.7, throttle);
    return {
      throttle,
      rudderInput,
      aimWorldX,
      aimWorldZ,
      primaryFire: false,
      secondaryFire: false,
      torpedoFire: false,
      radarActive: true,
    };
  }
  if (intent === "ATTACK" || intent === "FINISH_TARGET") {
    const throttle = 0.85;
    const rudderInput = applyIslandAvoidance(self, rudderTrack, throttle);
    return {
      throttle,
      rudderInput,
      aimWorldX,
      aimWorldZ,
      primaryFire: inPrimaryArc,
      secondaryFire: context.targetInMissileArc && self.secondaryCooldownSec <= 0.05,
      torpedoFire: false,
      radarActive: true,
    };
  }
  if (intent === "SEEK_SEA_CONTROL") {
    const aimCx = 0;
    const aimCz = 0;
    const yawToCenter = Math.atan2(aimCx - self.x, aimCz - self.z);
    const yawErrCenter = wrapPi(yawToCenter - self.headingRad);
    const rudderCenter = clamp(yawErrCenter / 0.55, -1, 1);
    const throttle = 0.82;
    return {
      throttle,
      rudderInput: applyIslandAvoidance(self, rudderCenter, throttle),
      aimWorldX: aimCx,
      aimWorldZ: aimCz,
      primaryFire: false,
      secondaryFire: false,
      torpedoFire: false,
      radarActive: true,
    };
  }
  if (intent === "HOLD_ARC") {
    const throttle = 0.45;
    const rudderInput = applyIslandAvoidance(self, rudderTrack, throttle);
    return {
      throttle,
      rudderInput,
      aimWorldX,
      aimWorldZ,
      primaryFire: false,
      secondaryFire: false,
      torpedoFire: false,
      radarActive: true,
    };
  }
  if (intent === "CHASE") {
    const throttle = 1;
    const rudderInput = applyIslandAvoidance(self, rudderTrack, throttle);
    return {
      throttle,
      rudderInput,
      aimWorldX,
      aimWorldZ,
      primaryFire: inPrimaryArc && self.primaryCooldownSec <= 0.05,
      secondaryFire: false,
      torpedoFire: false,
      radarActive: true,
    };
  }
  const throttle = 0.4;
  const rudderInput = applyIslandAvoidance(
    self,
    Math.sin(snapshot.timestamp / Math.max(1, snapshot.operationalHalfExtent)),
    throttle,
  );
  return {
    throttle,
    rudderInput,
    aimWorldX,
    aimWorldZ,
    primaryFire: false,
    secondaryFire: false,
    torpedoFire: false,
    radarActive: true,
  };
}
