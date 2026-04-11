/**
 * Lobby-Dialog: Schiffs-JSON (Movement, Rumpf-URL, Skalierung, Hitbox-Quader) bearbeiten;
 * Speicherung in localStorage (Patch pro Klasse). Export/Import als JSON-Datei.
 */

import {
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  getShipHullProfileByClass,
  type ShipClassId,
  type ShipHullVisualProfile,
} from "@battlefleet/shared";
import { HULL_GLTF_URL_BY_ID } from "../runtime/hullGltfUrls";
import {
  getEffectiveHullProfile,
  setHullProfilePatchForClass,
  setShipHitboxDebugVisible,
} from "../runtime/shipProfileRuntime";

const CLASSES: { id: ShipClassId; label: string }[] = [
  { id: SHIP_CLASS_FAC, label: "FAC" },
  { id: SHIP_CLASS_DESTROYER, label: "Zerstörer" },
  { id: SHIP_CLASS_CRUISER, label: "Kreuzer" },
];

function num(v: string, fallback: number): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function readForm(root: HTMLElement): Partial<ShipHullVisualProfile> {
  const q = (name: string): HTMLInputElement => root.querySelector(`[data-field="${name}"]`) as HTMLInputElement;

  const labelDe = q("labelDe").value.trim();
  const hullGltfId = q("hullGltfId").value;
  const hullVisualScale = num(q("hullVisualScale").value, 1);

  const movement = {
    movementSpeedMul: num(q("movementSpeedMul").value, 1),
    turnRateMul: num(q("turnRateMul").value, 1),
    accelMul: num(q("accelMul").value, 1),
  };

  const collisionHitbox = {
    center: {
      x: num(q("hbCx").value, 0),
      y: num(q("hbCy").value, 0),
      z: num(q("hbCz").value, 0),
    },
    halfExtents: {
      x: Math.max(0.05, num(q("hbHx").value, 1)),
      y: Math.max(0.05, num(q("hbHy").value, 1)),
      z: Math.max(0.05, num(q("hbHz").value, 1)),
    },
  };

  return {
    labelDe: labelDe || undefined,
    hullGltfId,
    hullVisualScale,
    movement,
    collisionHitbox,
  };
}

function writeForm(root: HTMLElement, merged: ShipHullVisualProfile): void {
  const q = (name: string): HTMLInputElement => root.querySelector(`[data-field="${name}"]`) as HTMLInputElement;

  q("labelDe").value = merged.labelDe ?? "";
  q("hullGltfId").value = merged.hullGltfId;
  q("hullVisualScale").value = String(merged.hullVisualScale ?? 1);
  const m = merged.movement ?? {};
  q("movementSpeedMul").value = String(m.movementSpeedMul ?? 1);
  q("turnRateMul").value = String(m.turnRateMul ?? 1);
  q("accelMul").value = String(m.accelMul ?? 1);

  const hb = merged.collisionHitbox ?? {
    center: { x: 0, y: 0, z: 0 },
    halfExtents: { x: 2, y: 1, z: 8 },
  };
  q("hbCx").value = String(hb.center.x);
  q("hbCy").value = String(hb.center.y);
  q("hbCz").value = String(hb.center.z);
  q("hbHx").value = String(hb.halfExtents.x);
  q("hbHy").value = String(hb.halfExtents.y);
  q("hbHz").value = String(hb.halfExtents.z);

  const hit = root.querySelector('[data-field="showHitbox"]') as HTMLInputElement;
  hit.checked = localStorage.getItem("battlefleet_show_ship_hitbox") !== "0";
}

