// =============================================================================
// ALTAIR ENGINE -- WebGL Shape Batch
// =============================================================================
// Batched renderer for untextured colored geometry: filled rectangles,
// filled circles, stroked circles/rings, and line segments. Used for HP
// bars, auras, pool effects, status tints, glow circles, and vector fallbacks.
//
// Vertex format: [x, y, r, g, b, a]  (6 floats per vertex)
// =============================================================================

import { createProgram, ortho } from './webgl-context';

// ---- Constants --------------------------------------------------------------

const MAX_VERTICES = 32768;
const FLOATS_PER_VERTEX = 6; // x, y, r, g, b, a

// ---- Shaders ----------------------------------------------------------------

const VERT_SRC = `
  attribute vec2 aPos;
  attribute vec4 aColor;
  uniform mat4 uProj;
  varying vec4 vColor;
  void main() {
    vColor = aColor;
    gl_Position = uProj * vec4(aPos, 0.0, 1.0);
  }
`;

const FRAG_SRC = `
  precision mediump float;
  varying vec4 vColor;
  void main() {
    gl_FragColor = vColor;
  }
`;

// ---- Helper: parse CSS color ------------------------------------------------

const colorCache = new Map<string, [number, number, number, number]>();

/**
 * Parse a CSS color string to [r, g, b, a] in 0–1 range.
 * Supports: #rgb, #rrggbb, #rrggbbaa, rgb(), rgba().
 */
export function parseColor(color: string): [number, number, number, number] {
  const cached = colorCache.get(color);
  if (cached) return cached;

  let r = 1, g = 1, b = 1, a = 1;

  if (color.startsWith('#')) {
    const hex = color.slice(1);
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16) / 255;
      g = parseInt(hex[1] + hex[1], 16) / 255;
      b = parseInt(hex[2] + hex[2], 16) / 255;
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16) / 255;
      g = parseInt(hex.slice(2, 4), 16) / 255;
      b = parseInt(hex.slice(4, 6), 16) / 255;
    } else if (hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16) / 255;
      g = parseInt(hex.slice(2, 4), 16) / 255;
      b = parseInt(hex.slice(4, 6), 16) / 255;
      a = parseInt(hex.slice(6, 8), 16) / 255;
    }
  } else if (color.startsWith('rgba(')) {
    const parts = color.slice(5, -1).split(',');
    r = parseInt(parts[0]) / 255;
    g = parseInt(parts[1]) / 255;
    b = parseInt(parts[2]) / 255;
    a = parseFloat(parts[3]);
  } else if (color.startsWith('rgb(')) {
    const parts = color.slice(4, -1).split(',');
    r = parseInt(parts[0]) / 255;
    g = parseInt(parts[1]) / 255;
    b = parseInt(parts[2]) / 255;
  }

  const result: [number, number, number, number] = [r, g, b, a];
  colorCache.set(color, result);
  return result;
}

// ---- ShapeBatch class -------------------------------------------------------

export class ShapeBatch {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject | null = null;
  private vertexBuffer: WebGLBuffer;
  private vertexData: Float32Array;
  private vertexCount: number = 0;
  private projMatrix: Float32Array;
  private indexData: Uint16Array;
  private indexBuffer: WebGLBuffer;
  private indexCount: number = 0;

