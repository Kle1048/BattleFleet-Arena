/**
 * Vollflächiger Key-Art-Hintergrund während Bootstrap (Szene, Namensdialog, Assets, Join).
 * Bild: `public/assets/loading-hero.png` (siehe README neben der Datei).
 */

const BACKDROP_ID = "bfa-session-load-backdrop";

function heroUrl(): string {
  const base = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  return `${base}assets/loading-hero.png`;
}

const FALLBACK_BG = `linear-gradient(
    180deg,
    rgba(4, 12, 28, 0.38) 0%,
    rgba(4, 12, 28, 0.62) 45%,
    rgba(4, 12, 28, 0.82) 100%
  )`;

function applyHeroLayers(el: HTMLElement, withImageUrl: string | null): void {
  if (withImageUrl) {
    el.style.backgroundImage = `${FALLBACK_BG}, url("${withImageUrl}")`;
    el.style.backgroundSize = "cover, cover";
    el.style.backgroundPosition = "center, center";
    el.style.backgroundRepeat = "no-repeat, no-repeat";
  } else {
    el.style.backgroundImage = FALLBACK_BG;
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center";
    el.style.backgroundRepeat = "no-repeat";
  }
}

export function mountSessionLoadBackdrop(caption: string): void {
  if (document.getElementById(BACKDROP_ID)) return;
  const el = document.createElement("div");
  el.id = BACKDROP_ID;
  el.className = "session-load-backdrop";
  el.setAttribute("role", "presentation");
  el.setAttribute("aria-hidden", "true");
  applyHeroLayers(el, null);

  const cap = document.createElement("div");
  cap.className = "session-load-backdrop-caption";
  cap.textContent = caption;
  el.appendChild(cap);

  document.body.appendChild(el);

  const url = heroUrl();
  const probe = new Image();
  probe.onload = () => {
    if (!document.getElementById(BACKDROP_ID)) return;
    applyHeroLayers(el, url);
  };
  probe.onerror = () => {
    /* Kein Key-Art unter public/assets/loading-hero.png — nur Verlauf. */
  };
  probe.src = url;
}

export function setSessionLoadBackdropCaption(text: string): void {
  const el = document.getElementById(BACKDROP_ID);
  const cap = el?.querySelector(".session-load-backdrop-caption");
  if (cap) cap.textContent = text;
}

export function removeSessionLoadBackdrop(): void {
  document.getElementById(BACKDROP_ID)?.remove();
}
