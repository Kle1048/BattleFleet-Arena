/**
 * Vibe Jam 2026 Webring: Entry (`?portal=true`), Exit-Hub, Rückkehr über `ref`.
 * Welt-Portale (XZ) — fest, damit Radar/Trigger stabil bleiben.
 */

import {
  PLAYER_DISPLAY_NAME_MAX_LEN,
  PlayerLifeState,
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  type ShipClassId,
  sanitizePortalReturnRef,
  VIBE_JAM_PORTAL_HUB_URL,
} from "@battlefleet/shared";
import type { ShipLobbyChoice } from "../ui/classPicker";

const SESSION_KEY = "bfa_vibejam_portal_v1";

/** „Vibe Jam Portal“ — weiter zum Hub. */
export const VIBE_JAM_EXIT_PORTAL_X = 520;
export const VIBE_JAM_EXIT_PORTAL_Z = -480;

/** Rückkehr zum vorherigen Spiel — nur wenn `ref` beim Eintritt gültig war. */
export const VIBE_JAM_RETURN_PORTAL_X = -520;
export const VIBE_JAM_RETURN_PORTAL_Z = 480;

export const VIBE_JAM_PORTAL_TRIGGER_RADIUS_M = 52;

export type VibeJamFrozenSession = {
  ref: string;
  /** Alle Query-Keys der Einstiegs-URL (Werte als String), für Echo beim Return. */
  params: Record<string, string>;
};

function readSearchSafe(): URLSearchParams {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

/** Nutzer kommt vom Webring-Redirector (`portal=true`). */
export function isVibeJamPortalEntry(): boolean {
  return readSearchSafe().get("portal") === "true";
}

function parseOptionalShipClass(raw: string | null): ShipClassId {
  if (!raw) return SHIP_CLASS_FAC;
  const s = raw.toLowerCase().trim();
  if (s === SHIP_CLASS_DESTROYER || s === "dd" || s === "destroyer") return SHIP_CLASS_DESTROYER;
  if (s === SHIP_CLASS_CRUISER || s === "cg" || s === "cruiser") return SHIP_CLASS_CRUISER;
  if (s === SHIP_CLASS_FAC || s === "fac") return SHIP_CLASS_FAC;
  return SHIP_CLASS_FAC;
}

function clampDisplayName(name: string): string {
  const t = name.trim().slice(0, PLAYER_DISPLAY_NAME_MAX_LEN);
  return t.length > 0 ? t : "Pilot";
}

/** Lobbywahl ohne UI — nur bei `?portal=true`. */
export function resolveLobbyChoiceFromPortalParams(): ShipLobbyChoice {
  const p = readSearchSafe();
  const shipClass = parseOptionalShipClass(p.get("shipClass"));
  const fromUsername = p.get("username") ?? p.get("name");
  const displayName = clampDisplayName(fromUsername ?? "");
  return { shipClass, displayName };
}

export function captureVibeJamPortalSessionIfNeeded(): void {
  if (typeof window === "undefined") return;
  if (!isVibeJamPortalEntry()) return;
  const p = readSearchSafe();
  const refRaw = p.get("ref");
  const ref = refRaw ? sanitizePortalReturnRef(refRaw) : null;
  const params: Record<string, string> = {};
  for (const [k, v] of p.entries()) {
    if (k.length > 64) continue;
    if (v.length > 512) continue;
    params[k] = v;
  }
  const payload: VibeJamFrozenSession = {
    ref: ref ?? "",
    params,
  };
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function hasVibeJamReturnPortal(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw) as VibeJamFrozenSession;
    return typeof s.ref === "string" && sanitizePortalReturnRef(s.ref) != null;
  } catch {
    return false;
  }
}

function loadFrozenSession(): VibeJamFrozenSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as VibeJamFrozenSession;
  } catch {
    return null;
  }
}

/** Rückleitung zum Spiel aus `ref` inkl. gespeicherter Parameter + `portal=true`. */
export function buildVibeJamReturnGameUrl(): string | null {
  const s = loadFrozenSession();
  if (!s?.ref) return null;
  const base = sanitizePortalReturnRef(s.ref);
  if (!base) return null;
  const u = new URL(base);
  for (const [k, v] of Object.entries(s.params)) {
    if (k === "portal") continue;
    u.searchParams.set(k, v);
  }
  u.searchParams.set("portal", "true");
  return u.toString();
}

function gameRefUrlForHub(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}${window.location.pathname}`;
}

/**
 * Redirect zum Vibe-Jam-Hub. `extra` z. B. displayName, speed (m/s), color, hp …
 * Der Hub ergänzt laut Doku u. a. `portal=true`.
 */
export function buildVibeJamHubRedirectUrl(extra: Record<string, string | number | undefined>): string {
  const u = new URL(VIBE_JAM_PORTAL_HUB_URL);
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s.length === 0) continue;
    if (k.length > 48) continue;
    u.searchParams.set(k, s.slice(0, 512));
  }
  u.searchParams.set("ref", gameRefUrlForHub());
  return u.toString();
}

export function redirectToUrl(url: string): void {
  if (typeof window === "undefined") return;
  window.location.assign(url);
}

type MePos = { x: number; z: number; speed: number; displayName?: string; lifeState: string };

export function buildHubRedirectForPlayer(me: MePos): string {
  const name =
    typeof me.displayName === "string" && me.displayName.trim().length > 0
      ? me.displayName.trim()
      : "player";
  const speedMps = Math.min(80, Math.max(0, Math.abs(Number(me.speed) || 0)));
  return buildVibeJamHubRedirectUrl({
    username: name.slice(0, PLAYER_DISPLAY_NAME_MAX_LEN),
    speed: Number(speedMps.toFixed(2)),
  });
}

/**
 * Einmal pro „Einatmen“ ins Portal; nach Abstand > `hysteresis` wieder scharf.
 */
export function createVibeJamPortalProximityChecker(): {
  check: (me: MePos | undefined, matchEnded: boolean) => void;
} {
  let armExit = true;
  let armReturn = true;
  const R = VIBE_JAM_PORTAL_TRIGGER_RADIUS_M;
  const hyst = R * 2.2;

  return {
    check(me, matchEnded) {
      if (typeof window === "undefined") return;
      if (matchEnded || !me || me.lifeState === PlayerLifeState.AwaitingRespawn) return;

      const dExit = Math.hypot(me.x - VIBE_JAM_EXIT_PORTAL_X, me.z - VIBE_JAM_EXIT_PORTAL_Z);
      if (dExit < R) {
        if (armExit) {
          armExit = false;
          redirectToUrl(buildHubRedirectForPlayer(me));
        }
      } else if (dExit > hyst) {
        armExit = true;
      }

      if (!hasVibeJamReturnPortal()) return;
      const back = buildVibeJamReturnGameUrl();
      if (!back) return;
      const dRet = Math.hypot(me.x - VIBE_JAM_RETURN_PORTAL_X, me.z - VIBE_JAM_RETURN_PORTAL_Z);
      if (dRet < R) {
        if (armReturn) {
          armReturn = false;
          redirectToUrl(back);
        }
      } else if (dRet > hyst) {
        armReturn = true;
      }
    },
  };
}