export function openShipProfileEditor(): Promise<void> {
  return new Promise((resolve) => {
    let currentClass: ShipClassId = SHIP_CLASS_FAC;

    const root = document.createElement("div");
    root.className = "ship-editor-overlay";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Schiffsprofil");

    const hullOptions = Object.keys(HULL_GLTF_URL_BY_ID)
      .map((id) => `<option value="${id}">${id}</option>`)
      .join("");

    root.innerHTML = `
      <div class="ship-editor-panel">
        <h2 class="ship-editor-title">Schiffsprofil (Client)</h2>
        <p class="ship-editor-hint">
          Speichern = Patch in <strong>localStorage</strong> (nur dieser Browser).
          <strong>Rumpf</strong>, <strong>Skalierung</strong>, <strong>Hitbox-Anzeige</strong> wirken sofort im Client.
          <strong>Movement-Multiplikatoren</strong> im Spiel nutzt der Server aus den eingecheckten JSONs —
          für echte Balance: exportieren und Dateien in <code>shared/src/data/ships/</code> ersetzen.
        </p>
        <div class="ship-editor-class-row"></div>
        <label class="ship-editor-field">
          <span>Anzeigename (labelDe)</span>
          <input type="text" data-field="labelDe" class="ship-editor-input" />
        </label>
        <label class="ship-editor-field">
          <span>Rumpf-Modell (hullGltfId)</span>
          <select data-field="hullGltfId" class="ship-editor-input">${hullOptions}</select>
        </label>
        <label class="ship-editor-field">
          <span>Rumpf-Skalierung (hullVisualScale)</span>
          <input type="range" data-field="hullVisualScale" min="0.25" max="3" step="0.05" value="1" class="ship-editor-range" />
          <span class="ship-editor-range-val" data-range-for="hullVisualScale">1</span>
        </label>
        <label class="ship-editor-field">
          <span>Speed-Mul</span>
          <input type="range" data-field="movementSpeedMul" min="0.3" max="2.5" step="0.05" value="1" class="ship-editor-range" />
          <span class="ship-editor-range-val" data-range-for="movementSpeedMul">1</span>
        </label>
        <label class="ship-editor-field">
          <span>Turn-Mul</span>
          <input type="range" data-field="turnRateMul" min="0.3" max="2.5" step="0.05" value="1" class="ship-editor-range" />
          <span class="ship-editor-range-val" data-range-for="turnRateMul">1</span>
        </label>
        <label class="ship-editor-field">
          <span>Accel-Mul</span>
          <input type="range" data-field="accelMul" min="0.3" max="2.5" step="0.05" value="1" class="ship-editor-range" />
          <span class="ship-editor-range-val" data-range-for="accelMul">1</span>
        </label>
        <div class="ship-editor-subtitle">Hitbox (AABB, Schiffskoordinaten +Y oben, +Z Bug)</div>
        <div class="ship-editor-grid">
          <label>Mitte X <input type="number" step="0.1" data-field="hbCx" class="ship-editor-num" /></label>
          <label>Mitte Y <input type="number" step="0.1" data-field="hbCy" class="ship-editor-num" /></label>
          <label>Mitte Z <input type="number" step="0.1" data-field="hbCz" class="ship-editor-num" /></label>
          <label>Halbe X <input type="number" step="0.1" min="0.05" data-field="hbHx" class="ship-editor-num" /></label>
          <label>Halbe Y <input type="number" step="0.1" min="0.05" data-field="hbHy" class="ship-editor-num" /></label>
          <label>Halbe Z <input type="number" step="0.1" min="0.05" data-field="hbHz" class="ship-editor-num" /></label>
        </div>
        <label class="ship-editor-check">
          <input type="checkbox" data-field="showHitbox" checked />
          Hitbox im Spiel als Drahtrahmen
        </label>
        <div class="ship-editor-actions">
          <button type="button" class="ship-editor-btn ship-editor-btn-primary" data-action="save">Speichern</button>
          <button type="button" class="ship-editor-btn" data-action="reset">Klasse zurücksetzen</button>
          <button type="button" class="ship-editor-btn" data-action="export">JSON exportieren</button>
          <label class="ship-editor-btn ship-editor-file">
            JSON importieren
            <input type="file" accept="application/json,.json" data-action="import" hidden />
          </label>
          <button type="button" class="ship-editor-btn" data-action="close">Schließen</button>
        </div>
      </div>
    `;

    const classRow = root.querySelector(".ship-editor-class-row") as HTMLElement;

    const refreshForm = (): void => {
      const merged = getEffectiveHullProfile(currentClass)!;
      writeForm(root, merged);
      for (const r of root.querySelectorAll(".ship-editor-range")) {
        const inp = r as HTMLInputElement;
        const name = inp.dataset.field;
        if (!name) continue;
        const lab = root.querySelector(`[data-range-for="${name}"]`);
        if (lab) lab.textContent = inp.value;
      }
    };

    for (const c of CLASSES) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ship-editor-class-btn";
      b.textContent = c.label;
      b.dataset.classId = c.id;
      if (c.id === currentClass) b.classList.add("is-active");
      b.addEventListener("click", () => {
        currentClass = c.id as ShipClassId;
        for (const x of classRow.querySelectorAll(".ship-editor-class-btn")) {
          x.classList.toggle("is-active", (x as HTMLElement).dataset.classId === currentClass);
        }
        refreshForm();
      });
      classRow.appendChild(b);
    }

    root.addEventListener("input", (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains("ship-editor-range")) {
        const name = t.getAttribute("data-field");
        if (name) {
          const lab = root.querySelector(`[data-range-for="${name}"]`);
          if (lab) lab.textContent = (t as HTMLInputElement).value;
        }
      }
    });

    root.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest("[data-action]");
      if (!t) return;
      const action = t.getAttribute("data-action");
      if (action === "save") {
        const patch = readForm(root);
        setHullProfilePatchForClass(currentClass, patch);
        const hit = root.querySelector('[data-field="showHitbox"]') as HTMLInputElement;
        setShipHitboxDebugVisible(hit.checked);
        refreshForm();
      }
      if (action === "reset") {
        setHullProfilePatchForClass(currentClass, null);
        refreshForm();
      }
      if (action === "export") {
        const merged = getEffectiveHullProfile(currentClass);
        if (!merged) return;
        const blob = new Blob([JSON.stringify(merged, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `ship-${merged.profileId}.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      if (action === "close") {
        root.remove();
        resolve();
      }
    });

    root.addEventListener("change", (e) => {
      const inp = e.target as HTMLInputElement;
      if (inp.matches('[data-action="import"]') && inp.files?.[0]) {
        const file = inp.files[0];
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(String(reader.result)) as ShipHullVisualProfile;
            if (!data.shipClassId || !getShipHullProfileByClass(data.shipClassId)) {
              throw new Error("Ungültige oder unbekannte shipClassId");
            }
            setHullProfilePatchForClass(data.shipClassId, data);
            currentClass = data.shipClassId;
            for (const x of classRow.querySelectorAll(".ship-editor-class-btn")) {
              x.classList.toggle("is-active", (x as HTMLElement).dataset.classId === currentClass);
            }
            refreshForm();
          } catch (err) {
            console.error("[ShipProfileEditor] Import failed", err);
            window.alert("Import fehlgeschlagen — siehe Konsole.");
          }
        };
        reader.readAsText(file);
        inp.value = "";
      }
    });

    document.body.appendChild(root);
    refreshForm();
  });
}
