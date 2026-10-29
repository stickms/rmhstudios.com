/**
 * Portal's portals on screen: each open, linked portal shows the view out of
 * its partner, rendered to a texture and drawn on the portal's oval; one level
 * of portals-inside-portals on top of that on desktop (`portalRecursion` 2),
 * none on phones (1: a portal seen through a portal is a flat glow).
 *
 * Per frame, for every open linked portal X the main camera can see:
 *   - its virtual camera is the main camera carried through the passage
 *     X → partner(X) (lib/sp-game/portal/portal-math `portalTransform`);
 *   - its projection gets an oblique near plane on the partner's surface
 *     (Lengyel's method, as three's Reflector), so the wall the partner sits on
 *     — between the virtual camera and the room — is clipped away;
 *   - recursion 2: the portals that virtual camera sees are rendered first,
 *     carried one passage further, at half resolution;
 *   - the world is drawn into X's render target with PVS from just in front of
 *     the partner (the virtual camera itself is inside the wall).
 * Then the main pass draws each oval sampling its target by screen position,
 * with an animated rim in the portal's colour (blue / orange) and its sparks.
 *
 * An open portal with no partner draws its colour's swirl (no view), as in
 * the game. The renderer's other passes (sky, 3D skybox, view model) are
 * WorldRenderer's and EntityRenderer's; this module only adds cameras, targets
 * and the ovals.
 *
 * Browser only (three.js).
 */

import {
  AdditiveBlending,
  CircleGeometry,
  Color,
  DoubleSide,
  HalfFloatType,
  Matrix4,
  Mesh,
  Plane,
  RingGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type Object3D,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from 'three';
import { frameFromAngles, portalTransform, transformAngles, transformPoint, PORTAL_HALF_HEIGHT, PORTAL_HALF_WIDTH, type PortalTransform } from '@/lib/sp-game/portal/portal-math';
import type { PortalState } from '@/lib/sp-game/portal/portals';
import { SourceCamera } from '../render/camera';
import { SOURCE_UNIT, srcDirToThree, srcToThree } from '../render/coords';
import type { WorldRenderer } from '../render/world-renderer';

/** The two portal colours (Portal's defaults), linear-ish sRGB for the rim. */
export const PORTAL_COLORS: readonly [Color, Color] = [new Color(0.25, 0.63, 1.0), new Color(1.0, 0.6, 0.12)];
/** The oval sits this far (Source units) off its surface (no z-fighting with the wall). */
export const PORTAL_SURFACE_OFFSET = 0.6;
/** Level-2 views render at this fraction of the drawing buffer. */
export const NESTED_SCALE = 0.5;
/** PVS for a virtual view is taken this far in front of the exit portal. */
const PVS_PROBE = 8;

export interface PortalViewOptions {
  /** 1 or 2 (quality plan `portalRecursion`). */
  recursion: number;
}

interface PortalVisual {
  id: number;
  which: 0 | 1;
  oval: Mesh<CircleGeometry, ShaderMaterial>;
  rim: Mesh<RingGeometry, ShaderMaterial>;
  rt: WebGLRenderTarget | null;
  /** Level-2 targets keyed by the inner portal's id. */
  nested: Map<number, WebGLRenderTarget>;
  state: PortalState | null;
  seen: boolean;
}

const OVAL_VS = /* glsl */ `
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const OVAL_FS = /* glsl */ `
uniform sampler2D uView;
uniform float uHasView;
uniform vec2 uResolution;
uniform vec3 uColor;
uniform float uTime;
uniform float uOpen;
varying vec2 vLocal;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float r = length(vLocal);
  if (r > 1.0) discard;
  vec3 col;
  if (uHasView > 0.5) {
    vec2 uv = gl_FragCoord.xy / uResolution;
    col = texture2D(uView, uv).rgb;
  } else {
    // No partner: the colour's swirl.
    float a = atan(vLocal.y, vLocal.x);
    float s = 0.5 + 0.5 * sin(a * 3.0 - uTime * 2.5 + r * 9.0);
    col = mix(uColor * 0.25, uColor, s * (1.0 - r * 0.6));
  }
  // A soft coloured edge inside the rim.
  float edge = smoothstep(0.78, 1.0, r);
  col = mix(col, uColor, edge * 0.85);
  gl_FragColor = vec4(col * uOpen, 1.0);
}
`;

const RIM_FS = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
varying vec2 vLocal;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main() {
  float r = length(vLocal);
  float a = atan(vLocal.y, vLocal.x);
  // Sparks: bright cells that run around the edge.
  float cells = 48.0;
  float cell = floor((a / 6.28318 + 0.5) * cells + uTime * 3.0);
  float spark = step(0.82, hash(cell + floor(uTime * 12.0)));
  float band = 1.0 - smoothstep(0.0, 0.08, abs(r - 1.04));
  float glow = 1.0 - smoothstep(1.0, 1.16, r);
  float k = band * (0.55 + spark * 0.9) + glow * 0.25;
  gl_FragColor = vec4(uColor * k, k);
}
`;

