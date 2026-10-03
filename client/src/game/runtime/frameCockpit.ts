import { canPrimaryArtilleryEngageAimAtWorldPoint, equippedMount, ARTILLERY_MIN_RANGE, ARTILLERY_MAX_RANGE, listPrimaryArtilleryMountConfigs, mountSlotMuzzleWorld, isYawWithinMountFireSector, PlayerLifeState, PROGRESSION_MAX_LEVEL, SPEED_FEEL_FACTOR, normalizeShipClassId, shipClassIdForProgressionLevel, getShipClassProfile, progressionMovementScale, progressionXpToNextLevel, progressionNavalRankEn, launcherYawRadFromBow, esmDetectionRange, esmEmitterStrokeCss, resolveAirDefenseDefenderIdForMissile, getAswmMagazineFromProfile, type ShipClassId, type AirDefenseMissileSnapshot, type AirDefensePlayerSnapshot } from "@battlefleet/shared/rules";
import type { FramePlayer, FrameRuntimeState, CockpitOutput, MessageOutput, AudioOutput, FrameOwnedTorpedo } from "./frameContracts";
import { t } from "../../locale/t";
import { FIRE_CONTROL_TARGET_RANGE as FIRE_CONTROL_RANGE_M } from "@battlefleet/shared/rules";
import { RADAR_DETECTION_RANGE, canIdentifyShip, SHIP_CONTACT_DISPLAY_RANGE } from "@battlefleet/shared/rules";
import { getAuthoritativeHullProfile } from "./shipProfileRuntime";
import type { CockpitRadarThreatLine, CockpitSsmRailLine, RadarBlipNorm } from "../presentation/CockpitModel";
import { RADAR_PLAN_SVG_BLIP_RADIUS, cockpitSsmRailTickLineNorthUp,
  esmLineTowardBlip, radarBlipNormalizedNorthUp } from "../hud/radarHudMath";

export type FrameCockpitState = Pick<FrameRuntimeState,
  "hudDue" | "lastHudLifeState" | "lastHudClass" | "lastHudRadar" | "lastHudMatchEnded" | "lastHudLevel">;

/** Builds cockpit/radar output only at HUD cadence, with the existing urgent-state bypass.
 * World lists are borrowed synchronously; only actual HUD output arrays are allocated. */
