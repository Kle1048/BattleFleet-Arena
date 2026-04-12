import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const BASE_URL = import.meta.env.BASE_URL;

/**
 * Drei Kartendetails — pro Insel index % 3 (5 Inseln → Verteilung auf alle drei Typen).
 */
export const ISLAND_GLB_URLS = [
  `${BASE_URL}assets/Map-Details/IslandShallow.glb`,
  `${BASE_URL}assets/Map-Details/IslandMountain.glb`,
  `${BASE_URL}assets/Map-Details/IslandVillage.glb`,
] as const;

/** Index im Modulo-3-Zyklus für `IslandShallow.glb` (0, 3, 6, …). */
const SHALLOW_VARIANT_INDEX = 0;

/** Abweichende Y-Rotation je weiterer Shallow-Insel (nur visuell). */
const SHALLOW_Y_ROTATION_STEP_RAD = (2 * Math.PI) / 3;

const templateByUrl = new Map<string, THREE.Group>();
const loadPromises = new Map<string, Promise<THREE.Group | null>>();

function loadIslandTemplate(url: string): Promise<THREE.Group | null> {
  const cached = templateByUrl.get(url);
  if (cached) return Promise.resolve(cached);
  let p = loadPromises.get(url);
  if (!p) {
    const loader = new GLTFLoader();
    p = loader
      .loadAsync(url)
      .then((gltf) => {
        const scene = gltf.scene as THREE.Group;
        templateByUrl.set(url, scene);
        loadPromises.delete(url);
        return scene;
      })
      .catch((err) => {
        console.error("[BattleFleet] Island GLB load failed:", url, err);
        loadPromises.delete(url);
        return null;
      });
    loadPromises.set(url, p);
  }
  return p;
}

/** Lädt alle drei Insel-Templates parallel; fehlgeschlagene URLs loggen und ignorieren. */
export async function preloadIslandGltfTemplates(): Promise<void> {
  await Promise.all(ISLAND_GLB_URLS.map((u) => loadIslandTemplate(u)));
}

/**
 * Skaliert die horizontale Ausdehnung (~max(X,Z)) auf ~Kollisionsradius (wie früher ~0,94·r Umriss).
 * Boden (min Y) auf y=0, Mitte in XZ bei (0,0) relativ zur Gruppe.
 */
function fitIslandToGameplayRadius(root: THREE.Object3D, radius: number): void {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const maxXZ = Math.max(size.x, size.z, 1e-6);
  /** Entspricht grob dem alten Zylinder-Durchmesser (0,94·2·r). */
  const targetDiameter = radius * 1.88;
  const s = targetDiameter / maxXZ;
  root.scale.setScalar(s);
  root.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(root);
  const c = box2.getCenter(new THREE.Vector3());
  root.position.x -= c.x;
  root.position.z -= c.z;
  root.position.y -= box2.min.y;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (m && typeof m === "object" && "fog" in m) {
          (m as THREE.MeshStandardMaterial).fog = false;
        }
      }
    }
  });
}

/**
 * Klont das Template für `islandIndex` (Modulo 3) und passt es an `radius` an.
 * @returns `null`, wenn das Template nicht geladen wurde.
 */
export function createIslandGltfInstance(islandIndex: number, radius: number): THREE.Group | null {
  const url = ISLAND_GLB_URLS[islandIndex % ISLAND_GLB_URLS.length]!;
  const template = templateByUrl.get(url);
  if (!template) return null;
  const root = template.clone(true) as THREE.Group;
  fitIslandToGameplayRadius(root, radius);
  if (islandIndex % ISLAND_GLB_URLS.length === SHALLOW_VARIANT_INDEX) {
    const shallowOrdinal = Math.floor(islandIndex / ISLAND_GLB_URLS.length);
    root.rotation.y = shallowOrdinal * SHALLOW_Y_ROTATION_STEP_RAD;
  }
  return root;
}
