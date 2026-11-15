/**
 * The chrome renderer (Steel 4.3): one WebGL context for every chrome element on the page.
 *
 * - V1: one context. Each element owns only a small 2D canvas (V2) that the shared canvas
 *   is copied into, so no element ever creates a context of its own.
 * - V3: a pill is drawn only while its `--c` is above zero.
 * - V9: nothing is scheduled at rest. Input requests one coalesced frame; a frame asks
 *   for another only while a thumb is still fading or the caller says a transition runs.
 * - V7/V8: the environment is repainted on content changes, never on a scroll frame.
 */
import {
  ENV_SCALE,
  createEnvironmentPainter,
  envWindowFor,
  windowCovers,
  type EnvWindow,
  type EnvironmentPainter,
  type Viewport,
} from './environment';
import {
  FRAGMENT_SHADER,
  ROOM,
  VERTEX_SHADER,
} from './shader';

export type ChromeKind =
  | 'ball'
  | 'pill';

/**
 * A ball that is a BODY (lib/globe): it turns, ripples and gives like dough. The globe's view owns this object,
 * mutates it, and asks for a frame; the renderer only reads it. Nothing here pulls the physics into this module.
 */
export interface BallState {
  /** Body -> view rotation, row-major 3x3. */
  rot: Float32Array;
  /** Up to three ripples: view-space direction and age in seconds (negative: none). 12 numbers. */
  ripples: Float32Array;
  /** The dough field (RGBA float, `fieldSize` squared), and a version that changes when it does. */
  field: Float32Array;
  fieldSize: number;
  version: number;
  /** True while the field is deformed. */
  soft: boolean;
  /** Dot size (1 = docked), dot strength, cage-line strength. */
  dots: [
    number,
    number,
    number,
  ];
  /** The destinations as body-space directions (3 numbers each, a fixed-length array), and how many are set. */
  pins: Float32Array;
  pinCount: number;
  /** How far the canvas hangs outside the disc, as a fraction of its diameter. */
  bleed: number;
}

interface Entry {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  kind: ChromeKind;
  ball?: BallState;
  /** The field version last uploaded for this ball. */
  uploaded?: number;
}

interface Program {
  program: WebGLProgram;
  uniforms: Record<
    string,
    WebGLUniformLocation | null
  >;
}

/** What the renderer needs from its surroundings; the tests replace these. */
export interface Host {
  window: Window &
    typeof globalThis;
  document: Document;
  requestFrame: (
    fn: () => void,
  ) => number;
  cancelFrame: (
    id: number,
  ) => void;
  requestIdle: (
    fn: () => void,
  ) => void;
  createGlCanvas: () =>
    | HTMLCanvasElement
    | OffscreenCanvas;
  createEnvCanvas: () =>
    | HTMLCanvasElement
    | OffscreenCanvas;
  /**
   * False while the element must not be given a child yet. In the browser that is "React has not finished hydrating
   * it": a canvas appended to server markup before hydration reaches it is a hydration mismatch (React error 418).
   */
  ready?: (
    el: Element,
  ) => boolean;
}

const MAX_DPR = 2;
/** How many idle slices the renderer looks again for an element that is not ready, before it waits for the next change. */
const READY_RETRIES = 20;
/** The longest one idle slice of the environment paint may run, in ms. */
const ENV_SLICE_MS = 6;
const UNIFORMS =
  [
    'u_viewport',
    'u_dpr',
    'u_hs',
    'u_centre',
    'u_envOrigin',
    'u_envSize',
    'u_env',
    'u_bg',
    'u_lo',
    'u_hi',
    'u_pointer',
    'u_night',
  ] as const;
/** The body program's own uniforms (lib/globe/shader.ts). */
const BALL_UNIFORMS =
  [
    'u_field',
    'u_soft',
    'u_rot',
    'u_rip',
    'u_dots',
    'u_pin',
    'u_pins',
  ] as const;

function parseColour(
  css: string,
): [
  number,
  number,
  number,
] {
  const m =
    /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(
      css,
    );
  return m
    ? [
        Number(
          m[1],
        ) /
          255,
        Number(
          m[2],
        ) /
          255,
        Number(
          m[3],
        ) /
          255,
      ]
    : [
        1,
        1,
        1,
      ];
}

