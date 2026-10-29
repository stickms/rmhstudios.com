/**
 * The 2D skybox: six quads around the camera, drawn first with depth off, textured
 * with materials/skybox/<skyname>{rt,lf,bk,ft,up,dn}. Face orientation follows the
 * engine's sky code (inherited from Quake 2's st_to_vec / skytexorder): rt = +X with
 * image u running toward −Y, bk = +Y (u → +X), lf = −X (u → +Y), ft = −Y (u → −X),
 * up = +Z (u → −Y, image top toward −X), dn = −Z (u → −Y, image top toward +X); Source
 * axes, image v down. Side images half as tall as wide cover only the upper half
 * (TF2's skies), the lower half repeats their bottom row.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  type Texture,
  Vector2,
  Vector3,
} from 'three';
import { srcDirToThree } from './coords';

export type SkyFace = 'rt' | 'lf' | 'bk' | 'ft' | 'up' | 'dn';

/** [centre, u axis, image-up axis] per face, Source axes. */
export const SKY_FACE_AXES: Record<SkyFace, [number[], number[], number[]]> = {
  rt: [[1, 0, 0], [0, -1, 0], [0, 0, 1]],
  lf: [[-1, 0, 0], [0, 1, 0], [0, 0, 1]],
  bk: [[0, 1, 0], [1, 0, 0], [0, 0, 1]],
  ft: [[0, -1, 0], [-1, 0, 0], [0, 0, 1]],
  up: [[0, 0, 1], [0, -1, 0], [-1, 0, 0]],
  dn: [[0, 0, -1], [0, -1, 0], [1, 0, 0]],
};

const SKY_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // at the far plane
}
`;

const SKY_FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform float uHasMap;
uniform vec3 uColor;
uniform vec2 uHalfTexel;
uniform float uHalfHeight;
varying vec2 vUv;
void main() {
  vec2 uv = vUv;
  if (uHalfHeight > 0.5) uv.y = uv.y * 2.0;
  uv = clamp(uv, uHalfTexel, 1.0 - uHalfTexel);
  vec3 c = uHasMap > 0.5 ? texture2D(uMap, uv).rgb : uColor;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}
`;

export class SkyBox {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera();
  private readonly root = new Group();
  private readonly materials: ShaderMaterial[] = [];
  private readonly geometry: BufferGeometry[] = [];

  /** `color` (linear) is drawn for faces without a texture. */
  constructor(color = new Color(0.36, 0.45, 0.58)) {
    this.scene.add(this.root);
    for (const face of Object.keys(SKY_FACE_AXES) as SkyFace[]) {
      const [c, u, v] = SKY_FACE_AXES[face];
      const pos = new Float32Array(12);
      const uvs = new Float32Array(8);
      const corners = [
        [-1, 1, 0, 0],
        [1, 1, 1, 0],
        [1, -1, 1, 1],
        [-1, -1, 0, 1],
      ];
      const t = new Vector3();
      corners.forEach(([sx, sy, uu, vv], i) => {
        srcDirToThree(c[0] + u[0] * sx + v[0] * sy, c[1] + u[1] * sx + v[1] * sy, c[2] + u[2] * sx + v[2] * sy, t);
        pos.set([t.x * 10, t.y * 10, t.z * 10], i * 3);
        uvs.set([uu, vv], i * 2);
      });
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(pos, 3));
      g.setAttribute('uv', new BufferAttribute(uvs, 2));
      // Seen from inside: (0, 1, 2), (0, 2, 3) wind counter-clockwise for each face's axes.
      g.setIndex([0, 2, 1, 0, 3, 2]);
      this.geometry.push(g);
      const m = new ShaderMaterial({
        name: `sky_${face}`,
        vertexShader: SKY_VERT,
        fragmentShader: SKY_FRAG,
        uniforms: {
          uMap: { value: null },
          uHasMap: { value: 0 },
          uColor: { value: color.clone() },
          uHalfTexel: { value: new Vector2(0, 0) },
          uHalfHeight: { value: 0 },
        },
        depthTest: false,
        depthWrite: false,
        side: DoubleSide,
      });
      m.userData.face = face;
      this.materials.push(m);
      const mesh = new Mesh(g, m);
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
  }

  /** Sets a face's texture (w, h: its stored size). */
  setFace(face: SkyFace, tex: Texture, w: number, h: number): void {
    const m = this.materials.find((x) => x.userData.face === face);
    if (!m) return;
    m.uniforms.uMap.value = tex;
    m.uniforms.uHasMap.value = 1;
    (m.uniforms.uHalfTexel.value as Vector2).set(0.5 / w, 0.5 / h);
    m.uniforms.uHalfHeight.value = face !== 'up' && face !== 'dn' && h * 2 === w ? 1 : 0;
  }

  /** Follows the main camera's orientation and projection (position stays at the origin). */
  sync(main: PerspectiveCamera): void {
    const c = this.camera;
    c.fov = main.fov;
    c.aspect = main.aspect;
    c.near = 0.1;
    c.far = 100;
    c.updateProjectionMatrix();
    c.quaternion.copy(main.quaternion);
    c.position.set(0, 0, 0);
    c.updateMatrixWorld(true);
  }

  dispose(): void {
    for (const g of this.geometry) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}