export function updateFrameCockpit(options: {
  me: FramePlayer; p: FramePlayer; now: number; mySessionId: string; cfgMaxSpeed: number;
  matchEnded: boolean; matchRemainingSecRaw: number; playerList: readonly FramePlayer[];
  torpedoList: readonly FrameOwnedTorpedo[] | null; adMissileSnapsScratch: readonly AirDefenseMissileSnapshot[];
  adPlayerSnapshots: readonly AirDefensePlayerSnapshot[]; state: FrameCockpitState;
  cockpit: CockpitOutput; gameMessageHud: Pick<MessageOutput, "showToast">;
  fireControlTargetId?: string | null;
  autofireEnabled?: boolean;
  gameAudio: Pick<AudioOutput, "levelUp">; toShortSession: (id: string) => string;
}): void {
  const { me, p, now, mySessionId, cfgMaxSpeed, matchEnded, matchRemainingSecRaw, playerList,
    torpedoList, adMissileSnapsScratch, adPlayerSnapshots, state, cockpit, gameMessageHud,
    gameAudio, toShortSession } = options;
  const urgentHud = state.lastHudLifeState !== me.lifeState || state.lastHudClass !== me.shipClass ||
    state.lastHudRadar !== (me.radarActive !== false) || state.lastHudMatchEnded !== matchEnded;
  if (state.hudDue(now, urgentHud)) {
    state.lastHudLifeState = me.lifeState;
    state.lastHudClass = me.shipClass;
    state.lastHudRadar = me.radarActive !== false;
    state.lastHudMatchEnded = matchEnded;
    const progLevel = Math.min(
      PROGRESSION_MAX_LEVEL,
      Math.max(1, Math.floor(typeof me.level === "number" ? me.level : 1)),
    );
    const progXp = typeof me.xp === "number" ? me.xp : 0;
    const xpSeg = progressionXpToNextLevel(progLevel, progXp);
    const xpLine =
      progLevel >= PROGRESSION_MAX_LEVEL
        ? t("hud.xpMax")
        : t("hud.xpProgress", { current: xpSeg.intoLevel, need: xpSeg.need });
    /** Während Respawn-Warte: Server behält Wrack-Rumpf in `shipClass`; HUD zeigt Zielklasse nach Degradierung. */
    const cockpitClassId = normalizeShipClassId(
      me.lifeState === PlayerLifeState.AwaitingRespawn
        ? shipClassIdForProgressionLevel(progLevel)
        : me.shipClass,
    ) as ShipClassId;
    const profShip = getShipClassProfile(cockpitClassId);
    const hullVis = getAuthoritativeHullProfile(cockpitClassId);
    const maxSp =
      cfgMaxSpeed *
      profShip.movementSpeedMul *
      progressionMovementScale(progLevel).maxSpeedFactor;
    const speedKn = p.speed / SPEED_FEEL_FACTOR;
    const maxSpeedKn = maxSp / SPEED_FEEL_FACTOR;
    let ownedMines = 0;
    if (torpedoList) {
      // "TorpedoList" ist im aktuellen Feature semantisch die aktive Minenliste.
      for (const t of torpedoList) {
        if (t.ownerId === mySessionId) ownedMines++;
      }
    }

    if (progLevel > state.lastHudLevel) {
      const rankEn = progressionNavalRankEn(progLevel);
      gameMessageHud.showToast(t("toast.levelRank", { level: progLevel, rank: rankEn }), "info", 3600);
      gameAudio.levelUp();
    }
    state.lastHudLevel = progLevel;

    const radarBlips: RadarBlipNorm[] = [];
    const esmLines: { x1: number; y1: number; x2: number; y2: number; stroke?: string }[] = [];
    const radarThreatLines: CockpitRadarThreatLine[] = [];
    const ssmRailLines: CockpitSsmRailLine[] = [];
    let radarVisible = false;
    const ownRadarActive = me.radarActive !== false;
    if (!matchEnded && me.lifeState !== PlayerLifeState.AwaitingRespawn) {
      radarVisible = true;
      const launchers = hullVis?.fixedSeaSkimmerLaunchers;
      if (launchers?.length) {
        for (const L of launchers) {
          const yb = launcherYawRadFromBow(L);
          const line = cockpitSsmRailTickLineNorthUp(p.headingRad, yb, {
            rimPx: RADAR_PLAN_SVG_BLIP_RADIUS,
          });
          let stroke: string | undefined;
          if (L.side === "port") stroke = "rgba(255, 72, 88, 0.94)";
          else if (L.side === "starboard") stroke = "rgba(72, 255, 128, 0.94)";
          else stroke = "rgba(210, 225, 255, 0.85)";
          ssmRailLines.push({ ...line, stroke });
        }
      }
      for (const other of playerList) {
        if (other.id === mySessionId) continue;
        if (other.lifeState === PlayerLifeState.AwaitingRespawn) continue;
        const designated = other.id === options.fireControlTargetId;
        const b = radarBlipNormalizedNorthUp(p.x, p.z, other.x, other.z, SHIP_CONTACT_DISPLAY_RANGE);
        if (b && ((designated && Math.hypot(other.x - p.x, other.z - p.z) <= FIRE_CONTROL_RANGE_M) || canIdentifyShip({ x: p.x, z: p.z, radarActive: ownRadarActive }, other))) {
          radarBlips.push(designated ? { ...b, designated: true } : b);
        }
        const emitterOn = other.radarActive !== false;
        if (emitterOn) {
          const esmRangeWorld = esmDetectionRange(other.shipClass);
          const bEsm = radarBlipNormalizedNorthUp(p.x, p.z, other.x, other.z, esmRangeWorld);
          if (bEsm) {
            const line = esmLineTowardBlip(bEsm);
            esmLines.push({ ...line, stroke: esmEmitterStrokeCss(other.shipClass) });
          }
        }
      }
      for (let ri = 0; ri < adMissileSnapsScratch.length; ri++) {
        const m = adMissileSnapsScratch[ri]!;
        if (m.ownerId === mySessionId) continue;
        if (resolveAirDefenseDefenderIdForMissile(m, adPlayerSnapshots) !== mySessionId) {
          continue;
        }
        const bM = radarBlipNormalizedNorthUp(p.x, p.z, m.x, m.z, RADAR_DETECTION_RANGE);
        if (!bM) continue;
        const line = esmLineTowardBlip(bM);
        const lockedOnMe = m.targetId === mySessionId;
        radarThreatLines.push({ ...line, dashed: !lockedOnMe });
      }
    }

    const shipClassId = cockpitClassId;
    const magCaps = getAswmMagazineFromProfile(hullVis, shipClassId);
    const aswmMagPortCap = magCaps.port;
    const aswmMagStarboardCap = magCaps.starboard;
    const remPort =
      typeof me.aswmRemainingPort === "number" && Number.isFinite(me.aswmRemainingPort)
        ? me.aswmRemainingPort
        : 0;
    const remSb =
      typeof me.aswmRemainingStarboard === "number" && Number.isFinite(me.aswmRemainingStarboard)
        ? me.aswmRemainingStarboard
        : 0;
    const aimWorld = Math.atan2(me.aimX - p.x, me.aimZ - p.z);
    let mainMountTrainRad = aimWorld - p.headingRad;
    while (mainMountTrainRad > Math.PI) mainMountTrainRad -= Math.PI * 2;
    while (mainMountTrainRad < -Math.PI) mainMountTrainRad += Math.PI * 2;

    const alive = me.hp > 0 && me.lifeState !== PlayerLifeState.AwaitingRespawn && !matchEnded;
    const gunMounts = listPrimaryArtilleryMountConfigs(hullVis, profShip.artilleryArcHalfAngleRad);
    const target = alive && radarVisible ? playerList.find(other => other.id === options.fireControlTargetId && other.hp > 0 && other.lifeState !== PlayerLifeState.AwaitingRespawn && Math.hypot(other.x - p.x, other.z - p.z) <= FIRE_CONTROL_RANGE_M) : undefined;
    const bearing = target ? Math.atan2(target.x - p.x, target.z - p.z) - p.headingRad : 0;
    const installed = new Set(hullVis?.mountSlots.map(slot => equippedMount(slot, hullVis!)?.weaponId));
    const airDefense = (["softkill", "ciws", "pdms", "sam"] as const).filter(kind => kind === "softkill" || installed.has(kind)).map(kind => ({
      system: kind.toUpperCase() as "CIWS" | "PDMS" | "SAM" | "SOFTKILL",
      status: !alive ? "Offline" as const : kind === "sam" && me.radarActive === false ? "Radar off" as const :
        me.adCooldownMask === undefined ? "—" as const : (me.adCooldownMask & ({ ciws: 1, pdms: 2, sam: 4, softkill: 8 }[kind])) ? "Cooldown" as const : "Active" as const,
    }));
    cockpit.update({
      targetStatus: target ? { name: target.displayName?.trim() || toShortSession(target.id),
        shipClass: getShipClassProfile(normalizeShipClassId(target.shipClass)).labelDe,
        canEngage: canPrimaryArtilleryEngageAimAtWorldPoint(p.x, p.z, p.headingRad, p.shipClass, target.x, target.z),
      } : undefined,
      gunStatus: gunMounts.length ? { autofire: !!options.autofireEnabled,
        inRange: target ? gunMounts.some(mount => {
          const muzzle = mountSlotMuzzleWorld(hullVis!, mount.slotId, p.x, p.z, p.headingRad, { x: target.x, z: target.z });
          const distance = Math.hypot(target.x - muzzle.x, target.z - muzzle.z);
          return distance >= ARTILLERY_MIN_RANGE && distance <= ARTILLERY_MAX_RANGE;
        }) : null,
        inArc: target ? gunMounts.some(mount => isYawWithinMountFireSector(bearing, mount.sector)) : null,
      } : undefined,
      airDefense,
      scoreboard: playerList.map(player => ({
        id: player.id, name: player.displayName?.trim() || toShortSession(player.id),
        shipClass: getShipClassProfile(normalizeShipClassId(player.shipClass)).labelDe,
        shipClassId: normalizeShipClassId(player.shipClass), level: player.level,
        rank: progressionNavalRankEn(player.level), score: player.score, kills: player.kills, isMe: player.id === mySessionId,
      })).sort((a, b) => b.score - a.score || b.kills - a.kills || a.id.localeCompare(b.id)),
      speed: speedKn,
      maxSpeed: maxSpeedKn,
      headingRad: p.headingRad,
      worldX: p.x,
      worldZ: p.z,
      mainMountTrainRad,
      aswmMagPortCap,
      aswmMagStarboardCap,
      aswmRemainingPort: remPort,
      aswmRemainingStarboard: remSb,
      hp: p.hp,
      maxHp: p.maxHp,
      primaryCooldownSec: p.primaryCooldownSec,
      secondaryCooldownSec: me.secondaryCooldownSec,
      torpedoCooldownSec: me.torpedoCooldownSec,
      mineCount: ownedMines,
      mineMaxCount: profShip.torpedoMaxPerOwner,
      respawnCountdownSec: me.respawnCountdownSec,
      spawnProtectionSec: me.spawnProtectionSec,
      matchRemainingSec: matchEnded ? 0 : matchRemainingSecRaw,
      score: typeof me.score === "number" ? me.score : 0,
      kills: typeof me.kills === "number" ? me.kills : 0,
      rankLabelEn: progressionNavalRankEn(progLevel),
      xpLine,
      shipClassLabel: profShip.labelDe,
      playerDisplayName:
        typeof me.displayName === "string" && me.displayName.trim().length > 0
          ? me.displayName.trim()
          : toShortSession(me.id),
      shipClassId,
      radarBlips,
      radarVisible,
      ownRadarActive,
      esmLines,
      radarThreatLines,
      ssmRailLines: radarVisible ? ssmRailLines : [],
    });
  }
}