/** Lengyel's oblique near plane (three's Reflector): clip `camera` at `planeCam` (camera space, kept side positive). */
export function applyObliqueClip(projection: Matrix4, planeCam: Vector4): void {
  const e = projection.elements;
  const q = new Vector4(
    (Math.sign(planeCam.x) + e[8]) / e[0],
    (Math.sign(planeCam.y) + e[9]) / e[5],
    -1,
    (1 + e[10]) / e[14],
  );
  const c = planeCam.clone().multiplyScalar(2 / planeCam.dot(q));
  e[2] = c.x;
  e[6] = c.y;
  e[10] = c.z + 1;
  e[14] = c.w;
}

const tmpV = new Vector3();
const tmpN = new Vector3();
const tmpPlane = new Plane();
const tmpClip = new Vector4();

/** The world-space plane of a portal (normal out of its surface), in three space. */
function portalPlaneThree(p: PortalState, out: Plane): Plane {
  srcToThree(p.origin.x, p.origin.y, p.origin.z, tmpV);
  srcDirToThree(p.forward.x, p.forward.y, p.forward.z, tmpN).normalize();
  return out.setFromNormalAndCoplanarPoint(tmpN, tmpV);
}

export class PortalView {
  private readonly visuals = new Map<number, PortalVisual>();
  private readonly virtual = new SourceCamera();
  private readonly pvsCam = new SourceCamera();
  private readonly resolution = new Vector2(1, 1);
  private recursion: number;
  private readonly basis = new Matrix4();
  private readonly ovalGeo = new CircleGeometry(1, 48);
  private readonly rimGeo = new RingGeometry(0.9, 1.2, 64);
  /** Diagnostics: virtual views rendered last frame. */
  views = 0;

  constructor(
    private readonly root: Object3D,
    opts: PortalViewOptions,
  ) {
    this.recursion = Math.max(1, Math.min(2, Math.round(opts.recursion)));
  }

  setRecursion(n: number): void {
    this.recursion = Math.max(1, Math.min(2, Math.round(n)));
  }

  /** Mirrors the world's portals (create / move / remove ovals). */
  sync(portals: readonly PortalState[], time: number): void {
    for (const v of this.visuals.values()) v.seen = false;
    for (const p of portals) {
      let v = this.visuals.get(p.id);
      if (!v) {
        v = this.create(p);
        this.visuals.set(p.id, v);
      }
      v.seen = true;
      v.state = p;
      v.which = p.which;
      const show = p.open;
      v.oval.visible = show;
      v.rim.visible = show;
      if (show) this.place(v, p);
      const color = PORTAL_COLORS[p.which];
      (v.oval.material.uniforms.uColor.value as Color).copy(color);
      (v.rim.material.uniforms.uColor.value as Color).copy(color);
      v.oval.material.uniforms.uTime.value = time;
      v.rim.material.uniforms.uTime.value = time;
    }
    for (const [id, v] of this.visuals) {
      if (v.seen) continue;
      this.destroy(v);
      this.visuals.delete(id);
    }
  }

