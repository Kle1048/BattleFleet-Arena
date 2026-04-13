import * as THREE from "three";
import {
  ARTILLERY_RANGE,
  aimDirectionYawFromBowRad,
  clampYawToMountSector,
  forwardXZ,
  getShipClassProfile,
  getShipHullProfileByClass,
  inferMountTrainBaseYawFromBow,
  isYawWithinMountFireSector,
  PlayerLifeState,
  resolveEffectiveMountFireSector,
  normalizeShipClassId,
  SHIP_CLASS_FAC,
  wrapPi,
  type MountFireSector,
  type ShipClassId,
} from "@battlefleet/shared";
import { AssetUrls } from "../runtime/assetCatalog";
import { getShipDebugTuning } from "../runtime/shipDebugTuning";
import {
  OVERLAY_RENDER_ORDER,
  SHIP_BOW_Z,
  SHIP_STERN_Z,
} from "./createGameScene";
import { VisualColorTokens, createShipHullAliveMaterial } from "../runtime/materialLibrary";
import { getEffectiveHullProfile, isShipHitboxDebugVisible } from "../runtime/shipProfileRuntime";
import { clonePreparedShipHull, collectHullMeshMaterials } from "./shipGltfHull";
import { createShipHitboxWireframe } from "./shipHitboxDebug";
import { createLocalShipRangeRingsGroup } from "./shipRangeRingsDebug";
import { attachMountVisualsToHullModel } from "./shipMountVisuals";
import { assignToOverlayLayer } from "../runtime/renderOverlayLayers";
import { worldToRenderX } from "../runtime/renderCoords";

const DECK_Y = 1.2;
const AIM_TURRET_GRAY = 0xb8bcc4;
/** Zweite (weitere) Mount-Ziellinie — leicht von der ersten unterscheidbar. */
const AIM_DEBUG_LINE_COLOR_ALT = 0x88c8ff;
const AIM_DEBUG_LINE_OUT_OF_SECTOR = 0xff4d4d;
const SHIP_SPRITE_BASE_WORLD_HEIGHT = SHIP_BOW_Z - SHIP_STERN_Z;
/** Kiel knapp über der Wasseroberfläche — Rumpf als Prisma (Dreieck × Höhe in Y). */
const HULL_KEEL_Y = 0.28;
const shipTextureLoader = new THREE.TextureLoader();
let cachedSchnellbootTexture: THREE.Texture | null = null;
let spriteLoadAttempted = false;

function getSchnellbootTexture(): THREE.Texture | null {
  if (cachedSchnellbootTexture) return cachedSchnellbootTexture;
  if (!spriteLoadAttempted) {
    spriteLoadAttempted = true;
    cachedSchnellbootTexture = shipTextureLoader.load(
      AssetUrls.shipSchnellboot256,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
      },
      undefined,
      () => {
        cachedSchnellbootTexture = null;
      },
    );
  }
  return cachedSchnellbootTexture;
}

function shipSpriteWorldWidthFromTexture(texture: THREE.Texture): number {
  const image = texture.image as { width?: number; height?: number } | undefined;
  const pixelWidth = image?.width;
  const pixelHeight = image?.height;
  if (!pixelWidth || !pixelHeight) {
    return SHIP_SPRITE_BASE_WORLD_HEIGHT;
  }
  const aspect = pixelWidth / pixelHeight;
  return SHIP_SPRITE_BASE_WORLD_HEIGHT * aspect;
}

export function applyShipVisualRuntimeTuning(vis: ShipVisual): void {
  const user = getShipDebugTuning();
  const def = getEffectiveHullProfile(vis.shipClassId)?.clientVisualTuningDefaults;
  const spriteScale = def?.spriteScale ?? user.spriteScale;
  const gltfHullYOffset = def?.gltfHullYOffset ?? user.gltfHullYOffset;
  const gltfHullOffsetX = def?.gltfHullOffsetX ?? 0;
  const gltfHullOffsetZ = def?.gltfHullOffsetZ ?? 0;
  vis.aimLine.position.set(0, 0, 0);
  if (vis.hullSprite) {
    vis.hullSprite.scale.setScalar(spriteScale);
  }
  if (vis.hullModel) {
    vis.hullModel.scale.setScalar(spriteScale);
    vis.hullModel.position.set(
      vis.hullGltfBaseX + gltfHullOffsetX,
      vis.hullGltfBaseY + gltfHullYOffset,
      vis.hullGltfBaseZ + gltfHullOffsetZ,
    );
  }
  if (vis.hitboxLogicalGroup && vis.shipHullScale > 1e-8) {
    /* Hitbox nur aus JSON (center/halfExtents) — unabhängig von shipPivotLocalZ (rein visuell / Welt-Offset). */
    vis.hitboxLogicalGroup.position.set(0, 0, 0);
    vis.hitboxLogicalGroup.visible = isShipHitboxDebugVisible();
  }
  if (vis.weaponGuideGroup && !user.showWeaponArc) {
    vis.weaponGuideGroup.visible = false;
  }
  if (vis.rangeRingsGroup) {
    vis.rangeRingsGroup.visible = user.showRangeRings;
  }
}

