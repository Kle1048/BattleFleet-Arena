import type { ShipClassId } from "./shipClass";
import type { ShipHullMovementDefinition } from "./shipMovement";

/**
 * Rumpf-lokales Koordinatensystem (wie im Client / Blender-Export üblich):
 * - +Y = hoch
 * - +Z = Bug
 * - +X = Steuerbord (rechts vom Bug aus gesehen); Backbord = −X
 *
 * Drehrichtung für „Yaw um die Hochachse“: positiv = von oben gegen den Uhrzeigersinn,
 * wenn +Z vorn ist (rechtsdrehend um +Y) — mit `worldToRenderX`-Spiegelung im Client
 * ggf. anpassen; die **Daten** hier sind in **Welt-/Schiffslokal** einheitlich beschrieben.
 */

export type Vec3 = {
  x: number;
  y: number;
  z: number;
};

/**
 * Transform eines „Empty“ / Montagepunkts: Position + Orientierung des Kind-GLB
 * relativ zur Schiffsgruppe (nach `hullScale` o. ä., je nach Import-Pipeline).
 */
export type ShipSocketTransform = {
  position: Vec3;
  /**
   * Euler-Winkel in **Radiant** (Y-X-Z oder Projekt-Standard — beim Import einheitlich halten).
   * Wenn nur horizontal gedreht wird: vor allem `y` setzen.
   */
  eulerRad?: Vec3;
};

/** Was an einem Slot grundsätzlich montiert werden darf (Filter für Loadout). */
export type MountVisualKind =
  | "artillery"
  | "ciws"
  | "sam_launcher"
  | "sam_fixed_rail"
  /** Point Defense / kleiner Lenkflugkörper — Slot-Filter wie CIWS/SAM, eigenes Loadout möglich. */
  | "pdms"
  | "generic";

/**
 * Horizontaler Feuersektor für **drehbare** Mounts (Geschütz, CIWS, drehbarer SAM-Launcher),
 * relativ zur **Bug-Achse** des Schiffs (+Z), gleiche Idee wie `isInForwardArc` / `artilleryArcHalfAngleRad`.
 *
 * - **symmetric:** Kegel um den Bug: Zielrichtung darf maximal `halfAngleRadFromBow` von **vorn** abweichen
 *   (gesamter Sektor = 2 × dieser Winkel). Entspricht einem symmetrischen „vorderen“ Bogen.
 * - **asymmetric:** Min/Max als **signed Yaw** um die Hochachse von der Bug-Richtung aus: 0 = Bug,
 *   positiv z. B. nach Steuerbord (+X), negativ nach Backbord — **einheitlich** mit eurer Server-/Client-
 *   Winkeldefinition halten (ggf. einmal gegen `forwardXZ` / `isInForwardArc` abgleichen).
 */
export type MountFireSector =
  | {
      kind: "symmetric";
      /** Halber Öffnungswinkel relativ zur Bug-Richtung (Radiant), z. B. wie `ARTILLERY_ARC_HALF_ANGLE_RAD`. */
      halfAngleRadFromBow: number;
      /**
       * Mittelrichtung des Sektors relativ zur Bug-Achse (Radiant). Standard **0** = Bug.
       * Z. B. **π** für heckwärts gerichtetes Geschütz (Sektor um das Heck herum).
       */
      centerYawRadFromBow?: number;
    }
  | {
      kind: "asymmetric";
      minYawRadFromBow: number;
      maxYawRadFromBow: number;
    };

/**
 * Flexibler Waffen-/Sensor-Slot: gleiche mechanische „Bucht“, unterschiedliche GLB-Inhalte
 * (Geschütz, SAM-Container, CIWS), sofern `compatibleKinds` passt.
 */
export type MountSlotDefinition = {
  id: string;
  socket: ShipSocketTransform;
  compatibleKinds: MountVisualKind[];
  /** Optional: Standard-Visual, wenn kein Loadout gesetzt */
  defaultVisualId?: string;
  /**
   * Feuersektor nur für **drehbare** Systeme relevant (`artillery`, `ciws`, `sam_launcher`).
   * Fehlt der Eintrag → Server/Client können auf `defaultRotatingMountFireSector` des Profils
   * oder auf die Schiffsklasse (`artilleryArcHalfAngleRad`) zurückfallen.
   */
  fireSector?: MountFireSector;
};

