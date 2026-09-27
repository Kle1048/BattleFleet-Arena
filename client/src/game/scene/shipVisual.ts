import * as THREE from "three";
import {
  ARTILLERY_RANGE,
  aimDirectionYawFromBowRad,
  clampYawToMountSector,
  getShipClassProfile,
  projectedTrainYaw,
  isYawWithinMountFireSector,
  PlayerLifeState,
  resolveEffectiveMountFireSector,
  normalizeShipClassId,
  SHIP_CLASS_FAC,
  type MountFireSector,
  type ShipClassId,
  type ShipHullVisualProfile,
} from "@battlefleet/shared";
import { AssetUrls } from "../runtime/assetCatalog";
import { getShipDebugTuning } from "../runtime/shipDebugTuning";
import {
  OVERLAY_RENDER_ORDER,
  SHIP_BOW_Z,
  SHIP_STERN_Z,
} from "./createGameScene";
import { VisualColorTokens, createShipHullAliveMaterial } from "../runtime/materialLibrary";
import { isShipHitboxDebugVisible } from "../runtime/shipProfileRuntime";
import { restoreAuthoredMaterial } from "./shipMaterialState";
import { clonePreparedShipHull, collectHullMeshMaterials } from "./shipGltfHull";
import { createShipHitboxWireframe } from "./shipHitboxDebug";
import { createLocalShipRangeRingsGroup } from "./shipRangeRingsDebug";
import {
  attachMountVisualsToHullModel,
  type ClientAimLineMountBinding,
  type ClientRotatingMountTrainBinding,
} from "./shipMountVisuals";
import { createLocalPlayerWeaponGuideOverlay } from "./shipWeaponSectorOverlay";
import { assignToOverlayLayer } from "../runtime/renderOverlayLayers";
import { worldToRenderX } from "../runtime/renderCoords";
import { disposeVisualResources } from "./shipVisualResources";
import { createAsyncAssetCache, fetchAssetBytes } from "../runtime/asyncAssetCache";

const DECK_Y = 1.2;
const AIM_TURRET_GRAY = 0xb8bcc4;
/** Zweite (weitere) Mount-Ziellinie — leicht von der ersten unterscheidbar. */
const AIM_DEBUG_LINE_COLOR_ALT = 0x88c8ff;
const AIM_DEBUG_LINE_OUT_OF_SECTOR = 0xff4d4d;
const SHIP_SPRITE_BASE_WORLD_HEIGHT = SHIP_BOW_Z - SHIP_STERN_Z;
/** Kiel knapp über der Wasseroberfläche — Rumpf als Prisma (Dreieck × Höhe in Y). */
const HULL_KEEL_Y = 0.28;
const spriteTextureCache = createAsyncAssetCache({
  async load(url: string, signal) {
    const bytes = await fetchAssetBytes(url, signal);
    const bitmap = await createImageBitmap(new Blob([bytes]), { imageOrientation: "flipY" });
    const texture = new THREE.Texture(bitmap);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  },
  disposeValue: (texture) => { texture.dispose(); texture.image.close(); },
});

function getSchnellbootTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  void spriteTextureCache.load(AssetUrls.shipSchnellboot256);
  // Keep the procedural hull visible while the sprite is pending or unavailable.
  return spriteTextureCache.get(AssetUrls.shipSchnellboot256) ?? null;
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