  private uProj: WebGLUniformLocation;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, VERT_SRC, FRAG_SRC);
    this.projMatrix = new Float32Array(16);
    this.vertexData = new Float32Array(MAX_VERTICES * FLOATS_PER_VERTEX);
    this.indexData = new Uint16Array(MAX_VERTICES * 3); // generous

    this.vertexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);

    this.indexBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexData.byteLength, gl.DYNAMIC_DRAW);

    // VAO
    const gl2 = gl as WebGL2RenderingContext;
    if (typeof gl2.createVertexArray === 'function') {
      this.vao = gl2.createVertexArray();
      gl2.bindVertexArray(this.vao);
      this.setupAttributes();
      gl2.bindVertexArray(null);
    }

    this.uProj = gl.getUniformLocation(this.program, 'uProj')!;
  }

  private setupAttributes(): void {
    const gl = this.gl;
    const stride = FLOATS_PER_VERTEX * 4;

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

    const aPos = gl.getAttribLocation(this.program, 'aPos');
    const aColor = gl.getAttribLocation(this.program, 'aColor');

    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 8);
  }

  /**
   * Begin a new frame.
   */
  begin(canvasWidth: number, canvasHeight: number): void {
    this.vertexCount = 0;
    this.indexCount = 0;
    ortho(this.projMatrix, canvasWidth, canvasHeight);
  }

  private addVertex(x: number, y: number, r: number, g: number, b: number, a: number): number {
    if (this.vertexCount >= MAX_VERTICES) {
      this.flush();
    }
    const offset = this.vertexCount * FLOATS_PER_VERTEX;
    // Premultiply alpha
    this.vertexData[offset + 0] = x;
    this.vertexData[offset + 1] = y;
    this.vertexData[offset + 2] = r * a;
    this.vertexData[offset + 3] = g * a;
    this.vertexData[offset + 4] = b * a;
    this.vertexData[offset + 5] = a;
    return this.vertexCount++;
  }

  /**
   * Draw a filled rectangle.
   */
  drawRect(
    x: number, y: number, w: number, h: number,
    color: string, alpha: number = 1,
  ): void {
    const [r, g, b, ca] = parseColor(color);
    const a = ca * alpha;
    const v0 = this.addVertex(x, y, r, g, b, a);
    const v1 = this.addVertex(x + w, y, r, g, b, a);
    const v2 = this.addVertex(x + w, y + h, r, g, b, a);
    const v3 = this.addVertex(x, y + h, r, g, b, a);
    this.indexData[this.indexCount++] = v0;
    this.indexData[this.indexCount++] = v1;
    this.indexData[this.indexCount++] = v2;
    this.indexData[this.indexCount++] = v0;
    this.indexData[this.indexCount++] = v2;
    this.indexData[this.indexCount++] = v3;
  }

  /**
   * Draw a filled circle approximated by a triangle fan.
   */
  drawCircle(
    cx: number, cy: number, radius: number,
    color: string, alpha: number = 1,
    segments: number = 16,
  ): void {
    const [r, g, b, ca] = parseColor(color);
    const a = ca * alpha;
    const center = this.addVertex(cx, cy, r, g, b, a);
    const firstRim = this.vertexCount;
    for (let i = 0; i <= segments; i++) {
      const angle = (Math.PI * 2 * i) / segments;
      this.addVertex(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, r, g, b, a);
    }
    for (let i = 0; i < segments; i++) {
      this.indexData[this.indexCount++] = center;
      this.indexData[this.indexCount++] = firstRim + i;
      this.indexData[this.indexCount++] = firstRim + i + 1;
    }
  }

  /**
   * Draw a ring (stroked circle) as a thick band of triangles.
   */
  drawRing(
    cx: number, cy: number, radius: number, lineWidth: number,
    color: string, alpha: number = 1,
    segments: number = 24,
  ): void {
    const [r, g, b, ca] = parseColor(color);
    const a = ca * alpha;
    const inner = radius - lineWidth / 2;
    const outer = radius + lineWidth / 2;
    const firstVert = this.vertexCount;

    for (let i = 0; i <= segments; i++) {
      const angle = (Math.PI * 2 * i) / segments;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      this.addVertex(cx + cos * inner, cy + sin * inner, r, g, b, a);
      this.addVertex(cx + cos * outer, cy + sin * outer, r, g, b, a);
    }

    for (let i = 0; i < segments; i++) {
      const i0 = firstVert + i * 2;
      const i1 = i0 + 1;
      const i2 = i0 + 2;
      const i3 = i0 + 3;
      this.indexData[this.indexCount++] = i0;
      this.indexData[this.indexCount++] = i1;
      this.indexData[this.indexCount++] = i2;
      this.indexData[this.indexCount++] = i1;
      this.indexData[this.indexCount++] = i3;
      this.indexData[this.indexCount++] = i2;
    }
  }

  /**
   * Draw a filled arc sector (pie slice).
   */
  drawArc(
    cx: number, cy: number,
    innerR: number, outerR: number,
    startAngle: number, endAngle: number,
    color: string, alpha: number = 1,
    segments: number = 16,
  ): void {
    const [r, g, b, ca] = parseColor(color);
    const a = ca * alpha;
    const sweep = endAngle - startAngle;
    const firstVert = this.vertexCount;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = startAngle + sweep * t;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      this.addVertex(cx + cos * innerR, cy + sin * innerR, r, g, b, a);
      this.addVertex(cx + cos * outerR, cy + sin * outerR, r, g, b, a);
    }

    for (let i = 0; i < segments; i++) {
      const i0 = firstVert + i * 2;
      const i1 = i0 + 1;
      const i2 = i0 + 2;
      const i3 = i0 + 3;
      this.indexData[this.indexCount++] = i0;
      this.indexData[this.indexCount++] = i1;
      this.indexData[this.indexCount++] = i2;
      this.indexData[this.indexCount++] = i1;
      this.indexData[this.indexCount++] = i3;
      this.indexData[this.indexCount++] = i2;
    }
  }

  /**
   * Draw a filled polygon (N-gon) centered at (cx, cy).
   */
  drawPolygon(
    cx: number, cy: number, radius: number,
    sides: number, startAngle: number,
    color: string, alpha: number = 1,
  ): void {
    const [r, g, b, ca] = parseColor(color);
    const a = ca * alpha;
    const center = this.addVertex(cx, cy, r, g, b, a);
    const firstRim = this.vertexCount;
    for (let i = 0; i <= sides; i++) {
      const angle = startAngle + (Math.PI * 2 * i) / sides;
      this.addVertex(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, r, g, b, a);
    }
    for (let i = 0; i < sides; i++) {
      this.indexData[this.indexCount++] = center;
      this.indexData[this.indexCount++] = firstRim + i;
      this.indexData[this.indexCount++] = firstRim + i + 1;
    }
  }

  /**
   * Draw a filled star centered at (cx, cy).
   */
  drawStar(
    cx: number, cy: number, radius: number,
    color: string, alpha: number = 1,
    points: number = 5,
  ): void {
    const [r, g, b, ca] = parseColor(color);
    const a = ca * alpha;
    const innerR = radius * 0.5;
    const center = this.addVertex(cx, cy, r, g, b, a);
    const firstRim = this.vertexCount;
    const totalPts = points * 2;
    for (let i = 0; i <= totalPts; i++) {
      const angle = -Math.PI / 2 + (Math.PI * i) / points;
      const rad = i % 2 === 0 ? radius : innerR;
      this.addVertex(cx + Math.cos(angle) * rad, cy + Math.sin(angle) * rad, r, g, b, a);
    }
    for (let i = 0; i < totalPts; i++) {
      this.indexData[this.indexCount++] = center;
      this.indexData[this.indexCount++] = firstRim + i;
      this.indexData[this.indexCount++] = firstRim + i + 1;
    }
  }

  /**
   * Draw a filled diamond shape.
   */
  drawDiamond(
    cx: number, cy: number, size: number,
    color: string, alpha: number = 1,
  ): void {
    const [r, g, b, ca] = parseColor(color);
    const a = ca * alpha;
    const hw = size * 0.7;
    const v0 = this.addVertex(cx, cy - size, r, g, b, a); // top
    const v1 = this.addVertex(cx + hw, cy, r, g, b, a);   // right
    const v2 = this.addVertex(cx, cy + size, r, g, b, a); // bottom
    const v3 = this.addVertex(cx - hw, cy, r, g, b, a);   // left
    this.indexData[this.indexCount++] = v0;
    this.indexData[this.indexCount++] = v1;
    this.indexData[this.indexCount++] = v2;
    this.indexData[this.indexCount++] = v0;
    this.indexData[this.indexCount++] = v2;
    this.indexData[this.indexCount++] = v3;
  }

  /**
   * Flush all accumulated geometry to the GPU.
   */
  flush(): void {
    if (this.indexCount === 0) return;

    const gl = this.gl;
    gl.useProgram(this.program);

    const gl2 = gl as WebGL2RenderingContext;
    if (this.vao && typeof gl2.bindVertexArray === 'function') {
      gl2.bindVertexArray(this.vao);
    } else {
      this.setupAttributes();
    }

    // Upload vertex data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData.subarray(0, this.vertexCount * FLOATS_PER_VERTEX));

    // Upload index data
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.indexData.subarray(0, this.indexCount));

    // Set uniforms
    gl.uniformMatrix4fv(this.uProj, false, this.projMatrix);

    // Draw
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);

    // Reset
    this.vertexCount = 0;
    this.indexCount = 0;

    if (this.vao && typeof gl2.bindVertexArray === 'function') {
      gl2.bindVertexArray(null);
    }
  }

  /**
   * End the frame — flush remaining geometry.
   */
  end(): void {
    this.flush();
  }
}
