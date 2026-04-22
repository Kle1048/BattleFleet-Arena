/**
 * Vibe Jam Webring: sichere `ref`-URL (nur https, keine javascript:-URLs).
 */

const MAX_REF_LEN = 2048;

/** `https://vibejam.cc/portal/2026` — Query-Parameter werden clientseitig angehängt. */
export const VIBE_JAM_PORTAL_HUB_URL = "https://vibejam.cc/portal/2026";

/**
 * Nur **https**-URLs, keine Credentials in `host` (kein `@` im Hostteil).
 * Gibt normalisierte URL-String zurück oder `null`.
 */
export function sanitizePortalReturnRef(ref: string): string | null {
  const s = ref.trim();
  if (s.length === 0 || s.length > MAX_REF_LEN) return null;
  if (!s.startsWith("https://")) return null;
  const lower = s.toLowerCase();
  if (lower.startsWith("https://javascript:") || lower.includes("javascript:")) return null;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (u.host.includes("@")) return null;
    return u.toString();
  } catch {
    return null;
  }
}
