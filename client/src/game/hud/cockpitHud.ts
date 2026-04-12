/**
 * Brücken-Overlay: Kurs als 000°…359° (0° = Nord), Fahrt, Waffen-Cooldowns, Match/Punkte.
 */

import { RADAR_RANGE_WORLD, type RadarBlipNorm } from "./radarHudMath";
import { cockpitRadarBlipsKey, cockpitRadarEsmKey, type CockpitEsmLine } from "./cockpitRadarKeys";

export type { CockpitEsmLine };
export { cockpitRadarBlipsKey, cockpitRadarEsmKey };

export type CockpitHudUpdate = {
  speed: number;
  maxSpeed: number;
  throttle: number;
  rudder: number;
  headingRad: number;
  hp: number;
  maxHp: number;
  primaryCooldownSec: number;
  /** ASuM / Sekundär — Cooldown repliziert (Task 7). */
  secondaryCooldownSec: number;
  /** Torpedo — Cooldown repliziert (Task 8). */
  torpedoCooldownSec: number;
  /** Aktive Minen des lokalen Spielers. */
  mineCount: number;
  /** Maximal erlaubte aktive Minen des lokalen Spielers. */
  mineMaxCount: number;
  /** Sekunden bis Respawn (nur `awaiting_respawn`, repliziert). */
  respawnCountdownSec: number;
  /** Verbleibender Spawn-Schutz in Sekunden (`spawn_protected`). */
  spawnProtectionSec: number;
  /** Task 10 — verbleibende Matchzeit (Sekunden). */
  matchRemainingSec: number;
  /** Task 10 — eigene Punkte / Kills. */
  score: number;
  kills: number;
  /** Task 11 — English naval rank label for current level (1…10). */
  rankLabelEn: string;
  /** Task 11 — XP bis nächstes Level, z. B. `45 / 130` oder `MAX`. */
  xpLine: string;
  /** Task 12 — Klassen-Kurzname (HUD). */
  shipClassLabel: string;
  /** Lobby-Anzeigename (oder gekürzte Session-ID). */
  playerDisplayName: string;
  /** Kleines Plan-Radar: Kontakte relativ zum Bug, normiert ±1. */
  radarBlips: RadarBlipNorm[];
  radarVisible: boolean;
  /** Eigenes Suchrad (repliziert) — steuert Sichtbarkeit für fremde ESM. */
  ownRadarActive: boolean;
  /** Passive ESM: Linien zum Peiler (Gegner mit aktivem Radar in Reichweite). */
  esmLines: CockpitEsmLine[];
};

const BASE_URL = import.meta.env.BASE_URL;

function degFromHeading(headingRad: number): number {
  const d = (headingRad * 180) / Math.PI;
  return ((d % 360) + 360) % 360;
}

function formatCourse(d: number): string {
  return `${Math.round(d).toString().padStart(3, "0")}°`;
}

const RADAR_BLIP_SCALE = 46;