export class ChromeRenderer {
  private readonly entries =
    new Map<
      Element,
      Entry
    >();
  private gl: WebGLRenderingContext | null =
    null;
  private glCanvas:
    | HTMLCanvasElement
    | OffscreenCanvas
    | null =
    null;
  private flat: Program | null =
    null;
  private body: Program | null =
    null;
  private bodySource:
    | string
    | null =
    null;
  private fieldTexture: WebGLTexture | null =
    null;
  private fieldOwner: Entry | null =
    null;
  private readonly pendingBalls =
    new Map<
      Element,
      BallState
    >();
  private envCanvas:
    | HTMLCanvasElement
    | OffscreenCanvas
    | null =
    null;
  private envTexture: WebGLTexture | null =
    null;
  private envWindow: EnvWindow | null =
    null;
  private envDirty = true;
  private envNight:
    | boolean
    | null =
    null;
  private envQueued = false;
  private frame = 0;
  private lost = false;
  private pointer: [
    number,
    number,
  ] =
    [
      -1e6,
      -1e6,
    ];
  private animatingUntil = 0;
  private scrolling = 0;
  private maxTexture = 4096;
  private readonly off: Array<
    () => void
  > =
    [];
  /** V13: the last redraw and the last environment repaint, in ms (read by the budget check). */
  readonly timings =
    {
      draw: 0,
      environment: 0,
      longestSlice: 0,
    };

  private readyTries = 0;

  constructor(
    private readonly host: Host,
  ) {}

  /** True when a frame is scheduled. The "nothing at rest" tests read this. */
  get pending(): boolean {
    return (
      this
        .frame !==
      0
    );
  }

  /** How many WebGL contexts this renderer holds: 0 or 1 (V1). */
  get contexts(): number {
    return this
      .gl
      ? 1
      : 0;
  }

  start(): boolean {
    if (
      this
        .gl
    )
      return true;
    const canvas =
      this.host.createGlCanvas();
    const gl =
      canvas.getContext(
        'webgl',
        {
          alpha: true,
          premultipliedAlpha: true,
          antialias: false,
        },
      ) as WebGLRenderingContext | null;
    if (
      !gl
    )
      return false; // V11: the CSS gradient is the whole design without WebGL
    this.glCanvas =
      canvas;
    this.gl =
      gl;
    if (
      !this.build()
    ) {
      this.gl =
        null;
      return false;
    }
    this.listen();
    this.invalidate();
    return true;
  }

  stop(): void {
    for (const off of this.off.splice(
      0,
    ))
      off();
    if (
      this
        .frame
    )
      this.host.cancelFrame(
        this
          .frame,
      );
    this.frame = 0;
    for (const {
      canvas,
    } of this.entries.values())
      canvas.remove();
    this.entries.clear();
    this.gl
      ?.getExtension(
        'WEBGL_lose_context',
      )
      ?.loseContext();
    this.gl =
      null;
  }

  /** V8: the page's content changed (route, feed page appended, fonts, resize). */
  invalidate(): void {
    this.envDirty = true;
    this.readyTries = 0;
    this.schedule();
  }

  /** V9: a transition is running for `ms` (the globe opening): draw every frame until it ends. */
  animate(
    ms: number,
  ): void {
    this.animatingUntil =
      Math.max(
        this
          .animatingUntil,
        this.host.window.performance.now() +
          ms,
      );
    this.schedule();
  }

  schedule(): void {
    if (
      this
        .frame ||
      this
        .lost ||
      !this
        .gl
    )
      return;
    this.frame =
      this.host.requestFrame(
        () => {
          this.frame = 0;
          this.draw();
        },
      );
  }

  private link:
    | ((
        source: string,
        extra: readonly string[],
      ) => Program | null)
    | null =
    null;

  /**
   * Make `el` (a `data-chrome="ball"` element) a body drawn from `state` with the body shader `fragment`. False when
   * this machine cannot do it (no float textures, or the program does not link): the ball stays flat chrome.
   */
  attachBall(
    el: Element,
    state: BallState,
    fragment: string,
  ): boolean {
    const gl =
      this
        .gl;
    if (
      !gl
    )
      return false;
    this.bodySource =
      fragment;
    if (
      !this.bodyProgram()
    )
      return false;
    this.pendingBalls.set(
      el,
      state,
    );
    this.schedule();
    return true;
  }