/**
 * Fest eingebaute Seezielflugkörper (z. B. Exocet-Kiste, Harpoon-Canister):
 * **kein** mitdrehendes Geschütz — die **Richtung** ist im Modell / am Socket fest.
 *
 * **Blender:** pro Startposition ein **Empty** (oder nur ein benanntes Objekt), das die
 * **Abstrahlrichtung** vorgibt (lokal typisch entlang **+Z** oder +X je nach Export;
 * einmal im Team festlegen und bei allen Rails gleich halten).
 *
 * **Port / Steuerbord:** für symmetrische Boote oft **zwei** Einträge (`side` port/starboard),
 * gespiegelte `position.x` und ggf. gespiegelter Yaw — oder ein Eintrag + Spiegelung im Code.
 *
 * **Gameplay / Aim:** Es gibt weiterhin **einen** Schiffs-Zielvektor. Die Simulation entscheidet,
 * ob und von welchem Launcher gefeuert wird (Bogen, Cooldown, Munition). Die **Flugrichtung**
 * des Flugkörpers kann sein:
 * - **realistisch:** entlang der festen Rail-Achse im Weltkoordinatensystem
 *   (`shipQuat * railLocalForward`), und nur der passende (z. B. zielseitige) Launcher feuert; oder
 * - **arcade:** visuell feste Röhre, Abgangsvektor aber in Richtung Ziel interpoliert — reine
 *   Client-/Design-Entscheidung (nicht in diesem Typ festgeschrieben).
 */
export type FixedSeaSkimmerLauncherSpec = {
  id: string;
  side: "port" | "starboard" | "centerline";
  /** Client: GLB am Socket (`assetCatalog` / `MOUNT_VISUAL_*`); optional bis Simulation festliegt. */
  visualId?: string;
  socket: ShipSocketTransform;
  /**
   * Feste horizontale Abstrahlrichtung relativ zum Bug: Winkel in **Radiant** in der XZ-Ebene,
   * 0 = Bug (+Z), π/2 = nach Steuerbord (+X), −π/2 = Backbord.
   * Beispiele: Exocet seitlich ~45° → ca. ±π/4; Harpoon quer ~90° → ca. ±π/2 (je nach Seite).
   * Alternativ nur über `socket.eulerRad` definieren — **eine** der beiden Konventionen pro Projekt nutzen.
   */
  launchYawRadFromBow?: number;
};

/**
 * Loadout: welcher **visuelle** Steckplatz (`MountSlotDefinition.id`) welches Asset nutzt.
 * Keys = Slot-IDs, Values = Asset-IDs (Client-`assetCatalog` / GLB-Name).
 */
export type ShipMountLoadout = Record<string, string>;

/**
 * Einfache axis-aligned Bounding Box im **Schiffskoordinatensystem** (wie Socket-Positionen:
 * +Y oben, +Z Bug, +X Steuerbord), **vor** `ShipClassProfile.hullScale` auf der Szene-Gruppe.
 * Server/Gameplay können später dieselben Werte für Treffer nutzen; der Client zeigt optional
 * einen Drahtrahmen.
 */
export type ShipCollisionHitbox = {
  /** Mittelpunkt der Box relativ zum Rumpf-Root (typisch nahe Wasserlinie / Längsmittel). */
  center: Vec3;
  /** Halbachsen entlang X / Y / Z (alle ≥ 0). */
  halfExtents: Vec3;
};

/**
 * Gesamtbeschreibung eines sichtbaren Schiffsaufbaus für **eine** Rumpf-/Klassen-Variante.
 */