function createHullPrismGeometry(halfBeam: number): THREE.BufferGeometry {
  const bowZ = SHIP_BOW_Z;
  const sternZ = SHIP_STERN_Z;
  const y0 = HULL_KEEL_Y;
  const y1 = DECK_Y;
  // Unten / oben: Bug +Z, Backbord −X, Steuerbord +X (wie bisher).
  const positions = new Float32Array([
    0,
    y0,
    bowZ,
    -halfBeam,
    y0,
    sternZ,
    halfBeam,
    y0,
    sternZ,
    0,
    y1,
    bowZ,
    -halfBeam,
    y1,
    sternZ,
    halfBeam,
    y1,
    sternZ,
  ]);
  const indices = [
    // Deck (+Y)
    3, 4, 5,
    // Kiel (−Y)
    0, 2, 1,
    // Backbord
    0, 1, 4, 0, 4, 3,
    // Steuerbord
    0, 3, 5, 0, 5, 2,
    // Heck
    1, 2, 5, 1, 5, 4,
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export type ShipVisual = {
  /** Für klassenspezifische Rumpf-Tuning-Defaults (JSON). */
  shipClassId: ShipClassId;
  group: THREE.Group;
  /** Debug-Ziellinie Mündung→Ziel (`THREE.Line`); Kind von `aimLine`. */
  aimLine: THREE.Group;
  hull: THREE.Mesh;
  hullSprite: THREE.Mesh | null;
  /** Optional: geklontes GLB — ersetzt Sprite/Prisma. */
  hullModel: THREE.Group | null;
  /** Position des GLB nach `prepare` (vor JSON-/Debug-Offsets). */
  hullGltfBaseX: number;
  hullGltfBaseY: number;
  hullGltfBaseZ: number;
  /** Materialien für GLB-Life-State (gleiche Indizes wie Meshes im Modell). */
  hullGltfMaterials: THREE.Material[];
  /** Mount-/System-GLBs (gleiche Life-State-Behandlung wie Rumpf). */
  mountGltfMaterials: THREE.Material[];
  /** Artillerie: Yaw-Gruppe am Mount zur Feuerrichtung. */
  artilleryTrainGroups: THREE.Group[];
  /** Parallel zu `artilleryTrainGroups`: Mount-Anchor (gleiche Pivot-Geometrie wie Aim-Linie). */
  artilleryTrainMountAnchors: THREE.Group[];
  /** Parallel: Flugabwehr-Zug (SAM/CIWS/PDMS) — bei Layered Defence Ziel = ASuM statt Aim. */
  artilleryTrainIsAirDefense: boolean[];
  /** `mount_*`-Sockets in Profil-Reihenfolge — parallele Debug-Linien zum Zielpunkt. */
  aimLineMountAnchors: THREE.Group[];
  /** Parallel zu `aimLineMountAnchors`: Slot-ID zur Zuordnung autoritativer Profile. */
  aimLineMountSlotIds: string[];
  /** Parallel zu `aimLineMountAnchors`: Feuersektor für Mount oder `null`. */
  aimLineMountFireSectors: Array<MountFireSector | null>;
  /** Parallel zu `aimLineMountAnchors`: Nullrichtung des Mounts (Bug=0, Heck=π). */
  aimLineMountBaseYawFromBow: number[];
  /** Parallel zu `artilleryTrainGroups` — Server-/Profil-Feuersektor. */
  mountTrainFireSectors: MountFireSector[];
  /** Parallel: Bug=0 / Heck=π — Modell-Basis am Socket. */
  mountTrainBaseYawFromBow: number[];
  /** Nur lokaler Spieler: Feuerbogen — bei Zerstörung ausgeblendet. */
  weaponGuideGroup: THREE.Group | null;
  /** Nur lokaler Spieler: 100-m-Abstandsringe (Debug). */
  rangeRingsGroup: THREE.Group | null;
  /**
   * Server-/JSON-Hitbox (Kanten), Kind von `group` mit `1/hullScale` — unabhängig vom GLB.
   * Nur `collisionHitbox.center` / halfExtents; kein `shipPivotLocalZ` (Pivot ist nur für Darstellung/Welt-Offset).
   */
  hitboxLogicalGroup: THREE.Group | null;
  /** `ShipClassProfile.hullScale` — für Hitbox-Pivot. */
  shipHullScale: number;
  /**
   * Cache für `setShipVisualLifeState`: vermeidet pro Frame volle Material-Neusetzung bei unverändertem Zustand.
   */
  _lastLifeVisualKey?: string;
  /** Zuletzt angewendete `getShipDebugTuningGeneration()` — vermeidet redundantes `applyShipVisualRuntimeTuning`. */
  debugTuningGenApplied?: number;
};

function hullAliveMaterial(isLocal: boolean): THREE.MeshStandardMaterial {
  return createShipHullAliveMaterial(isLocal);
}

function forEachAimDebugLineMaterial(
  vis: ShipVisual,
  fn: (mat: THREE.LineBasicMaterial, index: number) => void,
): void {
  vis.aimLine.children.forEach((c, i) => {
    const m = (c as THREE.Line).material as THREE.LineBasicMaterial | undefined;
    if (m) fn(m, i);
  });
}

function resolveAimLineSectorForIndex(
  vis: ShipVisual,
  index: number,
): MountFireSector | null {
  const slotId = vis.aimLineMountSlotIds[index];
  const hull = getShipHullProfileByClass(vis.shipClassId);
  const classArc = getShipClassProfile(vis.shipClassId).artilleryArcHalfAngleRad;
  const slot = slotId ? hull?.mountSlots.find((s) => s.id === slotId) : undefined;

  let baseSector =
    vis.aimLineMountFireSectors[index] ?? vis.mountTrainFireSectors[index] ?? null;
  // Autoritativ wie Server: falls Client-Patch/Visual-Profil abweicht, Slot-Sektor aus Shared-Basis nutzen.
  if (slot && hull) baseSector = resolveEffectiveMountFireSector(slot, hull, classArc);
  if (!baseSector) return null;
  if (baseSector.kind !== "symmetric") return baseSector;
  if (baseSector.centerYawRadFromBow !== undefined) return baseSector;
  const baseYaw = slot
    ? inferMountTrainBaseYawFromBow(slot)
    : (vis.aimLineMountBaseYawFromBow[index] ?? vis.mountTrainBaseYawFromBow[index] ?? 0);
  return { ...baseSector, centerYawRadFromBow: baseYaw };
}

function applyGltfHullMaterialsLifeState(
  materials: THREE.Material[],
  wreck: boolean,
  shielded: boolean,
  isLocal: boolean,
): void {
  for (const mat of materials) {
    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
      if (wreck) {
        mat.color.setHex(VisualColorTokens.shipHullWreck);
        mat.metalness = 0.04;
        mat.roughness = 0.92;
        mat.transparent = true;
        mat.opacity = 0.4;
        mat.emissive.setHex(VisualColorTokens.shipHullWreckEmissive);
        mat.emissiveIntensity = 0.45;
        mat.depthWrite = false;
      } else if (shielded) {
        mat.color.setHex(
          isLocal ? VisualColorTokens.shipHullShieldedLocal : VisualColorTokens.shipHullShieldedRemote,
        );
        mat.metalness = 0.18;
        mat.roughness = 0.55;
        mat.transparent = false;
        mat.opacity = 1;
        mat.depthWrite = true;
        mat.emissive.setHex(VisualColorTokens.shipHullShieldedEmissive);
        mat.emissiveIntensity = 0.55;
      } else {
        const hasAlbedoMap = mat.map != null;
        if (hasAlbedoMap) {
          /** `color` multipliziert die Base-Color-Map — fast weiß, leichter Local/Remote-Ton. */
          if (isLocal) {
            mat.color.setRGB(0.94, 0.96, 1);
          } else {
            mat.color.setRGB(1, 0.96, 0.94);
          }
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
          mat.transparent = false;
          mat.opacity = 1;
          mat.depthWrite = true;
        } else {
          mat.color.setHex(
            isLocal ? VisualColorTokens.shipHullLocalAlive : VisualColorTokens.shipHullRemoteAlive,
          );
          mat.metalness = 0.12;
          mat.roughness = 0.72;
          mat.emissive.setHex(0x000000);
          mat.emissiveIntensity = 0;
          mat.transparent = false;
          mat.opacity = 1;
          mat.depthWrite = true;
        }
      }
      continue;
    }
    if (mat instanceof THREE.MeshBasicMaterial) {
      if (wreck) {
        mat.color.setHex(0x6e7884);
        mat.opacity = 0.45;
        mat.transparent = true;
        mat.depthWrite = false;
      } else if (shielded) {
        mat.color.setHex(0xdef8ff);
        mat.opacity = 0.95;
        mat.transparent = true;
        mat.depthWrite = false;
      } else {
        mat.color.setHex(0xffffff);
        mat.opacity = 1;
        mat.transparent = true;
        mat.depthWrite = false;
      }
    }
  }
}

/**
 * Darstellung „zerstört“ (`awaiting_respawn`) vs. operativ — Materialien & Waffenführung.
 * Y-Versatz (Einsinken) setzt der Aufrufer auf `group.position.y`.
 */
export function setShipVisualLifeState(
  vis: ShipVisual,
  lifeState: string,
  isLocal: boolean,
): void {
  const tune = getShipDebugTuning();
  const showArc = tune.showWeaponArc;
  const showRings = tune.showRangeRings;
  const lifeVisualKey = `${lifeState}|${showArc ? "1" : "0"}|${showRings ? "1" : "0"}`;
  if (vis._lastLifeVisualKey === lifeVisualKey) return;
  vis._lastLifeVisualKey = lifeVisualKey;

  const wreck = lifeState === PlayerLifeState.AwaitingRespawn;
  const shielded = lifeState === PlayerLifeState.SpawnProtected;
  const hullMat = vis.hull.material as THREE.MeshStandardMaterial;
  const spriteMat =
    vis.hullSprite && vis.hullSprite.material instanceof THREE.MeshBasicMaterial
      ? vis.hullSprite.material
      : null;

  if (vis.hullGltfMaterials.length > 0) {
    applyGltfHullMaterialsLifeState(vis.hullGltfMaterials, wreck, shielded, isLocal);
  }
  if (vis.mountGltfMaterials.length > 0) {
    applyGltfHullMaterialsLifeState(vis.mountGltfMaterials, wreck, shielded, isLocal);
  }

  if (wreck) {
    hullMat.color.setHex(VisualColorTokens.shipHullWreck);
    hullMat.metalness = 0.04;
    hullMat.roughness = 0.92;
    hullMat.transparent = true;
    hullMat.opacity = 0.4;
    hullMat.emissive.setHex(VisualColorTokens.shipHullWreckEmissive);
    hullMat.emissiveIntensity = 0.45;
    hullMat.depthWrite = false;
    if (spriteMat) {
      spriteMat.color.setHex(0x6e7884);
      spriteMat.opacity = 0.45;
      spriteMat.transparent = true;
      spriteMat.depthWrite = false;
    }

    forEachAimDebugLineMaterial(vis, (aimMat) => {
      aimMat.transparent = true;
      aimMat.opacity = isLocal ? 0.08 : 0.06;
    });

    if (vis.weaponGuideGroup) {
      vis.weaponGuideGroup.visible = false;
    }
    if (vis.rangeRingsGroup) {
      vis.rangeRingsGroup.visible = false;
    }
    return;
  }

  if (shielded) {
    hullMat.color.setHex(
      isLocal ? VisualColorTokens.shipHullShieldedLocal : VisualColorTokens.shipHullShieldedRemote,
    );
    hullMat.metalness = 0.18;
    hullMat.roughness = 0.55;
    hullMat.transparent = false;
    hullMat.opacity = 1;
    hullMat.depthWrite = true;
    hullMat.emissive.setHex(VisualColorTokens.shipHullShieldedEmissive);
    hullMat.emissiveIntensity = 0.55;
    if (spriteMat) {
      spriteMat.color.setHex(0xdef8ff);
      spriteMat.opacity = 0.95;
      spriteMat.transparent = true;
      spriteMat.depthWrite = false;
    }

    forEachAimDebugLineMaterial(vis, (aimMat) => {
      aimMat.transparent = true;
      aimMat.color.setHex(AIM_TURRET_GRAY);
      aimMat.opacity = isLocal ? 1 : 0.92;
    });

    if (vis.weaponGuideGroup) {
      vis.weaponGuideGroup.visible = tune.showWeaponArc;
      vis.weaponGuideGroup.traverse((o) => {
        const l = o as THREE.Line;
        const m = l.material as THREE.LineBasicMaterial | undefined;
        if (m) {
          m.color.setHex(VisualColorTokens.shipGuideShield);
          m.opacity = 0.55;
          m.transparent = true;
        }
      });
    }
    if (vis.rangeRingsGroup) {
      vis.rangeRingsGroup.visible = tune.showRangeRings;
    }
    return;
  }

  if (vis.weaponGuideGroup) {
    vis.weaponGuideGroup.traverse((o) => {
      const l = o as THREE.Line;
      const m = l.material as THREE.LineBasicMaterial | undefined;
      if (m) {
        m.color.setHex(VisualColorTokens.shipAimLocal);
        m.opacity = 0.32;
      }
    });
  }

  hullMat.color.setHex(
    isLocal ? VisualColorTokens.shipHullLocalAlive : VisualColorTokens.shipHullRemoteAlive,
  );
  hullMat.metalness = 0.12;
  hullMat.roughness = 0.72;
  hullMat.emissive.setHex(0x000000);
  hullMat.emissiveIntensity = 0;
  hullMat.transparent = false;
  hullMat.opacity = 1;
  hullMat.depthWrite = true;
  if (spriteMat) {
    spriteMat.color.setHex(0xffffff);
    spriteMat.opacity = 1;
    spriteMat.transparent = true;
    spriteMat.depthWrite = false;
  }

  const aimOpacity = isLocal ? 0.95 : 0.88;
  forEachAimDebugLineMaterial(vis, (aimMat, i) => {
    aimMat.color.setHex(i === 0 ? AIM_TURRET_GRAY : AIM_DEBUG_LINE_COLOR_ALT);
    aimMat.opacity = aimOpacity;
  });

  if (vis.weaponGuideGroup) {
    vis.weaponGuideGroup.visible = tune.showWeaponArc;
  }
  if (vis.rangeRingsGroup) {
    vis.rangeRingsGroup.visible = tune.showRangeRings;
  }
}

/**
 * Ein Schiff für die Szene (eigene Gruppe, noch nicht scene.add).
 * **Ziellinie:** Debug-Linie vom Artillerie-Socket zum Aim-Punkt (`updateAimMountToTargetDebugLine`).
 */
export function createShipVisual(options: {
  isLocal: boolean;
  shipClassId?: string;
  /** Geladenes GLB (Szene); pro Schiff geklont. Ohne: Sprite oder Prisma. */
  hullGltfSource?: THREE.Group | null;
  /** Pro `visual_*`-Id aus Profil-Loadout — geklontes GLB-Template. */
  getMountGltfTemplate?: (visualId: string) => THREE.Group | null;
}): ShipVisual {
  const cid = normalizeShipClassId(options.shipClassId ?? SHIP_CLASS_FAC);
  const prof = getShipClassProfile(cid);
  const hullProfile = getEffectiveHullProfile(cid);
  const group = new THREE.Group();
  group.scale.setScalar(prof.hullScale);

  const halfBeam = 15;
  const hullGeom = createHullPrismGeometry(halfBeam);
  const hull = new THREE.Mesh(hullGeom, hullAliveMaterial(options.isLocal));
  hull.castShadow = true;
  hull.receiveShadow = true;
  group.add(hull);

  let hullModel: THREE.Group | null = null;
  let hullGltfBaseX = 0;
  let hullGltfBaseY = 0;
  let hullGltfBaseZ = 0;
  let hullGltfMaterials: THREE.Material[] = [];
  let mountGltfMaterials: THREE.Material[] = [];
  let artilleryTrainGroups: THREE.Group[] = [];
  let artilleryTrainMountAnchors: THREE.Group[] = [];
  let artilleryTrainIsAirDefense: boolean[] = [];
  let mountTrainFireSectors: MountFireSector[] = [];
  let mountTrainBaseYawFromBow: number[] = [];
  let aimLineMountAnchors: THREE.Group[] = [];
  let aimLineMountSlotIds: string[] = [];
  let aimLineMountFireSectors: Array<MountFireSector | null> = [];
  let aimLineMountBaseYawFromBow: number[] = [];
  let hullSprite: THREE.Mesh | null = null;

  if (options.hullGltfSource) {
    hullModel = clonePreparedShipHull(options.hullGltfSource);
    hullGltfBaseX = hullModel.position.x;
    hullGltfBaseY = hullModel.position.y;
    hullGltfBaseZ = hullModel.position.z;
    hullGltfMaterials = collectHullMeshMaterials(hullModel);
    if (hullProfile && options.getMountGltfTemplate) {
      const mounted = attachMountVisualsToHullModel(hullModel, hullProfile, options.getMountGltfTemplate);
      mountGltfMaterials = mounted.materials;
      artilleryTrainGroups = mounted.artilleryTrainGroups;
      artilleryTrainMountAnchors = mounted.artilleryTrainMountAnchors;
      artilleryTrainIsAirDefense = mounted.artilleryTrainIsAirDefense;
      mountTrainFireSectors = mounted.mountTrainFireSectors;
      mountTrainBaseYawFromBow = mounted.mountTrainBaseYawFromBow;
      aimLineMountAnchors = mounted.aimLineMountAnchors;
      aimLineMountSlotIds = mounted.aimLineMountSlotIds;
      aimLineMountFireSectors = mounted.aimLineMountFireSectors;
      aimLineMountBaseYawFromBow = mounted.aimLineMountBaseYawFromBow;
    }
    const hvScale = hullProfile?.hullVisualScale ?? 1;
    if (Math.abs(hvScale - 1) > 1e-6) {
      hullModel.scale.multiplyScalar(hvScale);
    }
    group.add(hullModel);
    hull.visible = false;
  } else {
    const spriteTex = getSchnellbootTexture();
    if (spriteTex) {
      // Bei verfügbarem Asset wird der einfache Prisma-Rumpf visuell durch ein Sprite ersetzt.
      const spriteMat = new THREE.MeshBasicMaterial({
        map: spriteTex,
        transparent: true,
        alphaTest: 0.08,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const spriteGeom = new THREE.PlaneGeometry(
        shipSpriteWorldWidthFromTexture(spriteTex),
        SHIP_SPRITE_BASE_WORLD_HEIGHT,
      );
      hullSprite = new THREE.Mesh(spriteGeom, spriteMat);
      hullSprite.rotation.x = -Math.PI / 2;
      hullSprite.position.y = DECK_Y + 0.18;
      hull.visible = false;
      group.add(hullSprite);
    }
  }

  const aimOpacity = options.isLocal ? 0.95 : 0.88;
  const aimLineGroup = new THREE.Group();
  const aimLineCount = Math.max(aimLineMountAnchors.length, 1);
  for (let i = 0; i < aimLineCount; i++) {
    const aimDebugGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 1),
    ]);
    const aimDebugMat = new THREE.LineBasicMaterial({
      color: i === 0 ? AIM_TURRET_GRAY : AIM_DEBUG_LINE_COLOR_ALT,
      transparent: true,
      opacity: aimOpacity,
      fog: false,
      depthTest: false,
      depthWrite: false,
    });
    const aimDebugLine = new THREE.Line(aimDebugGeom, aimDebugMat);
    aimDebugLine.name = i === 0 ? "aimMountToTarget" : `aimMountToTarget_${i}`;
    aimDebugLine.renderOrder = OVERLAY_RENDER_ORDER;
    aimLineGroup.add(aimDebugLine);
  }
  assignToOverlayLayer(aimLineGroup);
  group.add(aimLineGroup);

  // Feuersektor-Overlay bewusst deaktiviert.
  const weaponGuideGroup: THREE.Group | null = null;

  let rangeRingsGroup: THREE.Group | null = null;
  if (options.isLocal) {
    rangeRingsGroup = createLocalShipRangeRingsGroup(prof.hullScale);
    rangeRingsGroup.visible = getShipDebugTuning().showRangeRings;
    group.add(rangeRingsGroup);
  }

  let hitboxLogicalGroup: THREE.Group | null = null;
  /** Hitbox unabhängig vom GLB: gleiche Einheiten wie Server — `group` hat `hullScale`, daher korrigieren. */
  if (hullProfile?.collisionHitbox) {
    const hitboxRoot = new THREE.Group();
    hitboxRoot.name = "shipHitboxLogical";
    const inv = prof.hullScale > 1e-8 ? 1 / prof.hullScale : 1;
    hitboxRoot.scale.setScalar(inv);
    hitboxRoot.add(createShipHitboxWireframe(hullProfile.collisionHitbox));
    hitboxRoot.position.set(0, 0, 0);
    hitboxRoot.visible = isShipHitboxDebugVisible();
    assignToOverlayLayer(hitboxRoot);
    group.add(hitboxRoot);
    hitboxLogicalGroup = hitboxRoot;
  }

  const vis: ShipVisual = {
    shipClassId: cid,
    group,
    aimLine: aimLineGroup,
    hull,
    hullSprite,
    hullModel,
    hullGltfBaseX,
    hullGltfBaseY,
    hullGltfBaseZ,
    hullGltfMaterials,
    mountGltfMaterials,
    artilleryTrainGroups,
    artilleryTrainMountAnchors,
    artilleryTrainIsAirDefense,
    mountTrainFireSectors,
    mountTrainBaseYawFromBow,
    aimLineMountAnchors,
    aimLineMountSlotIds,
    aimLineMountFireSectors,
    aimLineMountBaseYawFromBow,
    weaponGuideGroup,
    rangeRingsGroup,
    hitboxLogicalGroup,
    shipHullScale: prof.hullScale,
  };
  applyShipVisualRuntimeTuning(vis);
  return vis;
}

