/**
 * Build WebGL programs without stalling the thread that asked for them.
 *
 * `compileShader` and `linkProgram` are asynchronous in every engine that matters — Chromium and Gecko hand them to a
 * GPU process, ANGLE on Windows compiles to HLSL there, WebKit to Metal — and what makes them block is the FIRST
 * status query (`getShaderParameter(COMPILE_STATUS)`, `getProgramParameter(LINK_STATUS)`, `getUniformLocation`): the
 * caller waits for the driver to finish. The cursor, the globe's coat and skin and the glass rims each built their
 * programs that way on mount, so a cold compile — the larger shaders here are thousands of lines of GLSL — landed in
 * the frames where the page was coming up: the stutter.
 *
 * So this file queues the work and asks nothing until it is done:
 *
 * - **`KHR_parallel_shader_compile`** (where the browser exposes it — Chromium on hardware GPUs, among others): poll
 *   `COMPLETION_STATUS_KHR`, which never blocks, on a timer until the driver says the program is linked; only then
 *   read `LINK_STATUS`.
 * - **Without it, on WebGL 2** (Safari, software rasterisers, older drivers): a fence after the link. Its status is
 *   non-blocking by spec (it updates between tasks), and it signals once the GPU side has executed everything queued
 *   before it — the compile and link included. A GPU process runs every context's commands in one queue (the glass
 *   worker's compiles too), so the query also waits a minimum time (`DEFER_MS`, below) for the driver's own link job.
 * - **WebGL 1 without the extension:** the same minimum wait (`DEFER_MS`), then the query.
 *
 * Status of the individual shaders is only read when the link FAILED (the log is for diagnostics), never on the
 * success path: that is a second round trip per shader for no information.
 *
 * Caching: the browser keeps its own persistent cache of compiled programs keyed on the exact source text (Chromium's
 * GPU program cache, ANGLE's blob cache in Gecko, WebKit's Metal shader cache), so a repeat visit compiles from that
 * cache rather than from scratch — as long as the source is byte-identical between page loads. Every caller builds its
 * source from constants for that reason; never splice a per-session value (a DPR, a time, a random seed) into GLSL.
 *
 * Timers, not animation frames: a build is not motion, and must not hold a frame driver awake (raf-loop-allowlist).
 */

type GL = WebGLRenderingContext | WebGL2RenderingContext;

/** `KHR_parallel_shader_compile`'s one constant (the extension object exposes it, but not in every engine's typings). */
const COMPLETION_STATUS_KHR = 0x91b1;
/** How often a pending build is polled. */
const POLL_MS = 16;
/**
 * Without the extension: the least time the driver gets before the status query (WebGL 2 also waits for its fence).
 * ANGLE links on worker threads of its own, so even a signalled fence can precede the link's end. Measured on
 * SwiftShader (no extension), a query 48 ms after the link waited up to 575 ms; one ≥ 0.8 s after it waited roughly a
 * round trip, which on a GPU process busy software-rasterising the page is itself 30 ms to seconds. The layers fade
 * in, so a later start costs nothing visible; a stall costs frames.
 */
const DEFER_MS = 1000;
/** A build still pending after this long is answered by a blocking query: a driver that never reports must not hang us. */
const MAX_WAIT_MS = 4000;

export interface ProgramSource {
  vert: string;
  frag: string;
  /** Attribute locations bound before the link (`bindAttribLocation`). */
  attribs?: Record<string, number>;
  /** An already-compiled vertex shader to share between programs (the caller keeps ownership). */
  vertShader?: WebGLShader;
}

export interface ProgramBuild {
  readonly program: WebGLProgram;
  /** The vertex shader this build compiled (null when it reused `vertShader`). */
  readonly vertShader: WebGLShader | null;
  /** True once the driver has finished (or, on WebGL 1 without the extension, been given time). Never blocks. */
  settled(): boolean;
  /** Blocking: the link result. Call after `settled()` (or accept the wait). */
  linked(): boolean;
  /** The driver's message when `linked()` is false. */
  error(): string;
}

