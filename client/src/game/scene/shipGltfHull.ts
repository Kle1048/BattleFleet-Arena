import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SHIP_BOW_Z, SHIP_STERN_Z } from "./createGameScene";

/** glTF: +Y oben, typisch Bug −Z. Spiel: Bug +Z (Nord) — drehe um 180° um Y. */
const SHIP_GLTF_YAW_RAD = Math.PI;

const TARGET_HULL_LENGTH = SHIP_BOW_Z - SHIP_STERN_Z;
/** Zusätzlicher Faktor auf die normierte Rumpflänge (visuelle Größe im Spiel). */
const SHIP_GLTF_EXTRA_SCALE = 200;

const cachedByUrl = new Map<string, THREE.Group>();
const loadPromises = new Map<string, Promise<THREE.Group | null>>();

/**
 * Lädt ein Schiff-GLB pro URL (Cache). Gleiche URL = gemeinsames Template zum Klonen.
 * Bei Fehler `null` — Fallback auf Sprite/Prisma.
 */
export function loadShipHullGltfSource(url: string): Promise<THREE.Group | null> {
  const hit = cachedByUrl.get(url);
  if (hit) return Promise.resolve(hit);
  let p = loadPromises.get(url);
  if (!p) {
    const loader = new GLTFLoader();
    p = loader
      .loadAsync(url)
      .then((gltf) => {
        cachedByUrl.set(url, gltf.scene);
        loadPromises.delete(url);
        return gltf.scene;
      })
      .catch((err) => {
        console.error("[BattleFleet] Ship GLB load failed:", url, err);
        loadPromises.delete(url);
        return null;
      });
    loadPromises.set(url, p);
  }
  return p;
}

export function getShipHullGltfSourceForUrl(url: string): THREE.Group | null {
  return cachedByUrl.get(url) ?? null;
}

export function collectHullMeshMaterials(root: THREE.Object3D): THREE.Material[] {
  const out: THREE.Material[] = [];
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material) {
      const m = o.material;
      if (Array.isArray(m)) {
        for (const x of m) out.push(x);
      } else {
        out.push(m);
      }
    }
  });
  return out;
}

/** Nur sichtbare Meshes — vermeidet Hilfs-/Leer-Objekte, die die Bounding-Box verfälschen. */
function unionMeshBoundingBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  let any = false;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.geometry) return;
    if (!o.visible) return;
    const b = new THREE.Box3().setFromObject(o);
    if (b.isEmpty()) return;
    if (!any) {
      box.copy(b);
      any = true;
    } else {
      box.union(b);
    }
  });
  if (!any) {
    return new THREE.Box3().setFromObject(root);
  }
  return box;
}

function prepareShipGltfInstance(root: THREE.Object3D): void {
  root.rotation.y = SHIP_GLTF_YAW_RAD;
  root.updateMatrixWorld(true);
  const box = unionMeshBoundingBox(root);
  const size = box.getSize(new THREE.Vector3());
  const horiz = Math.max(size.x, size.z);
  if (horiz > 1e-6) {
    const s = (TARGET_HULL_LENGTH / horiz) * SHIP_GLTF_EXTRA_SCALE;
    root.scale.multiplyScalar(s);
  }
  root.updateMatrixWorld(true);
  const box2 = unionMeshBoundingBox(root);
  root.position.y = -box2.min.y;
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

/**
 * Tiefenkopie des geladenen Szenengraphs, Skalierung/Position wie Referenz-Rumpf.
 */
export function clonePreparedShipHull(source: THREE.Group): THREE.Group {
  const root = source.clone(true);
  prepareShipGltfInstance(root);
  return root;
}