const _aimMountWorldA = new THREE.Vector3();
const _aimMountWorldB = new THREE.Vector3();

/** GLB-Mündung vs. `atan2` in der XZ-Ebene des Mount-Anchors. */
const ARTILLERY_TRAIN_MODEL_YAW_OFFSET_RAD = -Math.PI;

const _trainAimWorld = new THREE.Vector3();
const _trainMountWorld = new THREE.Vector3();
const _trainDirWorld = new THREE.Vector3();
const _trainAnchorQuat = new THREE.Quaternion();
const _trainDirAnchor = new THREE.Vector3();

/** Optionen für LW-Mounts: bei aktivem Layered Defence (E) Zielrichtung = ASuM, mit Sektor-Klemme. */
export type ArtilleryTrainAimOptions = {
  layeredDefenseActive: boolean;
  missileSim: { x: number; z: number } | null;
  shipSimX: number;
  shipSimZ: number;
  shipHeadingRad: number;
};

/**
 * Bug-relativer Mittelpunkt des LW-Feuersektors — **Nullstellung** (Profil: `fireSector.centerYawRadFromBow`,
 * sonst Socket-Heuristik `mountTrainBaseYawFromBow` / Z hinter Mittschiff ≈ π).
 */
function neutralBowYawRadForAawMount(
  sector: MountFireSector | undefined,
  baseYawFromBow: number,
): number {
  if (!sector) return baseYawFromBow;
  if (sector.kind === "symmetric") {
    return sector.centerYawRadFromBow ?? baseYawFromBow;
  }
  return wrapPi((sector.minYawRadFromBow + sector.maxYawRadFromBow) * 0.5);
}

