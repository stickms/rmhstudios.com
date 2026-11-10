// =============================================================================
// ALTAIR ENGINE -- WebGL Sprite Batch
// =============================================================================
// High-performance batched quad renderer. Accumulates textured quads into a
// shared vertex buffer and flushes them in a single draw call per texture.
//
// Vertex format per vertex: [x, y, u, v, r, g, b, a]  (8 floats)
// Each quad = 4 vertices = 6 indices (two triangles).
// =============================================================================

import { createProgram, ortho } from './webgl-context';

// ---- Constants --------------------------------------------------------------

const MAX_QUADS = 8192;
const FLOATS_PER_VERTEX = 8; // x, y, u, v, r, g, b, a
const VERTICES_PER_QUAD = 4;
const INDICES_PER_QUAD = 6;
const FLOATS_PER_QUAD = FLOATS_PER_VERTEX * VERTICES_PER_QUAD;

// ---- Shaders ----------------------------------------------------------------

const VERT_SRC = `
  precision highp float;
  attribute vec2 aPos;
  attribute vec2 aUV;
  attribute vec4 aColor;
  uniform mat4 uProj;
  varying vec2 vUV;
  varying vec4 vColor;
  void main() {
    vUV = aUV;
    vColor = aColor;
    gl_Position = uProj * vec4(aPos, 0.0, 1.0);
  }
`;

const FRAG_SRC = `
  precision mediump float;
  varying vec2 vUV;
  varying vec4 vColor;
  uniform sampler2D uTex;
  void main() {
    vec4 tex = texture2D(uTex, vUV);
    // Apply tint: multiply RGB, multiply alpha for premultiplied-alpha correctness
    gl_FragColor = tex * vColor;
  }
`;

// ---- Sprite Batch class -----------------------------------------------------

export class SpriteBatch {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject | null = null;
  private vertexBuffer: WebGLBuffer;
  private indexBuffer: WebGLBuffer;
  private vertexData: Float32Array;
  private quadCount: number = 0;
  private currentTexture: WebGLTexture | null = null;
  private projMatrix: Float32Array;

  // Uniform locations
  private uProj: WebGLUniformLocation;
  private uTex: WebGLUniformLocation;

  constructor(gl: WebGLRenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, VERT_SRC, FRAG_SRC);
    this.projMatrix = new Float32Array(16);

    // Allocate vertex data buffer (CPU side)
    this.vertexData = new Float32Array(MAX_QUADS * FLOATS_PER_QUAD);

    // Create GPU buffers
    this.vertexBuffer = gl.createBuffer()!;
    this.indexBuffer = gl.createBuffer()!;

    // Build index buffer (static — never changes)
    const indices = new Uint16Array(MAX_QUADS * INDICES_PER_QUAD);
    for (let i = 0; i < MAX_QUADS; i++) {
      const vi = i * 4;
      const ii = i * 6;
      indices[ii + 0] = vi + 0;
      indices[ii + 1] = vi + 1;
      indices[ii + 2] = vi + 2;
      indices[ii + 3] = vi + 0;
      indices[ii + 4] = vi + 2;
      indices[ii + 5] = vi + 3;
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    // Allocate vertex buffer (dynamic)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);

    // Try to use VAO if available (WebGL2 or extension)
    const gl2 = gl as WebGL2RenderingContext;
    if (typeof gl2.createVertexArray === 'function') {
      this.vao = gl2.createVertexArray();
      gl2.bindVertexArray(this.vao);
      this.setupAttributes();
      gl2.bindVertexArray(null);
    }

    // Get uniform locations
    this.uProj = gl.getUniformLocation(this.program, 'uProj')!;
    this.uTex = gl.getUniformLocation(this.program, 'uTex')!;
  }

  private setupAttributes(): void {
    const gl = this.gl;
    const stride = FLOATS_PER_VERTEX * 4; // bytes

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

    const aPos = gl.getAttribLocation(this.program, 'aPos');
    const aUV = gl.getAttribLocation(this.program, 'aUV');
    const aColor = gl.getAttribLocation(this.program, 'aColor');

    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, stride, 0);

