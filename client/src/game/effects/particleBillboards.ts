import * as THREE from "three";

/** CPU visual state only: no Object3D/matrix/material per pooled particle. */
export type ParticleVisual = {
  visible: boolean;
  position: THREE.Vector3;
  scale: THREE.Vector3;
  renderOrder: number;
  atlasFrame?: number;
  stretch?: number;
  ground?: boolean;
  material: {
    map: THREE.Texture; color: THREE.Color; opacity: number; rotation: number;
    blending: THREE.Blending; depthTest: boolean;
  };
};

/** One draw per camera pass. RGB-equivalent normal and additive compositing in
 * depth order: premultiplied normal uses alpha A, additive uses alpha zero.
 * The game canvas is opaque and Water samples reflection RGB, never its alpha. */
export function createParticleBillboards(scene: THREE.Scene, capacity: number,
  textures: readonly [THREE.Texture, THREE.Texture, THREE.Texture], particles: readonly ParticleVisual[], mainCamera?: THREE.Camera) {
  // Four RGBA texels: pose, color, style, atlas/stretch/orientation.
  // A uniform texture can be updated in onBeforeRender, unlike vertex attributes
  // which Three uploads earlier. Thus Water's nested reflection and main camera
  // each get their own correct sorting without stale buffers or private APIs.
  const data = new Float32Array(capacity * 16);
  const stateTexture = new THREE.DataTexture(data, 4, capacity, THREE.RGBAFormat, THREE.FloatType);
  stateTexture.needsUpdate = true;
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([
    -.5, -.5, 0, .5, -.5, 0, .5, .5, 0, -.5, .5, 0,
  ], 3));
  geometry.instanceCount = 0;
  const material = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3, transparent: true, depthWrite: false, fog: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), particleState: { value: stateTexture }, softMap: { value: textures[0] },
      smokeMap: { value: textures[1] }, ringMap: { value: textures[2] } },
    vertexShader: `
      uniform sampler2D particleState;
      out vec2 particleUv;
      out vec4 particleColor;
      flat out int particleMap;
      flat out float additive;
      out vec2 originalClip;
      flat out float atlasFrame;
      #include <fog_pars_vertex>
      void main() {
        vec4 pose = texelFetch(particleState, ivec2(0, gl_InstanceID), 0);
        particleColor = texelFetch(particleState, ivec2(1, gl_InstanceID), 0);
        vec4 style = texelFetch(particleState, ivec2(2, gl_InstanceID), 0);
        vec4 shape = texelFetch(particleState, ivec2(3, gl_InstanceID), 0);
        atlasFrame = shape.x;
        particleUv = position.xy + 0.5;
        particleMap = int(style.y);
        additive = style.z;
        vec2 aligned = position.xy * pose.w * vec2(1.0, shape.y);
        float c = cos(style.x), s = sin(style.x);
        vec2 rotated = vec2(c * aligned.x - s * aligned.y, s * aligned.x + c * aligned.y);
        vec4 mvPosition = viewMatrix * vec4(pose.xyz, 1.0);
        if (shape.z > 0.5) mvPosition = viewMatrix * vec4(pose.xyz + vec3(rotated.x, 0.0, rotated.y), 1.0);
        else mvPosition.xy += rotated;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        originalClip = vec2(gl_Position.z + gl_Position.w, gl_Position.w - gl_Position.z);
        // Rings/flashes previously disabled depth testing. Place those planar
        // billboards at the near depth (no depth writes), retaining original
        // near/far clipping and screen position. LessEqual always passes at zero.
        if (style.w > 0.5) gl_Position.z = -gl_Position.w;
      }`,
    fragmentShader: `
      out vec4 particleFragment;
      #define gl_FragColor particleFragment
      uniform sampler2D softMap;
      uniform sampler2D smokeMap;
      uniform sampler2D ringMap;
      in vec2 particleUv;
      in vec4 particleColor;
      flat in int particleMap;
      flat in float additive;
      in vec2 originalClip;
      flat in float atlasFrame;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        // Also preserve Water's oblique near plane for depth-independent quads.
        if (min(originalClip.x, originalClip.y) < 0.0) discard;
        vec2 smokeUv = (clamp(particleUv, 0.008, 0.992) + vec2(mod(atlasFrame, 2.0), floor(atlasFrame / 2.0))) * 0.5;
        vec4 texel = particleMap == 0 ? texture(softMap, particleUv) :
          (particleMap == 1 ? texture(smokeMap, smokeUv) : texture(ringMap, particleUv));
        gl_FragColor = particleColor * texel;
        if (gl_FragColor.a < 0.003) discard;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
        gl_FragColor.a *= 1.0 - additive;
      }`,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "particle_billboards";
  mesh.renderOrder = 11;
  mesh.frustumCulled = false; // Per-particle sprite sphere test below, unchanged.
  mesh.matrixAutoUpdate = false;
  mesh.userData.particles = particles; // Read-only diagnostics; not part of network state.
  scene.add(mesh);
  const projected = new THREE.Vector3();
  const viewProjection = new THREE.Matrix4();
  const frustum = new THREE.Frustum();
  const sphere = new THREE.Sphere();
  const depth: number[] = [];
  const visible: number[] = [];
  let disposed = false;

  const prepare = (camera: THREE.Camera): void => {
    if (disposed) return;
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);
    visible.length = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]!;
      if (!p.visible) continue;
      sphere.center.copy(p.position); sphere.radius = Math.SQRT1_2 * Math.abs(p.scale.x) * Math.max(1, p.stretch ?? 1);
      if (!frustum.intersectsSphere(sphere)) continue;
      if (mainCamera && p.material.map === textures[1] && p.material.blending !== THREE.AdditiveBlending) {
        // Stable thinning of smoke only. Flashes and water rings retain their detail.
        const reflection = camera !== mainCamera;
        const distance = Math.max(1, camera.position.distanceTo(p.position));
        if (reflection && i % 2 !== 0) continue;
        if (distance > 1400 && i % 2 !== 0) continue;
        if (p.scale.x / distance < (reflection ? .008 : .002)) continue;
      }
      projected.copy(p.position).applyMatrix4(viewProjection);
      depth[i] = projected.z; visible.push(i);
    }
    visible.sort((a, b) => depth[b]! - depth[a]! || a - b);
    if (visible.length > capacity) throw new Error("Particle instance capacity exceeded");
    for (let i = 0; i < visible.length; i++) {
      const p = particles[visible[i]!]!, m = p.material, offset = i * 16;
      data[offset] = p.position.x; data[offset + 1] = p.position.y; data[offset + 2] = p.position.z;
      data[offset + 3] = p.scale.x;
      data[offset + 4] = m.color.r; data[offset + 5] = m.color.g; data[offset + 6] = m.color.b;
      data[offset + 7] = m.opacity;
      data[offset + 8] = m.rotation; data[offset + 9] = textures.indexOf(m.map);
      data[offset + 10] = m.blending === THREE.AdditiveBlending ? 1 : 0;
      data[offset + 11] = m.depthTest ? 0 : 1;
      data[offset + 12] = p.atlasFrame ?? 0;
      data[offset + 13] = p.stretch ?? 1;
      data[offset + 14] = p.ground ? 1 : 0;
    }
    geometry.instanceCount = visible.length;
    if (visible.length) stateTexture.needsUpdate = true;
    material.uniformsNeedUpdate = true;
  };
  mesh.onBeforeRender = (_renderer, _scene, camera) => prepare(camera);
  return {
    prepare,
    dispose() {
      if (disposed) return;
      disposed = true; mesh.removeFromParent(); mesh.onBeforeRender = () => {};
      geometry.instanceCount = 0; geometry.dispose(); material.dispose(); stateTexture.dispose();
      visible.length = 0; depth.length = 0;
    },
  };
}
