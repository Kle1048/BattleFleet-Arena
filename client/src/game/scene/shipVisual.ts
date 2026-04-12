import * as THREE from "three";
import {
  ARTILLERY_RANGE,
  getShipClassProfile,
  PlayerLifeState,
  normalizeShipClassId,
  SHIP_CLASS_FAC,
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

const DECK_Y = 1.2;
const AIM_TURRET_GRAY = 0xb8bcc4;
/** Geschützrohr: sichtbare Zylinder-Geometrie (+Z vom Turmdrehpunkt). */
const AIM_BARREL_LENGTH = 16;
const AIM_BARREL_RADIUS_HEAVY = 0.52;
const AIM_BARREL_RADIUS_MUZZLE = 0.44;
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
  // "aimOriginLocalZ" verschiebt den Turmdrehpunkt entlang der Schiffsachse.
  vis.aimLine.position.z = user.aimOriginLocalZ;
  if (vis.hullSprite) {
    vis.hullSprite.scale.setScalar(spriteScale);
  }
  if (vis.hullModel) {
    vis.hullModel.scale.setScalar(spriteScale);
    vis.hullModel.position.y = vis.hullGltfBaseY + gltfHullYOffset;
  }
  if (vis.hitboxLogicalGroup && vis.shipHullScale > 1e-8) {
    vis.hitboxLogicalGroup.position.set(0, 0, user.shipPivotLocalZ / vis.shipHullScale);
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
  /** Drehgruppe; Kind: Zylinder-Rohr (`MeshBasicMaterial`). */
  aimLine: THREE.Group;
  hull: THREE.Mesh;
  hullSprite: THREE.Mesh | null;
  /** Optional: geklontes GLB — ersetzt Sprite/Prisma. */
  hullModel: THREE.Group | null;
  /** Y-Position des GLB nach `prepare` (vor `gltfHullYOffset`). */
  hullGltfBaseY: number;
  /** Materialien für GLB-Life-State (gleiche Indizes wie Meshes im Modell). */
  hullGltfMaterials: THREE.Material[];
  /** Mount-/System-GLBs (gleiche Life-State-Behandlung wie Rumpf). */
  mountGltfMaterials: THREE.Material[];
  /** Nur lokaler Spieler: Feuerbogen — bei Zerstörung ausgeblendet. */
  weaponGuideGroup: THREE.Group | null;
  /** Nur lokaler Spieler: 100-m-Abstandsringe (Debug). */
  rangeRingsGroup: THREE.Group | null;
  /**
   * Server-/JSON-Hitbox (Kanten), Kind von `group` mit `1/hullScale` — unabhängig vom GLB.
   * Position entlang +Z korrigiert den Sprite-/Modell-Pivot → Simulationsmittelpunkt.
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

function getAimBarrelMaterial(vis: ShipVisual): THREE.MeshBasicMaterial {
  const mesh = vis.aimLine.children[0] as THREE.Mesh | undefined;
  return mesh!.material as THREE.MeshBasicMaterial;
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
  const aimMat = getAimBarrelMaterial(vis);
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

    aimMat.transparent = true;
    aimMat.opacity = isLocal ? 0.08 : 0.06;

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

    aimMat.transparent = true;
    aimMat.color.setHex(AIM_TURRET_GRAY);
    aimMat.opacity = isLocal ? 1 : 0.92;

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

  const aimColor = AIM_TURRET_GRAY;
  const aimOpacity = isLocal ? 0.95 : 0.88;
  aimMat.color.setHex(aimColor);
  aimMat.opacity = aimOpacity;

  if (vis.weaponGuideGroup) {
    vis.weaponGuideGroup.visible = tune.showWeaponArc;
  }
  if (vis.rangeRingsGroup) {
    vis.rangeRingsGroup.visible = tune.showRangeRings;
  }
}

/**
 * Ein Schiff für die Szene (eigene Gruppe, noch nicht scene.add).
 * **Peilung (Ziellinie):** immer sichtbar — Local orange (Maus, sofort), Remote cyan (State vom Server).
 * Dient als Debug-Vorbild für spätere **drehbare Geschütztürme** (jeder Spieler eigene Aim-Achse).
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
  let hullGltfBaseY = 0;
  let hullGltfMaterials: THREE.Material[] = [];
  let mountGltfMaterials: THREE.Material[] = [];
  let hullSprite: THREE.Mesh | null = null;

  if (options.hullGltfSource) {
    hullModel = clonePreparedShipHull(options.hullGltfSource);
    hullGltfBaseY = hullModel.position.y;
    hullGltfMaterials = collectHullMeshMaterials(hullModel);
    if (hullProfile && options.getMountGltfTemplate) {
      mountGltfMaterials = attachMountVisualsToHullModel(hullModel, hullProfile, options.getMountGltfTemplate);
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

  const aimY = DECK_Y + 1.2;
  const aimOpacity = options.isLocal ? 0.95 : 0.88;
  const aimLineGroup = new THREE.Group();
  const barrelGeom = new THREE.CylinderGeometry(
    AIM_BARREL_RADIUS_MUZZLE,
    AIM_BARREL_RADIUS_HEAVY,
    AIM_BARREL_LENGTH,
    12,
  );
  barrelGeom.rotateX(Math.PI / 2);
  const barrelMat = new THREE.MeshBasicMaterial({
    color: AIM_TURRET_GRAY,
    transparent: true,
    opacity: aimOpacity,
    fog: false,
    depthTest: false,
    depthWrite: false,
  });
  const barrelMesh = new THREE.Mesh(barrelGeom, barrelMat);
  barrelMesh.position.set(0, aimY, AIM_BARREL_LENGTH / 2);
  barrelMesh.renderOrder = OVERLAY_RENDER_ORDER;
  aimLineGroup.add(barrelMesh);
  assignToOverlayLayer(aimLineGroup);
  group.add(aimLineGroup);

  let weaponGuideGroup: THREE.Group | null = null;
  if (options.isLocal) {
    weaponGuideGroup = new THREE.Group();
    // Keep guide radius in world units even though ship mesh is class-scaled.
    const invHullScale = prof.hullScale > 1e-6 ? 1 / prof.hullScale : 1;
    weaponGuideGroup.scale.setScalar(invHullScale);
    const arcRadius = ARTILLERY_RANGE;
    const arcHalf = prof.artilleryArcHalfAngleRad;
    const segments = 32;
    const arcPts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      const ang = -arcHalf + u * (2 * arcHalf);
      arcPts.push(new THREE.Vector3(Math.sin(ang) * arcRadius, aimY, Math.cos(ang) * arcRadius));
    }
    const arcGeom = new THREE.BufferGeometry().setFromPoints(arcPts);
    const arcMat = new THREE.LineBasicMaterial({
      color: VisualColorTokens.shipAimLocal,
      transparent: true,
      opacity: 0.32,
      fog: false,
      depthTest: false,
      depthWrite: false,
    });
    const arcLine = new THREE.Line(arcGeom, arcMat);
    arcLine.renderOrder = OVERLAY_RENDER_ORDER;
    weaponGuideGroup.add(arcLine);
    const edgePts = (
      a: number,
    ): [THREE.Vector3, THREE.Vector3] => [
      new THREE.Vector3(0, aimY, 0),
      new THREE.Vector3(Math.sin(a) * arcRadius, aimY, Math.cos(a) * arcRadius),
    ];
    for (const a of [-arcHalf, arcHalf]) {
      const g = new THREE.BufferGeometry().setFromPoints(edgePts(a));
      const edgeLine = new THREE.Line(g, arcMat);
      edgeLine.renderOrder = OVERLAY_RENDER_ORDER;
      weaponGuideGroup.add(edgeLine);
    }
    assignToOverlayLayer(weaponGuideGroup);
    group.add(weaponGuideGroup);
  }

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
    const tuning0 = getShipDebugTuning();
    hitboxRoot.position.set(0, 0, tuning0.shipPivotLocalZ / prof.hullScale);
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
    hullGltfBaseY,
    hullGltfMaterials,
    mountGltfMaterials,
    weaponGuideGroup,
    rangeRingsGroup,
    hitboxLogicalGroup,
    shipHullScale: prof.hullScale,
  };
  applyShipVisualRuntimeTuning(vis);
  return vis;
}
