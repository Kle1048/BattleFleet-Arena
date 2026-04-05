import * as THREE from "three";

export type ArtyFiredMsg = {
  shellId: number;
  ownerId: string;
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  flightMs: number;
};

export type ArtyImpactKind = "water" | "hit" | "island";

export type ArtyImpactMsg = {
  shellId: number;
  x: number;
  z: number;
  /** Vom Server; ohne Feld = Wasser (ältere Server). */
  kind?: ArtyImpactKind;
};

type FlyingShell = {
  shellId: number;
  mesh: THREE.Mesh;
  start: number;
  flightMs: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
};

function fadeOutMesh(
  scene: THREE.Scene,
  obj: THREE.Mesh,
  maxAge: number,
  initialOpacity: number,
  onDone?: () => void,
): void {
  const born = performance.now();
  const fade = (): void => {
    const t = performance.now() - born;
    const mat = obj.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, initialOpacity * (1 - t / maxAge));
    if (t >= maxAge) {
      scene.remove(obj);
      obj.geometry.dispose();
      mat.dispose();
      onDone?.();
      return;
    }
    requestAnimationFrame(fade);
  };
  requestAnimationFrame(fade);
}

/**
 * Artillerie-VFX: Kugelflug + Einschlag abhängig von **kind** (Wasser / Treffer / Insel-Ufer).
 */
export type ArtyImpactOptions = {
  /** Wenn true: Kugel entfernen, aber keinen Splash (Cull: Einschlag außerhalb Sichtkreis). */
  skipSplash?: boolean;
};

export function createArtilleryFx(scene: THREE.Scene): {
  onFired: (msg: ArtyFiredMsg) => void;
  onImpact: (msg: ArtyImpactMsg, options?: ArtyImpactOptions) => void;
  update: (nowPerfMs: number) => void;
} {
  const flying: FlyingShell[] = [];
  const shellMat = new THREE.MeshStandardMaterial({
    color: 0xffeed0,
    emissive: 0xffaa55,
    emissiveIntensity: 0.35,
    metalness: 0.2,
    roughness: 0.45,
    fog: false,
  });

  function removeShellById(shellId: number): void {
    const idx = flying.findIndex((f) => f.shellId === shellId);
    if (idx < 0) return;
    const f = flying[idx]!;
    scene.remove(f.mesh);
    f.mesh.geometry.dispose();
    (f.mesh.material as THREE.Material).dispose();
    flying.splice(idx, 1);
  }

  /** Flache Splashes von oben: ohne DepthTest + DoubleSide, sonst oft unsichtbar (Backface / Wasser-Z-Fight). */
  const splashMatOpts: THREE.MeshBasicMaterialParameters = {
    transparent: true,
    opacity: 1,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    fog: false,
  };

  function addSplashRing(
    x: number,
    z: number,
    inner: number,
    outer: number,
    color: number,
    opacity: number,
    maxAge: number,
    y = 0.55,
  ): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(inner, outer, 28),
      new THREE.MeshBasicMaterial({
        ...splashMatOpts,
        color,
        opacity,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, y, z);
    ring.renderOrder = 10;
    scene.add(ring);
    fadeOutMesh(scene, ring, maxAge, opacity);
  }

  function spawnWaterImpact(x: number, z: number): void {
    addSplashRing(x, z, 3, 20, 0x064b73, 0.82, 450);
    addSplashRing(x, z, 1.5, 11, 0x0c6ba8, 0.68, 400, 0.58);
    addSplashRing(x, z, 0.5, 5.5, 0x3d9ee8, 0.45, 320, 0.62);
  }

  function spawnIslandImpact(x: number, z: number): void {
    addSplashRing(x, z, 3, 24, 0x6b4a2a, 0.62, 480);
    addSplashRow(x, z, 0x8f7350, 0.45, 420);
  }

  function addSplashRow(x: number, z: number, color: number, opacity: number, maxAge: number): void {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.5, 17, 24),
      new THREE.MeshBasicMaterial({
        ...splashMatOpts,
        color,
        opacity,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.52, z);
    ring.renderOrder = 10;
    scene.add(ring);
    fadeOutMesh(scene, ring, maxAge, opacity);
  }

  function spawnHitImpact(x: number, z: number): void {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    group.renderOrder = 10;

    const ring1 = new THREE.Mesh(
      new THREE.RingGeometry(9, 36, 32),
      new THREE.MeshBasicMaterial({
        ...splashMatOpts,
        color: 0xff5500,
        opacity: 0.75,
      }),
    );
    ring1.rotation.x = -Math.PI / 2;
    ring1.position.y = 0.3;
    group.add(ring1);

    const ring2 = new THREE.Mesh(
      new THREE.RingGeometry(4.5, 18, 24),
      new THREE.MeshBasicMaterial({
        ...splashMatOpts,
        color: 0xffcc66,
        opacity: 0.65,
      }),
    );
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.y = 0.35;
    group.add(ring2);

    const burst = new THREE.Mesh(
      new THREE.SphereGeometry(4, 10, 10),
      new THREE.MeshBasicMaterial({
        ...splashMatOpts,
        color: 0xff3300,
        opacity: 0.55,
      }),
    );
    burst.position.y = 3.5;
    group.add(burst);

    scene.add(group);

    const materials: THREE.MeshBasicMaterial[] = [];
    group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial) {
        materials.push(o.material);
      }
    });
    const initialOpacities = materials.map((m) => m.opacity);

    const born = performance.now();
    const maxAge = 520;
    const tick = (): void => {
      const t = performance.now() - born;
      const u = Math.min(1, t / maxAge);
      burst.scale.setScalar(1 + u * 1.15);
      burst.position.y = 3.5 + u * 17;
      const fade = Math.max(0, 1 - t / maxAge);
      for (let i = 0; i < materials.length; i++) {
        materials[i]!.opacity = initialOpacities[i]! * fade;
      }
      if (t >= maxAge) {
        scene.remove(group);
        group.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            o.geometry.dispose();
            const mat = o.material;
            if (mat instanceof THREE.MeshBasicMaterial) mat.dispose();
          }
        });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  return {
    onFired(msg: ArtyFiredMsg): void {
      const r = 4.5;
      const geo = new THREE.SphereGeometry(r, 10, 10);
      const mesh = new THREE.Mesh(geo, shellMat.clone());
      mesh.position.set(msg.fromX, 12, msg.fromZ);
      mesh.castShadow = true;
      scene.add(mesh);
      flying.push({
        shellId: msg.shellId,
        mesh,
        start: performance.now(),
        flightMs: Math.max(80, msg.flightMs),
        ax: msg.fromX,
        az: msg.fromZ,
        bx: msg.toX,
        bz: msg.toZ,
      });
    },

    onImpact(msg: ArtyImpactMsg, options?: ArtyImpactOptions): void {
      removeShellById(msg.shellId);
      if (options?.skipSplash) return;
      const kind = msg.kind ?? "water";
      if (kind === "hit") spawnHitImpact(msg.x, msg.z);
      else if (kind === "island") spawnIslandImpact(msg.x, msg.z);
      else spawnWaterImpact(msg.x, msg.z);
    },

    update(nowPerfMs: number): void {
      for (const f of flying) {
        const u = clamp01((nowPerfMs - f.start) / f.flightMs);
        const x = f.ax + (f.bx - f.ax) * u;
        const z = f.az + (f.bz - f.az) * u;
        const arcH = Math.sin(u * Math.PI) * 22;
        f.mesh.position.set(x, 10 + arcH, z);
      }
    },
  };
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}
