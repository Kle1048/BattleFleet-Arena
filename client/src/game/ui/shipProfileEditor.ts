/**
 * Schiffsprofil-Editor (Workbench): alle Felder von `ShipHullVisualProfile` — Tabs + JSON-Bereiche.
 * Speicherung als Patch in localStorage pro `shipClassId`; Export/Import als Datei.
 */

import {
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  getAuthoritativeShipHullProfile,
  parseDefaultLoadoutJson,
  parseFixedSeaSkimmerLaunchersJson,
  parseMountSlotsJson,
  type MountFireSector,
  type ShipClassId,
  type ShipHullMovementDefinition,
  type ShipHullVisualProfile,
} from "@battlefleet/shared";
import { HULL_GLTF_URL_BY_ID } from "../runtime/hullGltfUrls";
import {
  clearAllHullProfileWorkbenchLivePreviews,
  getEffectiveHullProfile,
  setHullProfilePatchForClass,
  setHullProfileWorkbenchLivePreview,
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

function optionalNum(v: string): number | undefined {
  const t = v.trim();
  if (!t) return undefined;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : undefined;
}

export type ShipProfileEditorPanelApi = {
  setShipClass: (id: ShipClassId) => void;
  getShipClass: () => ShipClassId;
  refresh: () => void;
  dispose: () => void;
};

function readFireSector(root: HTMLElement): MountFireSector | undefined {
  const kind = (root.querySelector('[data-field="fsKind"]') as HTMLSelectElement).value;
  if (kind === "symmetric") {
    const half = num((root.querySelector('[data-field="fsHalf"]') as HTMLInputElement).value, Math.PI * (2 / 3));
    return { kind: "symmetric", halfAngleRadFromBow: half };
  }
  if (kind === "asymmetric") {
    return {
      kind: "asymmetric",
      minYawRadFromBow: num((root.querySelector('[data-field="fsMin"]') as HTMLInputElement).value, -1),
      maxYawRadFromBow: num((root.querySelector('[data-field="fsMax"]') as HTMLInputElement).value, 1),
    };
  }
  return undefined;
}

function writeFireSector(root: HTMLElement, fs: MountFireSector | undefined): void {
  const kindEl = root.querySelector('[data-field="fsKind"]') as HTMLSelectElement;
  const sym = root.querySelector('[data-fs-panel="symmetric"]') as HTMLElement;
  const asym = root.querySelector('[data-fs-panel="asymmetric"]') as HTMLElement;
  if (!fs) {
    kindEl.value = "";
    sym.hidden = true;
    asym.hidden = true;
    return;
  }
  if (fs.kind === "symmetric") {
    kindEl.value = "symmetric";
    sym.hidden = false;
    asym.hidden = true;
    (root.querySelector('[data-field="fsHalf"]') as HTMLInputElement).value = String(fs.halfAngleRadFromBow);
  } else if (fs.kind === "asymmetric") {
    kindEl.value = "asymmetric";
    sym.hidden = true;
    asym.hidden = false;
    (root.querySelector('[data-field="fsMin"]') as HTMLInputElement).value = String(fs.minYawRadFromBow);
    (root.querySelector('[data-field="fsMax"]') as HTMLInputElement).value = String(fs.maxYawRadFromBow);
  } else {
    kindEl.value = "";
    sym.hidden = true;
    asym.hidden = true;
  }
}

function readFullProfile(root: HTMLElement): ShipHullVisualProfile {
  const q = (name: string): HTMLInputElement => root.querySelector(`[data-field="${name}"]`) as HTMLInputElement;
  const shipClassId = (root.querySelector('[data-field="shipClassId"]') as HTMLSelectElement)
    .value as ShipClassId;

  const mountSlots = parseMountSlotsJson(
    (root.querySelector('[data-json="mountSlots"]') as HTMLTextAreaElement).value,
  );
  const fixedSeaSkimmerLaunchers = parseFixedSeaSkimmerLaunchersJson(
    (root.querySelector('[data-json="fixedSeaSkimmerLaunchers"]') as HTMLTextAreaElement).value,
  );
  const defaultLoadout = parseDefaultLoadoutJson(
    (root.querySelector('[data-json="defaultLoadout"]') as HTMLTextAreaElement).value,
  );

  const labelDe = q("labelDe").value.trim();
  const hullGltfId = (root.querySelector('[data-field="hullGltfId"]') as HTMLSelectElement).value;
  const hullVisualScale = num(q("hullVisualScale").value, 1);

  const movement: ShipHullMovementDefinition = {
    movementSpeedMul: num(q("movementSpeedMul").value, 1),
    turnRateMul: num(q("turnRateMul").value, 1),
    accelMul: num(q("accelMul").value, 1),
  };
  const rr = optionalNum(q("rudderResponsivenessMul").value);
  const ms = optionalNum(q("minSpeedForFullTurnMul").value);
  const dg = optionalNum(q("dragWhenNeutralMul").value);
  if (rr !== undefined) movement.rudderResponsivenessMul = rr;
  if (ms !== undefined) movement.minSpeedForFullTurnMul = ms;
  if (dg !== undefined) movement.dragWhenNeutralMul = dg;

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

  const defaultRotatingMountFireSector = readFireSector(root);

  const aswmPort = optionalNum(q("aswmPort").value);
  const aswmSb = optionalNum(q("aswmSb").value);
  const aswmMagazine =
    aswmPort !== undefined && aswmSb !== undefined ? { port: aswmPort, starboard: aswmSb } : undefined;

  const aswmMagicReloadMs = optionalNum(q("aswmMagicReloadMs").value);

  const spriteScale = optionalNum(q("cvSpriteScale").value);
  const gltfHullYOffset = optionalNum(q("cvHullYOffset").value);
  const gltfHullOffsetX = optionalNum(q("cvHullOffsetX").value);
  const gltfHullOffsetZ = optionalNum(q("cvHullOffsetZ").value);
  const shipPivotLocalZ = optionalNum(q("cvShipPivotZ").value);
  const clientVisualTuningDefaults =
    spriteScale !== undefined ||
    gltfHullYOffset !== undefined ||
    gltfHullOffsetX !== undefined ||
    gltfHullOffsetZ !== undefined ||
    shipPivotLocalZ !== undefined
      ? {
          ...(spriteScale !== undefined ? { spriteScale } : {}),
          ...(gltfHullYOffset !== undefined ? { gltfHullYOffset } : {}),
          ...(gltfHullOffsetX !== undefined ? { gltfHullOffsetX } : {}),
          ...(gltfHullOffsetZ !== undefined ? { gltfHullOffsetZ } : {}),
          ...(shipPivotLocalZ !== undefined ? { shipPivotLocalZ } : {}),
        }
      : undefined;

  return {
    profileId: q("profileId").value.trim() || "profile",
    shipClassId,
    labelDe: labelDe || undefined,
    hullGltfId,
    hullVisualScale,
    collisionHitbox,
    movement,
    defaultRotatingMountFireSector,
    mountSlots,
    fixedSeaSkimmerLaunchers: fixedSeaSkimmerLaunchers.length ? fixedSeaSkimmerLaunchers : undefined,
    aswmMagazine,
    aswmMagicReloadMs,
    defaultLoadout: Object.keys(defaultLoadout).length ? defaultLoadout : undefined,
    clientVisualTuningDefaults,
  };
}

function tryReadFullProfile(root: HTMLElement): ShipHullVisualProfile | null {
  try {
    return readFullProfile(root);
  } catch {
    return null;
  }
}

function writeForm(root: HTMLElement, merged: ShipHullVisualProfile): void {
  const q = (name: string): HTMLInputElement => root.querySelector(`[data-field="${name}"]`) as HTMLInputElement;

  q("profileId").value = merged.profileId ?? "";
  (root.querySelector('[data-field="shipClassId"]') as HTMLSelectElement).value = merged.shipClassId;
  q("labelDe").value = merged.labelDe ?? "";
  (root.querySelector('[data-field="hullGltfId"]') as HTMLSelectElement).value = merged.hullGltfId;
  q("hullVisualScale").value = String(merged.hullVisualScale ?? 1);

  const m = merged.movement ?? {};
  q("movementSpeedMul").value = String(m.movementSpeedMul ?? 1);
  q("turnRateMul").value = String(m.turnRateMul ?? 1);
  q("accelMul").value = String(m.accelMul ?? 1);
  q("rudderResponsivenessMul").value =
    m.rudderResponsivenessMul !== undefined ? String(m.rudderResponsivenessMul) : "";
  q("minSpeedForFullTurnMul").value =
    m.minSpeedForFullTurnMul !== undefined ? String(m.minSpeedForFullTurnMul) : "";
  q("dragWhenNeutralMul").value = m.dragWhenNeutralMul !== undefined ? String(m.dragWhenNeutralMul) : "";

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

  writeFireSector(root, merged.defaultRotatingMountFireSector);

  const mag = merged.aswmMagazine;
  q("aswmPort").value = mag !== undefined ? String(mag.port) : "";
  q("aswmSb").value = mag !== undefined ? String(mag.starboard) : "";
  q("aswmMagicReloadMs").value =
    merged.aswmMagicReloadMs !== undefined ? String(merged.aswmMagicReloadMs) : "";

  const cv = merged.clientVisualTuningDefaults;
  q("cvSpriteScale").value = cv?.spriteScale !== undefined ? String(cv.spriteScale) : "";
  q("cvHullYOffset").value = cv?.gltfHullYOffset !== undefined ? String(cv.gltfHullYOffset) : "";
  q("cvHullOffsetX").value = cv?.gltfHullOffsetX !== undefined ? String(cv.gltfHullOffsetX) : "";
  q("cvHullOffsetZ").value = cv?.gltfHullOffsetZ !== undefined ? String(cv.gltfHullOffsetZ) : "";
  q("cvShipPivotZ").value = cv?.shipPivotLocalZ !== undefined ? String(cv.shipPivotLocalZ) : "";

  (root.querySelector('[data-json="mountSlots"]') as HTMLTextAreaElement).value = JSON.stringify(
    merged.mountSlots ?? [],
    null,
    2,
  );
  (root.querySelector('[data-json="fixedSeaSkimmerLaunchers"]') as HTMLTextAreaElement).value =
    JSON.stringify(merged.fixedSeaSkimmerLaunchers ?? [], null, 2);
  (root.querySelector('[data-json="defaultLoadout"]') as HTMLTextAreaElement).value = JSON.stringify(
    merged.defaultLoadout ?? {},
    null,
    2,
  );
}

function syncRangeLabels(root: HTMLElement): void {
  for (const inp of root.querySelectorAll<HTMLInputElement>(".ship-editor-range")) {
    const name = inp.dataset.field;
    if (!name) continue;
    const lab = root.querySelector(`[data-range-for="${name}"]`);
    if (lab) lab.textContent = inp.value;
  }
}

function buildHullOptions(): string {
  return Object.keys(HULL_GLTF_URL_BY_ID)
    .map((id) => `<option value="${id}">${id}</option>`)
    .join("");
}

function buildClassOptions(): string {
  return CLASSES.map((c) => `<option value="${c.id}">${c.label}</option>`).join("");
}

/**
 * Eingebettetes Panel (z. B. rechte Spalte der Workbench), kein Modal.
 */
export function createShipProfileEditorPanel(
  parent: HTMLElement,
  options?: {
    onApplied?: (shipClassId: ShipClassId) => void;
    onClassChange?: (shipClassId: ShipClassId) => void;
    /** Live-Update der 3D-Ansicht (Workbench), ohne Speichern — bei jedem gültigen Formularstand */
    onLivePreview?: (profile: ShipHullVisualProfile) => void;
    initialClass?: ShipClassId;
  },
): ShipProfileEditorPanelApi {
  let currentClass: ShipClassId = options?.initialClass ?? SHIP_CLASS_FAC;

  const root = document.createElement("div");
  root.className = "ship-profile-editor-root";
  root.setAttribute("role", "region");
  root.setAttribute("aria-label", "Schiffsprofil");

  const hullOptions = buildHullOptions();
  const classOptions = buildClassOptions();

  root.innerHTML = `
    <div class="ship-editor-panel ship-profile-editor-panel">
      <h2 class="ship-editor-title">Schiffsprofil</h2>
      <p class="ship-editor-hint ship-profile-editor-hint">
        Speichern = Patch in <strong>localStorage</strong>. JSON-Tabs: <code>mountSlots</code>,
        <code>fixedSeaSkimmerLaunchers</code>, <code>defaultLoadout</code> — gleiche Struktur wie in
        <code>shared/src/data/ships/</code>.
      </p>
      <div class="ship-editor-tabs" role="tablist" aria-label="Profil-Kategorien">
        <button type="button" class="ship-editor-tab is-active" role="tab" aria-selected="true" data-tab="basis">Basis</button>
        <button type="button" class="ship-editor-tab" role="tab" aria-selected="false" data-tab="movement">Bewegung</button>
        <button type="button" class="ship-editor-tab" role="tab" aria-selected="false" data-tab="hitbox">Hitbox</button>
        <button type="button" class="ship-editor-tab" role="tab" aria-selected="false" data-tab="fire">Feuersektor</button>
        <button type="button" class="ship-editor-tab" role="tab" aria-selected="false" data-tab="asum">ASuM</button>
        <button type="button" class="ship-editor-tab" role="tab" aria-selected="false" data-tab="client">Darstellung</button>
        <button type="button" class="ship-editor-tab" role="tab" aria-selected="false" data-tab="json">JSON</button>
      </div>
      <div class="ship-editor-tab-panels">
        <div class="ship-editor-tab-panel is-active" data-tab-panel="basis" role="tabpanel">
          <label class="ship-editor-field"><span>profileId</span>
            <input type="text" data-field="profileId" class="ship-editor-input" autocomplete="off" /></label>
          <label class="ship-editor-field"><span>shipClassId</span>
            <select data-field="shipClassId" class="ship-editor-input">${classOptions}</select></label>
          <label class="ship-editor-field"><span>labelDe</span>
            <input type="text" data-field="labelDe" class="ship-editor-input" /></label>
          <label class="ship-editor-field"><span>hullGltfId</span>
            <select data-field="hullGltfId" class="ship-editor-input">${hullOptions}</select></label>
          <label class="ship-editor-field"><span>hullVisualScale</span>
            <input type="range" data-field="hullVisualScale" min="0.001" max="3" step="0.0001" value="1" class="ship-editor-range" />
            <span class="ship-editor-range-val" data-range-for="hullVisualScale">1</span></label>
        </div>
        <div class="ship-editor-tab-panel" data-tab-panel="movement" role="tabpanel" hidden>
          <label class="ship-editor-field"><span>movementSpeedMul</span>
            <input type="range" data-field="movementSpeedMul" min="0.3" max="2.5" step="0.05" value="1" class="ship-editor-range" />
            <span class="ship-editor-range-val" data-range-for="movementSpeedMul">1</span></label>
          <label class="ship-editor-field"><span>turnRateMul</span>
            <input type="range" data-field="turnRateMul" min="0.3" max="2.5" step="0.05" value="1" class="ship-editor-range" />
            <span class="ship-editor-range-val" data-range-for="turnRateMul">1</span></label>
          <label class="ship-editor-field"><span>accelMul</span>
            <input type="range" data-field="accelMul" min="0.3" max="2.5" step="0.05" value="1" class="ship-editor-range" />
            <span class="ship-editor-range-val" data-range-for="accelMul">1</span></label>
          <label class="ship-editor-field"><span>rudderResponsivenessMul (optional)</span>
            <input type="number" step="0.05" data-field="rudderResponsivenessMul" class="ship-editor-num" placeholder="1" /></label>
          <label class="ship-editor-field"><span>minSpeedForFullTurnMul (optional)</span>
            <input type="number" step="0.05" data-field="minSpeedForFullTurnMul" class="ship-editor-num" placeholder="1" /></label>
          <label class="ship-editor-field"><span>dragWhenNeutralMul (optional)</span>
            <input type="number" step="0.05" data-field="dragWhenNeutralMul" class="ship-editor-num" placeholder="1" /></label>
        </div>
        <div class="ship-editor-tab-panel" data-tab-panel="hitbox" role="tabpanel" hidden>
          <div class="ship-editor-subtitle">collisionHitbox (AABB, +Y oben, +Z Bug)</div>
          <div class="ship-editor-grid">
            <label>Mitte X <input type="number" step="0.1" data-field="hbCx" class="ship-editor-num" /></label>
            <label>Mitte Y <input type="number" step="0.1" data-field="hbCy" class="ship-editor-num" /></label>
            <label>Mitte Z <input type="number" step="0.1" data-field="hbCz" class="ship-editor-num" /></label>
            <label>Halbe X <input type="number" step="0.1" min="0.05" data-field="hbHx" class="ship-editor-num" /></label>
            <label>Halbe Y <input type="number" step="0.1" min="0.05" data-field="hbHy" class="ship-editor-num" /></label>
            <label>Halbe Z <input type="number" step="0.1" min="0.05" data-field="hbHz" class="ship-editor-num" /></label>
          </div>
        </div>
        <div class="ship-editor-tab-panel" data-tab-panel="fire" role="tabpanel" hidden>
          <p class="ship-profile-json-note">defaultRotatingMountFireSector — Fallback für drehbare Mounts ohne eigenen <code>fireSector</code>.</p>
          <label class="ship-editor-field"><span>Art</span>
            <select data-field="fsKind" class="ship-editor-input">
              <option value="">(kein Eintrag)</option>
              <option value="symmetric">symmetric</option>
              <option value="asymmetric">asymmetric</option>
            </select></label>
          <div data-fs-panel="symmetric" hidden>
            <label class="ship-editor-field"><span>halfAngleRadFromBow</span>
              <input type="number" step="0.01" data-field="fsHalf" class="ship-editor-num" /></label>
          </div>
          <div data-fs-panel="asymmetric" hidden>
            <label class="ship-editor-field"><span>minYawRadFromBow</span>
              <input type="number" step="0.01" data-field="fsMin" class="ship-editor-num" /></label>
            <label class="ship-editor-field"><span>maxYawRadFromBow</span>
              <input type="number" step="0.01" data-field="fsMax" class="ship-editor-num" /></label>
          </div>
        </div>
        <div class="ship-editor-tab-panel" data-tab-panel="asum" role="tabpanel" hidden>
          <div class="ship-editor-subtitle">aswmMagazine</div>
          <label class="ship-editor-field"><span>port</span>
            <input type="number" step="1" min="0" data-field="aswmPort" class="ship-editor-num" placeholder="leer = nicht setzen" /></label>
          <label class="ship-editor-field"><span>starboard</span>
            <input type="number" step="1" min="0" data-field="aswmSb" class="ship-editor-num" placeholder="leer = nicht setzen" /></label>
          <p class="ship-profile-json-note">Beide Felder leer: kein Override. Beide gesetzt: Magazin wird überschrieben.</p>
          <label class="ship-editor-field"><span>aswmMagicReloadMs (optional)</span>
            <input type="number" step="100" min="0" data-field="aswmMagicReloadMs" class="ship-editor-num" /></label>
        </div>
        <div class="ship-editor-tab-panel" data-tab-panel="client" role="tabpanel" hidden>
          <p class="ship-profile-json-note">clientVisualTuningDefaults</p>
          <label class="ship-editor-field"><span>spriteScale</span>
            <input type="number" step="0.05" data-field="cvSpriteScale" class="ship-editor-num" /></label>
          <label class="ship-editor-field"><span>gltfHullYOffset</span>
            <input type="number" step="0.05" data-field="cvHullYOffset" class="ship-editor-num" /></label>
          <label class="ship-editor-field"><span>gltfHullOffsetX (+X Steuerbord)</span>
            <input type="number" step="0.05" data-field="cvHullOffsetX" class="ship-editor-num" placeholder="optional" /></label>
          <label class="ship-editor-field"><span>gltfHullOffsetZ (+Z Bug)</span>
            <input type="number" step="0.05" data-field="cvHullOffsetZ" class="ship-editor-num" placeholder="optional" /></label>
          <label class="ship-editor-field"><span>shipPivotLocalZ (optional, sonst Env-Debug)</span>
            <input type="number" step="0.1" min="-80" max="80" data-field="cvShipPivotZ" class="ship-editor-num" placeholder="leer = global" /></label>
        </div>
        <div class="ship-editor-tab-panel" data-tab-panel="json" role="tabpanel" hidden>
          <label class="ship-editor-field ship-editor-json-block"><span>mountSlots (JSON-Array)</span>
            <textarea data-json="mountSlots" class="ship-editor-json" spellcheck="false" rows="10"></textarea></label>
          <label class="ship-editor-field ship-editor-json-block"><span>fixedSeaSkimmerLaunchers (JSON-Array)</span>
            <textarea data-json="fixedSeaSkimmerLaunchers" class="ship-editor-json" spellcheck="false" rows="6"></textarea></label>
          <label class="ship-editor-field ship-editor-json-block"><span>defaultLoadout (JSON-Objekt)</span>
            <textarea data-json="defaultLoadout" class="ship-editor-json" spellcheck="false" rows="5"></textarea></label>
        </div>
      </div>
      <div class="ship-editor-actions">
        <button type="button" class="ship-editor-btn ship-editor-btn-primary" data-action="save">Speichern</button>
        <button type="button" class="ship-editor-btn" data-action="reset">Klasse zurücksetzen</button>
        <button type="button" class="ship-editor-btn" data-action="export">JSON exportieren</button>
        <label class="ship-editor-btn ship-editor-file">JSON importieren
          <input type="file" accept="application/json,.json" data-action="import" hidden /></label>
      </div>
    </div>
  `;

  parent.appendChild(root);

  let livePreviewRaf = 0;

  const pushLivePreview = (): void => {
    const profile = tryReadFullProfile(root);
    if (!profile) return;
    setHullProfileWorkbenchLivePreview(profile.shipClassId, profile);
    options?.onLivePreview?.(profile);
  };

  const scheduleLivePreview = (): void => {
    if (livePreviewRaf) cancelAnimationFrame(livePreviewRaf);
    livePreviewRaf = requestAnimationFrame(() => {
      livePreviewRaf = 0;
      pushLivePreview();
    });
  };

  const refreshForm = (): void => {
    const merged = getEffectiveHullProfile(currentClass)!;
    writeForm(root, merged);
    syncRangeLabels(root);
  };

  const setActiveTab = (name: string): void => {
    for (const b of root.querySelectorAll<HTMLButtonElement>(".ship-editor-tab")) {
      const on = b.dataset.tab === name;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    }
    for (const p of root.querySelectorAll<HTMLElement>(".ship-editor-tab-panel")) {
      const on = p.dataset.tabPanel === name;
      p.classList.toggle("is-active", on);
      p.hidden = !on;
    }
  };

  const ac = new AbortController();
  const { signal } = ac;

  root.addEventListener(
    "click",
    (e) => {
      const tab = (e.target as HTMLElement).closest(".ship-editor-tab") as HTMLElement | null;
      const tabName = tab?.dataset.tab;
      if (tabName) {
        e.preventDefault();
        setActiveTab(tabName);
      }
    },
    { signal },
  );

  root.addEventListener(
    "input",
    (e) => {
      const t = e.target as HTMLElement;
      if (t.classList.contains("ship-editor-range")) {
        const name = t.getAttribute("data-field");
        if (name) {
          const lab = root.querySelector(`[data-range-for="${name}"]`);
          if (lab) lab.textContent = (t as HTMLInputElement).value;
        }
      }
      scheduleLivePreview();
    },
    { signal },
  );

  root.querySelector('[data-field="fsKind"]')?.addEventListener(
    "change",
    () => {
      const kind = (root.querySelector('[data-field="fsKind"]') as HTMLSelectElement).value;
      const sym = root.querySelector('[data-fs-panel="symmetric"]') as HTMLElement;
      const asym = root.querySelector('[data-fs-panel="asymmetric"]') as HTMLElement;
      sym.hidden = kind !== "symmetric";
      asym.hidden = kind !== "asymmetric";
      scheduleLivePreview();
    },
    { signal },
  );

  root.querySelector('[data-field="shipClassId"]')?.addEventListener(
    "change",
    () => {
      const next = (root.querySelector('[data-field="shipClassId"]') as HTMLSelectElement)
        .value as ShipClassId;
      if (next === currentClass) return;
      currentClass = next;
      refreshForm();
      pushLivePreview();
      options?.onClassChange?.(currentClass);
    },
    { signal },
  );

  root.addEventListener(
    "click",
    (e) => {
      const t = (e.target as HTMLElement).closest("[data-action]");
      if (!t) return;
      const action = t.getAttribute("data-action");
      if (action === "save") {
        try {
          const profile = readFullProfile(root);
          if (!getAuthoritativeShipHullProfile(profile.shipClassId)) {
            window.alert("Unbekannte shipClassId.");
            return;
          }
          setHullProfilePatchForClass(profile.shipClassId, profile);
          setHullProfileWorkbenchLivePreview(profile.shipClassId, null);
          currentClass = profile.shipClassId;
          (root.querySelector('[data-field="shipClassId"]') as HTMLSelectElement).value = currentClass;
          refreshForm();
          options?.onApplied?.(currentClass);
        } catch (err) {
          console.error("[ShipProfileEditor]", err);
          window.alert(err instanceof Error ? err.message : "Speichern fehlgeschlagen.");
        }
      }
      if (action === "reset") {
        setHullProfilePatchForClass(currentClass, null);
        setHullProfileWorkbenchLivePreview(currentClass, null);
        refreshForm();
        options?.onApplied?.(currentClass);
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
    },
    { signal },
  );

  root.addEventListener(
    "change",
    (e) => {
      const inp = e.target as HTMLInputElement;
      if (inp.matches('[data-action="import"]') && inp.files?.[0]) {
        const file = inp.files[0];
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const data = JSON.parse(String(reader.result)) as ShipHullVisualProfile;
            if (!data.shipClassId || !getAuthoritativeShipHullProfile(data.shipClassId)) {
              throw new Error("Ungültige oder unbekannte shipClassId");
            }
            setHullProfilePatchForClass(data.shipClassId, data);
            setHullProfileWorkbenchLivePreview(data.shipClassId, null);
            currentClass = data.shipClassId;
            refreshForm();
            options?.onApplied?.(currentClass);
            options?.onClassChange?.(currentClass);
          } catch (err) {
            console.error("[ShipProfileEditor] Import failed", err);
            window.alert("Import fehlgeschlagen — siehe Konsole.");
          }
        };
        reader.readAsText(file);
        inp.value = "";
        return;
      }
      scheduleLivePreview();
    },
    { signal },
  );

  refreshForm();

  return {
    setShipClass: (id: ShipClassId) => {
      currentClass = id;
      (root.querySelector('[data-field="shipClassId"]') as HTMLSelectElement).value = id;
      refreshForm();
      pushLivePreview();
    },
    getShipClass: () => currentClass,
    refresh: refreshForm,
    dispose: () => {
      clearAllHullProfileWorkbenchLivePreviews();
      ac.abort();
      root.remove();
    },
  };
}
