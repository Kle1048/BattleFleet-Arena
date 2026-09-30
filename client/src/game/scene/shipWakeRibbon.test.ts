import assert from "node:assert/strict";
import * as THREE from "three";
import { getAuthoritativeShipHullProfile, PlayerLifeState } from "@battlefleet/shared";
import { createShipWakeRibbonSystem, wakeRibbonBaseHalfWidthWorld } from "./shipWakeRibbon";
import type { ShipVisual } from "./shipVisual";

// Independent geometry reference: sampling, centered tangents, widening tail and UV ordering.
type Point = { x: number; z: number };
function legacyGeometry(samples: Point[], width: number) {
  const n = samples.length;
  const positions = new Float32Array(n * 6), uvs = new Float32Array(n * 4);
  const indices: number[] = [];
  function normalized(x: number, z: number): Point {
    const length = Math.hypot(x, z);
    return length < 1e-9 ? { x: 0, z: 1 } : { x: x / length, z: z / length };
  }
  for (let i = 0; i < n; i++) {
    const a = samples[Math.max(0, i - 1)]!, b = samples[Math.min(n - 1, i + 1)]!;
    const t = normalized(b.x - a.x, b.z - a.z);
    const p = normalized(-t.z, t.x);
    const u = i / (n - 1), half = width * (1.65 - .85 * Math.pow(u, .65));
    const sample = samples[i]!;
    positions.set([sample.x + p.x * half, 0.06, sample.z + p.z * half,
      sample.x - p.x * half, 0.06, sample.z - p.z * half], i * 6);
    uvs.set([u, 0, u, 1], i * 4);
    if (i < n - 1) indices.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  return { positions, uvs, indices: new Uint16Array(indices) };
}

function fixture() {
  const scene = new THREE.Scene();
  const system = createShipWakeRibbonSystem(scene);
  const group = new THREE.Group();
  group.scale.set(-1, 1, 1);
  const vis = { group, profile: getAuthoritativeShipHullProfile("fac") } as ShipVisual;
  const player = { id: "test", x: 0, z: 0, speed: 12, lifeState: PlayerLifeState.Alive as string, shipClass: "fac" };
  const visuals = new Map([[player.id, vis]]);
  const update = (nowSeconds = 0, maxLodDistanceWorld = 10000) => system.updateFromPlayers({
    players: [player], visuals, nowSeconds, lodAnchorWorld: { x: 0, z: 0 }, maxLodDistanceWorld,
  });
  const mesh = () => scene.getObjectByName("shipWakeRibbon_test") as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  return { scene, system, group, vis, player, visuals, update, mesh };
}

{
  const f = fixture();
  f.update();
  const mesh = f.mesh(), geom = mesh.geometry;
  const pos = geom.getAttribute("position") as THREE.BufferAttribute;
  const uv = geom.getAttribute("ribbonUv") as THREE.BufferAttribute;
  const index = geom.index!;
  const buffers = [pos.array, uv.array, index.array];
  assert.equal(pos.usage, THREE.DynamicDrawUsage);
  assert.equal(uv.usage, THREE.DynamicDrawUsage);
  assert.equal(pos.count, 192);
  assert.equal(index.count, 570);
  assert.equal(mesh.visible, false);
  assert.equal(geom.drawRange.count, 0);
  assert.equal(mesh.frustumCulled, false);
  let boundingRebuilds = 0;
  geom.computeBoundingSphere = () => { boundingRebuilds++; };
  const samples: Point[] = [];
  const world = new THREE.Vector3();
  let lastPositionVersion = pos.version, lastUvVersion = uv.version;
  let lastWidth = NaN;
  let rebuilds = 0;
  // Reset the initial sample just as a stopped ship would.
  f.player.speed = -1; f.update(); f.player.speed = 12;
  for (let frame = 0; frame < 1800; frame++) {
    // Curves, many ring wraps, unchanged frames and all hull widths.
    const movingFrame = Math.floor(frame / 3);
    const angle = movingFrame * .071;
    f.group.position.set(Math.sin(angle) * 130, 0, Math.cos(angle * .63) * 170);
    f.group.rotation.y = -angle * .1;
    f.player.shipClass = frame < 700 ? "fac" : frame < 1300 ? "destroyer" : "cruiser";
    f.vis.profile = getAuthoritativeShipHullProfile(f.player.shipClass);
    const clear = frame >= 900 && frame < 920;
    f.player.lifeState = clear ? PlayerLifeState.AwaitingRespawn : PlayerLifeState.Alive;
    const previousCount = samples.length;
    if (clear) samples.length = 0;
    else {
      f.group.updateMatrixWorld(true);
      const p = f.vis.profile!.modelEffects!.wake!.position;
      world.set(p.x, p.y, p.z).applyMatrix4(f.group.matrixWorld);
      const last = samples.at(-1);
      if (!last || Math.hypot(world.x - last.x, world.z - last.z) >= 2.15) {
        samples.push({ x: world.x, z: world.z });
        if (samples.length > 96) samples.shift();
      }
    }
    const width = wakeRibbonBaseHalfWidthWorld(f.player.shipClass);
    f.update(frame / 60);
    assert.equal(f.mesh(), mesh);
    assert.equal(geom.getAttribute("position"), pos);
    assert.equal(geom.getAttribute("ribbonUv"), uv);
    assert.equal(geom.index, index);
    assert.equal(pos.array, buffers[0]); assert.equal(uv.array, buffers[1]); assert.equal(index.array, buffers[2]);
    assert.equal(index.version, 0, "topology is uploaded only at initial allocation");
    assert.equal(mesh.material.uniforms.time!.value, frame / 60, "shader still animates on unchanged geometry");
    assert.equal(mesh.visible, samples.length >= 2);
    assert.equal(geom.drawRange.count, Math.max(0, samples.length - 1) * 6);
    if (samples.length >= 2) {
      const expected = legacyGeometry(samples, width);
      assert.deepEqual(pos.array.slice(0, expected.positions.length), expected.positions, `positions at ${frame}`);
      assert.deepEqual(uv.array.slice(0, expected.uvs.length), expected.uvs, `UVs at ${frame}`);
      assert.deepEqual(index.array.slice(0, expected.indices.length), expected.indices);
      const oldGeom = new THREE.BufferGeometry();
      oldGeom.setAttribute("position", new THREE.BufferAttribute(expected.positions, 3));
      oldGeom.computeBoundingSphere();
      assert.deepEqual(geom.boundingSphere!.center, oldGeom.boundingSphere!.center, "transparent sort center unchanged");
      assert(geom.boundingSphere!.radius + 1e-8 >= oldGeom.boundingSphere!.radius);
      oldGeom.dispose();
      assert.deepEqual(pos.updateRanges, [{ start: 0, count: samples.length * 6 }]);
    }
    if (!clear && frame % 3 !== 0 && width === lastWidth && previousCount === samples.length) {
      assert.equal(pos.version, lastPositionVersion, "unchanged trail does not request an upload");
    }
    if (samples.length === 96 && previousCount === 96) assert.equal(uv.version, lastUvVersion);
    rebuilds += pos.version - lastPositionVersion;
    lastPositionVersion = pos.version; lastUvVersion = uv.version; lastWidth = width;
  }
  assert.equal(boundingRebuilds, 0);
  assert(rebuilds < 650, `dirty updates only: ${rebuilds}/1800`);
  f.system.dispose();
  console.log(`wake: 1800-frame legacy geometry comparison exact; ${rebuilds} position updates, fixed buffer identities`);
}

{
  const f = fixture();
  f.update(); f.group.position.z = 5; f.update();
  const mesh = f.mesh(), pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const uv = mesh.geometry.getAttribute("ribbonUv") as THREE.BufferAttribute;
  const before = pos.version, beforeUv = uv.version;
  for (let i = 0; i < 300; i++) f.update(i / 60);
  assert.equal(pos.version, before); assert.equal(uv.version, beforeUv);
  // Width-only changes must still redraw even without another sample.
  f.player.shipClass = "cruiser"; f.update();
  assert.equal(pos.version, before + 1); assert.equal(uv.version, beforeUv);
  for (const reason of ["reverse", "respawn", "LOD", "marker"] as const) {
    if (reason === "reverse") f.player.speed = -12;
    if (reason === "respawn") f.player.lifeState = PlayerLifeState.AwaitingRespawn;
    if (reason === "LOD") f.player.x = 10001;
    const originalProfile = f.vis.profile;
    if (reason === "marker") f.vis.profile = undefined;
    const version = pos.version;
    for (let i = 0; i < 10; i++) f.update();
    assert.equal(mesh.visible, false, reason);
    assert.equal(mesh.geometry.drawRange.count, 0);
    assert.equal(pos.version, version, "clearing needs neither new buffers nor uploads");
    f.player.speed = 12; f.player.lifeState = PlayerLifeState.Alive; f.player.x = 0;
    f.vis.profile = originalProfile;
    f.update(); assert.equal(mesh.visible, false, "return starts with one fresh sample");
    f.group.position.z += 3; f.update(); assert.equal(mesh.visible, true);
  }
  let geometryDisposals = 0, materialDisposals = 0;
  mesh.geometry.addEventListener("dispose", () => geometryDisposals++);
  mesh.material.addEventListener("dispose", () => materialDisposals++);
  f.visuals.clear(); f.update();
  assert.equal(f.scene.children.length, 0, "missing visual must not leave an orphan trail");
  assert.equal(geometryDisposals, 1);
  assert.equal(materialDisposals, 0, "material is owned by the system, not a single trail");
  f.visuals.set(f.player.id, f.vis); f.update();
  assert.notEqual(f.mesh(), mesh); assert.equal(f.mesh().material, mesh.material);
  f.system.updateFromPlayers({ players: [], visuals: f.visuals });
  assert.equal(f.scene.children.length, 0);
  f.system.dispose(); f.system.dispose(); f.update();
  assert.equal(f.scene.children.length, 0, "late updates are inert");
  assert.equal(materialDisposals, 1);
}
{
  const f = fixture();
  f.update();
  f.group.position.x = 2.14; f.update();
  assert.equal(f.mesh().visible, false, "sub-threshold movement adds no sample");
  f.group.position.x = 2.15; f.update();
  assert.equal(f.mesh().geometry.drawRange.count, 6, "threshold is inclusive");
  // A -> B -> A has a zero-length central tangent; preserve the old fallback exactly.
  f.group.position.x = 0; f.update();
  const z = f.vis.profile!.modelEffects!.wake!.position.z;
  const expected = legacyGeometry([{ x: 0, z }, { x: 2.15, z }, { x: 0, z }], wakeRibbonBaseHalfWidthWorld("fac"));
  assert.deepEqual(f.mesh().geometry.getAttribute("position").array.slice(0, 18), expected.positions);
  f.system.dispose();
}
console.log("wake dirty uploads, sampling boundary, degenerate turn, LOD/stop/respawn reset and disposal ok");

{
  const f = fixture(); f.update(10); f.group.position.z = 5; f.update(10.1);
  const mesh = f.mesh(), position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  const version = position.version;
  f.player.speed = 0; f.update(11);
  assert.equal(mesh.visible, true, "stopping leaves a fading trail");
  assert.equal(position.version, version, "fade needs no geometry upload");
  f.update(13.2);
  assert.equal(mesh.visible, false, "stationary wake expires after three seconds");
  f.system.dispose();
}
