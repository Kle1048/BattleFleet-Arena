import type { ShipClassId } from "@battlefleet/shared/rules";

/** Small, stylized game badges; labels are supplied separately as accessible text. */
export function shipSymbol(id: ShipClassId): string {
  const silhouettes: Record<ShipClassId, string> = {
    fac: '<path d="M4 17h25l-6 5H8zM12 17v-5h7l4 5M17 12V8m0 2h6"/>',
    destroyer: '<path d="M2 17h32l-6 5H6zM9 17v-5h7v5m2 0v-7h6v7M21 10V4m0 3h7M27 16h5"/>',
    cruiser: '<path d="M1 17h34l-5 6H6zM7 17v-5h6v5m3 0V8h9v9M20 8V2m0 3h8M4 14h5m18 0h6M28 17v-5"/>',
  };
  return `<svg viewBox="0 0 36 26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">${silhouettes[id]}</svg>`;
}

/** Sleeve-stripe progression; level 7 uses Rear Admiral (Lower Half) braid.
 * Bottom-to-top widths follow the naval 1/4, 1/2 and 2 inch proportions.
 * Names remain the existing game ranks; this is a simplified stripe-only badge.
 */
export function rankSymbol(level: number): string {
  const rank = Math.max(1, Math.min(10, Math.floor(level) || 1));
  const thin = 1.25, normal = 2.5, broad = 10, gap = 1.5;
  const stripes = [
    [normal],
    [normal, thin],
    [normal, normal],
    [normal, thin, normal],
    [normal, normal, normal],
    [normal, normal, normal, normal],
    [broad],
    [broad, normal],
    [broad, normal, normal],
    [broad, normal, normal, normal],
  ][rank - 1]!;
  let bottom = 26;
  const marks = stripes.map(height => {
    bottom -= height;
    const stripe = `<rect x="6" y="${bottom}" width="24" height="${height}" rx=".25"/>`;
    bottom -= gap;
    return stripe;
  }).join("");
  return `<svg viewBox="0 0 36 28" aria-hidden="true" fill="currentColor">${marks}</svg>`;
}
