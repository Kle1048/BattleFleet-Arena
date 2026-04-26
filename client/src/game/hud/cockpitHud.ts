/**
 * HUD: **Brücke** (links, Navigation) und **OPZ** (rechts, Radar + Waffen + HP).
 */

import type { ShipClassId } from "@battlefleet/shared";
import { t } from "../../locale/t";
import {
  RADAR_PLAN_SVG_BLIP_RADIUS,
  RADAR_RANGE_WORLD,
  radarMapCenterMarkerOffsetNorthUp,
  type RadarBlipNorm,
} from "./radarHudMath";
import {
  cockpitRadarBlipsKey,
  cockpitRadarEsmKey,
  cockpitRadarPortalMarkersKey,
  cockpitRadarSsmRailsKey,
  cockpitRadarThreatKey,
  type CockpitEsmLine,
  type CockpitRadarThreatLine,
  type CockpitSsmRailLine,
} from "./cockpitRadarKeys";

export type { CockpitEsmLine, CockpitRadarThreatLine, CockpitSsmRailLine };
export {
  cockpitRadarBlipsKey,
  cockpitRadarEsmKey,
  cockpitRadarPortalMarkersKey,
  cockpitRadarSsmRailsKey,
  cockpitRadarThreatKey,
};

export type CockpitHudUpdate = {
  speed: number;
  maxSpeed: number;
  headingRad: number;
  /** Welt XZ — Kartenmitte-Marker auf dem Nord-Radar. */
  worldX: number;
  worldZ: number;
  /** Hauptgeschütz-Richtung relativ Bug (Train). */
  mainMountTrainRad: number;
  /** Magazin-Kapazität / Seite (Profil). */
  aswmMagPortCap: number;
  aswmMagStarboardCap: number;
  /** Server: verbleibende Runden. */
  aswmRemainingPort: number;
  aswmRemainingStarboard: number;
  hp: number;
  maxHp: number;
  primaryCooldownSec: number;
  secondaryCooldownSec: number;
  torpedoCooldownSec: number;
  mineCount: number;
  mineMaxCount: number;
  respawnCountdownSec: number;
  spawnProtectionSec: number;
  matchRemainingSec: number;
  score: number;
  kills: number;
  rankLabelEn: string;
  xpLine: string;
  shipClassLabel: string;
  playerDisplayName: string;
  shipClassId: ShipClassId;
  radarBlips: RadarBlipNorm[];
  /** Vibe-Jam-Portale (fester Weltpunkt) — kleiner Kreis, ggf. am Rand wenn außerhalb Radar-Reichweite. */
  radarPortalMarkers: RadarBlipNorm[];
  radarVisible: boolean;
  ownRadarActive: boolean;
  esmLines: CockpitEsmLine[];
  /** Hostile ASuM — Peilung (gestrichelt / durchgezogen je nach Lock). */
  radarThreatLines: CockpitRadarThreatLine[];
  /** Feste SSM-Rails — kurze Peiler-Ticks (Nord oben). */
  ssmRailLines: CockpitSsmRailLine[];
};