const parallelExt = new WeakMap<GL, boolean>();
/** Whether this context can be asked "done yet?" without blocking. Cached per context. */
export function hasParallelCompile(gl: GL): boolean {
  let has = parallelExt.get(gl);
  if (has === undefined) {
    has = !!gl.getExtension('KHR_parallel_shader_compile');
    parallelExt.set(gl, has);
  }
  return has;
}

const isWebGL2 = (gl: GL): gl is WebGL2RenderingContext =>
  typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;

function shader(gl: GL, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

/**
 * Queue a program: compile both stages and link, reading no status. Null only when the context could not even create
 * the objects (lost). The caller decides when to look — {@link whenLinked} for the non-blocking path, or
 * `build.linked()` straight away for a thread where a wait is harmless (a worker).
 */
export function startProgram(gl: GL, src: ProgramSource): ProgramBuild | null {
  const vs = src.vertShader ?? shader(gl, gl.VERTEX_SHADER, src.vert);
  const fs = shader(gl, gl.FRAGMENT_SHADER, src.frag);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  if (src.attribs)
    for (const [name, at] of Object.entries(src.attribs)) gl.bindAttribLocation(program, at, name);
  gl.linkProgram(program);
  const parallel = hasParallelCompile(gl);
  const gl2 = isWebGL2(gl) ? gl : null;
  let fence: WebGLSync | null = null;
  if (!parallel && gl2) {
    fence = gl2.fenceSync(gl2.SYNC_GPU_COMMANDS_COMPLETE, 0);
    // Without a flush the fence (and the link before it) may sit in this context's buffer until the next draw.
    gl2.flush();
  }
  const dropFence = () => {
    if (fence && gl2) gl2.deleteSync(fence);
    fence = null;
  };
  const started = typeof performance !== 'undefined' ? performance.now() : 0;
  let result: boolean | null = null;
  let message = '';
  return {
    program,
    vertShader: src.vertShader ? null : vs,
    settled() {
      if (result !== null) return true;
      if (parallel) return gl.getProgramParameter(program, COMPLETION_STATUS_KHR) === true;
      const waited = typeof performance === 'undefined' ? Infinity : performance.now() - started;
      if (waited < DEFER_MS) return false;
      if (fence && gl2) return gl2.getSyncParameter(fence, gl2.SYNC_STATUS) === gl2.SIGNALED;
      return true;
    },
    linked() {
      if (result === null) {
        dropFence();
        result = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
        // Logs are read only on failure: on success they are a round trip per shader for nothing.
        if (!result) {
          message = (
            gl.getProgramInfoLog(program) ||
            gl.getShaderInfoLog(fs) ||
            gl.getShaderInfoLog(vs) ||
            'program link failed'
          ).trim();
        }
        // The fragment shader is the program's own; a shared vertex shader stays with its owner.
        gl.detachShader(program, fs);
        gl.deleteShader(fs);
      }
      return result;
    },
    error() {
      return message;
    },
  };
}

/**
 * Resolve with the linked program (or null when it failed or the context was lost) without blocking the thread on the
 * driver. Polls on a timer; `signal` abandons the wait (the program is deleted).
 */
export function whenLinked(
  gl: GL,
  build: ProgramBuild,
  signal?: { aborted: boolean },
): Promise<WebGLProgram | null> {
  const started = typeof performance !== 'undefined' ? performance.now() : 0;
  return new Promise((resolve) => {
    const check = () => {
      if (signal?.aborted || gl.isContextLost()) {
        gl.deleteProgram(build.program);
        resolve(null);
        return;
      }
      const waited = typeof performance !== 'undefined' ? performance.now() - started : MAX_WAIT_MS;
      if (!build.settled() && waited < MAX_WAIT_MS) {
        setTimeout(check, POLL_MS);
        return;
      }
      if (build.linked()) {
        resolve(build.program);
      } else {
        gl.deleteProgram(build.program);
        resolve(null);
      }
    };
    // Never answer in the same task: the point is to give the driver time.
    setTimeout(check, hasParallelCompile(gl) ? POLL_MS : DEFER_MS);
  });
}
