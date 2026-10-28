/** Three.js rendering of Source sprite cards, velocity trails and subdivided ropes. */
import {
  BufferAttribute,
  CustomBlending,
  DataTexture,
  DepthTexture,
  DoubleSide,
  DstColorFactor,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OneFactor,
  OneMinusSrcAlphaFactor,
  Quaternion,
  RGBAFormat,
  ShaderMaterial,
  SrcAlphaFactor,
  SrcColorFactor,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Camera,
  type PerspectiveCamera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { sampleSheet } from './sheet';
import { PARTICLE_FRAGMENT, PARTICLE_VERTEX } from './shaders';
import type { LoadedTextures } from './client';
import type { ParticleSimulation, SimParticle, SimSystem } from './simulation';
import {
  number as n,
  vector,
  SOURCE_UNIT,
  type MaterialProxy,
  type ParticleMaterial,
  type ParticleOperator,
  type Params,
} from './types';

/** Matches the ref-pose basis baked into the existing TF2 GLBs: (x,y,z) → (y,z,x). */
export function sourceToGl(source: Vector3, target: Vector3, scale = SOURCE_UNIT) {
  return target.set(source.y * scale, source.z * scale, source.x * scale);
}
export function glToSource(gl: Vector3, target: Vector3) {
  return target.set(gl.z / SOURCE_UNIT, gl.x / SOURCE_UNIT, gl.y / SOURCE_UNIT);
}

interface Capture {
  target: WebGLRenderTarget;
  size: Vector2;
  users: number;
  time: number;
}
const captures = new WeakMap<WebGLRenderer, Capture>();

/** One scene/depth copy per canvas/frame, shared by every soft/refractive effect. */
export function acquireParticleCapture(gl: WebGLRenderer) {
  let capture = captures.get(gl);
  if (!capture) {
    const target = new WebGLRenderTarget(1, 1, { depthBuffer: true });
    target.depthTexture = new DepthTexture(1, 1);
    capture = { target, size: new Vector2(), users: 0, time: -1 };
    captures.set(gl, capture);
  }
  capture.users++;
  const current = capture;
  return {
    update(scene: Scene, camera: Camera, time: number) {
      gl.getDrawingBufferSize(current.size);
      if (current.target.width !== current.size.x || current.target.height !== current.size.y) {
        current.target.setSize(current.size.x, current.size.y);
        current.time = -1;
      }
      if (current.time === time) return current;
      current.time = time;
      const previous = gl.getRenderTarget(),
        mask = camera.layers.mask;
      const xr = gl.xr.enabled;
      try {
        gl.xr.enabled = false;
        camera.layers.disable(1); // All particle meshes use layer 1, the opaque scene stays on 0.
        gl.setRenderTarget(current.target);
        gl.clear();
        gl.render(scene, camera);
      } finally {
        gl.setRenderTarget(previous);
        camera.layers.mask = mask;
        gl.xr.enabled = xr;
      }
      return current;
    },
    dispose() {
      if (--current.users === 0) {
        current.target.dispose();
        captures.delete(gl);
      }
    },
  };
}

class DrawLayer {
  geometry = new InstancedBufferGeometry();
  material: ShaderMaterial;
  mesh: Mesh;
  readonly attrs: Record<string, InstancedBufferAttribute> = {};
  readonly order: SimParticle[] = [];
  readonly params: Params;
  readonly baseTexture;
  readonly needsScene: boolean;
  readonly subdiv: number;
  readonly capacity: number;
  readonly right = new Vector3();
  readonly up = new Vector3();
  readonly center = new Vector3();
  readonly end = new Vector3();
  readonly tangent = new Vector3();
  readonly view = new Vector3();
  readonly cameraRight = new Vector3();
  readonly cameraUp = new Vector3();
  readonly cameraForward = new Vector3();
  readonly sourceRight = new Vector3();
  readonly sourceUp = new Vector3();
  readonly rotation = new Quaternion();
  readonly values: Record<string, string | number> = {};
  constructor(
    readonly system: SimSystem,
    readonly renderer: ParticleOperator,
    readonly source: ParticleMaterial,
    readonly textures: LoadedTextures,
  ) {
    this.params = source.params;
    const p = this.params;
    const isRope = renderer.function === 'render_rope';
    this.subdiv = isRope
      ? Math.max(1, Math.min(16, n(renderer.params, 'subdivision_count', 3) + 1))
      : 1;
    this.capacity = system.capacity * this.subdiv;
    this.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0]), 3),
    );
    this.geometry.setAttribute(
      'uv',
      new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2),
    );
    this.geometry.setIndex([0, 1, 2, 0, 2, 3]);
    for (const [key, size] of Object.entries({
      aCenter: 3,
      aRight: 3,
      aUp: 3,
      aTint: 4,
      aUv0: 4,
      aUv1: 4,
      aUv2: 4,
      aUv3: 4,
      aBlend: 2,
    })) {
      const attr = new InstancedBufferAttribute(new Float32Array(this.capacity * size), size);
      attr.setUsage(DynamicDrawUsage);
      this.attrs[key] = attr;
      this.geometry.setAttribute(key, attr);
    }
    this.geometry.instanceCount = 0;
    this.baseTexture = source.textures.$basetexture ?? source.textures.$normalmap;
    const data = source.shader === 'refract' || !!n(p, '$extractgreenalpha');
    const premultiplied = !!(n(p, '$addself') || n(p, '$addoverblend') || n(p, '$addbasetexture2'));
    const defines: Record<string, number> = {};
    if (n(p, '$blendframes', source.shader === 'spritecard' ? 1 : 0)) defines.BLEND_FRAMES = 1;
    if (n(p, '$dualsequence')) defines.DUAL_SEQUENCE = 1;
    if (n(p, '$maxlumframeblend1')) defines.MAX_LUM1 = 1;
    if (n(p, '$maxlumframeblend2')) defines.MAX_LUM2 = 1;
    if (n(p, '$extractgreenalpha')) defines.EXTRACT_GREEN_ALPHA = 1;
    if (source.textures.$ramptexture) defines.COLOR_RAMP = 1;
    if (source.textures.$texture2 || source.textures.$basetexture2 || source.textures.$detail)
      defines.SECOND_TEXTURE = 1;
    if (premultiplied) defines.PREMULTIPLIED = 1;
    if (n(p, '$depthblend', source.shader === 'spritecard' ? 1 : 0)) defines.SOFT_PARTICLE = 1;
    if (source.shader === 'refract') defines.REFRACT = 1;
    this.needsScene = !!(defines.SOFT_PARTICLE || defines.REFRACT);
    const color = vector(p, '$color', [1, 1, 1]),
      color2 = vector(p, '$color2', [1, 1, 1]);
    const additive = !!n(p, '$additive') || n(p, '$spriterendermode') === 5;
    this.material = new ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      defines,
      uniforms: {
        uMap: { value: textures.get(this.baseTexture, 0, data) ?? WHITE },
        uSecond: {
          value:
            textures.get(
              source.textures.$texture2 ?? source.textures.$basetexture2 ?? source.textures.$detail,
            ) ?? WHITE,
        },
        uRamp: { value: textures.get(source.textures.$ramptexture) ?? WHITE },
        uDepth: { value: null },
        uScene: { value: null },
        uResolution: { value: new Vector2(1, 1) },
        uNearFar: { value: new Vector2(0.01, 1000) },
        uColor: {
          value: new Vector3(color[0] * color2[0], color[1] * color2[1], color[2] * color2[2]),
        },
        uAlpha: { value: n(p, '$alpha', 1) },
        uOverbright: { value: n(p, '$overbrightfactor', n(p, '$overbright', 1)) },
        uAddSelf: { value: n(p, '$addself') },
        uAddSecond: { value: n(p, '$addbasetexture2', n(p, '$detailblendfactor', 1)) },
        uAlphaTest: { value: n(p, '$alphatest') ? n(p, '$alphatestreference', 0.5) : 0.001 },
        uDepthScale: { value: n(p, '$depthblendscale', 50) * SOURCE_UNIT },
        uRefract: { value: n(p, '$refractamount', 0.025) },
        uBlendMode: { value: n(p, '$sequence_blend_mode') },
        uZoomSecond: { value: Math.max(1, n(p, '$zoomanimateseq2', 1)) },
        uUvTransform: { value: new Vector4(1, 1, 0, 0) },
      },
      transparent: true,
      depthWrite: false,
      depthTest: !n(p, '$ignorez'),
      side: DoubleSide,
      blending: CustomBlending,
      blendSrc: n(p, '$mod2x') ? DstColorFactor : premultiplied ? OneFactor : SrcAlphaFactor,
      blendDst: n(p, '$mod2x') ? SrcColorFactor : additive ? OneFactor : OneMinusSrcAlphaFactor,
      blendSrcAlpha: OneFactor,
      blendDstAlpha: OneMinusSrcAlphaFactor,
      toneMapped: false,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(1);
    this.mesh.renderOrder = system.effect.systems.indexOf(system);
  }

  proxies(time: number) {
    Object.assign(this.values, this.source.params);
    const read = (value: string | undefined, fallback = 0): number => {
      if (value === undefined) return fallback;
      const v = value.startsWith('$') ? this.values[value.toLowerCase()] : value;
      const num = Number(v);
      return Number.isFinite(num) ? num : fallback;
    };
    let frame = read(this.source.params.$frame);
    const uv = this.material.uniforms.uUvTransform.value as Vector4;
    uv.set(1, 1, 0, 0);
    for (const proxy of this.source.proxies) {
      if (!Array.isArray(proxy.value)) continue;
      const p: Record<string, string> = {};
      for (const item of proxy.value as MaterialProxy[])
        if (typeof item.value === 'string') p[item.key.toLowerCase()] = item.value;
      const out = p.resultvar?.toLowerCase();
      let result: number | undefined;
      switch (proxy.key.toLowerCase()) {
        case 'animatedtexture':
          frame = time * read(p.animatedtextureframerate, 30);
          break;
        case 'texturescroll': {
          const angle = (read(p.texturescrollangle) * Math.PI) / 180,
            offset = time * read(p.texturescrollrate, 1);
          uv.z = Math.cos(angle) * offset;
          uv.w = Math.sin(angle) * offset;
          break;
        }
        case 'sine':
          result =
            ((Math.sin(
              ((time + read(p.timeoffset)) * Math.PI * 2) / Math.max(0.001, read(p.sineperiod, 1)),
            ) +
              1) /
              2) *
              (read(p.sinemax, 1) - read(p.sinemin)) +
            read(p.sinemin);
          break;
        case 'linearramp':
          result = time * read(p.rate, 1) + read(p.initialvalue);
          break;
        case 'equals':
          result = read(p.srcvar1);
          break;
        case 'add':
          result = read(p.srcvar1) + read(p.srcvar2);
          break;
        case 'subtract':
          result = read(p.srcvar1) - read(p.srcvar2);
          break;
        case 'multiply':
          result = read(p.srcvar1) * read(p.srcvar2);
          break;
        case 'clamp':
          result = Math.max(read(p.min), Math.min(read(p.max, 1), read(p.srcvar1)));
          break;
      }
      if (out && result !== undefined) this.values[out] = result;
    }
    const data = this.source.shader === 'refract' || !!n(this.params, '$extractgreenalpha');
    this.material.uniforms.uMap.value = this.textures.get(this.baseTexture, frame, data) ?? WHITE;
    this.material.uniforms.uAlpha.value = read('$alpha', 1);
  }

  write(i: number, p: SimParticle, camera: Camera, scale: number) {
    const r = this.renderer.params,
      sourceTex = this.baseTexture;
    const sheet = sampleSheet(
      sourceTex?.sequences[String(p.sequence)],
      p.age,
      p.life,
      n(r, 'animation rate', 1),
      !!n(r, 'animation_fit_lifetime'),
      !!n(r, 'use animation rate as fps'),
    );
    const sheet2 = sampleSheet(
      sourceTex?.sequences[String(p.sequence2)],
      p.age,
      p.life,
      n(r, 'second sequence animation rate', n(r, 'animation rate', 1)),
      !!n(r, 'animation_fit_lifetime'),
      !!n(r, 'use animation rate as fps'),
      1,
    );
    for (const [attr, rect] of [
      [this.attrs.aUv0, sheet.first],
      [this.attrs.aUv1, sheet.second],
      [this.attrs.aUv2, sheet2.first],
      [this.attrs.aUv3, sheet2.second],
    ] as const)
      attr.setXYZW(i, ...rect);
    this.attrs.aBlend.setXY(i, sheet.blend, sheet2.blend);
    const uvWidth = Math.abs(sheet.first[2] - sheet.first[0]) * (sourceTex?.width ?? 1);
    const uvHeight = Math.abs(sheet.first[3] - sheet.first[1]) * (sourceTex?.height ?? 1);
    const radius = Math.max(0, p.radius) * scale;
    this.right.copy(this.cameraRight);
    this.up.copy(this.cameraUp);
    const orientation = n(r, 'orientation_type');
    if (orientation === 1 || orientation === 2 || orientation === 3) {
      const cp = this.system.cp(n(r, 'orientation control point', 0));
      this.sourceRight.set(1, 0, 0).applyQuaternion(cp.rotation);
      this.sourceUp.set(0, 1, 0).applyQuaternion(cp.rotation);
      sourceToGl(this.sourceRight, this.right, 1);
      sourceToGl(this.sourceUp, this.up, 1);
      if (orientation === 1) {
        this.up.set(0, 1, 0);
        this.right.crossVectors(this.up, this.cameraForward).normalize();
      }
    }
    if (this.renderer.function === 'render_sprite_trail') {
      const length = Math.max(
        n(r, 'min length'),
        Math.min(n(r, 'max length', 100), p.velocity.length() * p.trail),
      );
      const fadeIn = n(r, 'length fade in time');
      sourceToGl(p.velocity, this.tangent, 1).normalize();
      const halfLength = length * scale * 0.5 * (fadeIn ? Math.min(1, p.age / fadeIn) : 1);
      this.center.addScaledVector(this.tangent, -halfLength);
      this.up.copy(this.tangent).multiplyScalar(halfLength);
      this.right.crossVectors(this.tangent, this.cameraForward).normalize().multiplyScalar(radius);
    } else if (this.renderer.function !== 'render_rope') {
      const roll =
        p.roll +
        (this.renderer.function === 'render_screen_velocity_rotate'
          ? Math.atan2(p.velocity.z, p.velocity.y) + (n(r, 'forward_angle') * Math.PI) / 180
          : 0);
      const cos = Math.cos(roll),
        sin = Math.sin(roll);
      this.tangent.copy(this.right).multiplyScalar(cos).addScaledVector(this.up, sin);
      this.up.multiplyScalar(cos).addScaledVector(this.right, -sin);
      this.right
        .copy(this.tangent)
        .multiplyScalar(radius * Math.max(0.01, uvWidth / Math.max(0.01, uvHeight)));
      this.up.multiplyScalar(radius);
      if (Math.cos(p.yaw) < 0) this.right.negate();
    }
    this.attrs.aCenter.setXYZ(i, this.center.x, this.center.y, this.center.z);
    this.attrs.aRight.setXYZ(i, this.right.x, this.right.y, this.right.z);
    this.attrs.aUp.setXYZ(i, this.up.x, this.up.y, this.up.z);
    let alpha = Math.max(0, Math.min(1, p.alpha * p.alpha2));
    const distance = this.center.distanceTo(camera.position);
    const maxDistance = n(this.params, '$maxdistance', 100000) * SOURCE_UNIT;
    const fade = n(this.params, '$farfadeinterval', 400) * SOURCE_UNIT;
    alpha *= Math.max(0, Math.min(1, (maxDistance - distance) / Math.max(0.001, fade)));
    this.attrs.aTint.setXYZW(i, p.color.x, p.color.y, p.color.z, alpha);
  }

  update(camera: Camera, scale: number, capture?: Capture) {
    const attrs = this.attrs,
      sys = this.system;
    this.proxies(sys.time);
    const nearFar = this.material.uniforms.uNearFar.value as Vector2;
    nearFar.set((camera as PerspectiveCamera).near, (camera as PerspectiveCamera).far);
    if (capture) {
      this.material.uniforms.uScene.value = capture.target.texture;
      this.material.uniforms.uDepth.value = capture.target.depthTexture;
      this.material.uniforms.uResolution.value.copy(capture.size);
    }
    this.cameraRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    this.cameraUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
    this.cameraForward.set(0, 0, -1).applyQuaternion(camera.quaternion);
    this.order.length = sys.particles.length;
    for (let i = 0; i < sys.particles.length; i++) this.order[i] = sys.particles[i];
    const rope = this.renderer.function === 'render_rope';
    if (rope) this.order.sort((a, b) => a.id - b.id);
    else if (n(sys.definition.options, 'sort particles', 1)) {
      glToSource(camera.position, this.view);
      this.order.sort(
        (a, b) => b.position.distanceToSquared(this.view) - a.position.distanceToSquared(this.view),
      );
    }
    let count = 0;
    for (let j = 0; j < this.order.length; j++) {
      const p = this.order[j];
      if (!rope) {
        sourceToGl(p.position, this.center);
        this.write(count++, p, camera, scale);
      } else if (j < this.order.length - 1) {
        const p0 = this.order[Math.max(0, j - 1)].position,
          p1 = p.position;
        const p2 = this.order[j + 1].position,
          p3 = this.order[Math.min(this.order.length - 1, j + 2)].position;
        for (let k = 0; k < this.subdiv; k++) {
          catmull(p0, p1, p2, p3, k / this.subdiv, this.center);
          catmull(p0, p1, p2, p3, (k + 1) / this.subdiv, this.end);
          sourceToGl(this.center, this.center);
          sourceToGl(this.end, this.end);
          this.up.subVectors(this.end, this.center).multiplyScalar(0.5);
          this.center.add(this.up);
          this.right
            .crossVectors(this.up, this.cameraForward)
            .normalize()
            .multiplyScalar(p.radius * scale);
          const right = this.right.clone(),
            up = this.up.clone();
          this.write(count, p, camera, scale);
          attrs.aRight.setXYZ(count, right.x, right.y, right.z);
          attrs.aUp.setXYZ(count, up.x, up.y, up.z);
          const start =
            (j + k / this.subdiv) * n(this.renderer.params, 'texel_size', 1) +
            sys.time * n(this.renderer.params, 'texture_scroll_rate');
          attrs.aUv0.setXYZW(
            count,
            0,
            start,
            1,
            start + n(this.renderer.params, 'texel_size', 1) / this.subdiv,
          );
          attrs.aUv1.setXYZW(
            count,
            0,
            start,
            1,
            start + n(this.renderer.params, 'texel_size', 1) / this.subdiv,
          );
          count++;
        }
      }
    }
    this.geometry.instanceCount = count;
    for (const attr of Object.values(attrs)) attr.needsUpdate = true;
  }
  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

