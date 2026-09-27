import type { ShipClassId } from "./shipClass";
import type { ShipHullMovementDefinition } from "./shipMovement";
import { weaponSystem, type MountedWeapon, type WeaponSystemId } from "./weaponSystems";

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
 * - **union:** Vereinigung mehrerer Teilsektoren (z. B. Backbord- und Steuerbord-Bogen mit Totzone Bug/Heck).
 *   Verschachtelte `union`-Einträge werden beim Abfragen flach gemacht.
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
    }
  | {
      kind: "union";
      /** Mindestens ein Eintrag; Teilsektoren sind `symmetric`, `asymmetric` oder wieder `union`. */
      sectors: readonly MountFireSector[];
    };

/**
 * Flexibler Waffen-/Sensor-Slot: gleiche mechanische „Bucht“, unterschiedliche GLB-Inhalte
 * (Geschütz, SAM-Container, CIWS), sofern `compatibleKinds` passt.
 */
export type MountSlotDefinition = {
  id: string;
  socket: ShipSocketTransform;
  compatibleKinds: MountVisualKind[];
  /**
   * Feuersektor nur für **drehbare** Systeme relevant (`artillery`, `ciws`, `sam_launcher`).
   * Fehlt der Eintrag → Server/Client können auf `defaultRotatingMountFireSector` des Profils
   * oder auf die Schiffsklasse (`artilleryArcHalfAngleRad`) zurückfallen.
   */
  fireSector?: MountFireSector;
};

/** Nicht-räumliche Slot-Regeln. Der Loader ergänzt ausschließlich erzeugte GLB-Socket-Daten. */
export type MountSlotDefinitionInput = Omit<MountSlotDefinition, "socket">;

/** Feste Seezielflugkörper: Pose und +Z-Startrichtung stammen ausschließlich aus dem Rail-/Waffenmodell. */
export type FixedSeaSkimmerLauncherSpec = {
  id: string;
  side: "port" | "starboard" | "centerline";
  /** Waffensystem und Modell. Ohne Belegung keine Waffenfunktion. */
  equipment?: MountedWeapon;
  socket: ShipSocketTransform;
};

/**
 * Einziger Ort für die Slot-Belegung: Waffensystem und austauschbares Modell.
 * Ein nicht belegter Slot besitzt keine Waffenfunktion.
 */
export type ShipMountLoadout = Record<string, MountedWeapon>;

export function equippedMount(slot: MountSlotDefinition, profile: ShipHullVisualProfile): MountedWeapon | undefined {
  return profile.defaultLoadout?.[slot.id];
}

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
  /** Derived exclusively from the hull GLB, never authored in profile JSON. */
  modelEffects?: Readonly<Record<string, ShipSocketTransform>>;
  /** Stabile Profil-ID (Dateiname / Lookup), z. B. `"fac"`. */
  profileId: string;
  /** Referenz auf Rumpf-GLB / Skin — wird clientseitig per `hullGltfId` zu einer URL aufgelöst. */
  hullGltfId: string;
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
  /** Standard-Belegung der Slots (Slot-ID → Waffensystem + Modell). */
  defaultLoadout?: ShipMountLoadout;
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

/** Primär-Artillerie folgt dem Waffensystem; der Modellname ist irrelevant. */
export function slotEquippedWithPrimaryArtillery(
  slot: MountSlotDefinition,
  profile: ShipHullVisualProfile,
): boolean {
  if (!slot.compatibleKinds.includes("artillery")) return false;
  return equippedMount(slot, profile)?.weaponId === "artillery";
}

export type PrimaryArtilleryMountConfig = {
  slotId: string;
  socket: { x: number; y: number; z: number };
  sector: MountFireSector;
};

/**
 * Hardkill-Schicht **SAM** (äußerer Ring): SAM im Loadout + Suchrad (siehe BattleRoom).
 */
export function hullProvidesAirDefenseSamLayer(hull: ShipHullVisualProfile | undefined): boolean {
  if (!hull?.mountSlots?.length) return false;
  for (const slot of hull.mountSlots) {
    const equipment = equippedMount(slot, hull);
    if (equipment && weaponSystem(equipment.weaponId).airDefenseLayer === "sam") return true;
  }
  return false;
}

/**
 * Hardkill-Schicht **PD** (mittlerer Ring): PDMS im Loadout.
 */
export function hullProvidesAirDefensePdLayer(hull: ShipHullVisualProfile | undefined): boolean {
  if (!hull?.mountSlots?.length) return false;
  for (const slot of hull.mountSlots) {
    const equipment = equippedMount(slot, hull);
    if (equipment && weaponSystem(equipment.weaponId).airDefenseLayer === "pd") return true;
  }
  return false;
}

/**
 * Hardkill-Schicht **CIWS** (innerster Ring): CIWS im Loadout.
 */
export function hullProvidesAirDefenseCiwsLayer(hull: ShipHullVisualProfile | undefined): boolean {
  if (!hull?.mountSlots?.length) return false;
  for (const slot of hull.mountSlots) {
    const equipment = equippedMount(slot, hull);
    if (equipment && weaponSystem(equipment.weaponId).airDefenseLayer === "ciws") return true;
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

/**
 * Daten für einen Mount-Feuerbogen ohne Three.js — gleiche Semantik wie
 * `ClientRotatingMountTrainBinding.weaponGuide` nach `attachMountVisualsToHullModel` (Client).
 */
export type RotatingMountWeaponGuideConfig = {
  slotId: string;
  /** Waffenregeln und Modellkennung bleiben getrennt. */
  weaponId: WeaponSystemId;
  modelId: string;
  /** Horizontale Waffen-Reichweite (m) aus dem Waffensystem. */
  engagementRangeWorld: number;
  socket: { x: number; y: number; z: number };
  sector: MountFireSector;
};

/**
 * Alle tatsächlich mit einem drehbaren Waffensystem belegten Slots.
 *
 * Nutzung: Tests, Editor-Hilfen, Vorschau **ohne** GLB. Der laufende Client baut dieselben Felder
 * beim Mounten in `weaponGuide` pro `ClientRotatingMountTrainBinding`.
 */
export function listRotatingMountWeaponGuideConfigs(
  hull: ShipHullVisualProfile | undefined,
  classArcHalfAngleRad: number,
): RotatingMountWeaponGuideConfig[] {
  if (!hull?.mountSlots?.length) return [];
  const out: RotatingMountWeaponGuideConfig[] = [];
  for (const slot of hull.mountSlots) {
    const equipment = equippedMount(slot, hull);
    if (!equipment || !weaponSystem(equipment.weaponId).rotating) continue;
    out.push({
      slotId: slot.id,
      ...equipment,
      engagementRangeWorld: weaponSystem(equipment.weaponId).engagementRange,
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

/** Heading of a marker's local +Z after XYZ Euler rotation (not simply Euler.y). */
export function socketYawRadFromBow(socket: ShipSocketTransform): number {
  const e = socket.eulerRad;
  if (!e) return 0;
  return Math.atan2(Math.sin(e.y), Math.cos(e.x) * Math.cos(e.y));
}

/** Erster `mountSlots`-Eintrag mit Artillerie — Socket in Schiffslokal (+Z Bug). */
export function getPrimaryArtilleryMountSocketLocal(
  profile: ShipHullVisualProfile | undefined,
): { x: number; y: number; z: number } | null {
  if (!profile?.mountSlots?.length) return null;
  for (const slot of profile.mountSlots) {
    if (slotEquippedWithPrimaryArtillery(slot, profile)) {
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