export type ShipHullVisualProfile = {
  /** Stabile Profil-ID (Dateiname / Lookup), z. B. `"fac"`. */
  profileId: string;
  /** Referenz auf Rumpf-GLB / Skin — wird clientseitig per `hullGltfId` zu einer URL aufgelöst. */
  hullGltfId: string;
  /**
   * Zusätzlicher Faktor auf den skalierten Rumpf nach `clonePreparedShipHull` (1 = Standard).
   * Nur Client-Darstellung; nicht in der Server-Simulation.
   */
  hullVisualScale?: number;
  /** Einfache Hitbox (AABB); optional für Gameplay, im Client als Drahtrahmen darstellbar. */
  collisionHitbox?: ShipCollisionHitbox;
  /** Schiffsklasse, für die dieses Profil gilt. */
  shipClassId: ShipClassId;
  /** Anzeige / Doku */
  labelDe?: string;
  /**
   * Fahrverhalten dieses konkreten Schiffs — siehe `ShipHullMovementDefinition` / `movementConfigForPlayer`
   * in `shipMovement.ts`. Überschreibt die drei Klassen-Multiplikatoren, wenn Felder gesetzt sind.
   */
  movement?: ShipHullMovementDefinition;
  /**
   * Fallback, wenn ein drehbarer Mount **keinen** eigenen `fireSector` hat:
   * z. B. `{ "kind": "symmetric", "halfAngleRadFromBow": 2.094395… }` (= ±120° wie Artillerie).
   */
  defaultRotatingMountFireSector?: MountFireSector;
  mountSlots: MountSlotDefinition[];
  /** Feste SSM-Rails — Empty-Äquivalente mit fester Ausrichtung */
  fixedSeaSkimmerLaunchers?: FixedSeaSkimmerLauncherSpec[];
  /**
   * ASuM-Magazin pro Seite (Backbord = port, Steuerbord = starboard).
   * Summe = Schüsse bis **Magic Reload** (Server); Kurz-Cooldown zwischen Schüssen separat.
   */
  aswmMagazine?: AswmMagazineSpec;
  /**
   * Nach leerem Magazin: Dauer bis Magic Reload (ms). Ohne Eintrag: `ASWM_MAGIC_RELOAD_MS` (shared/aswm).
   */
  aswmMagicReloadMs?: number;
  /** Optional: Standard-Belegung der Slots (Slot-ID → Visual-Asset-ID) */
  defaultLoadout?: ShipMountLoadout;
  /**
   * Optional: Sinnvolle Defaults für Client-Rumpf-Darstellung (Debug-Tuning).
   * Überschreiben für dieses Profil nur die genannten Felder gegenüber dem globalen Panel.
   */
  clientVisualTuningDefaults?: {
    spriteScale?: number;
    /** Zusatz zu GLB-Rumpf-Y (Schiff hoch/tief). */
    gltfHullYOffset?: number;
    /** Optional: Zusatzverschiebung des Rumpf-GLB in Schiffslokal +X (Steuerbord). */
    gltfHullOffsetX?: number;
    /** Optional: Zusatzverschiebung entlang +Z (Bug). */
    gltfHullOffsetZ?: number;
    /**
     * Optional: Längs-Offset des sichtbaren Rumpf-Drehpunkts vs. Simulationspunkt entlang +Z (Schiffslokal),
     * gleiche Semantik wie `ShipDebugTuning.shipPivotLocalZ` — überschreibt den globalen Debug-Wert für dieses Profil.
     */
    shipPivotLocalZ?: number;
  };
};

/** Effektiver Horizontalbogen: Slot → Profil-Default → Klassen-`artilleryArcHalfAngleRad`. */
export function resolveEffectiveMountFireSector(
  slot: MountSlotDefinition,
  profile: ShipHullVisualProfile,
  classArcHalfAngleRad: number,
): MountFireSector {
  if (slot.fireSector) return slot.fireSector;
  if (profile.defaultRotatingMountFireSector) return profile.defaultRotatingMountFireSector;
  return {
    kind: "symmetric",
    halfAngleRadFromBow: classArcHalfAngleRad,
  };
}

/** Primär-Artillerie: Slot erlaubt `artillery` und Loadout zeigt auf ein Artillerie-GLB. */
export function slotEquippedWithPrimaryArtillery(
  slot: MountSlotDefinition,
  profile: ShipHullVisualProfile,
): boolean {
  if (!slot.compatibleKinds.includes("artillery")) return false;
  const vid = profile.defaultLoadout?.[slot.id] ?? slot.defaultVisualId ?? "";
  if (!vid) return false;
  return vid === "visual_artillery" || /(^|_)artillery$/i.test(vid);
}

export type PrimaryArtilleryMountConfig = {
  slotId: string;
  socket: { x: number; y: number; z: number };
  sector: MountFireSector;
};

/**
 * Hardkill-Schicht **SAM** (äußerer Ring): nur mit `visual_sam` am Slot + Suchrad (siehe BattleRoom).
 */
export function hullProvidesAirDefenseSamLayer(hull: ShipHullVisualProfile | undefined): boolean {
  if (!hull?.mountSlots?.length) return false;
  const loadout = hull.defaultLoadout ?? {};
  for (const slot of hull.mountSlots) {
    const vid = loadout[slot.id] ?? slot.defaultVisualId ?? "";
    if (vid === "visual_sam") return true;
  }
  return false;
}

