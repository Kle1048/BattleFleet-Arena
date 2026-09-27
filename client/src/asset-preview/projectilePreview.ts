import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createProjectileBody, PROJECTILE_VISUALS } from '../game/effects/projectileVisual';

for (const kind of ['ssm', 'sam', 'pd'] as const) {
  const host = document.getElementById(kind)!;
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#263e50');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  host.append(renderer.domElement);
  const body = createProjectileBody(kind, PROJECTILE_VISUALS[kind].asset.length);
  body.material.depthTest = true; // Isolated inspection, not the in-game SAM overlay.
  body.rotation.y = Math.PI / 2;
  scene.add(body, new THREE.HemisphereLight(0xeaf2ff, 0x56616c, 2));
  const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(1, 4, 5); scene.add(light);
  const length = PROJECTILE_VISUALS[kind].asset.length;
  const camera = new THREE.PerspectiveCamera(33, 1.6, .01, 100);
  camera.position.set(length*.20, length*.50, length*1.12);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false; controls.minDistance = length*.5; controls.maxDistance = length*3;
  const draw = () => renderer.render(scene, camera);
  controls.addEventListener('change', draw); controls.update();
  const resize = new ResizeObserver(() => {
    const width = host.clientWidth, height = host.clientHeight;
    camera.aspect = width/height; camera.updateProjectionMatrix();
    renderer.setSize(width, height); draw();
  });
  resize.observe(host);
  window.addEventListener('pagehide', () => {
    resize.disconnect(); controls.dispose(); body.geometry.dispose(); body.material.dispose(); renderer.dispose();
  }, { once: true });
}
document.getElementById('status')!.textContent = 'Alle drei Spielmodelle geladen · +Z vorwärts · keine Änderung der Flug- oder Trefferlogik';
