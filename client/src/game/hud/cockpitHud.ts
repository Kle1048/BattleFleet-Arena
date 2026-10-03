/**
 * HUD: **Brücke** (links, Navigation) und **OPZ** (rechts, Radar + Waffen + HP).
 */

import type { CockpitHudUpdate } from "../presentation/CockpitModel";
export type { CockpitHudUpdate } from "../presentation/CockpitModel";
import { t } from "../../locale/t";
import { shipSymbol, rankSymbol } from "./scoreboardSymbols";
import { createDomWriter } from "./domWriter";
import { SHIP_CONTACT_DISPLAY_RANGE as RADAR_RANGE_WORLD } from "@battlefleet/shared/rules";
import {
  RADAR_PLAN_SVG_BLIP_RADIUS,
  radarMapCenterMarkerOffsetNorthUp,
  type RadarBlipNorm,
} from "./radarHudMath";
import {
  cockpitRadarBlipsKey,
  cockpitRadarEsmKey,
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
  cockpitRadarSsmRailsKey,
  cockpitRadarThreatKey,
};

export function createCockpitHud(opts?: {
  /** Suchrad wie **R** umschalten (Touch / Maus am HUD-Knopf). */
  onRadarToggle?: () => void;
  speedParent?: Element;
}): { update: (u: CockpitHudUpdate) => void; dispose(): void } {
  const radarRangeLabel = t("hud.radarRangeMeters", { m: RADAR_RANGE_WORLD });
  const wrap = document.createElement("div");
  wrap.className = "cockpit-hud-root";
  wrap.setAttribute("aria-label", t("hud.ariaRoot"));
  wrap.innerHTML = `
    <div class="cockpit-match-timer" aria-label="Match time remaining" title="Match time remaining">
      <span class="cockpit-match-time">—</span>
    </div>
    <div class="cockpit-bridge" aria-label="${t("hud.ariaBridge")}">
      <div class="cockpit-bridge-stack">
        <div class="cockpit-panel cockpit-panel--bridge">
          <div class="cockpit-bridge-body">
          <div class="cockpit-readouts cockpit-readouts--bridge">
            <div class="cockpit-row">
              <span class="cockpit-label">${t("hud.labelClass")}</span>
              <span class="cockpit-ship-class">—</span>
            </div>
            <div class="cockpit-row cockpit-row-life hidden">
              <span class="cockpit-label">${t("hud.labelStatus")}</span>
              <span class="cockpit-life-status">—</span>
            </div>
            <div class="cockpit-row">
              <span class="cockpit-label">${t("hud.labelScore")}</span>
              <span class="cockpit-match-score"><span class="cockpit-score-val">0</span> <span class="cockpit-kills">(0)</span></span>
            </div>
            <div class="cockpit-scoreboard"><table aria-label="Current match standings"><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Class</th><th scope="col">Rank</th><th scope="col">Kills</th><th scope="col">Score</th></tr></thead><tbody class="cockpit-scoreboard-body"></tbody></table></div>
            <div class="cockpit-row">
              <span class="cockpit-label">${t("hud.labelName")}</span>
              <span class="cockpit-player-name">—</span>
            </div>
            <div class="cockpit-row cockpit-row-rank">
              <span class="cockpit-label">${t("hud.labelRank")}</span>
              <span class="cockpit-rank-en">—</span>
            </div>
            <div class="cockpit-row">
              <span class="cockpit-label">${t("hud.labelXp")}</span>
              <span class="cockpit-xp">—</span>
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
              <g class="cockpit-radar-blips"></g>
            </svg>
            <div class="cockpit-radar-scan"></div>
          </div>
          <div class="cockpit-radar-foot">
            <span class="cockpit-radar-range">${radarRangeLabel}</span>
            <span class="cockpit-radar-esm-hint">${t("hud.radarEsmHint")}</span>
          </div>
        </div>
        <div class="tac-target-status"><div class="tac-defense-heading">Target</div><div class="tac-target-row"><span class="tac-target-name">-</span><span class="tac-target-class"></span></div></div>
        <div class="cockpit-row cockpit-row-bar cockpit-hp-opz">
          <span class="cockpit-label">${t("hud.labelHp")}</span>
          <div class="cockpit-track cockpit-track-hp"><div class="cockpit-fill cockpit-fill-hp"></div></div>
        </div>
        <div class="tac-gun-status">
          <div class="tac-status-row"><span class="tac-defense-heading">Gun</span><span class="tac-auto">AUTO OFF</span></div>
          <div class="tac-gun-checks"><span class="tac-range">RANGE —</span><span class="tac-arc">ARC —</span></div>
        </div>
        <div class="tac-air-defense"><div class="tac-defense-heading">Air Defence</div>
          <div class="tac-status-row tac-softkill"><span>SOFTKILL</span><span class="tac-softkill-state"></span></div>
          <div class="tac-status-row tac-ciws"><span>CIWS</span><span class="tac-ciws-state"></span></div>
          <div class="tac-status-row tac-pdms"><span>PDMS</span><span class="tac-pdms-state"></span></div>
          <div class="tac-status-row tac-sam"><span>SAM</span><span class="tac-sam-state"></span></div>
        </div>
        <div class="cockpit-weapons-block">
          <div class="cockpit-row">
            <span class="tac-defense-heading">Anti Ship Missiles</span>
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

  const targetStatusEl = wrap.querySelector(".tac-target-status") as HTMLElement;
  const targetNameEl = wrap.querySelector(".tac-target-name") as HTMLElement;
  const targetClassEl = wrap.querySelector(".tac-target-class") as HTMLElement;
  const gunStatusEl = wrap.querySelector(".tac-gun-status") as HTMLElement;
  const autoEl = wrap.querySelector(".tac-auto") as HTMLElement;
  const rangeEl = wrap.querySelector(".tac-range") as HTMLElement;
  const arcEl = wrap.querySelector(".tac-arc") as HTMLElement;
  const defenseEl = wrap.querySelector(".tac-air-defense") as HTMLElement;
  const defenseRows = (["SOFTKILL", "CIWS", "PDMS", "SAM"] as const).map(system => ({ system,
    row: wrap.querySelector(`.tac-${system.toLowerCase()}`) as HTMLElement,
    state: wrap.querySelector(`.tac-${system.toLowerCase()}-state`) as HTMLElement,
  }));
  const scoreboardBody = wrap.querySelector(".cockpit-scoreboard-body") as HTMLElement;
  let lastScoreboardKey = "";
  const speedEl = document.createElement("div");
  speedEl.className = "cockpit-speed-readout";
  speedEl.setAttribute("aria-label", "Current speed in knots; negative means astern");
  (opts?.speedParent ?? wrap).appendChild(speedEl);
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
  const radarSsmRailsG = wrap.querySelector(".cockpit-radar-ssm-rails") as SVGGElement;
  const radarEsmG = wrap.querySelector(".cockpit-radar-esm") as SVGGElement;
  const radarThreatG = wrap.querySelector(".cockpit-radar-threats") as SVGGElement;
  const radarCourseLine = wrap.querySelector(".cockpit-radar-course") as SVGLineElement;
  const radarMapCenterWrap = wrap.querySelector(".cockpit-radar-mapcenter-wrap") as SVGGElement;
  const aswmDotsPort = wrap.querySelector(".cockpit-aswm-dots-port") as HTMLElement;
  const aswmDotsStarboard = wrap.querySelector(".cockpit-aswm-dots-starboard") as HTMLElement;

  document.body.appendChild(wrap);

  let disposed = false;
  const onRadarClick = (e: Event) => {
    e.stopPropagation();
    if (!disposed) opts?.onRadarToggle?.();
  };
  ownRadarStatusEl.addEventListener("click", onRadarClick);

  const svgNs = "http://www.w3.org/2000/svg";
  const dom = createDomWriter();
  const magazineKeys = new WeakMap<HTMLElement, string>();

  let lastRadarBlipsKey = "";
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
      if (b.designated) {
        const frame = document.createElementNS(svgNs, "rect");
        frame.setAttribute("x", String(b.nx * RADAR_PLAN_SVG_BLIP_RADIUS - 4.5));
        frame.setAttribute("y", String(b.ny * RADAR_PLAN_SVG_BLIP_RADIUS - 4.5));
        frame.setAttribute("width", "9"); frame.setAttribute("height", "9");
        frame.setAttribute("fill", "none"); frame.setAttribute("stroke", "#ffe58a");
        frame.setAttribute("stroke-width", "1.2");
        frame.setAttribute("class", "cockpit-radar-fire-control");
        radarBlipsG.appendChild(frame);
      }
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
    const cap = Math.max(0, Math.floor(Number(capacity) || 0));
    const rawRem = Number(remaining);
    const rem = Math.max(0, Math.min(cap, Math.floor(Number.isFinite(rawRem) ? rawRem : 0)));
    const key = `${cap}:${rem}`;
    if (magazineKeys.get(container) === key) return;
    magazineKeys.set(container, key);
    container.replaceChildren();
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
    dispose() {
      if (disposed) return;
      disposed = true;
      ownRadarStatusEl.removeEventListener("click", onRadarClick);
      speedEl.remove();
      wrap.remove();
    },
    update({
      targetStatus,
      gunStatus,
      airDefense = [],
      speed,
      scoreboard = [],
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
      radarVisible,
      ownRadarActive,
      esmLines,
      radarThreatLines,
      ssmRailLines,
    }: CockpitHudUpdate): void {
      if (disposed) return;
      dom.text(targetNameEl, targetStatus?.name ?? "-");
      dom.text(targetClassEl, targetStatus?.shipClass ?? "");
      dom.attribute(targetStatusEl, "title", targetStatus ? `${targetStatus.name} · ${targetStatus.shipClass}` : "No target");
      dom.attribute(targetStatusEl, "data-state", !targetStatus ? "neutral" : targetStatus.canEngage ? "active" : "warning");
      dom.style(gunStatusEl, "display", gunStatus ? "" : "none");
      dom.text(autoEl, gunStatus?.autofire ? "AUTO ON" : "AUTO OFF");
      dom.attribute(autoEl, "data-state", gunStatus?.autofire ? "active" : "neutral");
      for (const [el, label, value] of [[rangeEl, "RANGE", gunStatus?.inRange], [arcEl, "ARC", gunStatus?.inArc]] as const) {
        dom.text(el, `${label} ${value == null ? "—" : value ? "YES" : "NO"}`);
        dom.attribute(el, "data-state", value == null ? "neutral" : value ? "active" : "warning");
      }
      dom.style(defenseEl, "display", airDefense.length ? "" : "none");
      for (const entry of defenseRows) {
        const status = airDefense.find(item => item.system === entry.system)?.status;
        dom.style(entry.row, "display", status ? "" : "none");
        dom.text(entry.state, status ?? "");
        dom.attribute(entry.state, "data-state", status === "Active" ? "active" : status === "Cooldown" || status === "Radar off" ? "warning" : "neutral");
      }
      const scoreboardKey = JSON.stringify(scoreboard);
      if (scoreboardKey !== lastScoreboardKey) {
        lastScoreboardKey = scoreboardKey;
        scoreboardBody.replaceChildren();
        scoreboard.forEach((player, index) => {
          const row = document.createElement("tr");
          if (player.isMe) row.className = "cockpit-scoreboard-me";
          for (const [column, value] of [index + 1, player.name + (player.isMe ? " (you)" : ""), player.shipClass, player.rank, player.kills, player.score].entries()) {
            const cell = document.createElement("td");
            if (column === 2 || column === 3) {
              cell.className = column === 2 ? "scoreboard-symbol scoreboard-symbol--ship" : "scoreboard-symbol scoreboard-symbol--rank";
              const badge = document.createElement("span");
              badge.setAttribute("role", "img");
              badge.setAttribute("aria-label", String(value));
              badge.setAttribute("title", String(value));
              badge.setAttribute("tabindex", "0");
              badge.innerHTML = column === 2 ? shipSymbol(player.shipClassId) : rankSymbol(player.level);
              cell.appendChild(badge);
            } else {
              const text = document.createElement("span");
              text.className = column === 1 ? "scoreboard-player-name" : "scoreboard-number";
              text.textContent = String(value);
              text.setAttribute("title", String(value));
              cell.appendChild(text);
            }
            row.appendChild(cell);
          }
          scoreboardBody.appendChild(row);
        });
      }
      dom.text(speedEl, `Speed ${Math.round(speed)} kn`);
      dom.text(playerNameEl, playerDisplayName);
      dom.attribute(playerNameEl, "title", playerDisplayName);
      dom.text(shipClassEl, shipClassLabel);

      const courseRim = 42;
      const crx = Math.sin(headingRad) * courseRim;
      const cry = -Math.cos(headingRad) * courseRim;
      dom.attribute(radarCourseLine, "x2", crx.toFixed(2));
      dom.attribute(radarCourseLine, "y2", cry.toFixed(2));

      const distToCtr = Math.hypot(worldX, worldZ);
      if (distToCtr > 12) {
        const off = radarMapCenterMarkerOffsetNorthUp(worldX, worldZ, RADAR_PLAN_SVG_BLIP_RADIUS, RADAR_RANGE_WORLD);
        if (off) {
          dom.attribute(radarMapCenterWrap, "transform", `translate(${off.mx.toFixed(2)},${off.my.toFixed(2)})`);
          dom.style(radarMapCenterWrap, "opacity", "1");
        } else {
          dom.style(radarMapCenterWrap, "opacity", "0");
        }
      } else {
        dom.style(radarMapCenterWrap, "opacity", "0");
      }

      const speedRatio = maxSpeed > 0 ? Math.min(1, Math.abs(speed) / maxSpeed) : 0;
      dom.style(wrap, "--speed-glow", (0.15 + speedRatio * 0.55).toFixed(3));

      const hpRatio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
      dom.style(fillHp, "left", "0%");
      dom.style(fillHp, "width", `${(hpRatio * 100).toFixed(2)}%`);
      dom.style(fillHp, "background",
        hpRatio > 0.35
          ? "linear-gradient(90deg, rgba(80,200,120,0.4), rgba(120,255,160,0.95))"
          : "linear-gradient(90deg, rgba(255,200,80,0.5), rgba(255,90,90,0.95))");

      if (respawnCountdownSec > 0.05) {
        dom.toggle(lifeRow, "hidden", false);
        dom.text(lifeStatusEl, t("hud.statusRespawnIn", {
          seconds: respawnCountdownSec.toFixed(1),
        }));
        dom.style(lifeStatusEl, "opacity", "0.95");
      } else if (spawnProtectionSec > 0.05) {
        dom.toggle(lifeRow, "hidden", false);
        dom.text(lifeStatusEl, t("hud.statusSpawnProtection", {
          seconds: spawnProtectionSec.toFixed(1),
        }));
        dom.style(lifeStatusEl, "opacity", "0.95");
      } else {
        dom.toggle(lifeRow, "hidden", true);
        dom.text(lifeStatusEl, t("hud.emDash"));
      }

      dom.text(matchTimeEl, formatMatchTime(matchRemainingSec));
      dom.text(scoreValEl, `${score}`);
      dom.text(killsSpan, `(${kills})`);
      dom.text(rankEl, rankLabelEn);
      dom.attribute(rankEl, "title", rankLabelEn);
      dom.text(xpEl, xpLine);

      dom.text(ownRadarStatusEl, ownRadarActive ? t("hud.radarOn") : t("hud.radarOff"));
      dom.toggle(ownRadarStatusEl, "cockpit-own-radar-off", !ownRadarActive);
      dom.attribute(ownRadarStatusEl, "aria-pressed", ownRadarActive ? "true" : "false");

      fillAswmMagRow(aswmDotsPort, aswmMagPortCap, aswmRemainingPort);
      fillAswmMagRow(aswmDotsStarboard, aswmMagStarboardCap, aswmRemainingStarboard);
      const aswmRemainingTotal = aswmRemainingPort + aswmRemainingStarboard;
      if (aswmRemainingTotal <= 0 && secondaryCooldownSec > 0.05) {
        dom.text(aswmLoadCdEl, `${secondaryCooldownSec.toFixed(1)} s`);
        dom.style(aswmLoadCdEl, "opacity", "0.95");
      } else {
        dom.text(aswmLoadCdEl, "");
        dom.style(aswmLoadCdEl, "opacity", "0");
      }

      if (radarVisible) {
        dom.toggle(radarRoot, "cockpit-radar-hidden", false);
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
      } else {
        dom.toggle(radarRoot, "cockpit-radar-hidden", true);
        if (lastRadarBlipsKey) radarBlipsG.replaceChildren();
        if (lastSsmRailsKey) radarSsmRailsG.replaceChildren();
        if (lastEsmKey) radarEsmG.replaceChildren();
        if (lastThreatKey) radarThreatG.replaceChildren();
        lastRadarBlipsKey = "";
        lastSsmRailsKey = "";
        lastEsmKey = "";
        lastThreatKey = "";
      }
    },
  };
}