function setAawTrainNeutralTowardSectorCenter(
  train: THREE.Group,
  anchor: THREE.Group,
  sector: MountFireSector | undefined,
  baseYawFromBow: number,
  shipSimX: number,
  shipSimZ: number,
  shipHeadingRad: number,
): void {
  const relCenter = neutralBowYawRadForAawMount(sector, baseYawFromBow);
  const f = forwardXZ(shipHeadingRad);
  const base = Math.atan2(f.x, f.z);
  const ang = base + relCenter;
  const ax = shipSimX + Math.sin(ang) * 8000;
  const az = shipSimZ + Math.cos(ang) * 8000;
  setTrainRotationTowardSimAim(train, anchor, ax, az);
}

function setTrainRotationTowardSimAim(
  train: THREE.Group,
  anchor: THREE.Group,
  aimSimX: number,
  aimSimZ: number,
): void {
  _trainAimWorld.set(worldToRenderX(aimSimX), 0, aimSimZ);
  anchor.getWorldPosition(_trainMountWorld);
  _trainDirWorld.subVectors(_trainAimWorld, _trainMountWorld);
  _trainDirWorld.y = 0;
  if (_trainDirWorld.lengthSq() < 1e-14) return;
  _trainDirWorld.normalize();
  anchor.getWorldQuaternion(_trainAnchorQuat);
  _trainAnchorQuat.invert();
  _trainDirAnchor.copy(_trainDirWorld).applyQuaternion(_trainAnchorQuat);
  const yawGeom = Math.atan2(_trainDirAnchor.x, _trainDirAnchor.z);
  train.rotation.y = wrapPi(yawGeom + ARTILLERY_TRAIN_MODEL_YAW_OFFSET_RAD);
}

