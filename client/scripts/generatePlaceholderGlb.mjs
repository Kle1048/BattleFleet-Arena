/**
 * Erzeugt einfache Platzhalter-GLBs (Three.js → GLTFExporter) unter public/assets/.
 * Ausführen: npm run generate:placeholder-glb -w client
 */
/* Node hat kein FileReader — GLTFExporter nutzt ihn für binary: true */
if (typeof globalThis.FileReader === "undefined") {
  globalThis.FileReader = class {
    readAsArrayBuffer(blob) {
      blob
        .arrayBuffer()
        .then((buf) => {
          this.result = buf;
          if (typeof this.onloadend === "function") this.onloadend();
        })
        .catch((err) => {
          if (typeof this.onerror === "function") this.onerror(err);
        });
    }
  };
}

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsRoot = path.join(__dirname, "../public/assets");

/** @param {number} hex */
function c(hex) {
  return new THREE.Color(hex);
}

/**
 * @param {string} relPath z. B. "ships/hull_fac.glb"
 * @param {THREE.Object3D} root
 */
async function writeGlb(relPath, root) {
  const scene = new THREE.Scene();
  scene.name = path.basename(relPath, ".glb");
  scene.add(root);
  const exporter = new GLTFExporter();
  const arrayBuffer = await exporter.parseAsync(scene, { binary: true });
  const full = path.join(assetsRoot, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.from(arrayBuffer));
  console.log("wrote", relPath);
}

/**
 * Rumpf: Länge entlang +Z (Bug), Y oben, X Backbord/Steuerbord.
 * @param {number} beamX
 * @param {number} heightY
 * @param {number} lengthZ
 * @param {THREE.Color} color
 * @param {string} name
 */
function hullBox(beamX, heightY, lengthZ, color, name) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(beamX, heightY, lengthZ),
    new THREE.MeshStandardMaterial({ color, metalness: 0.25, roughness: 0.72 }),
  );
  mesh.name = name;
  return mesh;
}

function groupArtillery() {
  const g = new THREE.Group();
  g.name = "MountArtillery";
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.3, 0.7, 20),
    new THREE.MeshStandardMaterial({ color: c(0x6a6a78), metalness: 0.45, roughness: 0.5 }),
  );
  base.rotation.x = Math.PI / 2;
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 5.5, 10),
    new THREE.MeshStandardMaterial({ color: c(0x3a3a48), metalness: 0.55, roughness: 0.42 }),
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = 2.9;
  g.add(base);
  g.add(barrel);
  return g;
}

function meshCiws() {
  const g = new THREE.Group();
  g.name = "MountCIWS";
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: c(0x8899aa), metalness: 0.35, roughness: 0.55 }),
  );
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.35, 0.5, 16),
    new THREE.MeshStandardMaterial({ color: c(0x5a6670), metalness: 0.4, roughness: 0.5 }),
  );
  base.rotation.x = Math.PI / 2;
  base.position.y = -0.2;
  g.add(base);
  g.add(dome);
  dome.position.y = 0.15;
  return g;
}

function meshSamBox() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2.2, 1.4, 2.8),
    new THREE.MeshStandardMaterial({ color: c(0x4a5560), metalness: 0.3, roughness: 0.65 }),
  );
  mesh.name = "MountSAM";
  return mesh;
}

function meshSsmCanister() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.2, 4.2),
    new THREE.MeshStandardMaterial({ color: c(0x5c5048), metalness: 0.25, roughness: 0.7 }),
  );
  mesh.name = "MountSSM";
  return mesh;
}

function meshTorpedoTube() {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.5, 5, 12),
    new THREE.MeshStandardMaterial({ color: c(0x2a3038), metalness: 0.5, roughness: 0.45 }),
  );
  mesh.rotation.z = Math.PI / 2;
  mesh.name = "MountTorpedo";
  return mesh;
}

async function main() {
  await writeGlb("ships/hull_fac.glb", hullBox(4, 2, 18, c(0x5a7a8a), "HullFAC"));
  await writeGlb("ships/hull_destroyer.glb", hullBox(6, 3, 26, c(0x4a5c6a), "HullDestroyer"));
  await writeGlb("ships/hull_cruiser.glb", hullBox(9, 4, 34, c(0x3d4a58), "HullCruiser"));

  await writeGlb("systems/mount_artillery_turret.glb", groupArtillery());
  await writeGlb("systems/mount_ciws_rotating.glb", meshCiws());
  await writeGlb("systems/mount_sam_box.glb", meshSamBox());
  await writeGlb("systems/mount_ssm_canister.glb", meshSsmCanister());
  await writeGlb("systems/mount_torpedo_launcher.glb", meshTorpedoTube());

  console.log("done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
