import * as THREE from "three";
import { gltfAssetCache } from "./gltfAssetCache";
import { markSharedGeometry } from "./shipVisualResources";



/**
 * Lädt ein Schiff-GLB pro URL (Cache). Gleiche URL = gemeinsames Template zum Klonen.
 * Bei Fehler `null` — Fallback auf Sprite/Prisma.
 */
export function loadShipHullGltfSource(url: string): Promise<THREE.Group | null> {
  return gltfAssetCache.load(url);
}

export function getShipHullGltfSourceForUrl(url: string): THREE.Group | null {
  return gltfAssetCache.get(url) ?? null;
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

/**
 * `Object3D.clone(true)` teilt **Material-Referenzen** mit dem GLB-Template — alle Schiffe mit
 * gleichem Modell würden sonst dieselben Materialien mutieren (z. B. Zerstört-/Spawn-Schutz).
 * Texturen bleiben geteilt; nur die Material-Instanzen werden pro Mesh dupliziert.
 */
export function cloneMeshMaterialsDeep(root: THREE.Object3D, clones?: Map<THREE.Material, THREE.Material>): void {
  const ownMaterial = (source: THREE.Material) => {
    if (!clones) return source.clone();
    let clone = clones.get(source);
    if (!clone) { clone = source.clone(); clones.set(source, clone); }
    return clone;
  };
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Line || o instanceof THREE.Points)) return;
    markSharedGeometry(o.geometry);
    const m = o.material;
    if (Array.isArray(m)) {
      o.material = m.map(ownMaterial);
    } else if (m) {
      o.material = ownMaterial(m);
    }
  });
}

/**
 * Tiefenkopie des metrischen Szenengraphs. Ursprung und Abmessungen bleiben unverändert.
 */
export function clonePreparedShipHull(source: THREE.Group): THREE.Group {
  const root = source.clone(true);
  root.traverse(o => {
    if (o instanceof THREE.Mesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  cloneMeshMaterialsDeep(root);
  return root;
}
