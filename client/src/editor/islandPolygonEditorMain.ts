/**
 * Insel-Polygon-Editor: GLB wie im Spiel skalieren, konvexe XZ-Hülle berechnen,
 * JSON für `shared/src/data/mapIslandPolygonOverrides.json` exportieren.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MAP_ISLAND_LAYOUT } from "@battlefleet/shared";
import { createGameRenderer, bindRendererResize } from "../game/runtime/rendererLifecycle";
import { preloadIslandGltfTemplates, createIslandGltfInstance } from "../game/scene/islandGltfVisuals";
import { convexFootprintXZFromIslandRoot } from "./islandGltfConvexFootprint";

const ISLAND_GLB_LABELS = ["IslandShallow", "IslandMountain", "IslandVillage"] as const;

function requireEl<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el as T;
}

function mountUi(): void {
  const root = requireEl<HTMLDivElement>("app");
  const renderer = createGameRenderer(root);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x4a90b8);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 50_000);
  camera.position.set(400, 520, 400);

  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(120, 200, 80);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));

  const grid = new THREE.GridHelper(4000, 40, 0x335566, 0x2a4460);
  grid.position.y = 0.02;
  scene.add(grid);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.set(0, 0, 0);

  bindRendererResize(camera, renderer, root);

  let islandRoot: THREE.Group | null = null;
  let hullLine: THREE.LineLoop | null = null;

  const hullMat = new THREE.LineBasicMaterial({
    color: 0xffcc33,
    depthTest: true,
    transparent: true,
    opacity: 0.95,
  });

  function removeHull(): void {
    if (hullLine) {
      scene.remove(hullLine);
      hullLine.geometry.dispose();
    }
    hullLine = null;
  }

  function removeIsland(): void {
    removeHull();
    if (islandRoot) {
      scene.remove(islandRoot);
      islandRoot.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry?.dispose();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mats) m.dispose();
        }
      });
    }
    islandRoot = null;
  }

  function rebuildIsland(): void {
    removeIsland();
    const islandIndex = Number(selIsland.value);
    const glbKind = Number(selGlb.value);
    const spec = MAP_ISLAND_LAYOUT[islandIndex];
    if (!spec) return;

    const inst = createIslandGltfInstance(glbKind, spec.radius);
    if (!inst) {
      statusEl.textContent = "GLB noch nicht geladen — Seite kurz warten und erneut wählen.";
      return;
    }
    islandRoot = inst;
    islandRoot.position.set(spec.x, 0, spec.z);
    scene.add(islandRoot);
    controls.target.set(spec.x, 8, spec.z);
    camera.position.set(spec.x + 280, 220, spec.z + 280);
    statusEl.textContent = `Slot ${spec.id} · r=${spec.radius} · GLB ${ISLAND_GLB_LABELS[glbKind % 3]} (Spiel: Template = Slot-Index % 3)`;
  }

  function showHull(hull: { x: number; z: number }[]): void {
    removeHull();
    if (hull.length < 3) {
      statusEl.textContent = "Hülle hat weniger als 3 Punkte — Modell prüfen.";
      return;
    }
    const y = 1.2;
    const pts = hull.map((p) => new THREE.Vector3(p.x, y, p.z));
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    hullLine = new THREE.LineLoop(geom, hullMat);
    scene.add(hullLine);
  }

  const selIsland = requireEl<HTMLSelectElement>("ipe-island");
  const selGlb = requireEl<HTMLSelectElement>("ipe-glb");
  const statusEl = requireEl<HTMLParagraphElement>("ipe-status");
  const ta = requireEl<HTMLTextAreaElement>("ipe-json");
  const btnHull = requireEl<HTMLButtonElement>("ipe-btn-hull");
  const btnRebuild = requireEl<HTMLButtonElement>("ipe-btn-rebuild");
  const btnCopy = requireEl<HTMLButtonElement>("ipe-btn-copy");
  const btnDownload = requireEl<HTMLButtonElement>("ipe-btn-download");

  function setExportEnabled(on: boolean): void {
    btnCopy.disabled = !on;
    btnDownload.disabled = !on;
  }
  setExportEnabled(false);

  MAP_ISLAND_LAYOUT.forEach((s, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = `${s.id}  (${s.x}, ${s.z})  r=${s.radius}`;
    selIsland.appendChild(o);
  });

  ISLAND_GLB_LABELS.forEach((label, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = label;
    selGlb.appendChild(o);
  });

  selIsland.addEventListener("change", () => {
    const i = Number(selIsland.value);
    selGlb.value = String(i % 3);
    rebuildIsland();
  });
  selGlb.addEventListener("change", rebuildIsland);
  btnRebuild.addEventListener("click", rebuildIsland);

  btnHull.addEventListener("click", () => {
    if (!islandRoot) {
      statusEl.textContent = "Keine Insel in der Szene.";
      return;
    }
    const hull = convexFootprintXZFromIslandRoot(islandRoot);
    showHull(hull);
    const spec = MAP_ISLAND_LAYOUT[Number(selIsland.value)]!;
    const payload = {
      islands: [{ id: spec.id, verts: hull.map((p) => ({ x: p.x, z: p.z })) }],
    };
    ta.value = JSON.stringify(payload, null, 2);
    setExportEnabled(true);
    statusEl.textContent = `Hülle: ${hull.length} Eckpunkte. JSON unten — Zwischenablage / Download, dann in Repo-Datei mergen.`;
  });

  btnCopy.addEventListener("click", () => {
    if (!ta.value.trim()) return;
    void navigator.clipboard.writeText(ta.value).then(
      () => {
        statusEl.textContent = "In Zwischenablage kopiert.";
      },
      () => {
        statusEl.textContent = "Kopieren fehlgeschlagen — Text manuell markieren.";
      },
    );
  });

  btnDownload.addEventListener("click", () => {
    if (!ta.value.trim()) return;
    const blob = new Blob([ta.value], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mapIslandPolygonOverrides.json";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    statusEl.textContent = "Download gestartet (mapIslandPolygonOverrides.json).";
  });

  void preloadIslandGltfTemplates().then(() => {
    rebuildIsland();
  });

  function tick(): void {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

mountUi();