export function createCockpitHud(): { update: (u: CockpitHudUpdate) => void } {
  const wrap = document.createElement("div");
  wrap.className = "cockpit";
  wrap.setAttribute("aria-label", "Fahrt-Anzeige");
  const radarRangeLabel = `${RADAR_RANGE_WORLD}m`;
  wrap.innerHTML = `
    <div class="cockpit-panel">
      <div class="cockpit-radar" aria-hidden="true">
        <div class="cockpit-radar-head">
          <span class="cockpit-radar-title">TACTICAL</span>
          <span class="cockpit-own-radar-status" title="R = Suchrad an/aus">RADAR ON</span>
        </div>
        <div class="cockpit-radar-bezel">
          <svg class="cockpit-radar-svg" viewBox="-52 -52 104 104">
            <defs>
              <clipPath id="cockpitRadarClip"><circle cx="0" cy="0" r="47.5" /></clipPath>
              <radialGradient id="cockpitRadarGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stop-color="rgba(0,255,120,0.12)" />
                <stop offset="70%" stop-color="rgba(0,40,20,0.35)" />
                <stop offset="100%" stop-color="rgba(0,12,6,0.85)" />
              </radialGradient>
            </defs>
            <circle cx="0" cy="0" r="50" fill="url(#cockpitRadarGlow)" />
            <circle class="cockpit-radar-ring-outer" cx="0" cy="0" r="48" fill="none" />
            <circle class="cockpit-radar-ring-mid" cx="0" cy="0" r="24" fill="none" />
            <circle class="cockpit-radar-ring-inner" cx="0" cy="0" r="8" fill="none" />
            <line class="cockpit-radar-axis" x1="0" y1="-48" x2="0" y2="48" />
            <line class="cockpit-radar-axis" x1="-48" y1="0" x2="48" y2="0" />
            <polygon class="cockpit-radar-bow" points="0,-44 -5,-36 5,-36" />
            <g class="cockpit-radar-esm" clip-path="url(#cockpitRadarClip)"></g>
            <circle class="cockpit-radar-ownship" cx="0" cy="0" r="2.2" />
            <g class="cockpit-radar-blips" clip-path="url(#cockpitRadarClip)"></g>
          </svg>
          <div class="cockpit-radar-scan"></div>
        </div>
        <div class="cockpit-radar-foot">
          <span class="cockpit-radar-range">${radarRangeLabel}</span>
          <span class="cockpit-radar-esm-hint">ESM</span>
        </div>
      </div>
      <div class="cockpit-readouts">
        <div class="cockpit-row cockpit-row-header" style="display:flex;align-items:center;gap:8px;margin-bottom:2px;">
          <img
            src="${BASE_URL}assets/hud-command-icon.svg"
            alt="Kommando-Icon"
            width="20"
            height="20"
            style="display:block;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));"
          />
          <span class="cockpit-header-title" style="font-weight:700;letter-spacing:0.02em;opacity:0.9;">Bridge</span>
        </div>
        <div class="cockpit-row">
          <span class="cockpit-label">Name</span>
          <span class="cockpit-player-name">—</span>
        </div>
        <div class="cockpit-row">
          <span class="cockpit-label">Klasse</span>
          <span class="cockpit-ship-class">Zerstörer</span>
        </div>
        <div class="cockpit-row">
          <span class="cockpit-label">Fahrt</span>
          <span class="cockpit-speed"><span class="cockpit-speed-val">0</span><span class="cockpit-speed-unit"> kn</span></span>
        </div>
        <div class="cockpit-row">
          <span class="cockpit-label">Kurs</span>
          <span class="cockpit-course">000°</span>
        </div>
        <div class="cockpit-row cockpit-row-bar">
          <span class="cockpit-label">Gas</span>
          <div class="cockpit-track">
            <div class="cockpit-track-mid"></div>
            <div class="cockpit-fill cockpit-fill-throttle"></div>
          </div>
        </div>
        <div class="cockpit-row cockpit-row-bar">
          <span class="cockpit-label">Ruder</span>
          <div class="cockpit-track">
            <div class="cockpit-track-mid"></div>
            <div class="cockpit-fill cockpit-fill-rudder"></div>
          </div>
        </div>
        <div class="cockpit-row cockpit-row-bar">
          <span class="cockpit-label">HP</span>
          <div class="cockpit-track cockpit-track-hp">
            <div class="cockpit-fill cockpit-fill-hp"></div>
          </div>
        </div>
        <div class="cockpit-row cockpit-row-rank">
          <span class="cockpit-label">Rank</span>
          <span class="cockpit-rank-en">Ensign</span>
        </div>
        <div class="cockpit-row">
          <span class="cockpit-label">XP</span>
          <span class="cockpit-xp">0 / 100</span>
        </div>
        <div class="cockpit-row">
          <span class="cockpit-label">Feuer</span>
          <span class="cockpit-primary-cd">—</span>
        </div>
        <div class="cockpit-row">
          <span class="cockpit-label">ASuM</span>
          <span class="cockpit-secondary-cd">—</span>
        </div>
        <div class="cockpit-row">
          <span class="cockpit-label">Minen</span>
          <span class="cockpit-torpedo-cd">—</span>
        </div>
        <div class="cockpit-row cockpit-row-life hidden">
          <span class="cockpit-label">Status</span>
          <span class="cockpit-life-status">—</span>
        </div>
        <div class="cockpit-row">
          <span class="cockpit-label">Match</span>
          <span class="cockpit-match-time">—</span>
        </div>
        <div class="cockpit-row">
          <span class="cockpit-label">Punkte</span>
          <span class="cockpit-match-score"><span class="cockpit-score-val">0</span> <span class="cockpit-kills">(0)</span></span>
        </div>
      </div>
    </div>
  `;

  const playerNameEl = wrap.querySelector(".cockpit-player-name") as HTMLElement;
  const shipClassEl = wrap.querySelector(".cockpit-ship-class") as HTMLElement;
  const speedVal = wrap.querySelector(".cockpit-speed-val") as HTMLElement;
  const courseEl = wrap.querySelector(".cockpit-course") as HTMLElement;
  const fillThrottle = wrap.querySelector(".cockpit-fill-throttle") as HTMLElement;
  const fillRudder = wrap.querySelector(".cockpit-fill-rudder") as HTMLElement;
  const fillHp = wrap.querySelector(".cockpit-fill-hp") as HTMLElement;
  const primaryCdEl = wrap.querySelector(".cockpit-primary-cd") as HTMLElement;
  const secondaryCdEl = wrap.querySelector(".cockpit-secondary-cd") as HTMLElement;
  const torpedoCdEl = wrap.querySelector(".cockpit-torpedo-cd") as HTMLElement;
  const lifeRow = wrap.querySelector(".cockpit-row-life") as HTMLElement;
  const lifeStatusEl = wrap.querySelector(".cockpit-life-status") as HTMLElement;
  const matchTimeEl = wrap.querySelector(".cockpit-match-time") as HTMLElement;
  const scoreValEl = wrap.querySelector(".cockpit-score-val") as HTMLElement;
  const killsSpan = wrap.querySelector(".cockpit-kills") as HTMLElement;
  const rankEl = wrap.querySelector(".cockpit-rank-en") as HTMLElement;
  const xpEl = wrap.querySelector(".cockpit-xp") as HTMLElement;
  const radarRoot = wrap.querySelector(".cockpit-radar") as HTMLElement;
  const ownRadarStatusEl = wrap.querySelector(".cockpit-own-radar-status") as HTMLElement;
  const radarBlipsG = wrap.querySelector(".cockpit-radar-blips") as SVGGElement;
  const radarEsmG = wrap.querySelector(".cockpit-radar-esm") as SVGGElement;

  document.body.appendChild(wrap);

  const svgNs = "http://www.w3.org/2000/svg";

  let lastRadarBlipsKey = "";
  let lastEsmKey = "";

  function drawEsmLines(lines: { x1: number; y1: number; x2: number; y2: number }[]): void {
    radarEsmG.replaceChildren();
    for (const ln of lines) {
      const el = document.createElementNS(svgNs, "line");
      el.setAttribute("x1", String(ln.x1));
      el.setAttribute("y1", String(ln.y1));
      el.setAttribute("x2", String(ln.x2));
      el.setAttribute("y2", String(ln.y2));
      el.setAttribute("class", "cockpit-radar-esm-line");
      radarEsmG.appendChild(el);
    }
  }

  function drawRadarBlips(blips: RadarBlipNorm[]): void {
    radarBlipsG.replaceChildren();
    for (const b of blips) {
      const r = b.nx * b.nx + b.ny * b.ny;
      if (r > 1.02) continue;
      const dot = document.createElementNS(svgNs, "circle");
      dot.setAttribute("cx", String(b.nx * RADAR_BLIP_SCALE));
      dot.setAttribute("cy", String(b.ny * RADAR_BLIP_SCALE));
      dot.setAttribute("r", "3");
      dot.setAttribute("class", "cockpit-radar-blip");
      radarBlipsG.appendChild(dot);
    }
  }

  function formatMatchTime(totalSec: number): string {
    const s = Math.max(0, Math.floor(totalSec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  }

  function setCenterBar(el: HTMLElement, value: number): void {
    const v = Math.max(-1, Math.min(1, value));
    const half = Math.abs(v) * 50;
    if (v >= 0) {
      el.style.left = "50%";
      el.style.width = `${half}%`;
    } else {
      el.style.left = `${50 - half}%`;
      el.style.width = `${half}%`;
    }
  }

  return {
    update({
      speed,
      maxSpeed,
      throttle,
      rudder,
      headingRad,
      hp,
      maxHp,
      primaryCooldownSec,
      secondaryCooldownSec,
      torpedoCooldownSec,
      mineCount,
      mineMaxCount,
      respawnCountdownSec,
      spawnProtectionSec,
      matchRemainingSec,
      score,
      kills,
      rankLabelEn,
      xpLine,
      shipClassLabel,
      playerDisplayName,
      radarBlips,
      radarVisible,
      ownRadarActive,
      esmLines,
    }: CockpitHudUpdate): void {
      const deg = degFromHeading(headingRad);

      playerNameEl.textContent = playerDisplayName;
      shipClassEl.textContent = shipClassLabel;

      const spd = Math.round(speed);
      speedVal.textContent = `${spd}`;
      speedVal.style.opacity = Math.abs(speed) < 0.4 ? "0.55" : "1";

      courseEl.textContent = formatCourse(deg);

      fillThrottle.style.background =
        throttle >= 0
          ? "linear-gradient(90deg, rgba(60,180,255,0.2), rgba(110,220,255,0.95))"
          : "linear-gradient(90deg, rgba(255,170,80,0.95), rgba(255,120,60,0.25))";
      setCenterBar(fillThrottle, throttle);

      fillRudder.style.background =
        rudder >= 0
          ? "linear-gradient(90deg, rgba(100,220,160,0.25), rgba(120,255,190,0.95))"
          : "linear-gradient(90deg, rgba(255,120,160,0.95), rgba(255,160,180,0.25))";
      setCenterBar(fillRudder, rudder);

      const speedRatio = maxSpeed > 0 ? Math.min(1, Math.abs(speed) / maxSpeed) : 0;
      wrap.style.setProperty("--speed-glow", String(0.15 + speedRatio * 0.55));

      const hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
      fillHp.style.left = "0%";
      fillHp.style.width = `${hpRatio * 100}%`;
      fillHp.style.background =
        hpRatio > 0.35
          ? "linear-gradient(90deg, rgba(80,200,120,0.4), rgba(120,255,160,0.95))"
          : "linear-gradient(90deg, rgba(255,200,80,0.5), rgba(255,90,90,0.95))";

      if (primaryCooldownSec > 0.05) {
        primaryCdEl.textContent = `${primaryCooldownSec.toFixed(1)} s`;
        primaryCdEl.style.opacity = "0.9";
      } else {
        primaryCdEl.textContent = "bereit";
        primaryCdEl.style.opacity = "0.55";
      }

      if (secondaryCooldownSec > 0.05) {
        secondaryCdEl.textContent = `${secondaryCooldownSec.toFixed(1)} s`;
        secondaryCdEl.style.opacity = "0.9";
      } else {
        secondaryCdEl.textContent = "bereit";
        secondaryCdEl.style.opacity = "0.55";
      }

      if (torpedoCooldownSec > 0.05) {
        torpedoCdEl.textContent = `${torpedoCooldownSec.toFixed(1)} s`;
        torpedoCdEl.style.opacity = "0.9";
        torpedoCdEl.style.color = "";
      } else if (mineCount >= mineMaxCount) {
        torpedoCdEl.textContent = "MAX";
        torpedoCdEl.style.opacity = "1";
        torpedoCdEl.style.color = "#ff6b6b";
      } else {
        torpedoCdEl.textContent = "bereit";
        torpedoCdEl.style.opacity = "0.55";
        torpedoCdEl.style.color = "";
      }

      if (respawnCountdownSec > 0.05) {
        lifeRow.classList.remove("hidden");
        lifeStatusEl.textContent = `Respawn in ${respawnCountdownSec.toFixed(1)} s`;
        lifeStatusEl.style.opacity = "0.95";
      } else if (spawnProtectionSec > 0.05) {
        lifeRow.classList.remove("hidden");
        lifeStatusEl.textContent = `Spawn-Schutz ${spawnProtectionSec.toFixed(1)} s`;
        lifeStatusEl.style.opacity = "0.95";
      } else {
        lifeRow.classList.add("hidden");
        lifeStatusEl.textContent = "—";
      }

      matchTimeEl.textContent = formatMatchTime(matchRemainingSec);
      scoreValEl.textContent = `${score}`;
      killsSpan.textContent = `(${kills})`;
      rankEl.textContent = rankLabelEn;
      xpEl.textContent = xpLine;

      ownRadarStatusEl.textContent = ownRadarActive ? "RADAR ON" : "RADAR OFF";
      ownRadarStatusEl.classList.toggle("cockpit-own-radar-off", !ownRadarActive);

      if (radarVisible) {
        radarRoot.classList.remove("cockpit-radar-hidden");
        const bk = cockpitRadarBlipsKey(radarBlips);
        const ek = cockpitRadarEsmKey(esmLines);
        if (ek !== lastEsmKey) {
          lastEsmKey = ek;
          drawEsmLines(esmLines);
        }
        if (bk !== lastRadarBlipsKey) {
          lastRadarBlipsKey = bk;
          drawRadarBlips(radarBlips);
        }
      } else {
        radarRoot.classList.add("cockpit-radar-hidden");
        lastRadarBlipsKey = "";
        lastEsmKey = "";
        radarEsmG.replaceChildren();
        radarBlipsG.replaceChildren();
      }
    },
  };
}
