/** Wire-compatible player intentions; never accepted as authoritative outcomes. */
export type InputCommand = {
  throttle: number;
  rudderInput: number;
  aimX?: number;
  aimZ?: number;
  /** True solange LMB gehalten (Client); `tryPrimaryFire` feuert nur nach Ablauf des Cooldowns. */
  primaryFire?: boolean;
  /** True solange RMB gehalten — ASuM mit Cooldown / Limit aktiv. */
  secondaryFire?: boolean;
  /** Optional: ASuM von fester Seite (Mobile) — überschreibt Aim-basierte Rail-Wahl. */
  aswmFireSide?: "port" | "starboard";
  /** Torpedo (Task 8): Mausrad-Klick gehalten oder Taste Q. */
  torpedoFire?: boolean;
  /** Debug-Tuning: Minen-Ablage entlang Schiffs-Längsachse (lokales -Z = Heck). */
  mineSpawnLocalZ?: number;
  /** Suchrad an/aus — steuert ESM-Sichtbarkeit für Gegner (repliziert). */
  radarActive?: boolean;
};
