/**
 * HUD: **Brücke** (links, Navigation) und **OPZ** (rechts, Radar + Waffen + HP).
 */

import { FEATURE_MINES_ENABLED, type ShipClassId } from "@battlefleet/shared";
import { getAuthoritativeHullProfile } from "../runtime/shipProfileRuntime";
import { t } from "../../locale/t";
import {
  RADAR_RANGE_WORLD,
  radarMapCenterMarkerOffsetNorthUp,
  type RadarBlipNorm,
} from "./radarHudMath";
import {
  cockpitRadarBlipsKey,
  cockpitRadarEsmKey,
  cockpitRadarThreatKey,
  type CockpitEsmLine,
  type CockpitRadarThreatLine,
} from "./cockpitRadarKeys";
import { renderWeaponSchematic } from "./weaponSchematicMini";

export type { CockpitEsmLine, CockpitRadarThreatLine };
export { cockpitRadarBlipsKey, cockpitRadarEsmKey, cockpitRadarThreatKey };

export type CockpitHudUpdate = {
  speed: number;
  maxSpeed: number;
  throttle: number;
  rudder: number;
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
  radarVisible: boolean;
  ownRadarActive: boolean;
  esmLines: CockpitEsmLine[];
  /** Hostile ASuM — Peilung (gestrichelt / durchgezogen je nach Lock). */
  radarThreatLines: CockpitRadarThreatLine[];
};

function degFromHeading(headingRad: number): number {
  const d = (headingRad * 180) / Math.PI;
  return ((d % 360) + 360) % 360;
}

function formatCourse(d: number): string {
  return `${Math.round(d).toString().padStart(3, "0")}°`;
}

const RADAR_BLIP_SCALE = 46;

const BRIDGE_COMPACT_KEY = "bfa.hud.bridgeCompact";
const OPZ_COMPACT_KEY = "bfa.hud.opzCompact";

