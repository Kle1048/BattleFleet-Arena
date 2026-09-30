import { canPrimaryArtilleryEngageAimAtWorldPoint } from "../primaryArtilleryEngagement";
import { artilleryAim, missileFireSolution, missileBearingSolution } from "./fireControl";
import { desiredBotRadar } from "./radarControl";
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
  const avoidIslands: typeof applyIslandAvoidance = snapshot.islandsEnabled === false
    ? (_self, rudder) => clamp(rudder, -1, 1) : applyIslandAvoidance;
  const self = snapshot.self;
  const radarActive = desiredBotRadar(snapshot, intent);
  const target = snapshot.enemies.find((q) => q.id === context.bestTargetId) ?? null;
  const bearing = (snapshot.esmBearings ?? []).find(b => b.id === context.esmTargetId);
  const gunAim = target ? artilleryAim(self, target) : null;
  const missile = target ? missileFireSolution(self, target) : bearing ? missileBearingSolution(self, bearing.bearingRad) : null;
  const fireMissile = (intent === "ATTACK" || intent === "FINISH_TARGET" ||
    (!!snapshot.profile && snapshot.profile !== "standard" && intent === "SEEK_SEA_CONTROL")) &&
    self.secondaryCooldownSec <= 0.05 && missile?.canFire === true;
  // InputCommand carries one aim point. Do not fire the cannon at a missile lead point.
  const aim = fireMissile ? missile : gunAim ?? missile;
  const aimWorldX = aim?.x ?? self.x + Math.sin(self.headingRad) * 120;
  const aimWorldZ = aim?.z ?? self.z + Math.cos(self.headingRad) * 120;
  const yawToAim = Math.atan2(aimWorldX - self.x, aimWorldZ - self.z);
  const yawErr = wrapPi(yawToAim - self.headingRad);
  let rudderYawErr = yawErr;
  if (
    (target || bearing) &&
    (intent === "ATTACK" ||
      intent === "FINISH_TARGET" ||
      intent === "CHASE" ||
      intent === "HOLD_ARC")
  ) {
    rudderYawErr = missile?.rudderYawError ?? yawErr;
  }
  const rudderTrack = clamp(rudderYawErr / 0.55, -1, 1);
  const canFirePrimary = !!target && !fireMissile && self.primaryCooldownSec <= 0.05 &&
    canPrimaryArtilleryEngageAimAtWorldPoint(self.x, self.z, self.headingRad, self.shipClass, aimWorldX, aimWorldZ);

  if (snapshot.profile && snapshot.profile !== "standard") {
    const profile = snapshot.profile;
    let throttle = 0.8, rudder = rudderTrack;
    const steer = (x: number, z: number) => {
      const limit = Math.max(100, snapshot.operationalHalfExtent - 150);
      return clamp(wrapPi(Math.atan2(clamp(x, -limit, limit) - self.x,
        clamp(z, -limit, limit) - self.z) - self.headingRad) / 0.55, -1, 1);
    };
    const patrol = () => {
      const angle = Math.atan2(self.x, self.z) + 0.6;
      rudder = steer(Math.sin(angle) * 240, Math.cos(angle) * 240);
      throttle = 0.55;
    };
    const escape = () => {
      const away = target ? Math.atan2(self.x - target.x, self.z - target.z)
        : bearing ? bearing.bearingRad + Math.PI : self.headingRad;
      rudder = steer(self.x + Math.sin(away) * 500, self.z + Math.cos(away) * 500);
      throttle = 1;
    };
    if (intent === "EVADE_MISSILES") { rudder = yawErr >= 0 ? -1 : 1; throttle = 1; }
    else if (intent === "RETREAT" || intent === "TAKE_COVER") escape();
    else if (intent === "SEEK_SEA_CONTROL") patrol();
    else if (target && !canFirePrimary && !(profile === "cautious" && self.hp / Math.max(1, self.maxHp) < 0.4) &&
             (intent === "CHASE" || intent === "REPOSITION")) {
      // A modest rear offset is available to everyone. Never abandon a valid gun shot just to flank.
      const offset = intent === "REPOSITION" ? 120 : 60;
      rudder = steer(target.x - Math.sin(target.headingRad) * offset,
        target.z - Math.cos(target.headingRad) * offset);
      throttle = profile === "cautious" ? 0.55 : 0.85;
    } else if (profile === "aggressive" && !target && intent === "CHASE" && input.memory.pursuit &&
               snapshot.timestamp - input.memory.pursuit.at < 30000) {
      rudder = steer(input.memory.pursuit.x, input.memory.pursuit.z);
      throttle = 1; // Last observed position only; stale tracks never enable weapons.
    } else if (profile === "cautious") {
      const hurt = self.hp / Math.max(1, self.maxHp) < 0.4;
      if (target && hurt && Math.hypot(target.x - self.x, target.z - self.z) < 320) escape();
      else throttle = intent === "CHASE" ? 0.55 : 0.35;
    } else if (!target && !bearing) patrol();
    else if (intent === "HOLD_ARC") throttle = 0.3;
    if (Math.max(Math.abs(self.x), Math.abs(self.z)) > snapshot.operationalHalfExtent - 180)
      rudder = steer(0, 0);
    return { throttle, rudderInput: avoidIslands(self, rudder, throttle), aimWorldX, aimWorldZ,
      primaryFire: canFirePrimary && intent !== "EVADE_MISSILES" && intent !== "TAKE_COVER",
      secondaryFire: fireMissile, torpedoFire: false, radarActive };
  }

  if (intent === "EVADE_MISSILES") {
    const throttle = 1;
    const rudderInput = avoidIslands(self, yawErr >= 0 ? -1 : 1, throttle);
    return {
      throttle,
      rudderInput,
      aimWorldX,
      aimWorldZ,
      primaryFire: false,
      secondaryFire: false,
      torpedoFire: false,
      radarActive,
    };
  }
  if (intent === "RETREAT") {
    const throttle = -0.5;
    const rudderInput = avoidIslands(self, yawErr >= 0 ? -0.7 : 0.7, throttle);
    return {
      throttle,
      rudderInput,
      aimWorldX,
      aimWorldZ,
      primaryFire: false,
      secondaryFire: false,
      torpedoFire: false,
      radarActive,
    };
  }
  if (intent === "ATTACK" || intent === "FINISH_TARGET") {
    const throttle = 0.85;
    const rudderInput = avoidIslands(self, rudderTrack, throttle);
    return {
      throttle,
      rudderInput,
      aimWorldX,
      aimWorldZ,
      primaryFire: canFirePrimary,
      secondaryFire: fireMissile,
      torpedoFire: false,
      radarActive,
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
      rudderInput: avoidIslands(self, rudderCenter, throttle),
      aimWorldX: aimCx,
      aimWorldZ: aimCz,
      primaryFire: false,
      secondaryFire: false,
      torpedoFire: false,
      radarActive,
    };
  }
  if (intent === "HOLD_ARC") {
    const throttle = 0.45;
    const rudderInput = avoidIslands(self, rudderTrack, throttle);
    return {
      throttle,
      rudderInput,
      aimWorldX,
      aimWorldZ,
      primaryFire: false,
      secondaryFire: false,
      torpedoFire: false,
      radarActive,
    };
  }
  if (intent === "CHASE") {
    const throttle = 1;
    const rudderInput = avoidIslands(self, rudderTrack, throttle);
    return {
      throttle,
      rudderInput,
      aimWorldX,
      aimWorldZ,
      primaryFire: canFirePrimary,
      secondaryFire: false,
      torpedoFire: false,
      radarActive,
    };
  }
  const throttle = 0.4;
  const rudderInput = avoidIslands(
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
    radarActive,
  };
}