  private create(p: PortalState): PortalVisual {
    const oval = new Mesh(
      this.ovalGeo,
      new ShaderMaterial({
        vertexShader: OVAL_VS,
        fragmentShader: OVAL_FS,
        uniforms: {
          uView: { value: null as Texture | null },
          uHasView: { value: 0 },
          uResolution: { value: this.resolution },
          uColor: { value: PORTAL_COLORS[p.which].clone() },
          uTime: { value: 0 },
          uOpen: { value: 1 },
        },
        side: DoubleSide,
      }),
    );
    oval.name = `portal-${p.id}`;
    oval.renderOrder = 1;
    const rim = new Mesh(
      this.rimGeo,
      new ShaderMaterial({
        vertexShader: OVAL_VS,
        fragmentShader: RIM_FS,
        uniforms: { uColor: { value: PORTAL_COLORS[p.which].clone() }, uTime: { value: 0 } },
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    );
    rim.renderOrder = 2;
    oval.matrixAutoUpdate = false;
    rim.matrixAutoUpdate = false;
    this.root.add(oval, rim);
    return { id: p.id, which: p.which, oval, rim, rt: null, nested: new Map(), state: p, seen: true };
  }

  private place(v: PortalVisual, p: PortalState): void {
    // Basis: local x = portal left (width), y = up (height), z = forward; scaled to the oval's half sizes.
    const left = { x: p.up.y * p.forward.z - p.up.z * p.forward.y, y: p.up.z * p.forward.x - p.up.x * p.forward.z, z: p.up.x * p.forward.y - p.up.y * p.forward.x };
    const x = srcDirToThree(left.x, left.y, left.z, new Vector3()).multiplyScalar(PORTAL_HALF_WIDTH * SOURCE_UNIT);
    const y = srcDirToThree(p.up.x, p.up.y, p.up.z, new Vector3()).multiplyScalar(PORTAL_HALF_HEIGHT * SOURCE_UNIT);
    const z = srcDirToThree(p.forward.x, p.forward.y, p.forward.z, new Vector3());
    const o = srcToThree(
      p.origin.x + p.forward.x * PORTAL_SURFACE_OFFSET,
      p.origin.y + p.forward.y * PORTAL_SURFACE_OFFSET,
      p.origin.z + p.forward.z * PORTAL_SURFACE_OFFSET,
      new Vector3(),
    );
    this.basis.makeBasis(x, y, z).setPosition(o);
    v.oval.matrix.copy(this.basis);
    v.oval.matrixWorldNeedsUpdate = true;
    const rimO = srcToThree(
      p.origin.x + p.forward.x * (PORTAL_SURFACE_OFFSET + 0.4),
      p.origin.y + p.forward.y * (PORTAL_SURFACE_OFFSET + 0.4),
      p.origin.z + p.forward.z * (PORTAL_SURFACE_OFFSET + 0.4),
      new Vector3(),
    );
    v.rim.matrix.copy(this.basis).setPosition(rimO);
    v.rim.matrixWorldNeedsUpdate = true;
  }

  private destroy(v: PortalVisual): void {
    v.oval.removeFromParent();
    v.rim.removeFromParent();
    v.oval.material.dispose();
    v.rim.material.dispose();
    v.rt?.dispose();
    for (const t of v.nested.values()) t.dispose();
  }

  private target(v: PortalVisual, nestedId: number | null, w: number, h: number): WebGLRenderTarget {
    const make = () => new WebGLRenderTarget(w, h, { type: HalfFloatType, depthBuffer: true, stencilBuffer: false });
    if (nestedId === null) {
      if (!v.rt) v.rt = make();
      else if (v.rt.width !== w || v.rt.height !== h) v.rt.setSize(w, h);
      return v.rt;
    }
    let t = v.nested.get(nestedId);
    if (!t) {
      t = make();
      v.nested.set(nestedId, t);
    } else if (t.width !== w || t.height !== h) t.setSize(w, h);
    return t;
  }

  private partnerOf(v: PortalVisual): PortalVisual | null {
    const s = v.state;
    if (!s || !s.open || s.linked < 0) return null;
    const p = this.visuals.get(s.linked);
    return p?.state?.open ? p : null;
  }

  /** Whether portal `v` faces and is inside `cam`'s view (a cheap test: in front, within a generous cone). */
  private visibleFrom(v: PortalVisual, cam: SourceCamera): boolean {
    const s = v.state;
    if (!s || !s.open) return false;
    const dx = cam.origin.x - s.origin.x;
    const dy = cam.origin.y - s.origin.y;
    const dz = cam.origin.z - s.origin.z;
    if (dx * s.forward.x + dy * s.forward.y + dz * s.forward.z <= 0) return false;
    // Behind the camera entirely (with the oval's radius of slack)?
    const f = cam.camera.getWorldDirection(tmpV);
    srcToThree(s.origin.x, s.origin.y, s.origin.z, tmpN).sub(cam.camera.position);
    return tmpN.dot(f) > -PORTAL_HALF_HEIGHT * SOURCE_UNIT;
  }

  private passage(from: PortalVisual, to: PortalVisual): PortalTransform {
    const a = from.state!;
    const b = to.state!;
    return portalTransform(frameFromAngles(a.origin, a.angles), frameFromAngles(b.origin, b.angles));
  }

  /** `src` carried through `tr` into `out`, with the oblique clip on `exit`'s surface. */
  private carry(src: SourceCamera, tr: PortalTransform, exit: PortalState, aspect: number, out: SourceCamera): void {
    const o = transformPoint(tr, src.origin);
    const a = transformAngles(tr, src.angles);
    out.setAspect(aspect);
    out.set({ origin: o, angles: a, fov: src.fov });
    out.camera.updateProjectionMatrix();
    const cam = out.camera;
    cam.updateMatrixWorld(true);
    portalPlaneThree(exit, tmpPlane).applyMatrix4(cam.matrixWorldInverse);
    tmpClip.set(tmpPlane.normal.x, tmpPlane.normal.y, tmpPlane.normal.z, tmpPlane.constant);
    applyObliqueClip(cam.projectionMatrix, tmpClip);
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  }

  private renderInto(
    renderer: WebGLRenderer,
    world: WorldRenderer,
    cam: SourceCamera,
    exit: PortalState,
    rt: WebGLRenderTarget,
    hide: PortalVisual | null,
    time: number,
  ): void {
    // PVS from just in front of the exit (the virtual camera sits inside the wall).
    this.pvsCam.set({
      origin: {
        x: exit.origin.x + exit.forward.x * PVS_PROBE,
        y: exit.origin.y + exit.forward.y * PVS_PROBE,
        z: exit.origin.z + exit.forward.z * PVS_PROBE,
      },
      angles: cam.angles,
      fov: cam.fov,
    });
    this.pvsCam.camera.position.copy(cam.camera.position);
    world.update(this.pvsCam, time);
    if (hide) {
      hide.oval.visible = false;
      hide.rim.visible = false;
    }
    this.resolution.set(rt.width, rt.height);
    renderer.setRenderTarget(rt);
    world.render(renderer, cam);
    if (hide && hide.state?.open) {
      hide.oval.visible = true;
      hide.rim.visible = true;
    }
    this.views++;
  }

  /**
   * Renders every visible portal's view into its target. Call before the main
   * world pass; the main pass then draws the ovals with their views.
   */
  renderViews(renderer: WebGLRenderer, world: WorldRenderer, main: SourceCamera, time: number): void {
    this.views = 0;
    const size = renderer.getDrawingBufferSize(new Vector2());
    const w = Math.max(1, Math.floor(size.x));
    const h = Math.max(1, Math.floor(size.y));
    const aspect = w / h;
    const prevTarget = renderer.getRenderTarget();
    const list = [...this.visuals.values()];
    // Level 1 sees no portals unless level 2 fills them.
    const setFlat = () => {
      for (const v of list) {
        v.oval.material.uniforms.uHasView.value = 0;
        v.oval.material.uniforms.uView.value = null;
      }
    };
    const outer = new SourceCamera();
    for (const x of list) {
      const exit = this.partnerOf(x);
      if (!exit || !this.visibleFrom(x, main)) continue;
      const trX = this.passage(x, exit);
      this.carry(main, trX, exit.state!, aspect, outer);
      // Level 2: the portals the virtual camera sees, one passage further.
      setFlat();
      if (this.recursion >= 2) {
        const nw = Math.max(1, Math.floor(w * NESTED_SCALE));
        const nh = Math.max(1, Math.floor(h * NESTED_SCALE));
        for (const y of list) {
          const exitY = this.partnerOf(y);
          if (!exitY || y === exit || !this.visibleFrom(y, outer)) continue;
          const trY = this.passage(y, exitY);
          this.carry(outer, trY, exitY.state!, aspect, this.virtual);
          const rt = this.target(x, y.id, nw, nh);
          for (const v of list) v.oval.material.uniforms.uHasView.value = 0;
          this.renderInto(renderer, world, this.virtual, exitY.state!, rt, exitY, time);
        }
        for (const y of list) {
          const rt = x.nested.get(y.id);
          if (rt && y !== exit && this.partnerOf(y) && this.visibleFrom(y, outer)) {
            y.oval.material.uniforms.uView.value = rt.texture;
            y.oval.material.uniforms.uHasView.value = 1;
          }
        }
      }
      const rt = this.target(x, null, w, h);
      this.renderInto(renderer, world, outer, exit.state!, rt, exit, time);
    }
    // The main pass: every linked, visible oval shows its own view.
    for (const v of list) {
      const has = !!this.partnerOf(v) && !!v.rt && this.visibleFrom(v, main);
      v.oval.material.uniforms.uHasView.value = has ? 1 : 0;
      v.oval.material.uniforms.uView.value = has ? v.rt!.texture : null;
    }
    this.resolution.set(w, h);
    renderer.setRenderTarget(prevTarget);
    // Back to the main camera's PVS.
    world.update(main, time);
  }

  /** Camera for diagnostics / tests. */
  get virtualCamera(): PerspectiveCamera {
    return this.virtual.camera;
  }

  get count(): number {
    return this.visuals.size;
  }

  dispose(): void {
    for (const v of this.visuals.values()) this.destroy(v);
    this.visuals.clear();
    this.ovalGeo.dispose();
    this.rimGeo.dispose();
  }
}
