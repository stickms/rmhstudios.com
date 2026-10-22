/**
 * The page's one glass renderer: a single WebGL 2 context, one program, one scene texture. Each glass surface owns
 * a plain 2D canvas (behind its content); `draw` renders that surface into the shared offscreen canvas and copies it
 * across in the same task, so no frame is ever shown half-drawn and the browser never holds more than one GL context
 * for all of it (they are capped at ~16 per page, and the globe uses one too).
 */
import { FRAG, GLASS_RIPPLES, VERT } from './shader';

export interface GlassDraw {
  /** Surface size in CSS px, and the backing-store scale it is drawn at. */
  width: number;
  height: number;
  dpr: number;
  radius: number;
  bezel: number;
  thickness: number;
  disperse: number;
  /** Scene position (CSS px) of the surface's top-left corner, and the scene's size. */
  sceneX: number;
  sceneY: number;
  sceneW: number;
  sceneH: number;
  sceneOn: number;
  /** rgb 0..1 + alpha. */
  tint: [number, number, number, number];
  rim: [number, number, number];
  ink: [number, number, number];
  dark: number;
  /** Cursor light in surface px (+ height), and how strongly it is on. */
  lightX: number;
  lightY: number;
  lightZ: number;
  lightOn: number;
  /** Optical tilt on a unit disc. Only the glass normal changes; content stays in normal flow. */
  tilt?: [number, number];
  /** Up to GLASS_RIPPLES × (x, y, age, amplitude); age < 0 = empty. */
  ripples: Float32Array;
  press: number;
}

export interface RippleShape {
  speed: number;
  width: number;
  life: number;
  gain: number;
}
export const RIPPLE_SHAPE: RippleShape = { speed: 560, width: 64, life: 1.15, gain: 0.9 };

type GL = WebGL2RenderingContext;

function compile(gl: GL, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

const NAMES = [
  'uSize',
  'uPx',
  'uRadius',
  'uBezel',
  'uThickness',
  'uScene',
  'uSceneMap',
  'uSceneOn',
  'uDisperse',
  'uTint',
  'uRim',
  'uInk',
  'uDark',
  'uLight',
  'uLightOn',
  'uTilt',
  'uRip',
  'uRipShape',
  'uPress',
] as const;
type UName = (typeof NAMES)[number];

export class GlassRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: GL | null = null;
  private u = {} as Record<UName, WebGLUniformLocation | null>;
  private tex: WebGLTexture | null = null;
  private lost = false;
  private cw = 0;
  private ch = 0;
  /** Called after the context is lost or restored so the owner can fall back / redraw. */
  onChange: (() => void) | null = null;

  private constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
      this.gl = null;
      this.tex = null;
      this.onChange?.();
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this.cw = this.ch = 0;
      this.init();
      this.onChange?.();
    });
  }

  static create(doc: Document = document): GlassRenderer | null {
    const r = new GlassRenderer(doc.createElement('canvas'));
    return r.init() ? r : null;
  }

  get ready(): boolean {
    return !this.lost && this.gl !== null;
  }

  private init(): boolean {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
      powerPreference: 'default',
    }) as GL | null;
    if (!gl) return false;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    if (!prog) return false;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    for (const n of NAMES) this.u[n] = gl.getUniformLocation(prog, n);
    // A 1×1 transparent scene so the sampler is always complete.
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.uScene, 0);
    this.tex = tex;
    this.gl = gl;
    return true;
  }

  /**
   * Upload a page snapshot. The bitmap is NOT closed here; the caller owns it. The shader reads it as premultiplied
   * (transparent texels must stay transparent, not turn into an opaque black rim), so a canvas source is premultiplied
   * on upload. An ImageBitmap ignores the flag; whichever way the browser hands it over, a fully transparent texel
   * is rgb 0 with alpha 0, and the shader clamps colour to alpha, so a straight-alpha upload cannot paint black either.
   */
  setScene(source: ImageBitmap | HTMLCanvasElement): boolean {
    const gl = this.gl;
    if (!gl || !this.tex || this.lost) return false;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      return false;
    }
    return gl.getError() === gl.NO_ERROR;
  }

  /** Render one surface and copy it into `target`. Returns false if nothing could be drawn. */
  draw(o: GlassDraw, target: HTMLCanvasElement): boolean {
    const gl = this.gl;
    if (!gl || this.lost) return false;
    const pw = Math.max(1, Math.round(o.width * o.dpr));
    const ph = Math.max(1, Math.round(o.height * o.dpr));
    // Retain a high-water backing store. Resizing this shared canvas to EVERY
    // surface reallocated the GPU buffer repeatedly within a single frame.
    if (pw > this.cw || ph > this.ch) {
      this.canvas.width = this.cw = Math.max(pw, this.cw);
      this.canvas.height = this.ch = Math.max(ph, this.ch);
    }
    if (target.width !== pw || target.height !== ph) {
      target.width = pw;
      target.height = ph;
    }
    const u = this.u;
    gl.viewport(0, 0, pw, ph);
    // gl_FragCoord is in device px; `uPx` converts it, and the surface size is the CSS size.
    gl.uniform2f(u.uSize, o.width, o.height);
    gl.uniform1f(u.uPx, o.width / pw);
    gl.uniform1f(u.uRadius, o.radius);
    gl.uniform1f(u.uBezel, o.bezel);
    gl.uniform1f(u.uThickness, o.thickness);
    gl.uniform4f(
      u.uSceneMap,
      o.sceneX,
      o.sceneY,
      1 / Math.max(1, o.sceneW),
      1 / Math.max(1, o.sceneH),
    );
    gl.uniform1f(u.uSceneOn, o.sceneOn);
    gl.uniform1f(u.uDisperse, o.disperse);
    gl.uniform4f(u.uTint, o.tint[0], o.tint[1], o.tint[2], o.tint[3]);
    gl.uniform3f(u.uRim, o.rim[0], o.rim[1], o.rim[2]);
    gl.uniform3f(u.uInk, o.ink[0], o.ink[1], o.ink[2]);
    gl.uniform1f(u.uDark, o.dark);
    gl.uniform3f(u.uLight, o.lightX, o.lightY, o.lightZ);
    gl.uniform1f(u.uLightOn, o.lightOn);
    gl.uniform2f(u.uTilt, o.tilt?.[0] ?? 0, o.tilt?.[1] ?? 0);
    gl.uniform4fv(u.uRip, o.ripples);
    gl.uniform4f(
      u.uRipShape,
      RIPPLE_SHAPE.speed,
      RIPPLE_SHAPE.width,
      RIPPLE_SHAPE.life,
      RIPPLE_SHAPE.gain,
    );
    gl.uniform1f(u.uPress, o.press);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const ctx = target.getContext('2d');
    if (!ctx) return false;
    ctx.clearRect(0, 0, pw, ph);
    // The GL viewport starts at the bottom-left; Canvas2D's source rect starts
    // at the top-left. Copy just the current surface from the retained buffer.
    ctx.drawImage(this.canvas, 0, this.ch - ph, pw, ph, 0, 0, pw, ph);
    return true;
  }

  dispose(): void {
    const gl = this.gl;
    if (gl && this.tex) gl.deleteTexture(this.tex);
    this.gl = null;
    this.tex = null;
    this.canvas.width = this.canvas.height = 1;
  }
}

export { GLASS_RIPPLES };
