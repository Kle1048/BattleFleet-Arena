/**
 * Brücken-Overlay: Kurs als 000°…359° (0° = Nord), Fahrt, Waffen-Cooldowns, Match/Punkte.
 */

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
  /** Sekunden bis Respawn (nur `awaiting_respawn`, repliziert). */
  respawnCountdownSec: number;
  /** Verbleibender Spawn-Schutz in Sekunden (`spawn_protected`). */
  spawnProtectionSec: number;
  /** Task 10 — verbleibende Matchzeit (Sekunden). */
  matchRemainingSec: number;
  /** Task 10 — eigene Punkte / Kills. */
  score: number;
  kills: number;
  /** Task 11 — Level im aktuellen Leben (1…10). */
  level: number;
  /** Task 11 — XP bis nächstes Level, z. B. `45 / 130` oder `MAX`. */
  xpLine: string;
  /** Task 12 — Klassen-Kurzname (HUD). */
  shipClassLabel: string;
  /** Lobby-Anzeigename (oder gekürzte Session-ID). */
  playerDisplayName: string;
};

function degFromHeading(headingRad: number): number {
  const d = (headingRad * 180) / Math.PI;
  return ((d % 360) + 360) % 360;
}

function formatCourse(d: number): string {
  return `${Math.round(d).toString().padStart(3, "0")}°`;
}

export function createCockpitHud(): { update: (u: CockpitHudUpdate) => void } {
  const wrap = document.createElement("div");
  wrap.className = "cockpit";
  wrap.setAttribute("aria-label", "Fahrt-Anzeige");
  wrap.innerHTML = `
    <div class="cockpit-panel">
      <div class="cockpit-readouts">
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
        <div class="cockpit-row">
          <span class="cockpit-label">Level</span>
          <span class="cockpit-level">1</span>
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
          <span class="cockpit-label">Torpedo</span>
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
  const levelEl = wrap.querySelector(".cockpit-level") as HTMLElement;
  const xpEl = wrap.querySelector(".cockpit-xp") as HTMLElement;

  document.body.appendChild(wrap);

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
      respawnCountdownSec,
      spawnProtectionSec,
      matchRemainingSec,
      score,
      kills,
      level,
      xpLine,
      shipClassLabel,
      playerDisplayName,
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
      } else {
        torpedoCdEl.textContent = "bereit";
        torpedoCdEl.style.opacity = "0.55";
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
      levelEl.textContent = `${level}`;
      xpEl.textContent = xpLine;
    },
  };
}