/**
 * Geschütz: Mount→Aim. Flugabwehr (SAM/CIWS/PDMS): bei Layered Defence + ASuM zum Flugkörper (Sektor-Klemme);
 * sonst **Nullstellung** = Richtung Feuersektor-Mitte / Bug-Null (`fac.json` u. a.), nicht `rotation.y = 0`.
 */
export function updateArtilleryTrainRotationsFromAim(
  vis: ShipVisual,
  aimSimX: number,
  aimSimZ: number,
  aimOptions?: ArtilleryTrainAimOptions,
): void {
  const trains = vis.artilleryTrainGroups;
  const anchors = vis.artilleryTrainMountAnchors;
  const aaw = vis.artilleryTrainIsAirDefense;
  const sectors = vis.mountTrainFireSectors;
  const bases = vis.mountTrainBaseYawFromBow;
  for (let i = 0; i < trains.length; i++) {
    const train = trains[i];
    const anchor = anchors[i];
    if (!train || !anchor) continue;

    if (aaw[i] !== true) {
      setTrainRotationTowardSimAim(train, anchor, aimSimX, aimSimZ);
      continue;
    }

    if (aimOptions?.layeredDefenseActive && aimOptions.missileSim) {
      const relRaw = aimDirectionYawFromBowRad(
        aimOptions.shipSimX,
        aimOptions.shipSimZ,
        aimOptions.shipHeadingRad,
        aimOptions.missileSim.x,
        aimOptions.missileSim.z,
      );
      if (relRaw !== null) {
        const sector = sectors[i];
        const relC = sector ? clampYawToMountSector(relRaw, sector) : relRaw;
        const f = forwardXZ(aimOptions.shipHeadingRad);
        const base = Math.atan2(f.x, f.z);
        const ang = base + relC;
        const ax = aimOptions.shipSimX + Math.sin(ang) * 8000;
        const az = aimOptions.shipSimZ + Math.cos(ang) * 8000;
        setTrainRotationTowardSimAim(train, anchor, ax, az);
        continue;
      }
    }

    if (aimOptions) {
      setAawTrainNeutralTowardSectorCenter(
        train,
        anchor,
        sectors[i],
        bases[i] ?? 0,
        aimOptions.shipSimX,
        aimOptions.shipSimZ,
        aimOptions.shipHeadingRad,
      );
    } else {
      train.rotation.y = 0;
    }
  }
}