  detachBall(
    el: Element,
  ): void {
    this.pendingBalls.delete(
      el,
    );
    const entry =
      this.entries.get(
        el,
      );
    if (
      !entry?.ball
    )
      return;
    delete entry.ball;
    delete entry.uploaded;
    entry.canvas.style.inset =
      '0';
    entry.canvas.style.width =
      entry.canvas.style.height =
        '100%';
    entry.canvas.style.borderRadius =
      'inherit';
    (
      el as HTMLElement
    ).removeAttribute(
      'data-chrome-live',
    );
    this.schedule();
  }

  /** The body program and its field texture, built on first use and again after a context restore. */
  private bodyProgram(): Program | null {
    const gl =
      this
        .gl;
    if (
      this
        .body ||
      !gl ||
      !this
        .bodySource ||
      !this
        .link
    )
      return this
        .body;
    if (
      !gl.getExtension(
        'OES_texture_float',
      ) ||
      !gl.getExtension(
        'OES_texture_float_linear',
      )
    )
      return null;
    const body =
      this.link(
        this
          .bodySource,
        BALL_UNIFORMS,
      );
    if (
      !body
    )
      return null;
    gl.uniform1i(
      body
        .uniforms
        .u_field ??
        null,
      1,
    );
    this.fieldTexture =
      gl.createTexture();
    gl.activeTexture(
      gl.TEXTURE1,
    );
    gl.bindTexture(
      gl.TEXTURE_2D,
      this
        .fieldTexture,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      gl.LINEAR,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      gl.CLAMP_TO_EDGE,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_T,
      gl.CLAMP_TO_EDGE,
    );
    gl.activeTexture(
      gl.TEXTURE0,
    );
    this.body =
      body;
    return body;
  }