    gl.enableVertexAttribArray(aUV);
    gl.vertexAttribPointer(aUV, 2, gl.FLOAT, false, stride, 8);

    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 16);
  }

  /**
   * Begin a new frame. Call once per render frame.
   */
  begin(canvasWidth: number, canvasHeight: number): void {
    this.quadCount = 0;
    this.currentTexture = null;
    ortho(this.projMatrix, canvasWidth, canvasHeight);
  }

  /**
   * Push a textured quad into the batch.
   *
   * @param texture GPU texture to sample from
   * @param sx Source X in the texture (pixels)
   * @param sy Source Y in the texture (pixels)
   * @param sw Source width (pixels)
   * @param sh Source height (pixels)
   * @param texW Full texture width (pixels)
   * @param texH Full texture height (pixels)
   * @param dx Destination X on canvas (pixels, top-left)
   * @param dy Destination Y on canvas (pixels, top-left)
   * @param dw Destination width (pixels)
   * @param dh Destination height (pixels)
   * @param r Tint red (0–1), default 1
   * @param g Tint green (0–1), default 1
   * @param b Tint blue (0–1), default 1
   * @param a Alpha (0–1), default 1
   * @param flipX Mirror horizontally
   */
  drawQuad(
    texture: WebGLTexture,
    sx: number, sy: number, sw: number, sh: number,
    texW: number, texH: number,
    dx: number, dy: number, dw: number, dh: number,
    r: number = 1, g: number = 1, b: number = 1, a: number = 1,
    flipX: boolean = false,
  ): void {
    // Flush if texture changed or batch is full
    if (this.currentTexture && this.currentTexture !== texture) {
      this.flush();
    }
    if (this.quadCount >= MAX_QUADS) {
      this.flush();
    }
    this.currentTexture = texture;

    // UV coordinates
    let u0 = sx / texW;
    let u1 = (sx + sw) / texW;
    const v0 = sy / texH;
    const v1 = (sy + sh) / texH;
    if (flipX) { const tmp = u0; u0 = u1; u1 = tmp; }

    // Premultiply alpha into tint color for premultiplied alpha blending
    const pr = r * a;
    const pg = g * a;
    const pb = b * a;
    const pa = a;

    // Write 4 vertices: TL, TR, BR, BL
    const offset = this.quadCount * FLOATS_PER_QUAD;
    const d = this.vertexData;

    // Top-left
    d[offset + 0] = dx;      d[offset + 1] = dy;
    d[offset + 2] = u0;      d[offset + 3] = v0;
    d[offset + 4] = pr;      d[offset + 5] = pg;
    d[offset + 6] = pb;      d[offset + 7] = pa;

    // Top-right
    d[offset + 8]  = dx + dw; d[offset + 9]  = dy;
    d[offset + 10] = u1;      d[offset + 11] = v0;
    d[offset + 12] = pr;      d[offset + 13] = pg;
    d[offset + 14] = pb;      d[offset + 15] = pa;

    // Bottom-right
    d[offset + 16] = dx + dw; d[offset + 17] = dy + dh;
    d[offset + 18] = u1;      d[offset + 19] = v1;
    d[offset + 20] = pr;      d[offset + 21] = pg;
    d[offset + 22] = pb;      d[offset + 23] = pa;

    // Bottom-left
    d[offset + 24] = dx;      d[offset + 25] = dy + dh;
    d[offset + 26] = u0;      d[offset + 27] = v1;
    d[offset + 28] = pr;      d[offset + 29] = pg;
    d[offset + 30] = pb;      d[offset + 31] = pa;

    this.quadCount++;
  }

  /**
   * Flush all accumulated quads to the GPU.
   */
  flush(): void {
    if (this.quadCount === 0) return;

    const gl = this.gl;
    gl.useProgram(this.program);

    // Bind VAO or set up attributes manually
    const gl2 = gl as WebGL2RenderingContext;
    if (this.vao && typeof gl2.bindVertexArray === 'function') {
      gl2.bindVertexArray(this.vao);
    } else {
      this.setupAttributes();
    }

    // Upload vertex data
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    const subData = this.vertexData.subarray(0, this.quadCount * FLOATS_PER_QUAD);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, subData);

    // Set uniforms
    gl.uniformMatrix4fv(this.uProj, false, this.projMatrix);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.currentTexture);
    gl.uniform1i(this.uTex, 0);

    // Draw
    gl.drawElements(gl.TRIANGLES, this.quadCount * INDICES_PER_QUAD, gl.UNSIGNED_SHORT, 0);

    // Reset
    this.quadCount = 0;
    this.currentTexture = null;

    if (this.vao && typeof gl2.bindVertexArray === 'function') {
      gl2.bindVertexArray(null);
    }
  }

  /**
   * End the frame — flush remaining quads.
   */
  end(): void {
    this.flush();
  }
}
