import { en } from "./en";

/**
 * Resolve a dotted path on `en` (e.g. `toast.softkillSuccess`) and replace `{var}` placeholders.
 */
export function t(path: string, vars?: Record<string, string | number>): string {
  const parts = path.split(".");
  let cur: unknown = en;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") {
      return path;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  if (typeof cur !== "string") {
    return path;
  }
  let s = cur;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      s = s.replaceAll(`{${k}}`, String(v));
    }
  }
  return s;
}
