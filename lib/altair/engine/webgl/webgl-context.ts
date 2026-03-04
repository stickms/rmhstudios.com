// =============================================================================
// ALTAIR ENGINE -- WebGL Context
// =============================================================================
// Initializes and manages the WebGL rendering context. Provides shader
// compilation utilities and orthographic projection matrix setup.
// =============================================================================

/**
 * Initialize a WebGL2 context on the given canvas.
 * Falls back to WebGL1 if WebGL2 is not available.
 */
export function initWebGL(canvas: HTMLCanvasElement): WebGLRenderingContext {
  const opts: WebGLContextAttributes = {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  };

  const gl = canvas.getContext('webgl2', opts) || canvas.getContext('webgl', opts);
  if (!gl) {
    throw new Error('WebGL not supported');
  }

  // Standard blend mode for premultiplied alpha
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // Disable depth and stencil — we render back-to-front via draw order
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.STENCIL_TEST);

  return gl;
}

/**
 * Compile a shader from source.
 */
export function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile error: ${log}`);
  }
  return shader;
}

/**
 * Create a shader program from vertex and fragment sources.
 */
export function createProgram(
  gl: WebGLRenderingContext,
  vertSrc: string,
  fragSrc: string,
): WebGLProgram {
  const vert = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const frag = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program');
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    throw new Error(`Program link error: ${log}`);
  }
  // Shaders can be detached & deleted after linking
  gl.detachShader(program, vert);
  gl.detachShader(program, frag);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  return program;
}

/**
 * Compute a 4x4 orthographic projection matrix (column-major for WebGL).
 * Maps (0,0)-(w,h) to clip space (-1,-1)-(1,1), with y-down.
 */
export function ortho(out: Float32Array, w: number, h: number): Float32Array {
  out[0]  = 2 / w;  out[1]  = 0;      out[2]  = 0; out[3]  = 0;
  out[4]  = 0;      out[5]  = -2 / h; out[6]  = 0; out[7]  = 0;
  out[8]  = 0;      out[9]  = 0;      out[10] = 1; out[11] = 0;
  out[12] = -1;     out[13] = 1;      out[14] = 0; out[15] = 1;
  return out;
}