function catmull(a: Vector3, b: Vector3, c: Vector3, d: Vector3, t: number, out: Vector3) {
  const t2 = t * t,
    t3 = t2 * t;
  return out
    .copy(a)
    .multiplyScalar((-t3 + 2 * t2 - t) * 0.5)
    .addScaledVector(b, (3 * t3 - 5 * t2 + 2) * 0.5)
    .addScaledVector(c, (-3 * t3 + 4 * t2 + t) * 0.5)
    .addScaledVector(d, (t3 - t2) * 0.5);
}
const WHITE = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
WHITE.needsUpdate = true;

export class ParticleRenderer {
  readonly group = new Group();
  readonly layers: DrawLayer[] = [];
  readonly needsScene: boolean;
  constructor(
    readonly simulation: ParticleSimulation,
    readonly textures: LoadedTextures,
  ) {
    for (const sys of simulation.systems) {
      const material = simulation.bundle.materials[sys.definition.material ?? ''];
      if (!material) continue;
      for (const renderer of sys.definition.renderers) {
        const layer = new DrawLayer(sys, renderer, material, textures);
        this.layers.push(layer);
        this.group.add(layer.mesh);
      }
    }
    this.needsScene = this.layers.some((l) => l.needsScene);
  }
  update(camera: Camera, scale = 1, capture?: Capture) {
    sourceToGl(this.simulation.environment.points.get(0)!.position, this.group.position);
    this.group.position.multiplyScalar(1 - scale);
    this.group.scale.setScalar(scale);
    for (const layer of this.layers) layer.update(camera, SOURCE_UNIT, capture);
  }
  dispose() {
    for (const layer of this.layers) layer.dispose();
    this.textures.dispose();
    this.group.clear();
  }
}
