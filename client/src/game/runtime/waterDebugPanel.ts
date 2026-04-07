import type * as THREE from "three";
import {
  applyWaterShaderTuning,
  readWaterShaderTuning,
  type WaterShaderTuning,
} from "./materialLibrary";

const STORAGE_KEY = "bfa.waterShaderTuning.v1";

type SliderDef = {
  key: keyof WaterShaderTuning;
  label: string;
  min: number;
  max: number;
  step: number;
};

const SLIDERS: readonly SliderDef[] = [
  { key: "uvScale", label: "UV Scale", min: 8, max: 48, step: 0.5 },
  { key: "depthAmp", label: "Depth Amp", min: 0.05, max: 0.6, step: 0.01 },
  { key: "flowMix", label: "Flow Intensity", min: 0, max: 0.3, step: 0.01 },
  { key: "shoreMix", label: "Shore Foam", min: 0, max: 0.8, step: 0.01 },
  { key: "wakeCoreMix", label: "Wake Core", min: 0, max: 0.8, step: 0.01 },
  { key: "wakeOuterMix", label: "Wake Outer", min: 0, max: 0.5, step: 0.01 },
  { key: "wakeOuterWidthMul", label: "Wake Width", min: 0.5, max: 2.0, step: 0.01 },
  { key: "wakeOuterNoiseMix", label: "Wake Noise", min: 0, max: 1, step: 0.01 },
  { key: "timeX", label: "Drift X", min: 0.002, max: 0.08, step: 0.001 },
  { key: "timeY", label: "Drift Y", min: 0.002, max: 0.08, step: 0.001 },
];

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function loadPersisted(): Partial<WaterShaderTuning> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<WaterShaderTuning>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savePersisted(value: Partial<WaterShaderTuning>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore storage errors
  }
}

export function createWaterDebugPanel(material: THREE.Material): { dispose: () => void } {
  const base = readWaterShaderTuning(material);
  if (!base) return { dispose() {} };

  const persisted = loadPersisted();
  applyWaterShaderTuning(material, persisted);

  const root = document.createElement("div");
  root.style.cssText =
    "position:fixed;left:12px;bottom:12px;z-index:9999;min-width:220px;" +
    "background:rgba(10,20,28,0.82);color:#d9efff;border:1px solid rgba(130,180,220,0.35);" +
    "border-radius:8px;padding:8px 10px;font:11px/1.35 system-ui,sans-serif;";
  const header = document.createElement("div");
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;";
  const title = document.createElement("div");
  title.textContent = "Water Shader Debug";
  title.style.cssText = "font-weight:700;";
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.style.cssText =
    "background:#153247;color:#bfe7ff;border:1px solid rgba(130,180,220,0.45);" +
    "border-radius:5px;padding:2px 7px;cursor:pointer;font:11px system-ui,sans-serif;";
  header.appendChild(title);
  header.appendChild(toggle);
  root.appendChild(header);

  const body = document.createElement("div");
  body.style.cssText = "display:grid;grid-template-columns:1fr auto;gap:4px 8px;align-items:center;margin-top:6px;";
  root.appendChild(body);

  const current: WaterShaderTuning = {
    ...base,
    ...persisted,
  };

  for (const s of SLIDERS) {
    const label = document.createElement("label");
    label.textContent = s.label;
    body.appendChild(label);

    const wrap = document.createElement("div");
    wrap.style.cssText = "display:flex;align-items:center;gap:6px;";
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(s.min);
    input.max = String(s.max);
    input.step = String(s.step);
    input.value = String(current[s.key]);
    input.style.width = "110px";
    const val = document.createElement("span");
    val.style.cssText = "min-width:46px;text-align:right;color:#9ed3ff;";
    val.textContent = Number(current[s.key]).toFixed(3);
    input.addEventListener("input", () => {
      const raw = Number(input.value);
      const next = clamp(raw, s.min, s.max);
      current[s.key] = next;
      val.textContent = next.toFixed(3);
      applyWaterShaderTuning(material, { [s.key]: next });
      savePersisted(current);
    });
    wrap.appendChild(input);
    wrap.appendChild(val);
    body.appendChild(wrap);
  }

  const hint = document.createElement("div");
  hint.style.cssText = "margin-top:6px;color:#84b5d9;";
  hint.textContent = "Werte werden lokal gespeichert.";
  root.appendChild(hint);

  let expanded = false;
  const applyExpandedState = (): void => {
    body.style.display = expanded ? "grid" : "none";
    hint.style.display = expanded ? "block" : "none";
    toggle.textContent = expanded ? "Hide" : "Show";
  };
  toggle.addEventListener("click", () => {
    expanded = !expanded;
    applyExpandedState();
  });
  applyExpandedState();

  document.body.appendChild(root);

  return {
    dispose() {
      root.remove();
    },
  };
}