/** Debug visibility only: spatial model data is never tuned at runtime. */
export function applyShipVisualRuntimeTuning(vis: ShipVisual): void {
  const user = getShipDebugTuning();
  vis.aimLine.position.set(0, 0, 0);
  if (vis.hitboxLogicalGroup) {
    /* Hitbox nur aus JSON (center/halfExtents) — unabhängig von shipPivotLocalZ (rein visuell / Welt-Offset). */
    vis.hitboxLogicalGroup.position.set(0, 0, 0);
    vis.hitboxLogicalGroup.visible = isShipHitboxDebugVisible();
  }
  if (vis.weaponGuideGroup) {
    vis.weaponGuideGroup.visible = user.showWeaponArc;
  }
  if (vis.rangeRingsGroup) {
    vis.rangeRingsGroup.visible = user.showRangeRings;
  }
  vis.aimLine.visible = user.showMountAimLines;
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
  /** Explicit immutable build input: authoritative in matches, draft in the workbench. */
  profile: ShipHullVisualProfile | undefined;
  /** Für klassenspezifische Rumpf-Tuning-Defaults (JSON). */
  shipClassId: ShipClassId;
  group: THREE.Group;
  /** Cosmetic roll/pitch/sink only; logical hitbox and sectors remain on group. */
  modelMotion: THREE.Group;
  /** Debug-Ziellinie Mündung→Ziel (`THREE.Line`); Kind von `aimLine`. */
  aimLine: THREE.Group;
  hull: THREE.Mesh;
  hullSprite: THREE.Mesh | null;
  /** Optional: geklontes GLB — ersetzt Sprite/Prisma. */
  hullModel: THREE.Group | null;
  /** Materialien für GLB-Life-State (gleiche Indizes wie Meshes im Modell). */
  hullGltfMaterials: THREE.Material[];
  /** Mount-/System-GLBs (gleiche Life-State-Behandlung wie Rumpf). */
  mountGltfMaterials: THREE.Material[];
  /** Drehbare Mounts mit Train-Yaw (Geschütz / LW). */
  rotatingMountTrains: ClientRotatingMountTrainBinding[];
  /** `mount_*`-Sockets — je eine Debug-Ziellinie Mündung→Ziel. */
  aimLineMounts: ClientAimLineMountBinding[];
  /** Nur lokaler Spieler: Feuerbogen — bei Zerstörung ausgeblendet. */
  weaponGuideGroup: THREE.Group | null;
  /** Nur lokaler Spieler: 100-m-Abstandsringe (Debug). */
  rangeRingsGroup: THREE.Group | null;
  /**
   * Server-/JSON-Hitbox (Kanten), Kind von `group` mit `1/hullScale` — unabhängig vom GLB.
   * Nur `collisionHitbox.center` / halfExtents; kein `shipPivotLocalZ` (Pivot ist nur für Darstellung/Welt-Offset).
   */
  hitboxLogicalGroup: THREE.Group | null;
  /**
   * Cache für `setShipVisualLifeState`: vermeidet pro Frame volle Material-Neusetzung bei unverändertem Zustand.
   */
  _lastLifeVisualKey?: string;
  /** Zuletzt angewendete `getShipDebugTuningGeneration()` — vermeidet redundantes `applyShipVisualRuntimeTuning`. */
  debugTuningGenApplied?: number;
};

/** Per-instance resources only. GLB geometry and sprite/GLB textures belong to their caches. */
export function disposeShipVisual(vis: ShipVisual): void {
  disposeVisualResources(vis.group);
  vis.hullGltfMaterials.length = 0;
  vis.mountGltfMaterials.length = 0;
  vis.rotatingMountTrains.length = 0;
  vis.aimLineMounts.length = 0;
}

export function disposeShipSpriteTexture(): void {
  spriteTextureCache.dispose();
}

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
  const b = vis.aimLineMounts[index];
  if (!b) return null;
  const slotId = b.slotId;
  const hull = vis.profile;
  const classArc = getShipClassProfile(vis.shipClassId).artilleryArcHalfAngleRad;
  const slot = slotId ? hull?.mountSlots.find((s) => s.id === slotId) : undefined;

  const train = vis.rotatingMountTrains.find((t) => t.slotId === slotId);
  let baseSector = b.mountFireSector ?? train?.weaponGuide.sector ?? null;
  if (slot && hull) baseSector = resolveEffectiveMountFireSector(slot, hull, classArc);
  return baseSector;
}