/**
 * Debug-Ziellinie: vom Artillerie-Mount (Welt) zum Aim-Punkt (Simulations-XZ, Y=0).
 * `aimSimX`/`aimSimZ` wie `PlayerState.aimX`/`aimZ` bzw. Maus-Treffer.
 */
export function updateAimMountToTargetDebugLine(
  vis: ShipVisual,
  shipSimX: number,
  shipSimZ: number,
  shipHeadingRad: number,
  aimSimX: number,
  aimSimZ: number,
): string[] {
  const debug: string[] = [];
  const anchors = vis.aimLineMountAnchors;
  _aimMountWorldB.set(worldToRenderX(aimSimX), 0, aimSimZ);
  const g = vis.group;
  g.worldToLocal(_aimMountWorldB);
  const bx = _aimMountWorldB.x;
  const by = _aimMountWorldB.y;
  const bz = _aimMountWorldB.z;

  for (let i = 0; i < vis.aimLine.children.length; i++) {
    const line = vis.aimLine.children[i] as THREE.Line | undefined;
    if (!line?.geometry) continue;
    const anchor = anchors[i];
    if (!anchor) {
      line.visible = false;
      debug.push(`M${i}: no-anchor`);
      continue;
    }
    anchor.getWorldPosition(_aimMountWorldA);
    g.worldToLocal(_aimMountWorldA);
    const pos = line.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, _aimMountWorldA.x, _aimMountWorldA.y, _aimMountWorldA.z);
    pos.setXYZ(1, bx, by, bz);
    pos.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    const mat = line.material as THREE.LineBasicMaterial | undefined;
    if (mat) {
      const slotId = vis.aimLineMountSlotIds[i] ?? `#${i}`;
      const sector = resolveAimLineSectorForIndex(vis, i);
      const aimYaw = aimDirectionYawFromBowRad(
        shipSimX,
        shipSimZ,
        shipHeadingRad,
        aimSimX,
        aimSimZ,
      );
      const inSector = !sector || (aimYaw !== null && isYawWithinMountFireSector(aimYaw, sector));
      const inRange =
        Math.hypot(aimSimX - shipSimX, aimSimZ - shipSimZ) <= ARTILLERY_RANGE + 1e-3;
      let secDbg = "none";
      if (sector) {
        if (sector.kind === "symmetric") {
          secDbg = `sym(c=${(sector.centerYawRadFromBow ?? 0).toFixed(2)},h=${sector.halfAngleRadFromBow.toFixed(2)})`;
        } else {
          secDbg = `asym(${sector.minYawRadFromBow.toFixed(2)}..${sector.maxYawRadFromBow.toFixed(2)})`;
        }
      }
      debug.push(
        `M${i}[${slotId}]: sec=${inSector ? "Y" : "N"} rng=${inRange ? "Y" : "N"} yaw=${
          aimYaw == null ? "null" : aimYaw.toFixed(2)
        } ${secDbg}`,
      );
      mat.color.setHex(
        inSector && inRange
          ? i === 0
            ? AIM_TURRET_GRAY
            : AIM_DEBUG_LINE_COLOR_ALT
          : AIM_DEBUG_LINE_OUT_OF_SECTOR,
      );
      mat.needsUpdate = true;
    }
    line.visible = true;
  }
  return debug;
}