export function createCockpitHud(opts?: {
  /** Suchrad wie **R** umschalten (Touch / Maus am HUD-Knopf). */
  onRadarToggle?: () => void;
}): { update: (u: CockpitHudUpdate) => void } {
  const radarRangeLabel = t("hud.radarRangeMeters", { m: RADAR_RANGE_WORLD });
  const wrap = document.createElement("div");
  wrap.className = "cockpit-hud-root";
  wrap.setAttribute("aria-label", t("hud.ariaRoot"));
  wrap.innerHTML = `
    <div class="cockpit-bridge" aria-label="${t("hud.ariaBridge")}">
      <div class="cockpit-bridge-stack">
        <div class="cockpit-panel cockpit-panel--bridge">
          <div class="cockpit-bridge-body">
          <div class="cockpit-readouts cockpit-readouts--bridge">
            <div class="cockpit-row">
              <span class="cockpit-label">${t("hud.labelName")}</span>
              <span class="cockpit-player-name">—</span>
            </div>
            <div class="cockpit-row">
              <span class="cockpit-label">${t("hud.labelClass")}</span>
              <span class="cockpit-ship-class">—</span>
            </div>
            <div class="cockpit-row cockpit-row-rank">
              <span class="cockpit-label">${t("hud.labelRank")}</span>
              <span class="cockpit-rank-en">—</span>
            </div>
            <div class="cockpit-row">
              <span class="cockpit-label">${t("hud.labelXp")}</span>
              <span class="cockpit-xp">—</span>
            </div>
            <div class="cockpit-row cockpit-row-life hidden">
              <span class="cockpit-label">${t("hud.labelStatus")}</span>
              <span class="cockpit-life-status">—</span>
            </div>
            <div class="cockpit-row">
              <span class="cockpit-label">${t("hud.labelMatch")}</span>
              <span class="cockpit-match-time">—</span>
            </div>
            <div class="cockpit-row">
              <span class="cockpit-label">${t("hud.labelScore")}</span>
              <span class="cockpit-match-score"><span class="cockpit-score-val">0</span> <span class="cockpit-kills">(0)</span></span>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>

    <div class="cockpit-opz" aria-label="${t("hud.ariaOpz")}">
      <div class="cockpit-panel cockpit-panel--opz">
        <div class="cockpit-radar">
          <div class="cockpit-radar-head">
            <span class="cockpit-radar-title">${t("hud.radarTitle")}</span>
            <button
              type="button"
              class="cockpit-own-radar-status cockpit-own-radar-toggle"
              title="${t("hud.radarToggleTitle")}"
              aria-label="${t("hud.radarToggleAria")}"
              aria-pressed="true"
            >${t("hud.radarOn")}</button>
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
              <line class="cockpit-radar-axis cockpit-radar-axis-45" x1="-33.941" y1="-33.941" x2="33.941" y2="33.941" />
              <line class="cockpit-radar-axis cockpit-radar-axis-45" x1="-33.941" y1="33.941" x2="33.941" y2="-33.941" />
              <text class="cockpit-radar-cardinal-n" x="0" y="-39" text-anchor="middle">${t("hud.radarNorth")}</text>
              <line class="cockpit-radar-course" x1="0" y1="0" x2="0" y2="-42" />
              <g class="cockpit-radar-ssm-rails" clip-path="url(#cockpitRadarClip)"></g>
              <g class="cockpit-radar-esm" clip-path="url(#cockpitRadarClip)"></g>
              <g class="cockpit-radar-threats" clip-path="url(#cockpitRadarClip)"></g>
              <g class="cockpit-radar-mapcenter-wrap" clip-path="url(#cockpitRadarClip)" style="opacity:0" title="${t("hud.radarMapCenterTitle")}">
                <polygon class="cockpit-radar-mapcenter-diamond" points="0,-6 4,0 0,6 -4,0" />
              </g>
              <circle class="cockpit-radar-ownship" cx="0" cy="0" r="2.2" />
              <g class="cockpit-radar-blips" clip-path="url(#cockpitRadarClip)"></g>
              <g class="cockpit-radar-portal-markers" clip-path="url(#cockpitRadarClip)"></g>
            </svg>
            <div class="cockpit-radar-scan"></div>
          </div>
          <div class="cockpit-radar-foot">
            <span class="cockpit-radar-range">${radarRangeLabel}</span>
            <span class="cockpit-radar-esm-hint">${t("hud.radarEsmHint")}</span>
          </div>
        </div>
        <div class="cockpit-row cockpit-row-bar cockpit-hp-opz">
          <span class="cockpit-label">${t("hud.labelHp")}</span>
          <div class="cockpit-track cockpit-track-hp"><div class="cockpit-fill cockpit-fill-hp"></div></div>
        </div>
        <div class="cockpit-weapons-block">
          <div class="cockpit-row">
            <span class="cockpit-label">${t("hud.labelAswmLoad")}</span>
            <span class="cockpit-aswm-load-cd"></span>
          </div>
          <div class="cockpit-aswm-mag">
            <div class="cockpit-aswm-col cockpit-aswm-col--port" aria-label="${t("hud.ariaAswmPort")}">
              <span class="cockpit-aswm-col-label">${t("hud.aswmPortShort")}</span>
              <div class="cockpit-aswm-dots cockpit-aswm-dots-port"></div>
            </div>
            <div class="cockpit-aswm-col cockpit-aswm-col--starboard" aria-label="${t("hud.ariaAswmStarboard")}">
              <span class="cockpit-aswm-col-label">${t("hud.aswmStarboardShort")}</span>
              <div class="cockpit-aswm-dots cockpit-aswm-dots-starboard"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const playerNameEl = wrap.querySelector(".cockpit-player-name") as HTMLElement;
  const shipClassEl = wrap.querySelector(".cockpit-ship-class") as HTMLElement;
  const fillHp = wrap.querySelector(".cockpit-fill-hp") as HTMLElement;
  const aswmLoadCdEl = wrap.querySelector(".cockpit-aswm-load-cd") as HTMLElement;
  const lifeRow = wrap.querySelector(".cockpit-row-life") as HTMLElement;
  const lifeStatusEl = wrap.querySelector(".cockpit-life-status") as HTMLElement;
  const matchTimeEl = wrap.querySelector(".cockpit-match-time") as HTMLElement;
  const scoreValEl = wrap.querySelector(".cockpit-score-val") as HTMLElement;
  const killsSpan = wrap.querySelector(".cockpit-kills") as HTMLElement;
  const rankEl = wrap.querySelector(".cockpit-rank-en") as HTMLElement;
  const xpEl = wrap.querySelector(".cockpit-xp") as HTMLElement;
  const radarRoot = wrap.querySelector(".cockpit-radar") as HTMLElement;
  const ownRadarStatusEl = wrap.querySelector(".cockpit-own-radar-status") as HTMLButtonElement;
  const radarBlipsG = wrap.querySelector(".cockpit-radar-blips") as SVGGElement;
  const radarPortalMarkersG = wrap.querySelector(".cockpit-radar-portal-markers") as SVGGElement;
  const radarSsmRailsG = wrap.querySelector(".cockpit-radar-ssm-rails") as SVGGElement;
  const radarEsmG = wrap.querySelector(".cockpit-radar-esm") as SVGGElement;
  const radarThreatG = wrap.querySelector(".cockpit-radar-threats") as SVGGElement;
  const radarCourseLine = wrap.querySelector(".cockpit-radar-course") as SVGLineElement;
  const radarMapCenterWrap = wrap.querySelector(".cockpit-radar-mapcenter-wrap") as SVGGElement;
  const aswmDotsPort = wrap.querySelector(".cockpit-aswm-dots-port") as HTMLElement;
  const aswmDotsStarboard = wrap.querySelector(".cockpit-aswm-dots-starboard") as HTMLElement;

  document.body.appendChild(wrap);

  if (opts?.onRadarToggle) {
    const toggle = opts.onRadarToggle;
    ownRadarStatusEl.addEventListener("click", (e) => {
      e.stopPropagation();
      toggle();
    });
  }

  const svgNs = "http://www.w3.org/2000/svg";

  let lastRadarBlipsKey = "";
  let lastRadarPortalMarkersKey = "";
  let lastSsmRailsKey = "";
  let lastEsmKey = "";
  let lastThreatKey = "";

  function drawSsmRails(lines: CockpitSsmRailLine[]): void {
    radarSsmRailsG.replaceChildren();
    for (const ln of lines) {
      const el = document.createElementNS(svgNs, "line");
      el.setAttribute("x1", String(ln.x1));
      el.setAttribute("y1", String(ln.y1));
      el.setAttribute("x2", String(ln.x2));
      el.setAttribute("y2", String(ln.y2));
      el.setAttribute("class", "cockpit-radar-ssm-rail");
      if (ln.stroke) el.style.stroke = ln.stroke;
      radarSsmRailsG.appendChild(el);
    }
  }

  function drawThreatLines(lines: CockpitRadarThreatLine[]): void {
    radarThreatG.replaceChildren();
    for (const ln of lines) {
      const el = document.createElementNS(svgNs, "line");
      el.setAttribute("x1", String(ln.x1));
      el.setAttribute("y1", String(ln.y1));
      el.setAttribute("x2", String(ln.x2));
      el.setAttribute("y2", String(ln.y2));
      el.setAttribute("class", "cockpit-radar-threat-line");
      if (ln.dashed) {
        el.style.strokeDasharray = "4 3";
      } else {
        el.style.strokeDasharray = "";
      }
      radarThreatG.appendChild(el);
    }
  }

  function drawEsmLines(lines: CockpitEsmLine[]): void {
    radarEsmG.replaceChildren();
    for (const ln of lines) {
      const el = document.createElementNS(svgNs, "line");
      el.setAttribute("x1", String(ln.x1));
      el.setAttribute("y1", String(ln.y1));
      el.setAttribute("x2", String(ln.x2));
      el.setAttribute("y2", String(ln.y2));
      el.setAttribute("class", "cockpit-radar-esm-line");
      if (ln.stroke) el.style.stroke = ln.stroke;
      radarEsmG.appendChild(el);
    }
  }

  function drawRadarBlips(blips: RadarBlipNorm[]): void {
    radarBlipsG.replaceChildren();
    for (const b of blips) {
      const r = b.nx * b.nx + b.ny * b.ny;
      if (r > 1.02) continue;
      const dot = document.createElementNS(svgNs, "circle");
      dot.setAttribute("cx", String(b.nx * RADAR_PLAN_SVG_BLIP_RADIUS));
      dot.setAttribute("cy", String(b.ny * RADAR_PLAN_SVG_BLIP_RADIUS));
      dot.setAttribute("r", "3");
      dot.setAttribute("class", "cockpit-radar-blip");
      radarBlipsG.appendChild(dot);
    }
  }

  function drawRadarPortalMarkers(markers: RadarBlipNorm[]): void {
    radarPortalMarkersG.replaceChildren();
    for (const b of markers) {
      const r = b.nx * b.nx + b.ny * b.ny;
      if (r > 1.02) continue;
      const dot = document.createElementNS(svgNs, "circle");
      dot.setAttribute("cx", String(b.nx * RADAR_PLAN_SVG_BLIP_RADIUS));
      dot.setAttribute("cy", String(b.ny * RADAR_PLAN_SVG_BLIP_RADIUS));
      dot.setAttribute("r", "2.35");
      dot.setAttribute("class", "cockpit-radar-portal-marker");
      radarPortalMarkersG.appendChild(dot);
    }
  }

  function formatMatchTime(totalSec: number): string {
    const s = Math.max(0, Math.floor(totalSec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  }

  /**
   * Zeilen für ASuM-Raster: ≤2 Slots eine Zeile, sonst zwei Zeilen (z. B. 4→2+2, 8→4+4).
   * Reihenfolge links→rechts, oben→unten.
   */
  function aswmMagRowLengths(cap: number): number[] {
    const c = Math.max(0, Math.floor(cap));
    if (c <= 0) return [];
    if (c <= 2) return [c];
    const top = Math.ceil(c / 2);
    const bottom = Math.floor(c / 2);
    return [top, bottom];
  }

  /** Rot = bereits verschossen, Grün = im Magazin bereit. */
  function fillAswmMagRow(container: HTMLElement, capacity: number, remaining: number): void {
    container.replaceChildren();
    const cap = Math.max(0, Math.floor(Number(capacity) || 0));
    const rawRem = Number(remaining);
    const rem = Math.max(0, Math.min(cap, Math.floor(Number.isFinite(rawRem) ? rawRem : 0)));
    const spent = Math.max(0, cap - rem);
    const dots: HTMLElement[] = [];
    for (let i = 0; i < spent; i++) {
      const d = document.createElement("span");
      d.className = "cockpit-aswm-dot cockpit-aswm-dot--fired";
      dots.push(d);
    }
    for (let i = 0; i < rem; i++) {
      const d = document.createElement("span");
      d.className = "cockpit-aswm-dot cockpit-aswm-dot--ready";
      dots.push(d);
    }
    const rowLens = aswmMagRowLengths(cap);
    let idx = 0;
    for (const n of rowLens) {
      const row = document.createElement("div");
      row.className = "cockpit-aswm-dot-row";
      for (let k = 0; k < n; k++) {
        const el = dots[idx++];
        if (el) row.appendChild(el);
      }
      container.appendChild(row);
    }
  }

  return {
    update({
      speed,
      maxSpeed,
      headingRad,
      worldX,
      worldZ,
      aswmMagPortCap,
      aswmMagStarboardCap,
      aswmRemainingPort,
      aswmRemainingStarboard,
      hp,
      maxHp,
      secondaryCooldownSec,
      torpedoCooldownSec: _torpedoCooldownSec,
      mineCount: _mineCount,
      mineMaxCount: _mineMaxCount,
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
      radarPortalMarkers,
      radarVisible,
      ownRadarActive,
      esmLines,
      radarThreatLines,
      ssmRailLines,
    }: CockpitHudUpdate): void {
      playerNameEl.textContent = playerDisplayName;
      shipClassEl.textContent = shipClassLabel;

      const courseRim = 42;
      const crx = Math.sin(headingRad) * courseRim;
      const cry = -Math.cos(headingRad) * courseRim;
      radarCourseLine.setAttribute("x2", String(crx));
      radarCourseLine.setAttribute("y2", String(cry));

      const distToCtr = Math.hypot(worldX, worldZ);
      if (distToCtr > 12) {
        const off = radarMapCenterMarkerOffsetNorthUp(worldX, worldZ, RADAR_PLAN_SVG_BLIP_RADIUS, RADAR_RANGE_WORLD);
        if (off) {
          radarMapCenterWrap.setAttribute("transform", `translate(${off.mx},${off.my})`);
          radarMapCenterWrap.style.opacity = "1";
        } else {
          radarMapCenterWrap.style.opacity = "0";
        }
      } else {
        radarMapCenterWrap.style.opacity = "0";
      }

      const speedRatio = maxSpeed > 0 ? Math.min(1, Math.abs(speed) / maxSpeed) : 0;
      wrap.style.setProperty("--speed-glow", String(0.15 + speedRatio * 0.55));

      const hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
      fillHp.style.left = "0%";
      fillHp.style.width = `${hpRatio * 100}%`;
      fillHp.style.background =
        hpRatio > 0.35
          ? "linear-gradient(90deg, rgba(80,200,120,0.4), rgba(120,255,160,0.95))"
          : "linear-gradient(90deg, rgba(255,200,80,0.5), rgba(255,90,90,0.95))";

      if (respawnCountdownSec > 0.05) {
        lifeRow.classList.remove("hidden");
        lifeStatusEl.textContent = t("hud.statusRespawnIn", {
          seconds: respawnCountdownSec.toFixed(1),
        });
        lifeStatusEl.style.opacity = "0.95";
      } else if (spawnProtectionSec > 0.05) {
        lifeRow.classList.remove("hidden");
        lifeStatusEl.textContent = t("hud.statusSpawnProtection", {
          seconds: spawnProtectionSec.toFixed(1),
        });
        lifeStatusEl.style.opacity = "0.95";
      } else {
        lifeRow.classList.add("hidden");
        lifeStatusEl.textContent = t("hud.emDash");
      }

      matchTimeEl.textContent = formatMatchTime(matchRemainingSec);
      scoreValEl.textContent = `${score}`;
      killsSpan.textContent = `(${kills})`;
      rankEl.textContent = rankLabelEn;
      xpEl.textContent = xpLine;

      ownRadarStatusEl.textContent = ownRadarActive ? t("hud.radarOn") : t("hud.radarOff");
      ownRadarStatusEl.classList.toggle("cockpit-own-radar-off", !ownRadarActive);
      ownRadarStatusEl.setAttribute("aria-pressed", ownRadarActive ? "true" : "false");

      fillAswmMagRow(aswmDotsPort, aswmMagPortCap, aswmRemainingPort);
      fillAswmMagRow(aswmDotsStarboard, aswmMagStarboardCap, aswmRemainingStarboard);
      const aswmRemainingTotal = aswmRemainingPort + aswmRemainingStarboard;
      if (aswmRemainingTotal <= 0 && secondaryCooldownSec > 0.05) {
        aswmLoadCdEl.textContent = `${secondaryCooldownSec.toFixed(1)} s`;
        aswmLoadCdEl.style.opacity = "0.95";
      } else {
        aswmLoadCdEl.textContent = "";
        aswmLoadCdEl.style.opacity = "0";
      }

      if (radarVisible) {
        radarRoot.classList.remove("cockpit-radar-hidden");
        const bk = cockpitRadarBlipsKey(radarBlips);
        const sk = cockpitRadarSsmRailsKey(ssmRailLines);
        if (sk !== lastSsmRailsKey) {
          lastSsmRailsKey = sk;
          drawSsmRails(ssmRailLines);
        }
        const ek = cockpitRadarEsmKey(esmLines);
        if (ek !== lastEsmKey) {
          lastEsmKey = ek;
          drawEsmLines(esmLines);
        }
        const tk = cockpitRadarThreatKey(radarThreatLines);
        if (tk !== lastThreatKey) {
          lastThreatKey = tk;
          drawThreatLines(radarThreatLines);
        }
        if (bk !== lastRadarBlipsKey) {
          lastRadarBlipsKey = bk;
          drawRadarBlips(radarBlips);
        }
        const pk = cockpitRadarPortalMarkersKey(radarPortalMarkers);
        if (pk !== lastRadarPortalMarkersKey) {
          lastRadarPortalMarkersKey = pk;
          drawRadarPortalMarkers(radarPortalMarkers);
        }
      } else {
        radarRoot.classList.add("cockpit-radar-hidden");
        lastRadarBlipsKey = "";
        lastRadarPortalMarkersKey = "";
        lastSsmRailsKey = "";
        lastEsmKey = "";
        lastThreatKey = "";
        radarSsmRailsG.replaceChildren();
        radarEsmG.replaceChildren();
        radarThreatG.replaceChildren();
        radarBlipsG.replaceChildren();
        radarPortalMarkersG.replaceChildren();
      }
    },
  };
}