function applyGltfHullMaterialsLifeState(
  materials: THREE.Material[],
  wreck: boolean,
  shielded: boolean,
  isLocal: boolean,
): void {
  for (const mat of new Set(materials)) {
    restoreAuthoredMaterial(mat);
    // Alive means the exact authored appearance, including transparent/glass materials.
    if (!wreck && !shielded) continue;
    if (mat instanceof THREE.MeshStandardMaterial || mat instanceof THREE.MeshPhysicalMaterial) {
      if (wreck) {
        mat.color.setHex(VisualColorTokens.shipHullWreck);
        mat.metalness = 0.04;
        mat.roughness = 0.92;
        mat.transparent = false;
        mat.opacity = 1;
        mat.emissive.setHex(VisualColorTokens.shipHullWreckEmissive);
        mat.emissiveIntensity = 0.45;
        mat.depthWrite = true;
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
      }
      continue;
    }
    if (mat instanceof THREE.MeshBasicMaterial) {
      if (wreck) {
        mat.color.setHex(0x6e7884);
        mat.opacity = 1;
        mat.transparent = false;
        mat.depthWrite = true;
      } else if (shielded) {
        mat.color.setHex(0xdef8ff);
        mat.opacity = 0.95;
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
  const showMountAim = tune.showMountAimLines;
  const lifeVisualKey = `${lifeState}|${isLocal}|${showArc ? "1" : "0"}|${showRings ? "1" : "0"}|${
    showMountAim ? "1" : "0"
  }`;
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
    hullMat.transparent = false;
    hullMat.opacity = 1;
    hullMat.emissive.setHex(VisualColorTokens.shipHullWreckEmissive);
    hullMat.emissiveIntensity = 0.45;
    hullMat.depthWrite = true;
    if (spriteMat) {
      spriteMat.color.setHex(0x6e7884);
      spriteMat.opacity = 1;
      spriteMat.transparent = false;
      spriteMat.depthWrite = true;
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
  /** Required explicit input; no localStorage/editor lookup inside rendering. */
  profile: ShipHullVisualProfile | undefined;
  shipClassId?: string;
  /** Geladenes GLB (Szene); pro Schiff geklont. Ohne: Sprite oder Prisma. */
  hullGltfSource?: THREE.Group | null;
  /** Pro `visual_*`-Id aus Profil-Loadout — geklontes GLB-Template. */
  getMountGltfTemplate?: (visualId: string) => THREE.Group | null;
}): ShipVisual {
  const cid = normalizeShipClassId(options.shipClassId ?? SHIP_CLASS_FAC);
  const prof = getShipClassProfile(cid);
  const hullProfile = options.profile;
  if (hullProfile && hullProfile.shipClassId !== cid) throw new Error("Ship profile/class mismatch");
  const group = new THREE.Group();
  // Complete sim → render basis: reflect local geometry as well as world X/yaw.
  group.scale.set(-1, 1, 1);
  const modelMotion = new THREE.Group();
  modelMotion.name = "shipModelMotion";
  group.add(modelMotion);

  const halfBeam = 15;
  const hullGeom = createHullPrismGeometry(halfBeam);
  const hull = new THREE.Mesh(hullGeom, hullAliveMaterial(options.isLocal));
  hull.castShadow = true;
  hull.receiveShadow = true;
  modelMotion.add(hull);

  let hullModel: THREE.Group | null = null;
  let hullGltfMaterials: THREE.Material[] = [];
  let mountGltfMaterials: THREE.Material[] = [];
  let rotatingMountTrains: ClientRotatingMountTrainBinding[] = [];
  let aimLineMounts: ClientAimLineMountBinding[] = [];
  let hullSprite: THREE.Mesh | null = null;

  if (options.hullGltfSource) {
    hullModel = clonePreparedShipHull(options.hullGltfSource);
    hullGltfMaterials = collectHullMeshMaterials(hullModel);
    if (hullProfile && options.getMountGltfTemplate) {
      const mounted = attachMountVisualsToHullModel(hullModel, hullProfile, options.getMountGltfTemplate);
      mountGltfMaterials = mounted.materials;
      rotatingMountTrains = mounted.rotatingMountTrains;
      aimLineMounts = mounted.aimLineMounts;
    }
    modelMotion.add(hullModel);
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
      modelMotion.add(hullSprite);
    }
  }

  const aimOpacity = options.isLocal ? 0.95 : 0.88;
  const aimLineGroup = new THREE.Group();
  const aimLineCount = Math.max(aimLineMounts.length, 1);
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
  aimLineGroup.visible = getShipDebugTuning().showMountAimLines;
  group.add(aimLineGroup);

  let weaponGuideGroup: THREE.Group | null = null;
  if (options.isLocal) {
    weaponGuideGroup = createLocalPlayerWeaponGuideOverlay({
      shipGroup: group,
      artilleryArcHalfAngleRad: prof.artilleryArcHalfAngleRad,
      hullProfile: hullProfile ?? undefined,
    });
  }

  let rangeRingsGroup: THREE.Group | null = null;
  if (options.isLocal) {
    rangeRingsGroup = createLocalShipRangeRingsGroup();
    rangeRingsGroup.visible = getShipDebugTuning().showRangeRings;
    group.add(rangeRingsGroup);
  }

  let hitboxLogicalGroup: THREE.Group | null = null;
  /** Hitbox unabhängig vom GLB: gleiche Einheiten wie Server — `group` hat `hullScale`, daher korrigieren. */
  if (hullProfile?.collisionHitbox) {
    const hitboxRoot = new THREE.Group();
    hitboxRoot.name = "shipHitboxLogical";
    hitboxRoot.add(createShipHitboxWireframe(hullProfile.collisionHitbox));
    hitboxRoot.position.set(0, 0, 0);
    hitboxRoot.visible = isShipHitboxDebugVisible();
    assignToOverlayLayer(hitboxRoot);
    group.add(hitboxRoot);
    hitboxLogicalGroup = hitboxRoot;
  }

  const vis: ShipVisual = {
    profile: hullProfile,
    shipClassId: cid,
    group,
    modelMotion,
    aimLine: aimLineGroup,
    hull,
    hullSprite,
    hullModel,
    hullGltfMaterials,
    mountGltfMaterials,
    rotatingMountTrains,
    aimLineMounts,
    weaponGuideGroup,
    rangeRingsGroup,
    hitboxLogicalGroup,
  };
  applyShipVisualRuntimeTuning(vis);
  return vis;
}

const _aimMountWorldA = new THREE.Vector3();
const _aimMountWorldB = new THREE.Vector3();

const aimRender = new THREE.Vector3();
const aimLocal = new THREE.Vector3();
const mountWorld = new THREE.Vector3();
const directionRender = new THREE.Vector3();

/** Incoming missile selection is supplied by presentation, never inferred from asset names. */
export type ArtilleryTrainAimOptions = {
  layeredDefenseActive: boolean;
  missileSim: { x: number; z: number } | null;
  shipSimX: number;
  shipSimZ: number;
  shipHeadingRad: number;
};

/** +Z is the authored weapon front. Use the full matrix, including reflection and cosmetic tilt. */
export function updateArtilleryTrainRotationsFromAim(
  vis: ShipVisual, aimSimX: number, aimSimZ: number, aimOptions?: ArtilleryTrainAimOptions,
): void {
  vis.group.updateWorldMatrix(true, true);
  for (const m of vis.rotatingMountTrains) {
    const target = m.isAirDefense
      ? (aimOptions?.layeredDefenseActive ? aimOptions.missileSim : null)
      : { x: aimSimX, z: aimSimZ };
    if (!target) { m.train.rotation.y = 0; continue; } // Authored socket orientation is neutral.
    aimRender.set(worldToRenderX(target.x), 0, target.z);
    aimLocal.copy(aimRender);
    vis.group.worldToLocal(aimLocal);
    const sector = m.weaponGuide.sector;
    const rawYaw = Math.atan2(aimLocal.x, aimLocal.z);
    m.anchor.getWorldPosition(mountWorld);
    if (isYawWithinMountFireSector(rawYaw, sector)) {
      directionRender.subVectors(aimRender, mountWorld);
    } else {
      const yaw = clampYawToMountSector(rawYaw, sector);
      directionRender.set(Math.sin(yaw), 0, Math.cos(yaw)).transformDirection(vis.group.matrixWorld);
    }
    // Solve the projected mount basis in XZ, not a quaternion extracted from a reflected
    // hierarchy. This preserves exact horizontal aim while the deck rolls/pitches.
    const e = m.anchor.matrixWorld.elements;
    const yaw = projectedTrainYaw(e[0]!, e[2]!, e[8]!, e[10]!, directionRender.x, directionRender.z);
    if (yaw !== null) m.train.rotation.y = yaw;
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
  if (!getShipDebugTuning().showMountAimLines) {
    for (let i = 0; i < vis.aimLine.children.length; i++) {
      const line = vis.aimLine.children[i] as THREE.Line | undefined;
      if (line) line.visible = false;
    }
    return [];
  }

  const debug: string[] = [];
  const mounts = vis.aimLineMounts;
  _aimMountWorldB.set(worldToRenderX(aimSimX), 0, aimSimZ);
  const g = vis.group;
  g.worldToLocal(_aimMountWorldB);
  const bx = _aimMountWorldB.x;
  const by = _aimMountWorldB.y;
  const bz = _aimMountWorldB.z;

  for (let i = 0; i < vis.aimLine.children.length; i++) {
    const line = vis.aimLine.children[i] as THREE.Line | undefined;
    if (!line?.geometry) continue;
    const anchor = mounts[i]?.anchor;
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
      const slotId = vis.aimLineMounts[i]?.slotId ?? `#${i}`;
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
        } else if (sector.kind === "asymmetric") {
          secDbg = `asym(${sector.minYawRadFromBow.toFixed(2)}..${sector.maxYawRadFromBow.toFixed(2)})`;
        } else {
          secDbg = `union(n=${sector.sectors.length})`;
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