  private build(): boolean {
    const gl =
      this
        .gl;
    if (
      !gl
    )
      return false;
    const compile =
      (
        type: number,
        source: string,
      ) => {
        const shader =
          gl.createShader(
            type,
          );
        if (
          !shader
        )
          return null;
        gl.shaderSource(
          shader,
          source,
        );
        gl.compileShader(
          shader,
        );
        return gl.getShaderParameter(
          shader,
          gl.COMPILE_STATUS,
        )
          ? shader
          : null;
      };
    const vs =
      compile(
        gl.VERTEX_SHADER,
        VERTEX_SHADER,
      );
    const link =
      (
        source: string,
        extra: readonly string[],
      ): Program | null => {
        const fs =
          compile(
            gl.FRAGMENT_SHADER,
            source,
          );
        const program =
          gl.createProgram();
        if (
          !vs ||
          !fs ||
          !program
        )
          return null;
        gl.attachShader(
          program,
          vs,
        );
        gl.attachShader(
          program,
          fs,
        );
        gl.bindAttribLocation(
          program,
          0,
          'a_pos',
        );
        gl.linkProgram(
          program,
        );
        if (
          !gl.getProgramParameter(
            program,
            gl.LINK_STATUS,
          )
        )
          return null;
        gl.useProgram(
          program,
        );
        const uniforms: Program['uniforms'] =
          {};
        for (const name of [
          ...UNIFORMS,
          ...extra,
        ])
          uniforms[
            name
          ] =
            gl.getUniformLocation(
              program,
              name,
            );
        gl.uniform1i(
          uniforms.u_env ??
            null,
          0,
        );
        return {
          program,
          uniforms,
        };
      };
    this.link =
      link;
    this.flat =
      link(
        FRAGMENT_SHADER,
        [],
      );
    if (
      !this
        .flat
    )
      return false;
    this.body =
      null;
    this.fieldTexture =
      null;
    this.fieldOwner =
      null;
    const buffer =
      gl.createBuffer();
    gl.bindBuffer(
      gl.ARRAY_BUFFER,
      buffer,
    );
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(
        [
          -1,
          -1,
          1,
          -1,
          -1,
          1,
          1,
          1,
        ],
      ),
      gl.STATIC_DRAW,
    );
    gl.enableVertexAttribArray(
      0,
    );
    gl.vertexAttribPointer(
      0,
      2,
      gl.FLOAT,
      false,
      0,
      0,
    );
    this.envTexture =
      gl.createTexture();
    gl.bindTexture(
      gl.TEXTURE_2D,
      this
        .envTexture,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MIN_FILTER,
      gl.LINEAR,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_MAG_FILTER,
      gl.LINEAR,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_S,
      gl.CLAMP_TO_EDGE,
    );
    gl.texParameteri(
      gl.TEXTURE_2D,
      gl.TEXTURE_WRAP_T,
      gl.CLAMP_TO_EDGE,
    );
    this.maxTexture =
      Number(
        gl.getParameter(
          gl.MAX_TEXTURE_SIZE,
        ),
      ) ||
      4096;
    gl.disable(
      gl.DEPTH_TEST,
    );
    gl.disable(
      gl.BLEND,
    );
    this.envDirty = true;
    return true;
  }

  private listen(): void {
    const {
      window:
        win,
      document:
        doc,
    } =
      this
        .host;
    const on =
      (
        target: EventTarget,
        type: string,
        fn: EventListener,
        options?: AddEventListenerOptions,
      ) => {
        target.addEventListener(
          type,
          fn,
          options,
        );
        this.off.push(
          () =>
            target.removeEventListener(
              type,
              fn,
              options,
            ),
        );
      };
    const redraw =
      () =>
        this.schedule();
    // V10: the one pointer listener. It feeds the reflected pointer; proximity stays in CSS (C6).
    on(
      doc,
      'pointermove',
      ((
        e: PointerEvent,
      ) => {
        this.pointer =
          [
            e.pageX,
            e.pageY,
          ];
        this.schedule();
      }) as EventListener,
      {
        passive: true,
      },
    );
    on(
      doc,
      'pointerdown',
      redraw,
      {
        passive: true,
      },
    );
    on(
      doc,
      'pointerup',
      redraw,
      {
        passive: true,
      },
    );
    on(
      win,
      'scroll',
      (() => {
        this.scrolling =
          win.performance.now();
        this.schedule();
      }) as EventListener,
      {
        passive: true,
        capture: true,
      },
    );
    on(
      doc,
      'input',
      redraw,
      {
        passive: true,
      },
    );
    on(
      doc,
      'change',
      redraw,
      {
        passive: true,
      },
    );
    on(
      doc,
      'focusin',
      redraw,
      {
        passive: true,
      },
    );
    on(
      doc,
      'focusout',
      redraw,
      {
        passive: true,
      },
    );
    on(
      win,
      'resize',
      () =>
        this.invalidate(),
      {
        passive: true,
      },
    );
    // A thumb turning chrome is a CSS transition of `--c` (4.1) that no input event need
    // accompany (the pointer can stop inside the proximity zone): draw until it settles.
    on(
      doc,
      'transitionrun',
      ((
        e: TransitionEvent,
      ) => {
        if (
          e.propertyName ===
          '--c'
        )
          this.animate(
            e.elapsedTime *
              1000 +
              320,
          );
      }) as EventListener,
      {
        passive: true,
      },
    );
    void doc.fonts?.ready.then(
      () =>
        this.invalidate(),
    );
    const canvas =
      this
        .glCanvas as EventTarget;
    on(
      canvas,
      'webglcontextlost',
      ((
        e: Event,
      ) => {
        // V11: hide the copies so the CSS gradient shows, and wait for the restore.
        e.preventDefault();
        this.lost = true;
        for (const {
          canvas:
            c,
        } of this.entries.values())
          c.style.display =
            'none';
      }) as EventListener,
    );
    on(
      canvas,
      'webglcontextrestored',
      () => {
        this.lost = false;
        if (
          this.build()
        ) {
          for (const {
            canvas:
              c,
          } of this.entries.values())
            c.style.display =
              '';
          this.invalidate();
        }
      },
    );
  }

  /** Find chrome elements, give new ones a canvas, forget detached ones. */
  private sync(): void {
    const doc =
      this
        .host
        .document;
    const found =
      doc.querySelectorAll<HTMLElement>(
        '[data-chrome]',
      );
    const seen =
      new Set<Element>();
    let waiting = false;
    for (const el of found) {
      seen.add(
        el,
      );
      if (
        this.entries.has(
          el,
        )
      )
        continue;
      if (
        this
          .host
          .ready &&
        !this.host.ready(
          el,
        )
      ) {
        waiting = true;
        continue;
      }
      const canvas =
        doc.createElement(
          'canvas',
        );
      canvas.setAttribute(
        'aria-hidden',
        'true',
      );
      canvas.setAttribute(
        'data-chrome-canvas',
        '',
      );
      canvas.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;border-radius:inherit';
      const kind: ChromeKind =
        el
          .dataset
          .chrome ===
        'ball'
          ? 'ball'
          : 'pill';
      if (
        kind ===
        'pill'
      )
        canvas.style.opacity =
          'var(--c)'; // V3
      const ctx =
        canvas.getContext(
          '2d',
        );
      if (
        !ctx
      )
        continue;
      el.appendChild(
        canvas,
      );
      this.entries.set(
        el,
        {
          canvas,
          ctx,
          kind,
        },
      );
    }
    // Not at rest yet: look again at idle, a bounded number of times, then leave it to the next invalidate().
    if (
      waiting &&
      this
        .readyTries++ <
        READY_RETRIES
    )
      this.host.requestIdle(
        () =>
          this.schedule(),
      );
    for (const [
      el,
      entry,
    ] of this
      .entries) {
      if (
        seen.has(
          el,
        )
      )
        continue;
      entry.canvas.remove();
      this.entries.delete(
        el,
      );
      this.pendingBalls.delete(
        el,
      );
    }
    for (const [
      el,
      state,
    ] of this
      .pendingBalls) {
      const entry =
        this.entries.get(
          el,
        );
      if (
        !entry ||
        entry.ball ===
          state
      )
        continue;
      entry.ball =
        state;
      entry.uploaded =
        -1;
      const over = `${(-state.bleed * 100).toFixed(2)}%`;
      const size = `${((1 + 2 * state.bleed) * 100).toFixed(2)}%`;
      entry.canvas.style.inset =
        over;
      entry.canvas.style.width =
        entry.canvas.style.height =
          size;
      entry.canvas.style.borderRadius =
        '0';
    }
  }

  private viewport(): Viewport {
    const {
      window:
        win,
      document:
        doc,
    } =
      this
        .host;
    const root =
      doc.documentElement;
    return {
      scrollX:
        win.scrollX,
      scrollY:
        win.scrollY,
      width:
        win.innerWidth,
      height:
        win.innerHeight,
      pageWidth:
        Math.max(
          root.scrollWidth,
          win.innerWidth,
        ),
      pageHeight:
        Math.max(
          root.scrollHeight,
          win.innerHeight,
        ),
    };
  }

  /**
   * V7, V13: never on a scroll frame, and never one long task. The paint runs in idle
   * slices of ENV_SLICE_MS; when the last slice finishes the texture is uploaded and one
   * redraw is requested.
   */
  private queueEnvironment(
    night: boolean,
  ): void {
    if (
      this
        .envQueued
    )
      return;
    this.envQueued = true;
    let painter: EnvironmentPainter | null =
      null;
    let region: EnvWindow | null =
      null;
    let spent = 0;
    let longest = 0;
    const slice =
      () => {
        const gl =
          this
            .gl;
        if (
          !gl ||
          this
            .lost
        ) {
          this.envQueued = false;
          return;
        }
        const {
          window:
            win,
          document:
            doc,
        } =
          this
            .host;
        // Scrolling started mid-paint: stand aside until it stops.
        if (
          win.performance.now() -
            this
              .scrolling <
          120
        ) {
          this.host.requestIdle(
            slice,
          );
          return;
        }
        const began =
          win.performance.now();
        this.envCanvas ??=
          this.host.createEnvCanvas();
        const canvas =
          this
            .envCanvas;
        if (
          !painter
        ) {
          const v =
            this.viewport();
          region =
            envWindowFor(
              v,
              this
                .maxTexture,
            );
          canvas.width =
            Math.max(
              1,
              Math.round(
                region.width *
                  ENV_SCALE,
              ),
            );
          canvas.height =
            Math.max(
              1,
              Math.round(
                region.height *
                  ENV_SCALE,
              ),
            );
          const ctx =
            canvas.getContext(
              '2d',
            ) as CanvasRenderingContext2D | null;
          if (
            !ctx
          ) {
            this.envQueued = false;
            return;
          }
          const background =
            win.getComputedStyle(
              doc.body,
            ).backgroundColor;
          painter =
            createEnvironmentPainter(
              ctx,
              doc.body,
              region,
              background,
              {
                x: v.scrollX,
                y: v.scrollY,
              },
              () =>
                win.performance.now(),
            );
        }
        const done =
          painter.step(
            ENV_SLICE_MS,
          );
        const took =
          win.performance.now() -
          began;
        spent +=
          took;
        longest =
          Math.max(
            longest,
            took,
          );
        if (
          !done
        ) {
          this.host.requestIdle(
            slice,
          );
          return;
        }
        gl.activeTexture(
          gl.TEXTURE0,
        );
        gl.bindTexture(
          gl.TEXTURE_2D,
          this
            .envTexture,
        );
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          canvas as TexImageSource,
        );
        this.envWindow =
          region;
        this.envNight =
          night;
        this.envDirty = false;
        this.envQueued = false;
        this.timings.environment =
          spent;
        this.timings.longestSlice =
          longest;
        this.schedule();
      };
    this.host.requestIdle(
      slice,
    );
  }

  private draw(): void {
    const gl =
      this
        .gl;
    const glCanvas =
      this
        .glCanvas;
    if (
      !gl ||
      !glCanvas ||
      this
        .lost
    )
      return;
    const {
      window:
        win,
      document:
        doc,
    } =
      this
        .host;
    this.sync();
    if (
      this
        .entries
        .size ===
      0
    )
      return;

    const night =
      doc.documentElement.classList.contains(
        'style-graphite',
      );
    const v =
      this.viewport();
    const now =
      win.performance.now();
    const stale =
      this
        .envDirty ||
      this
        .envNight !==
        night ||
      !this
        .envWindow ||
      !windowCovers(
        this
          .envWindow,
        v,
      );
    if (
      stale &&
      now -
        this
          .scrolling >
        120
    )
      this.queueEnvironment(
        night,
      );
    else if (
      stale
    )
      this.schedule(); // still scrolling: look again next frame
    if (
      !this
        .envWindow
    )
      return; // nothing to reflect yet; the CSS gradient is showing

    const dprCap =
      Math.min(
        win.devicePixelRatio ||
          1,
        MAX_DPR,
      );
    const room =
      night
        ? ROOM.night
        : ROOM.day;
    const bg =
      parseColour(
        win.getComputedStyle(
          doc.body,
        )
          .backgroundColor,
      );
    let fading = false;

    const envWindow =
      this
        .envWindow;
    let current: Program | null =
      null;
    const primed =
      new Set<Program>();
    const bind =
      (
        prog: Program,
      ) => {
        if (
          current !==
          prog
        ) {
          gl.useProgram(
            prog.program,
          );
          current =
            prog;
        }
        if (
          primed.has(
            prog,
          )
        )
          return prog.uniforms;
        primed.add(
          prog,
        );
        const u =
          prog.uniforms;
        gl.uniform2f(
          u.u_envOrigin ??
            null,
          envWindow.x,
          envWindow.y,
        );
        gl.uniform2f(
          u.u_envSize ??
            null,
          envWindow.width,
          envWindow.height,
        );
        gl.uniform3f(
          u.u_bg ??
            null,
          bg[0],
          bg[1],
          bg[2],
        );
        gl.uniform3f(
          u.u_lo ??
            null,
          room
            .lo[0],
          room
            .lo[1],
          room
            .lo[2],
        );
        gl.uniform3f(
          u.u_hi ??
            null,
          room
            .hi[0],
          room
            .hi[1],
          room
            .hi[2],
        );
        gl.uniform2f(
          u.u_pointer ??
            null,
          this
            .pointer[0],
          this
            .pointer[1],
        );
        gl.uniform1f(
          u.u_night ??
            null,
          night
            ? 1
            : 0,
        );
        return u;
      };
    const flat =
      this
        .flat;
    if (
      !flat
    )
      return;

    for (const [
      el,
      entry,
    ] of this
      .entries) {
      if (
        entry.kind ===
        'pill'
      ) {
        const c =
          Number.parseFloat(
            win
              .getComputedStyle(
                el,
              )
              .getPropertyValue(
                '--c',
              ),
          ) ||
          0;
        if (
          c <=
          0
        )
          continue; // V3: a flat thumb costs nothing
        if (
          c <
          1
        )
          fading = true;
      }
      const rect =
        el.getBoundingClientRect();
      if (
        rect.width <
          1 ||
        rect.height <
          1
      )
        continue;
      if (
        rect.bottom <
          0 ||
        rect.top >
          v.height ||
        rect.right <
          0 ||
        rect.left >
          v.width
      )
        continue;

      // V2: backing size = the element's CSS size (or the largest size it declares, for a
      // globe that is scaled up when open) times min(dpr, 2).
      const declared =
        Number(
          (
            el as HTMLElement
          )
            .dataset
            .chromeMax,
        ) ||
        0;
      const body =
        entry.ball
          ? this.bodyProgram()
          : null;
      const ball =
        body
          ? entry.ball
          : undefined;
      // A body's canvas hangs outside the disc so a pushed limb has somewhere to go.
      const over =
        ball
          ? 1 +
            2 *
              ball.bleed
          : 1;
      const w =
        Math.max(
          1,
          Math.round(
            Math.max(
              rect.width,
              declared,
            ) *
              dprCap *
              over,
          ),
        );
      const h =
        Math.max(
          1,
          Math.round(
            (w *
              rect.height) /
              rect.width,
          ),
        );
      if (
        entry
          .canvas
          .width !==
          w ||
        entry
          .canvas
          .height !==
          h
      ) {
        entry.canvas.width =
          w;
        entry.canvas.height =
          h;
      }
      if (
        glCanvas.width <
        w
      )
        glCanvas.width =
          w;
      if (
        glCanvas.height <
        h
      )
        glCanvas.height =
          h;

      const u =
        bind(
          body &&
            ball
            ? body
            : flat,
        );
      if (
        body &&
        ball
      ) {
        gl.activeTexture(
          gl.TEXTURE1,
        );
        gl.bindTexture(
          gl.TEXTURE_2D,
          this
            .fieldTexture,
        );
        if (
          this
            .fieldOwner !==
            entry ||
          entry.uploaded !==
            ball.version
        ) {
          gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            ball.fieldSize,
            ball.fieldSize,
            0,
            gl.RGBA,
            gl.FLOAT,
            ball.field,
          );
          this.fieldOwner =
            entry;
          entry.uploaded =
            ball.version;
        }
        gl.activeTexture(
          gl.TEXTURE0,
        );
        gl.uniform1f(
          u.u_soft ??
            null,
          ball.soft
            ? 1
            : 0,
        );
        gl.uniformMatrix3fv(
          u.u_rot ??
            null,
          false,
          ball.rot,
        );
        gl.uniform4fv(
          u.u_rip ??
            null,
          ball.ripples,
        );
        gl.uniform3f(
          u.u_dots ??
            null,
          ball
            .dots[0],
          ball
            .dots[1],
          ball
            .dots[2],
        );
        gl.uniform3fv(
          u.u_pin ??
            null,
          ball.pins,
        );
        gl.uniform1f(
          u.u_pins ??
            null,
          ball.pinCount,
        );
        if (
          !(
            el as HTMLElement
          ).hasAttribute(
            'data-chrome-live',
          )
        ) {
          (
            el as HTMLElement
          ).setAttribute(
            'data-chrome-live',
            '',
          );
        }
      }

      gl.viewport(
        0,
        glCanvas.height -
          h,
        w,
        h,
      );
      gl.enable(
        gl.SCISSOR_TEST,
      );
      gl.scissor(
        0,
        glCanvas.height -
          h,
        w,
        h,
      );
      gl.clearColor(
        0,
        0,
        0,
        0,
      );
      gl.clear(
        gl.COLOR_BUFFER_BIT,
      );
      gl.uniform2f(
        u.u_viewport ??
          null,
        w,
        glCanvas.height,
      ); // gl_FragCoord.y counts from the canvas bottom
      gl.uniform1f(
        u.u_dpr ??
          null,
        w /
          (rect.width *
            over),
      );
      gl.uniform2f(
        u.u_hs ??
          null,
        rect.width /
          2,
        rect.height /
          2,
      );
      gl.uniform2f(
        u.u_centre ??
          null,
        rect.left +
          rect.width /
            2 +
          v.scrollX,
        rect.top +
          rect.height /
            2 +
          v.scrollY,
      );
      gl.drawArrays(
        gl.TRIANGLE_STRIP,
        0,
        4,
      );

      entry.ctx.clearRect(
        0,
        0,
        w,
        h,
      );
      entry.ctx.drawImage(
        glCanvas as CanvasImageSource,
        0,
        0,
        w,
        h,
        0,
        0,
        w,
        h,
      );
    }

    this.timings.draw =
      win.performance.now() -
      now;
    // V9: another frame only while something is still changing by itself.
    if (
      fading ||
      now <
        this
          .animatingUntil
    )
      this.schedule();
  }
}
