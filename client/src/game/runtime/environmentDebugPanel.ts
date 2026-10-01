import {
  SHIP_CLASS_CRUISER,
  SHIP_CLASS_DESTROYER,
  SHIP_CLASS_FAC,
  type ShipClassId,
} from "@battlefleet/shared";
import type { GameSceneBundle } from "../scene/createGameScene";
import { sunAnglesFromPosition } from "../scene/environmentSun";
import { LIGHTING_PRESETS, type LightingPresetId } from "../scene/lightingPresets";
import {
  applyFollowCameraTuning,
  DEFAULT_FOLLOW_CAMERA_TUNING,
  getFollowCameraTuning,
  resetFollowCameraTuning,
  savePersistedFollowCameraTuning,
  subscribeFollowCameraTuning,
  type FollowCameraTuning,
} from "./followCameraTuning";
import {
  applyShipDebugTuning,
  DEFAULT_SHIP_DEBUG_TUNING,
  getShipDebugTuning,
  type ShipDebugTuning,
} from "./shipDebugTuning";
import {
  DEFAULT_ENVIRONMENT_TUNING,
  type EnvironmentTuning,
} from "./environmentTuning";
import { clearPersistedClientSettings } from "./clearPersistedClientSettings";
import {
  isShipHitboxDebugVisible,
  isWreckCollisionDebugVisible,
  setShipHitboxDebugVisible,
  setWreckCollisionDebugVisible,
} from "./shipProfileRuntime";
import { appendToBottomDebugDock } from "./bottomDebugDock";
import { getSoundMix, resetSoundMixToDefaults, setSoundMix } from "../audio/soundMixState";
import { savePersistedShipTuning } from "./shipTuningStorage";
import { resetThirdPersonCamera } from "./thirdPersonCamera";

type ShipSliderDef = {
  key: {
    [K in keyof ShipDebugTuning]: ShipDebugTuning[K] extends number ? K : never;
  }[keyof ShipDebugTuning];
  label: string;
  min: number;
  max: number;
  step: number;
};

const SHIP_SLIDERS: readonly ShipSliderDef[] = [
  { key: "cameraPivotLocalZ", label: "Camera Pivot Z", min: -80, max: 80, step: 0.1 },
  { key: "mineSpawnLocalZ", label: "Mine Spawn Z", min: -140, max: 20, step: 0.1 },
];

/** Checkbox „Feinschritte“: Zehntel des normalen Sliderschritts. */
function effectiveShipSliderStep(s: ShipSliderDef, useFineSteps: boolean): number {
  if (!useFineSteps) return s.step;
  const f = s.step / 10;
  return f < 1e-9 ? s.step : f;
}