/**
 * Hardkill-Schicht **PD** (mittlerer Ring): `visual_pdms` (Point Defense / PDMS) im Default-Loadout.
 */
export function hullProvidesAirDefensePdLayer(hull: ShipHullVisualProfile | undefined): boolean {
  if (!hull?.mountSlots?.length) return false;
  const loadout = hull.defaultLoadout ?? {};
  for (const slot of hull.mountSlots) {
    const vid = loadout[slot.id] ?? slot.defaultVisualId ?? "";
    if (vid === "visual_pdms") return true;
  }
  return false;
}

/**
 * Hardkill-Schicht **CIWS** (innerster Ring): `visual_ciws` im Default-Loadout.
 */
export function hullProvidesAirDefenseCiwsLayer(hull: ShipHullVisualProfile | undefined): boolean {
  if (!hull?.mountSlots?.length) return false;
  const loadout = hull.defaultLoadout ?? {};
  for (const slot of hull.mountSlots) {
    const vid = loadout[slot.id] ?? slot.defaultVisualId ?? "";
    if (vid === "visual_ciws") return true;
  }
  return false;
}

/** Alle Slots mit Primär-Artillerie — Reihenfolge = `mountSlots` (Bug→Heck typisch). */

export function listPrimaryArtilleryMountConfigs(
  hull: ShipHullVisualProfile | undefined,
  classArcHalfAngleRad: number,
): PrimaryArtilleryMountConfig[] {
  if (!hull?.mountSlots?.length) return [];
  const out: PrimaryArtilleryMountConfig[] = [];
  for (const slot of hull.mountSlots) {
    if (!slotEquippedWithPrimaryArtillery(slot, hull)) continue;
    out.push({
      slotId: slot.id,
      socket: { x: slot.socket.position.x, y: slot.socket.position.y, z: slot.socket.position.z },
      sector: resolveEffectiveMountFireSector(slot, hull, classArcHalfAngleRad),
    });
  }
  return out;
}

/** Drehbare Waffen-/LW-Slots — gleiche Menge wie Client-`ROTATING_MOUNT_KINDS` / Train-Gruppen. */
const ROTATING_WEAPON_GUIDE_KINDS: readonly MountVisualKind[] = [
  "artillery",
  "ciws",
  "sam_launcher",
  "pdms",
];

export function slotHasRotatingWeaponGuide(slot: MountSlotDefinition): boolean {
  return slot.compatibleKinds.some((k) => ROTATING_WEAPON_GUIDE_KINDS.includes(k));
}

export type RotatingMountWeaponGuideConfig = {
  slotId: string;
  socket: { x: number; y: number; z: number };
  sector: MountFireSector;
};

/** Alle `mountSlots` mit drehbarer Waffe — Feuerbogen-Visualisierung (Client). */
export function listRotatingMountWeaponGuideConfigs(
  hull: ShipHullVisualProfile | undefined,
  classArcHalfAngleRad: number,
): RotatingMountWeaponGuideConfig[] {
  if (!hull?.mountSlots?.length) return [];
  const out: RotatingMountWeaponGuideConfig[] = [];
  for (const slot of hull.mountSlots) {
    if (!slotHasRotatingWeaponGuide(slot)) continue;
    out.push({
      slotId: slot.id,
      socket: {
        x: slot.socket.position.x,
        y: slot.socket.position.y,
        z: slot.socket.position.z,
      },
      sector: resolveEffectiveMountFireSector(slot, hull, classArcHalfAngleRad),
    });
  }
  return out;
}

/**
 * Basis-Geschützrichtung im Schiff (Radiant): Bug = 0, Heck = π — heuristisch aus Socket-Z.
 * Für Client-Train-Rotation relativ zur Bug-Achse.
 */
export function inferMountTrainBaseYawFromBow(slot: MountSlotDefinition): number {
  return slot.socket.position.z < 0 ? Math.PI : 0;
}

/** Erster `mountSlots`-Eintrag mit Artillerie — Socket in Schiffslokal (+Z Bug). */
export function getPrimaryArtilleryMountSocketLocal(
  profile: ShipHullVisualProfile | undefined,
): { x: number; y: number; z: number } | null {
  if (!profile?.mountSlots?.length) return null;
  for (const slot of profile.mountSlots) {
    if (slot.compatibleKinds.includes("artillery")) {
      const p = slot.socket.position;
      return { x: p.x, y: p.y, z: p.z };
    }
  }
  return null;
}

export type AswmMagazineSpec = {
  port: number;
  starboard: number;
};
