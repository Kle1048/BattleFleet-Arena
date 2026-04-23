/**
 * Edge detection for Sea Control zone HUD toasts (enter / leave).
 * `prev === null` means uninitialized — first sample sets state without a toast.
 */

export type SeaControlZoneHudPrev = boolean | null;

export type SeaControlZoneHudEdge = "enter" | "leave";

export function seaControlZoneHudTransition(
  prev: SeaControlZoneHudPrev,
  inZone: boolean,
): { next: boolean; edge: SeaControlZoneHudEdge | null } {
  if (prev === null) {
    return { next: inZone, edge: null };
  }
  if (prev === inZone) {
    return { next: inZone, edge: null };
  }
  return { next: inZone, edge: inZone ? "enter" : "leave" };
}