function snapToStep(v: number, step: number): number {
  if (!(step > 0)) return v;
  const inv = 1 / step;
  return Math.round(v * inv) / inv;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function hexInputToNumber(hex: string): number {
  const s = hex.replace("#", "");
  return Number.parseInt(s, 16);
}

function numberToHexInput(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

export type EnvironmentDebugPanelOptions = {
  /** Nach Raumbeitritt setzen: wechselt die Spielerklasse serverseitig (nur Debug). */
  getDebugShipClassSender?: () => ((shipClass: ShipClassId) => void) | undefined;
};

export function createEnvironmentDebugPanel(
  bundle: GameSceneBundle,
  options?: EnvironmentDebugPanelOptions,
): { dispose: () => void } {
  const currentCamera: FollowCameraTuning = {
    ...DEFAULT_FOLLOW_CAMERA_TUNING,
    ...getFollowCameraTuning(),
  };

  let env: EnvironmentTuning = bundle.getEnvironmentTuning();

  const root = document.createElement("div");
  root.className = "environment-debug-panel";
  /* Layout + scale: index.html `.environment-debug-panel` */
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;";
  const title = document.createElement("div");
  title.textContent = "Environment Debug";
  title.style.cssText = "font-weight:700;";
  const headerButtons = document.createElement("div");
  headerButtons.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end;";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.style.cssText =
    "background:#153247;color:#bfe7ff;border:1px solid rgba(130,180,220,0.45);" +
    "border-radius:5px;padding:2px 7px;cursor:pointer;font:11px system-ui,sans-serif;";
  const resetAll = document.createElement("button");
  resetAll.type = "button";
  resetAll.textContent = "Reset";
  resetAll.title = "Reset environment, foam, ship and camera to defaults";
  resetAll.style.cssText =
    "background:#2a4a2a;color:#c8ffc8;border:1px solid rgba(130,220,150,0.45);" +
    "border-radius:5px;padding:2px 7px;cursor:pointer;font:11px system-ui,sans-serif;";
  const clearBrowserStorage = document.createElement("button");
  clearBrowserStorage.type = "button";
  clearBrowserStorage.textContent = "Clear storage";
  clearBrowserStorage.title =
    "Remove all local settings from this browser and reload (same as ?resetLocal=1).";
  clearBrowserStorage.style.cssText =
    "background:#4a3a2a;color:#ffd4a8;border:1px solid rgba(220,160,100,0.55);" +
    "border-radius:5px;padding:2px 7px;cursor:pointer;font:11px system-ui,sans-serif;";
  headerButtons.appendChild(toggle);
  headerButtons.appendChild(resetAll);
  headerButtons.appendChild(clearBrowserStorage);
  header.appendChild(title);
  header.appendChild(headerButtons);
  root.appendChild(header);

  const tabBar = document.createElement("div");
  tabBar.style.cssText = "display:none;flex-wrap:wrap;gap:4px;margin-top:6px;";

  const panelHost = document.createElement("div");
  panelHost.style.cssText =
    "display:none;max-height:min(52vh,380px);overflow-x:hidden;overflow-y:auto;margin-top:4px;" +
    "padding-right:4px;scrollbar-gutter:stable;";

  const makePanel = (): HTMLDivElement => {
    const p = document.createElement("div");
    p.style.cssText =
      "display:none;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;width:100%;";
    return p;
  };

  const panelEnv = makePanel();
  const panelWaterThree = makePanel();
  const panelShip = makePanel();
  const panelCam = makePanel();
  const panelSound = makePanel();

  const addSectionTitle = (parent: HTMLElement, text: string, withTopBorder = true): void => {
    const el = document.createElement("div");
    el.style.cssText =
      "grid-column:1/-1;font-weight:700;" +
      (withTopBorder
        ? "margin-top:6px;padding-top:6px;border-top:1px solid rgba(130,180,220,0.28);"
        : "");
    el.textContent = text;
    parent.appendChild(el);
  };

  const addSlider = (
    parent: HTMLElement,
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onInput: (v: number) => void,
  ): { input: HTMLInputElement; val: HTMLElement } => {
    const lab = document.createElement("label");
    lab.textContent = label;
    parent.appendChild(lab);
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    input.style.width = "120px";
    const val = document.createElement("span");
    val.style.cssText = "min-width:52px;text-align:right;color:#9ed3ff;";
    val.textContent = Number(value).toFixed(3);
    input.addEventListener("input", () => {
      const raw = Number(input.value);
      const next = clamp(raw, min, max);
      val.textContent = next.toFixed(3);
      onInput(next);
    });
    wrap.appendChild(input);
    wrap.appendChild(val);
    parent.appendChild(wrap);
    return { input, val };
  };

  const selectStyle =
    "background:#153247;color:#bfe7ff;border:1px solid rgba(130,180,220,0.45);" +
    "border-radius:5px;padding:2px 6px;font:11px system-ui,sans-serif;max-width:180px;";

  /* ——— Tab: Umgebung ——— */
  addSectionTitle(panelEnv, "Sky & lighting", false);
  const skyLab = document.createElement("label");
  skyLab.textContent = "Sky";
  panelEnv.appendChild(skyLab);
  const skyWrap = document.createElement("div");
  skyWrap.style.cssText = "display:flex;justify-content:flex-end;";
  const skyToggle = document.createElement("input");
  skyToggle.type = "checkbox";
  skyToggle.checked = env.skyEnabled;
  skyToggle.addEventListener("change", () => {
    env = { ...env, skyEnabled: skyToggle.checked };
    bundle.applyEnvironmentTuning({ skyEnabled: skyToggle.checked });
  });
  skyWrap.appendChild(skyToggle);
  panelEnv.appendChild(skyWrap);

  const turbRef = addSlider(panelEnv, "Turbidity", 0.5, 20, 0.25, env.turbidity, (v) => {
    env = { ...env, turbidity: v };
    bundle.applyEnvironmentTuning({ turbidity: v });
  });
  const rayRef = addSlider(panelEnv, "Rayleigh", 0.1, 4, 0.05, env.rayleigh, (v) => {
    env = { ...env, rayleigh: v };
    bundle.applyEnvironmentTuning({ rayleigh: v });
  });
  const mieRef = addSlider(panelEnv, "Mie", 0, 0.05, 0.0005, env.mieCoefficient, (v) => {
    env = { ...env, mieCoefficient: v };
    bundle.applyEnvironmentTuning({ mieCoefficient: v });
  });
  const mieGRef = addSlider(panelEnv, "Mie Dir G", 0.2, 1, 0.02, env.mieDirectionalG, (v) => {
    env = { ...env, mieDirectionalG: v };
    bundle.applyEnvironmentTuning({ mieDirectionalG: v });
  });
  const elevRef = addSlider(panelEnv, "Sun elevation (°)", -5, 85, 0.5, env.elevationDeg, (v) => {
    env = { ...env, elevationDeg: v };
    bundle.applyEnvironmentTuning({ elevationDeg: v });
  });
  const aziRef = addSlider(panelEnv, "Sun azimuth (°)", 0, 360, 1, env.azimuthDeg, (v) => {
    env = { ...env, azimuthDeg: v };
    bundle.applyEnvironmentTuning({ azimuthDeg: v });
  });

  const presetLab = document.createElement("label");
  presetLab.textContent = "Lighting preset";
  panelEnv.appendChild(presetLab);
  const presetSel = document.createElement("select");
  presetSel.style.cssText = selectStyle;
  for (const id of Object.keys(LIGHTING_PRESETS) as LightingPresetId[]) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = id;
    presetSel.appendChild(o);
  }
  presetSel.value = env.lightingPreset;
  presetSel.addEventListener("change", () => {
    const id = presetSel.value as LightingPresetId;
    const ang = sunAnglesFromPosition(LIGHTING_PRESETS[id].sunPos);
    env = { ...env, lightingPreset: id, elevationDeg: ang.elevationDeg, azimuthDeg: ang.azimuthDeg };
    bundle.applyEnvironmentTuning(env);
    elevRef.input.value = String(ang.elevationDeg);
    elevRef.val.textContent = ang.elevationDeg.toFixed(1);
    aziRef.input.value = String(ang.azimuthDeg);
    aziRef.val.textContent = ang.azimuthDeg.toFixed(1);
  });
  panelEnv.appendChild(presetSel);

  const ambRef = addSlider(panelEnv, "Ambient ×", 0.2, 2.2, 0.02, env.ambientIntensityMul, (v) => {
    env = { ...env, ambientIntensityMul: v };
    bundle.applyEnvironmentTuning({ ambientIntensityMul: v });
  });
  const sunMulRef = addSlider(panelEnv, "Sun ×", 0.2, 2.2, 0.02, env.sunIntensityMul, (v) => {
    env = { ...env, sunIntensityMul: v };
    bundle.applyEnvironmentTuning({ sunIntensityMul: v });
  });
  const fogRef = addSlider(panelEnv, "Fog strength", 0, 1, 0.02, env.fogStrength, (v) => {
    env = { ...env, fogStrength: v };
    bundle.applyEnvironmentTuning({ fogStrength: v });
  });

  /* ——— Tab: three.js Wasser ——— */
  addSectionTitle(panelWaterThree, "three.js Water", false);
  const distRef = addSlider(
    panelWaterThree,
    "Distortion",
    0.5,
    12,
    0.1,
    env.waterDistortionScale,
    (v) => {
      env = { ...env, waterDistortionScale: v };
      bundle.applyEnvironmentTuning({ waterDistortionScale: v });
    },
  );
  const sizeRef = addSlider(panelWaterThree, "Noise Size", 0.2, 4, 0.05, env.waterSize, (v) => {
    env = { ...env, waterSize: v };
    bundle.applyEnvironmentTuning({ waterSize: v });
  });
  const alphaRef = addSlider(panelWaterThree, "Alpha", 0.35, 1, 0.01, env.waterAlpha, (v) => {
    env = { ...env, waterAlpha: v };
    bundle.applyEnvironmentTuning({ waterAlpha: v });
  });

  const wcLab = document.createElement("label");
  wcLab.textContent = "Water color";
  panelWaterThree.appendChild(wcLab);
  const wcPick = document.createElement("input");
  wcPick.type = "color";
  wcPick.value = numberToHexInput(env.waterColorHex);
  wcPick.addEventListener("input", () => {
    const n = hexInputToNumber(wcPick.value);
    env = { ...env, waterColorHex: n };
    bundle.applyEnvironmentTuning({ waterColorHex: n });
  });
  panelWaterThree.appendChild(wcPick);

  const wsLab = document.createElement("label");
  wsLab.textContent = "Sun color (water)";
  panelWaterThree.appendChild(wsLab);
  const wsPick = document.createElement("input");
  wsPick.type = "color";
  wsPick.value = numberToHexInput(env.waterSunColorHex);
  wsPick.addEventListener("input", () => {
    const n = hexInputToNumber(wsPick.value);
    env = { ...env, waterSunColorHex: n };
    bundle.applyEnvironmentTuning({ waterSunColorHex: n });
  });
  panelWaterThree.appendChild(wsPick);

  const reflLab = document.createElement("label");
  reflLab.textContent = "Reflection RT (px)";
  panelWaterThree.appendChild(reflLab);
  const reflWrap = document.createElement("div");
  reflWrap.style.cssText = "display:flex;align-items:center;gap:6px;justify-content:flex-end;";
  const reflSel = document.createElement("select");
  reflSel.style.cssText = selectStyle;
  for (const px of [256, 512, 1024]) {
    const o = document.createElement("option");
    o.value = String(px);
    o.textContent = String(px);
    reflSel.appendChild(o);
  }
  reflSel.value = String(env.reflectionTextureSize);
  const reflNote = document.createElement("div");
  reflNote.style.cssText = "grid-column:1/-1;font-size:10px;color:#9ab;";
  reflNote.textContent = "Reload the page to apply the reflection resolution.";
  reflNote.style.display = "none";
  reflSel.addEventListener("change", () => {
    env = { ...env, reflectionTextureSize: Number(reflSel.value) };
    bundle.applyEnvironmentTuning({ reflectionTextureSize: Number(reflSel.value) });
    reflNote.style.display = "block";
  });
  reflWrap.appendChild(reflSel);
  panelWaterThree.appendChild(reflWrap);
  panelWaterThree.appendChild(reflNote);

  /* ——— Tab: Schiff ——— */
  addSectionTitle(panelShip, "Ship / Sprite", false);
  const currentShip: ShipDebugTuning = {
    ...DEFAULT_SHIP_DEBUG_TUNING,
    ...getShipDebugTuning(),
  };
  const arcLabel = document.createElement("label");
  arcLabel.textContent = "Weapon Arc Visible";
  panelShip.appendChild(arcLabel);
  const arcWrap = document.createElement("div");
  arcWrap.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:6px;";
  const arcToggle = document.createElement("input");
  arcToggle.type = "checkbox";
  arcToggle.checked = currentShip.showWeaponArc;
  arcToggle.addEventListener("change", () => {
    currentShip.showWeaponArc = arcToggle.checked;
    applyShipDebugTuning({ showWeaponArc: arcToggle.checked });
    savePersistedShipTuning(currentShip);
  });
  arcWrap.appendChild(arcToggle);
  panelShip.appendChild(arcWrap);

  const ringsLabel = document.createElement("label");
  ringsLabel.textContent = "Range rings (100 m)";
  ringsLabel.title = "Local ship: rings at 100 m intervals for range debugging.";
  panelShip.appendChild(ringsLabel);
  const ringsWrap = document.createElement("div");
  ringsWrap.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:6px;";
  const ringsToggle = document.createElement("input");
  ringsToggle.type = "checkbox";
  ringsToggle.checked = currentShip.showRangeRings;
  ringsToggle.addEventListener("change", () => {
    currentShip.showRangeRings = ringsToggle.checked;
    applyShipDebugTuning({ showRangeRings: ringsToggle.checked });
    savePersistedShipTuning(currentShip);
  });
  ringsWrap.appendChild(ringsToggle);
  panelShip.appendChild(ringsWrap);

  const islandPolyLabel = document.createElement("label");
  islandPolyLabel.textContent = "Island collision (polygons)";
  islandPolyLabel.title =
    "Outline of server/shared convex island footprints (DEFAULT_MAP_ISLAND_POLYGONS); matches physics.";
  panelShip.appendChild(islandPolyLabel);
  const islandPolyWrap = document.createElement("div");
  islandPolyWrap.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:6px;";
  const islandPolyToggle = document.createElement("input");
  islandPolyToggle.type = "checkbox";
  islandPolyToggle.checked = currentShip.showIslandCollisionPolygons;
  islandPolyToggle.addEventListener("change", () => {
    currentShip.showIslandCollisionPolygons = islandPolyToggle.checked;
    applyShipDebugTuning({ showIslandCollisionPolygons: islandPolyToggle.checked });
    bundle.islandCollisionPolygonGroup.visible = islandPolyToggle.checked;
    savePersistedShipTuning(currentShip);
  });
  islandPolyWrap.appendChild(islandPolyToggle);
  panelShip.appendChild(islandPolyWrap);

  const mountAimLabel = document.createElement("label");
  mountAimLabel.textContent = "Mount aim lines";
  mountAimLabel.title =
    "Lines from gun sockets to the aim point; visual only, saved in localStorage.";
  panelShip.appendChild(mountAimLabel);
  const mountAimWrap = document.createElement("div");
  mountAimWrap.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:6px;";
  const mountAimToggle = document.createElement("input");
  mountAimToggle.type = "checkbox";
  mountAimToggle.checked = currentShip.showMountAimLines;
  mountAimToggle.addEventListener("change", () => {
    currentShip.showMountAimLines = mountAimToggle.checked;
    applyShipDebugTuning({ showMountAimLines: mountAimToggle.checked });
    savePersistedShipTuning(currentShip);
  });
  mountAimWrap.appendChild(mountAimToggle);
  panelShip.appendChild(mountAimWrap);

  const hitboxLabel = document.createElement("label");
  hitboxLabel.textContent = "Hitbox (wireframe)";
  hitboxLabel.title = "Server hitbox (AABB) debug overlay; saved in localStorage.";
  panelShip.appendChild(hitboxLabel);
  const hitboxWrap = document.createElement("div");
  hitboxWrap.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:6px;";
  const hitboxToggle = document.createElement("input");
  hitboxToggle.type = "checkbox";
  hitboxToggle.checked = isShipHitboxDebugVisible();
  hitboxToggle.addEventListener("change", () => {
    setShipHitboxDebugVisible(hitboxToggle.checked);
  });
  hitboxWrap.appendChild(hitboxToggle);
  panelShip.appendChild(hitboxWrap);

  const wreckColLabel = document.createElement("label");
  wreckColLabel.textContent = "Wreck collision (hitbox)";
  wreckColLabel.title =
    "Wireframe matches the server hitbox OBB (simulation position and bearing). Saved locally.";
  panelShip.appendChild(wreckColLabel);
  const wreckColWrap = document.createElement("div");
  wreckColWrap.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:6px;";
  const wreckColToggle = document.createElement("input");
  wreckColToggle.type = "checkbox";
  wreckColToggle.checked = isWreckCollisionDebugVisible();
  wreckColToggle.addEventListener("change", () => {
    setWreckCollisionDebugVisible(wreckColToggle.checked);
  });
  wreckColWrap.appendChild(wreckColToggle);
  panelShip.appendChild(wreckColWrap);

  addSectionTitle(panelShip, "Match: change ship (debug)", true);
  const shipDbgHint = document.createElement("div");
  shipDbgHint.style.cssText =
    "grid-column:1/-1;font-size:10px;color:#8ab;line-height:1.35;margin-bottom:4px;";
  shipDbgHint.textContent =
    "During a match: set the class through the server (model, magazine, maximum HP). Without a room: console output.";
  panelShip.appendChild(shipDbgHint);
  const shipDbgRow = document.createElement("div");
  shipDbgRow.style.cssText =
    "grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:flex-start;";
  const mkShipDbgBtn = (label: string, shipClass: ShipClassId): void => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.style.cssText =
      "background:#153247;color:#bfe7ff;border:1px solid rgba(130,180,220,0.45);" +
      "border-radius:5px;padding:4px 10px;cursor:pointer;font:11px system-ui,sans-serif;";
    b.addEventListener("click", () => {
      const send = options?.getDebugShipClassSender?.();
      if (send) send(shipClass);
      else console.warn("[BattleFleet] Debug ship: not connected to a room yet.");
    });
    shipDbgRow.appendChild(b);
  };
  mkShipDbgBtn("FAC", SHIP_CLASS_FAC);
  mkShipDbgBtn("Destroyer", SHIP_CLASS_DESTROYER);
  mkShipDbgBtn("Cruiser", SHIP_CLASS_CRUISER);
  panelShip.appendChild(shipDbgRow);

  const shipFineRow = document.createElement("label");
  shipFineRow.style.cssText =
    "grid-column:1/-1;display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.82rem;margin-bottom:8px;";
  const shipFineCheckbox = document.createElement("input");
  shipFineCheckbox.type = "checkbox";
  shipFineCheckbox.checked = false;
  shipFineCheckbox.title = "Use one tenth of the normal step for all ship sliders (for example, GLB Y: 0.1 instead of 1).";
  const shipFineCaption = document.createElement("span");
  shipFineCaption.textContent = "Fine ship slider steps (1/10 increments)";
  shipFineRow.appendChild(shipFineCheckbox);
  shipFineRow.appendChild(shipFineCaption);
  panelShip.appendChild(shipFineRow);

  const shipSliderRefs: {
    key: keyof ShipDebugTuning;
    input: HTMLInputElement;
    numInput: HTMLInputElement;
    min: number;
    max: number;
  }[] = [];

  for (const s of SHIP_SLIDERS) {
    const label = document.createElement("label");
    label.textContent = s.label;
    panelShip.appendChild(label);

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(s.min);
    input.max = String(s.max);
    input.step = "any";
    input.value = String(currentShip[s.key]);
    input.style.width = "110px";
    const numInput = document.createElement("input");
    numInput.type = "number";
    numInput.min = String(s.min);
    numInput.max = String(s.max);
    numInput.step = "any";
    numInput.title = "Enter a value directly; press Enter or Tab to apply.";
    numInput.style.cssText =
      "width:88px;padding:2px 4px;font:11px system-ui,sans-serif;background:#0d1f2d;color:#cfefff;border:1px solid rgba(130,180,220,0.45);border-radius:4px;";
    numInput.value = String(currentShip[s.key]);

    const commitShipValue = (raw: number): void => {
      if (!Number.isFinite(raw)) return;
      const step = effectiveShipSliderStep(s, shipFineCheckbox.checked);
      const next = clamp(snapToStep(raw, step), s.min, s.max);
      const tuned = applyShipDebugTuning({ [s.key]: next });
      const applied = tuned[s.key] as number;
      currentShip[s.key] = applied;
      input.value = String(applied);
      numInput.value = String(applied);
      savePersistedShipTuning(currentShip);
    };

    input.addEventListener("input", () => {
      commitShipValue(Number(input.value));
    });
    numInput.addEventListener("change", () => {
      commitShipValue(Number(numInput.value));
    });
    numInput.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        numInput.blur();
      }
    });

    wrap.appendChild(input);
    wrap.appendChild(numInput);
    panelShip.appendChild(wrap);
    shipSliderRefs.push({ key: s.key, input, numInput, min: s.min, max: s.max });
  }

  const shipManualHint = document.createElement("div");
  shipManualHint.style.cssText = "grid-column:1/-1;font-size:10px;color:#8ab;line-height:1.35;margin-top:4px;";
  shipManualHint.textContent =
    "Type a value and press Enter or leave the field to apply it. Limits and increments match the slider.";
  panelShip.appendChild(shipManualHint);

  /* ——— Tab: Kamera ——— */
  addSectionTitle(panelCam, "Follow Camera", false);
  const viewLabel = document.createElement("label");
  viewLabel.textContent = "View";
  const viewSelect = document.createElement("select");
  viewSelect.style.cssText = selectStyle;
  viewSelect.setAttribute("aria-label", "Camera view");
  for (const [value, label] of [["map", "Map view"], ["thirdPerson", "Third-Person / Orbit"]]) {
    const option = document.createElement("option");
    option.value = value!; option.textContent = label!;
    viewSelect.appendChild(option);
  }
  viewSelect.value = currentCamera.mode;
  viewSelect.addEventListener("change", () => {
    const applied = applyFollowCameraTuning({ mode: viewSelect.value === "thirdPerson" ? "thirdPerson" : "map" });
    savePersistedFollowCameraTuning({ ...applied });
  });
  panelCam.append(viewLabel, viewSelect);
  const orbitHint = document.createElement("div");
  orbitHint.style.cssText = "grid-column:1/-1;font-size:11px;color:#9ed3ff;";
  orbitHint.textContent = "Third person: Alt + left-drag to look around; mouse wheel to zoom. Normal clicks still control weapons. Map settings below apply only to map view.";
  panelCam.appendChild(orbitHint);
  const recenterOrbit = document.createElement("button");
  recenterOrbit.type = "button";
  recenterOrbit.textContent = "Align orbit behind ship";
  recenterOrbit.style.gridColumn = "1/-1";
  recenterOrbit.addEventListener("click", resetThirdPersonCamera);
  panelCam.appendChild(recenterOrbit);
  const orbitDistanceRef = addSlider(panelCam, "Orbit distance", 80, 2000, 10, currentCamera.orbitDistance, (value) => {
    savePersistedFollowCameraTuning({ ...applyFollowCameraTuning({ orbitDistance: value }) });
  });
  const orbitPitchRef = addSlider(panelCam, "Orbit pitch (°)", 8, 80, 1, currentCamera.orbitPitchDeg, (value) => {
    savePersistedFollowCameraTuning({ ...applyFollowCameraTuning({ orbitPitchDeg: value }) });
  });
  const pitchLabel = document.createElement("label");
  pitchLabel.textContent = "Pitch angle (°)";
  panelCam.appendChild(pitchLabel);
  const pitchWrap = document.createElement("div");
  pitchWrap.style.cssText = "display:flex;align-items:center;gap:6px;";
  const pitchInput = document.createElement("input");
  pitchInput.type = "range";
  pitchInput.min = "15";
  pitchInput.max = "90";
  pitchInput.step = "1";
  pitchInput.value = String(Math.round(currentCamera.pitchDeg));
  pitchInput.style.width = "110px";
  const pitchVal = document.createElement("span");
  pitchVal.style.cssText = "min-width:46px;text-align:right;color:#9ed3ff;";
  pitchVal.textContent = String(Math.round(currentCamera.pitchDeg));
  pitchInput.addEventListener("input", () => {
    const next = clamp(Number(pitchInput.value), 15, 90);
    currentCamera.pitchDeg = next;
    pitchVal.textContent = String(Math.round(next));
    const applied = applyFollowCameraTuning({ pitchDeg: next });
    savePersistedFollowCameraTuning({ ...applied });
  });
  pitchWrap.appendChild(pitchInput);
  pitchWrap.appendChild(pitchVal);
  panelCam.appendChild(pitchWrap);

  const heightLabel = document.createElement("label");
  heightLabel.textContent = "Camera distance (height)";
  panelCam.appendChild(heightLabel);
  const heightWrap = document.createElement("div");
  heightWrap.style.cssText = "display:flex;align-items:center;gap:6px;";
  const heightInput = document.createElement("input");
  heightInput.type = "range";
  heightInput.min = "80";
  heightInput.max = "5000";
  heightInput.step = "10";
  heightInput.value = String(Math.round(currentCamera.heightAbovePivot));
  heightInput.style.width = "110px";
  const heightVal = document.createElement("span");
  heightVal.style.cssText = "min-width:46px;text-align:right;color:#9ed3ff;";
  heightVal.textContent = String(Math.round(currentCamera.heightAbovePivot));
  heightInput.addEventListener("input", () => {
    const next = clamp(Number(heightInput.value), 80, 5000);
    currentCamera.heightAbovePivot = next;
    heightVal.textContent = String(Math.round(next));
    const applied = applyFollowCameraTuning({ heightAbovePivot: next });
    savePersistedFollowCameraTuning({ ...applied });
  });
  heightWrap.appendChild(heightInput);
  heightWrap.appendChild(heightVal);
  panelCam.appendChild(heightWrap);

  const modeLabel = document.createElement("label");
  modeLabel.textContent = "Map rotation";
  panelCam.appendChild(modeLabel);
  const modeWrap = document.createElement("div");
  modeWrap.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:6px;";
  const modeSelect = document.createElement("select");
  modeSelect.style.cssText = selectStyle;
  const optNorth = document.createElement("option");
  optNorth.value = "north";
  optNorth.textContent = "North up";
  const optHead = document.createElement("option");
  optHead.value = "head";
  optHead.textContent = "Head up";
  modeSelect.appendChild(optNorth);
  modeSelect.appendChild(optHead);
  modeSelect.value = currentCamera.northUp ? "north" : "head";
  modeSelect.addEventListener("change", () => {
    const northUp = modeSelect.value === "north";
    currentCamera.northUp = northUp;
    const applied = applyFollowCameraTuning({ northUp });
    savePersistedFollowCameraTuning({ ...applied });
  });
  modeWrap.appendChild(modeSelect);
  panelCam.appendChild(modeWrap);

  const lagLabel = document.createElement("label");
  lagLabel.textContent = "Heading-up rotation lag (s)";
  lagLabel.title = "0 = rotate immediately. Higher values smooth camera turns (heading-up only).";
  panelCam.appendChild(lagLabel);
  const lagWrap = document.createElement("div");
  lagWrap.style.cssText = "display:flex;align-items:center;gap:6px;";
  const lagInput = document.createElement("input");
  lagInput.type = "range";
  lagInput.min = "0";
  lagInput.max = "0.75";
  lagInput.step = "0.01";
  lagInput.value = String(currentCamera.headUpYawLagSec);
  lagInput.style.width = "110px";
  const lagVal = document.createElement("span");
  lagVal.style.cssText = "min-width:46px;text-align:right;color:#9ed3ff;";
  lagVal.textContent = currentCamera.headUpYawLagSec.toFixed(2);
  lagInput.addEventListener("input", () => {
    const next = clamp(Number(lagInput.value), 0, 0.75);
    currentCamera.headUpYawLagSec = next;
    lagVal.textContent = next.toFixed(2);
    const applied = applyFollowCameraTuning({ headUpYawLagSec: next });
    savePersistedFollowCameraTuning({ ...applied });
  });
  lagWrap.appendChild(lagInput);
  lagWrap.appendChild(lagVal);
  panelCam.appendChild(lagWrap);

  const smInit = getSoundMix();
  addSectionTitle(panelSound, "Audio mix (×1 = default)", false);
  const smHint = document.createElement("div");
  smHint.style.cssText = "grid-column:1/-1;font-size:10px;color:#84b5d9;margin-bottom:4px;";
  smHint.textContent =
    "Multipliers for base audio levels: dynamic music, engine loop and sound effects. Saved in localStorage.";
  panelSound.appendChild(smHint);
  const musMixRef = addSlider(panelSound, "Dynamic music", 0, 2.5, 0.05, smInit.music, (v) => {
    setSoundMix({ music: v });
  });
  const engMixRef = addSlider(panelSound, "Engine loop", 0, 2.5, 0.05, smInit.engine, (v) => {
    setSoundMix({ engine: v });
  });
  const sfxMixRef = addSlider(panelSound, "SFX (weapons, impacts, …)", 0, 2.5, 0.05, smInit.sfx, (v) => {
    setSoundMix({ sfx: v });
  });

  type TabId = "env" | "water" | "ship" | "cam" | "sound";
  const tabPanels: { id: TabId; label: string; el: HTMLDivElement }[] = [
    { id: "env", label: "Environment", el: panelEnv },
    { id: "water", label: "Water (Three)", el: panelWaterThree },
    { id: "ship", label: "Ship", el: panelShip },
    { id: "cam", label: "Camera", el: panelCam },
    { id: "sound", label: "Sound", el: panelSound },
  ];

  const tabButtons = new Map<TabId, HTMLButtonElement>();
  let activeTab: TabId = "env";

  const setTab = (id: TabId): void => {
    activeTab = id;
    for (const t of tabPanels) {
      const is = t.id === id;
      t.el.style.display = is ? "grid" : "none";
      const btn = tabButtons.get(t.id);
      if (btn) {
        btn.style.background = is ? "#2a5580" : "#153247";
        btn.style.fontWeight = is ? "700" : "400";
        btn.style.borderColor = is ? "rgba(160,200,240,0.65)" : "rgba(130,180,220,0.45)";
      }
    }
  };

  for (const t of tabPanels) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = t.label;
    btn.style.cssText =
      "background:#153247;color:#bfe7ff;border:1px solid rgba(130,180,220,0.45);" +
      "border-radius:5px;padding:4px 8px;cursor:pointer;font:11px system-ui,sans-serif;";
    btn.addEventListener("click", () => setTab(t.id));
    tabButtons.set(t.id, btn);
    tabBar.appendChild(btn);
  }

  for (const t of tabPanels) {
    panelHost.appendChild(t.el);
  }

  root.appendChild(tabBar);
  root.appendChild(panelHost);

  setTab("env");

  resetAll.addEventListener("click", () => {
    const nextShip: ShipDebugTuning = { ...DEFAULT_SHIP_DEBUG_TUNING };
    Object.assign(currentShip, nextShip);
    applyShipDebugTuning(nextShip);
    savePersistedShipTuning(currentShip);
    arcToggle.checked = nextShip.showWeaponArc;
    ringsToggle.checked = nextShip.showRangeRings;
    islandPolyToggle.checked = nextShip.showIslandCollisionPolygons;
    bundle.islandCollisionPolygonGroup.visible = nextShip.showIslandCollisionPolygons;
    mountAimToggle.checked = nextShip.showMountAimLines;
    setShipHitboxDebugVisible(false);
    hitboxToggle.checked = false;
    setWreckCollisionDebugVisible(false);
    wreckColToggle.checked = false;
    for (const r of shipSliderRefs) {
      const v = nextShip[r.key];
      r.input.value = String(v);
      r.numInput.value = String(v);
    }
    resetFollowCameraTuning();
    Object.assign(currentCamera, DEFAULT_FOLLOW_CAMERA_TUNING);
    const camNext = getFollowCameraTuning();
    viewSelect.value = camNext.mode;
    orbitDistanceRef.input.value = String(camNext.orbitDistance);
    orbitDistanceRef.val.textContent = String(camNext.orbitDistance);
    orbitPitchRef.input.value = String(camNext.orbitPitchDeg);
    orbitPitchRef.val.textContent = String(camNext.orbitPitchDeg);
    pitchInput.value = String(Math.round(camNext.pitchDeg));
    pitchVal.textContent = String(Math.round(camNext.pitchDeg));
    heightInput.value = String(Math.round(camNext.heightAbovePivot));
    heightVal.textContent = String(Math.round(camNext.heightAbovePivot));
    modeSelect.value = camNext.northUp ? "north" : "head";
    lagInput.value = String(camNext.headUpYawLagSec);
    lagVal.textContent = camNext.headUpYawLagSec.toFixed(2);
    savePersistedFollowCameraTuning({ ...camNext });

    resetSoundMixToDefaults();
    const smR = getSoundMix();
    musMixRef.input.value = String(smR.music);
    musMixRef.val.textContent = smR.music.toFixed(3);
    engMixRef.input.value = String(smR.engine);
    engMixRef.val.textContent = smR.engine.toFixed(3);
    sfxMixRef.input.value = String(smR.sfx);
    sfxMixRef.val.textContent = smR.sfx.toFixed(3);

    env = { ...DEFAULT_ENVIRONMENT_TUNING };
    bundle.applyEnvironmentTuning(DEFAULT_ENVIRONMENT_TUNING);
    skyToggle.checked = env.skyEnabled;
    presetSel.value = env.lightingPreset;
    turbRef.input.value = String(env.turbidity);
    turbRef.val.textContent = env.turbidity.toFixed(3);
    rayRef.input.value = String(env.rayleigh);
    rayRef.val.textContent = env.rayleigh.toFixed(3);
    mieRef.input.value = String(env.mieCoefficient);
    mieRef.val.textContent = env.mieCoefficient.toFixed(3);
    mieGRef.input.value = String(env.mieDirectionalG);
    mieGRef.val.textContent = env.mieDirectionalG.toFixed(3);
    elevRef.input.value = String(env.elevationDeg);
    elevRef.val.textContent = env.elevationDeg.toFixed(3);
    aziRef.input.value = String(env.azimuthDeg);
    aziRef.val.textContent = env.azimuthDeg.toFixed(3);
    ambRef.input.value = String(env.ambientIntensityMul);
    ambRef.val.textContent = env.ambientIntensityMul.toFixed(3);
    sunMulRef.input.value = String(env.sunIntensityMul);
    sunMulRef.val.textContent = env.sunIntensityMul.toFixed(3);
    fogRef.input.value = String(env.fogStrength);
    fogRef.val.textContent = env.fogStrength.toFixed(3);
    distRef.input.value = String(env.waterDistortionScale);
    distRef.val.textContent = env.waterDistortionScale.toFixed(3);
    sizeRef.input.value = String(env.waterSize);
    sizeRef.val.textContent = env.waterSize.toFixed(3);
    alphaRef.input.value = String(env.waterAlpha);
    alphaRef.val.textContent = env.waterAlpha.toFixed(3);
    wcPick.value = numberToHexInput(env.waterColorHex);
    wsPick.value = numberToHexInput(env.waterSunColorHex);
    reflSel.value = String(env.reflectionTextureSize);
  });

  clearBrowserStorage.addEventListener("click", () => {
    clearPersistedClientSettings();
    window.location.reload();
  });

  const hint = document.createElement("div");
  hint.style.cssText = "margin-top:6px;font-size:10px;color:#84b5d9;";
  hint.textContent =
    "Values are saved locally. Tabs keep the panel compact. Clear storage removes all saved client settings and reloads the page.";
  root.appendChild(hint);

  let expanded = false;
  const applyExpandedState = (): void => {
    const show = expanded;
    tabBar.style.display = show ? "flex" : "none";
    panelHost.style.display = show ? "block" : "none";
    hint.style.display = show ? "block" : "none";
    toggle.textContent = expanded ? "Hide" : "Show";
    if (show) setTab(activeTab);
  };
  toggle.addEventListener("click", () => {
    expanded = !expanded;
    applyExpandedState();
  });
  applyExpandedState();

  appendToBottomDebugDock(root);

  bundle.islandCollisionPolygonGroup.visible = getShipDebugTuning().showIslandCollisionPolygons;
  islandPolyToggle.checked = getShipDebugTuning().showIslandCollisionPolygons;

  const unsubscribeCamera = subscribeFollowCameraTuning((value) => {
    Object.assign(currentCamera, value);
    viewSelect.value = value.mode;
    orbitDistanceRef.input.value = String(value.orbitDistance);
    orbitDistanceRef.val.textContent = value.orbitDistance.toFixed(1);
    orbitPitchRef.input.value = String(value.orbitPitchDeg);
    orbitPitchRef.val.textContent = value.orbitPitchDeg.toFixed(1);
  });

  return {
    dispose() {
      unsubscribeCamera();
      root.remove();
    },
  };
}
