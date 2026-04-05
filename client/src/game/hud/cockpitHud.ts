/**
 * Brücken-Overlay: Peilung als 000°…359° (0° = Nord), Kompassrose dreht mit −Kurs damit Nord fest zur Karte passt.
 */

export type CockpitHudUpdate = {
  speed: number;
  maxSpeed: number;
  throttle: number;
  rudder: number;
  headingRad: number;
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
      <div class="cockpit-compass-wrap">
        <div class="cockpit-lubber"></div>
        <div class="cockpit-compass-card">
          <span class="cockpit-mk" style="--a:0">N</span>
          <span class="cockpit-mk" style="--a:90">O</span>
          <span class="cockpit-mk" style="--a:180">S</span>
          <span class="cockpit-mk" style="--a:270">W</span>
        </div>
        <div class="cockpit-compass-ring"></div>
      </div>
      <div class="cockpit-readouts">
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
      </div>
    </div>
  `;

  const card = wrap.querySelector(".cockpit-compass-card") as HTMLElement;
  const speedVal = wrap.querySelector(".cockpit-speed-val") as HTMLElement;
  const courseEl = wrap.querySelector(".cockpit-course") as HTMLElement;
  const fillThrottle = wrap.querySelector(".cockpit-fill-throttle") as HTMLElement;
  const fillRudder = wrap.querySelector(".cockpit-fill-rudder") as HTMLElement;

  document.body.appendChild(wrap);

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
    update({ speed, maxSpeed, throttle, rudder, headingRad }: CockpitHudUpdate): void {
      const deg = degFromHeading(headingRad);
      card.style.transform = `rotate(${-deg}deg)`;

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
    },
  };
}