function readHudCompact(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeHudCompact(key: string, compact: boolean): void {
  try {
    localStorage.setItem(key, compact ? "1" : "0");
  } catch {
    /* ignore quota / private mode */
  }
}

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
      <div class="cockpit-panel cockpit-panel--bridge">
        <div class="cockpit-panel-head cockpit-panel-head--bridge">
          <span class="cockpit-panel-title">${t("hud.panelBridge")}</span>
          <button type="button" class="cockpit-panel-toggle" aria-expanded="true" title="${t("hud.bridgeToggleCollapseTitle")}" aria-label="${t("hud.bridgeToggleCollapseAria")}">−</button>
        </div>
        <div class="cockpit-bridge-minimal" hidden>
          <div class="cockpit-row cockpit-row-minimal">
            <span class="cockpit-label">${t("hud.labelCourse")}</span>
            <span class="cockpit-course cockpit-course-minimal">000°</span>
          </div>
        </div>
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
          <div class="cockpit-row">
            <span class="cockpit-label">${t("hud.labelSpeed")}</span>
            <span class="cockpit-speed"><span class="cockpit-speed-val">0</span><span class="cockpit-speed-unit">${t("hud.speedUnitKn")}</span></span>
          </div>
          <div class="cockpit-row">
            <span class="cockpit-label">${t("hud.labelCourseFull")}</span>
            <span class="cockpit-course">000°</span>
          </div>
          <div class="cockpit-row cockpit-row-bar">
            <span class="cockpit-label">${t("hud.labelThrottle")}</span>
            <div class="cockpit-track"><div class="cockpit-track-mid"></div><div class="cockpit-fill cockpit-fill-throttle"></div></div>
          </div>
          <div class="cockpit-row cockpit-row-bar">
            <span class="cockpit-label">${t("hud.labelRudder")}</span>
            <div class="cockpit-track"><div class="cockpit-track-mid"></div><div class="cockpit-fill cockpit-fill-rudder"></div></div>
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

    <div class="cockpit-opz" aria-label="${t("hud.ariaOpz")}">
      <div class="cockpit-panel cockpit-panel--opz">
        <div class="cockpit-panel-head cockpit-panel-head--opz">
          <span class="cockpit-panel-title">${t("hud.panelOpz")}</span>
          <button type="button" class="cockpit-panel-toggle" aria-expanded="true" title="${t("hud.opzToggleCollapseTitle")}" aria-label="${t("hud.opzToggleCollapseAria")}">−</button>
        </div>
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
              <g class="cockpit-radar-esm" clip-path="url(#cockpitRadarClip)"></g>
              <g class="cockpit-radar-threats" clip-path="url(#cockpitRadarClip)"></g>
              <g class="cockpit-radar-mapcenter-wrap" clip-path="url(#cockpitRadarClip)" style="opacity:0" title="${t("hud.radarMapCenterTitle")}">
                <polygon class="cockpit-radar-mapcenter-diamond" points="0,-6 4,0 0,6 -4,0" />
              </g>
              <circle class="cockpit-radar-ownship" cx="0" cy="0" r="2.2" />
              <g class="cockpit-radar-blips" clip-path="url(#cockpitRadarClip)"></g>
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
          <div class="cockpit-subhead">${t("hud.subheadWeapons")}</div>
          <div class="cockpit-row">
            <span class="cockpit-label">${t("hud.labelPrimary")}</span>
            <span class="cockpit-primary-cd">—</span>
          </div>
          <div class="cockpit-row">
            <span class="cockpit-label">${t("hud.labelAswm")}</span>
            <span class="cockpit-secondary-cd">—</span>
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
          <div class="cockpit-row cockpit-row-mines">
            <span class="cockpit-label">${t("hud.labelMines")}</span>
            <span class="cockpit-torpedo-cd">—</span>
          </div>
        </div>
        <div class="cockpit-schematic-wrap">
          <div class="cockpit-subhead">${t("hud.subheadTopology")}</div>
          <div class="cockpit-schematic-host"></div>
        </div>
      </div>
    </div>
  `;

  const bridgePanel = wrap.querySelector(".cockpit-panel--bridge") as HTMLElement;
  const opzPanel = wrap.querySelector(".cockpit-panel--opz") as HTMLElement;
  const bridgeToggle = wrap.querySelector(".cockpit-panel--bridge .cockpit-panel-toggle") as HTMLButtonElement;
  const opzToggle = wrap.querySelector(".cockpit-panel--opz .cockpit-panel-toggle") as HTMLButtonElement;
  const bridgeMinimal = wrap.querySelector(".cockpit-bridge-minimal") as HTMLElement;
  const bridgeBody = wrap.querySelector(".cockpit-bridge-body") as HTMLElement;
  const courseMinimalEl = wrap.querySelector(".cockpit-course-minimal") as HTMLElement;

  const applyBridgeCompact = (compact: boolean): void => {
    bridgePanel.classList.toggle("cockpit-panel--compact", compact);
    bridgeToggle.setAttribute("aria-expanded", compact ? "false" : "true");
    bridgeToggle.textContent = compact ? "+" : "−";
    bridgeToggle.title = compact ? t("hud.bridgeToggleExpandTitle") : t("hud.bridgeToggleCollapseTitle");
    bridgeToggle.setAttribute(
      "aria-label",
      compact ? t("hud.bridgeToggleExpandAria") : t("hud.bridgeToggleCollapseAria"),
    );
    bridgeMinimal.hidden = !compact;
    bridgeBody.hidden = compact;
    writeHudCompact(BRIDGE_COMPACT_KEY, compact);
  };

  const applyOpzCompact = (compact: boolean): void => {
    opzPanel.classList.toggle("cockpit-panel--compact", compact);
    opzToggle.setAttribute("aria-expanded", compact ? "false" : "true");
    opzToggle.textContent = compact ? "+" : "−";
    opzToggle.title = compact ? t("hud.opzToggleExpandTitle") : t("hud.opzToggleCollapseTitle");
    opzToggle.setAttribute(
      "aria-label",
      compact ? t("hud.opzToggleExpandAria") : t("hud.opzToggleCollapseAria"),
    );
    writeHudCompact(OPZ_COMPACT_KEY, compact);
  };

  applyBridgeCompact(readHudCompact(BRIDGE_COMPACT_KEY));
  applyOpzCompact(readHudCompact(OPZ_COMPACT_KEY));

  bridgeToggle.addEventListener("click", () => {
    applyBridgeCompact(!bridgePanel.classList.contains("cockpit-panel--compact"));
  });
  opzToggle.addEventListener("click", () => {
    applyOpzCompact(!opzPanel.classList.contains("cockpit-panel--compact"));
  });

  const playerNameEl = wrap.querySelector(".cockpit-player-name") as HTMLElement;
  const shipClassEl = wrap.querySelector(".cockpit-ship-class") as HTMLElement;
  const speedVal = wrap.querySelector(".cockpit-speed-val") as HTMLElement;
  /** Nicht nur `.cockpit-course` — das erste im DOM ist der minimale Kurs (gleiches Node wie `.cockpit-course-minimal`). */
  const courseEl = wrap.querySelector(".cockpit-readouts--bridge .cockpit-course") as HTMLElement;
  const fillThrottle = wrap.querySelector(".cockpit-fill-throttle") as HTMLElement;
  const fillRudder = wrap.querySelector(".cockpit-fill-rudder") as HTMLElement;
  const fillHp = wrap.querySelector(".cockpit-fill-hp") as HTMLElement;
  const primaryCdEl = wrap.querySelector(".cockpit-primary-cd") as HTMLElement;
  const secondaryCdEl = wrap.querySelector(".cockpit-secondary-cd") as HTMLElement;
  const torpedoCdEl = wrap.querySelector(".cockpit-torpedo-cd") as HTMLElement;
  const minesRow = wrap.querySelector(".cockpit-row-mines") as HTMLElement;
  minesRow.hidden = !FEATURE_MINES_ENABLED;
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
  const radarEsmG = wrap.querySelector(".cockpit-radar-esm") as SVGGElement;
  const radarThreatG = wrap.querySelector(".cockpit-radar-threats") as SVGGElement;
  const radarCourseLine = wrap.querySelector(".cockpit-radar-course") as SVGLineElement;
  const radarMapCenterWrap = wrap.querySelector(".cockpit-radar-mapcenter-wrap") as SVGGElement;
  const schematicHost = wrap.querySelector(".cockpit-schematic-host") as HTMLElement;
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
  let lastEsmKey = "";
  let lastThreatKey = "";
  let lastSchematicKey = "";

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
      throttle,
      rudder,
      headingRad,
      worldX,
      worldZ,
      mainMountTrainRad,
      aswmMagPortCap,
      aswmMagStarboardCap,
      aswmRemainingPort,
      aswmRemainingStarboard,
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
      shipClassId,
      radarBlips,
      radarVisible,
      ownRadarActive,
      esmLines,
      radarThreatLines,
    }: CockpitHudUpdate): void {
      const deg = degFromHeading(headingRad);

      playerNameEl.textContent = playerDisplayName;
      shipClassEl.textContent = shipClassLabel;

      const spd = Math.round(speed);
      speedVal.textContent = `${spd}`;
      speedVal.style.opacity = Math.abs(speed) < 0.4 ? "0.55" : "1";

      const courseStr = formatCourse(deg);
      courseEl.textContent = courseStr;
      courseMinimalEl.textContent = courseStr;

      const courseRim = 42;
      const crx = Math.sin(headingRad) * courseRim;
      const cry = -Math.cos(headingRad) * courseRim;
      radarCourseLine.setAttribute("x2", String(crx));
      radarCourseLine.setAttribute("y2", String(cry));

      const distToCtr = Math.hypot(worldX, worldZ);
      if (distToCtr > 12) {
        const off = radarMapCenterMarkerOffsetNorthUp(worldX, worldZ, RADAR_BLIP_SCALE, RADAR_RANGE_WORLD);
        if (off) {
          radarMapCenterWrap.setAttribute("transform", `translate(${off.mx},${off.my})`);
          radarMapCenterWrap.style.opacity = "1";
        } else {
          radarMapCenterWrap.style.opacity = "0";
        }
      } else {
        radarMapCenterWrap.style.opacity = "0";
      }

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
        primaryCdEl.textContent = t("hud.weaponReady");
        primaryCdEl.style.opacity = "0.55";
      }

      if (secondaryCooldownSec > 0.05) {
        secondaryCdEl.textContent = `${secondaryCooldownSec.toFixed(1)} s`;
        secondaryCdEl.style.opacity = "0.9";
      } else {
        secondaryCdEl.textContent = t("hud.weaponReady");
        secondaryCdEl.style.opacity = "0.55";
      }

      if (FEATURE_MINES_ENABLED) {
        if (torpedoCooldownSec > 0.05) {
          torpedoCdEl.textContent = `${torpedoCooldownSec.toFixed(1)} s`;
          torpedoCdEl.style.opacity = "0.9";
          torpedoCdEl.style.color = "";
        } else if (mineCount >= mineMaxCount) {
          torpedoCdEl.textContent = t("hud.minesMax");
          torpedoCdEl.style.opacity = "1";
          torpedoCdEl.style.color = "#ff6b6b";
        } else {
          torpedoCdEl.textContent = t("hud.weaponReady");
          torpedoCdEl.style.opacity = "0.55";
          torpedoCdEl.style.color = "";
        }
      }

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

      const prof = getAuthoritativeHullProfile(shipClassId);
      const sk = `${shipClassId}:${mainMountTrainRad.toFixed(3)}`;
      if (sk !== lastSchematicKey) {
        lastSchematicKey = sk;
        renderWeaponSchematic(schematicHost, prof, mainMountTrainRad);
      }

      if (radarVisible) {
        radarRoot.classList.remove("cockpit-radar-hidden");
        const bk = cockpitRadarBlipsKey(radarBlips);
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
      } else {
        radarRoot.classList.add("cockpit-radar-hidden");
        lastRadarBlipsKey = "";
        lastEsmKey = "";
        lastThreatKey = "";
        radarEsmG.replaceChildren();
        radarThreatG.replaceChildren();
        radarBlipsG.replaceChildren();
      }
    },
  };
}
