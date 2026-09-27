import { getAswmMagazineFromProfile, getAuthoritativeShipHullProfile, normalizeShipClassId,
  type FixedSeaSkimmerLauncherSpec } from "@battlefleet/shared/rules";
import type { ParticipantState } from "../ParticipantState.js";

type Magazine = Pick<ParticipantState, "aswmRemainingPort" | "aswmRemainingStarboard" | "aswmNextShotAtMs" | "aswmReloadUntilMs">;

/** One initialization path for join, class progression, respawn and round reset. */
export function resetMagazine(row: Magazine, shipClass: string): void {
  const id = normalizeShipClassId(shipClass);
  const magazine = getAswmMagazineFromProfile(getAuthoritativeShipHullProfile(id), id);
  row.aswmRemainingPort = magazine.port;
  row.aswmRemainingStarboard = magazine.starboard;
  row.aswmNextShotAtMs = 0;
  row.aswmReloadUntilMs = 0;
}

export function clearMagazine(row: Magazine): void {
  row.aswmRemainingPort = 0;
  row.aswmRemainingStarboard = 0;
  row.aswmNextShotAtMs = 0;
  row.aswmReloadUntilMs = 0;
}

export function consumeRound(row: Magazine, launcher: FixedSeaSkimmerLauncherSpec): void {
  if (launcher.side === "port") row.aswmRemainingPort--;
  else if (launcher.side === "starboard") row.aswmRemainingStarboard--;
  else if (row.aswmRemainingPort > 0) row.aswmRemainingPort--;
  else row.aswmRemainingStarboard--;
}
