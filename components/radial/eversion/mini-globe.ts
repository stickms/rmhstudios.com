/**
 * Draws the button-sized eversion (`lib/eversion/mini.ts`) over the control that was pressed to navigate
 * (amended 2026-10-21: the liquid-globe hub keeps the full-screen run, every other navigation goes through at once
 * and plays this instead).
 *
 * It never moves: one canvas, `position: fixed` over the control's own rect plus the margin the surface needs
 * (`MINI_PAD`). The control is hidden under it (`[data-evert-mini]`, eversion.css) for the run and shown again for
 * the last tenth, while the canvas fades, so the hand-back is a crossfade onto the real thing even when the new
 * page restyled it (the nav item that just became the current page). It is body-level, so it keeps playing while
 * the route changes underneath; nothing waits on it.
 *
 * Plain DOM and one WebGL2 context, shared and reused, like `popup.ts`: it has to be on screen in the frame the
 * press lands, with no React render in between. The face texture is painted from the control itself (its fill,
 * the backgrounds inside it, its text where the browser laid it out, its SVG icons), not a screenshot: a capture
 * would cost the frames this exists to save. No WebGL2, a control bigger than a button, or nothing to draw: it
 * does nothing, and the navigation is unaffected either way.
 */

import { buildMesh } from '@/lib/eversion/mesh';
import {
  MINI_CAMERA,
  MINI_MS,
  MINI_PAD,
  buildMiniGeometry,
  miniPositions,
  miniStage,
  type MiniGeometry,
} from '@/lib/eversion/mini';

/** Bigger than this is a card or a panel, not a button: left alone. */
const MAX_W = 480;
const MAX_H = 200;
const MIN_SIDE = 8;
/** The last fraction of the run: the control is back under the canvas and the canvas fades off it. */
const HANDBACK = 0.9;
const DPR_CAP = 2;
/** The longest the run waits for the face's icons to decode before its first frame. */
const ICON_WAIT_MS = 80;

const VS = `#version 300 es
in vec3 aPos;
in vec2 aUvB;
in vec2 aUvA;
uniform vec2 uHalf;
uniform float uD;
uniform float uDepth;
out vec2 vUvB;
out vec2 vUvA;
out vec3 vPos;
void main() {
  // The same camera as lib/eversion/mini.ts#miniProject: scale 1 in the plane z = 0.
  float w = (uD - aPos.z) / uD;
  gl_Position = vec4(aPos.x / uHalf.x, -aPos.y / uHalf.y, (-aPos.z / uDepth) * w, w);
  vUvB = aUvB;
  vUvA = aUvA;
  vPos = aPos;
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUvB;
in vec2 vUvA;
in vec3 vPos;
uniform sampler2D uTex;
uniform float uMix;
uniform float uShade;
uniform float uAlpha;
uniform vec2 uFace;
uniform float uRadius;
out vec4 outColor;
void main() {
  vec4 c = mix(texture(uTex, vUvB), texture(uTex, vUvA), uMix);
  // Screen-space normal; both sides are lit alike (the inside comes out during the eversion).
  vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
  float diffuse = abs(dot(n, normalize(vec3(-0.35, -0.55, 0.76))));
  float lit = mix(1.0, 0.7 + 0.42 * diffuse, uShade);
  // While the face is flat it is the control's own shape (its border radius), so the first and last frames are the
  // control exactly; the mask lets go as it becomes a globe (the sphere has no corners to cut).
  vec2 q = abs((mix(vUvB, vUvA, uMix) - 0.5) * uFace) - (uFace * 0.5 - uRadius);
  float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - uRadius;
  float mask = mix(1.0 - smoothstep(-0.5, 0.5, d), 1.0, uShade);
  outColor = vec4(c.rgb * lit, c.a) * (uAlpha * mask);
}`;

interface Gl {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  program: WebGLProgram;
  pos: WebGLBuffer;
  tex: WebGLTexture;
  indexCount: number;
  geom: MiniGeometry;
  positions: Float32Array;
  u: Record<'half' | 'd' | 'depth' | 'mix' | 'shade' | 'alpha' | 'face' | 'radius', WebGLUniformLocation | null>;
}

let shared: Gl | null = null;
let failed = false;
let current: { cancel(): void } | null = null;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
}

function setUp(): Gl | null {
  if (shared) return shared;
  if (failed) return null;
  const canvas = document.createElement('canvas');
  canvas.className = 'evert-mini';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    depth: true,
  });
  const vs = gl && compile(gl, gl.VERTEX_SHADER, VS);
  const fs = gl && compile(gl, gl.FRAGMENT_SHADER, FS);
  const program = gl?.createProgram();
  if (!gl || !vs || !fs || !program) {
    failed = true;
    return null;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    failed = true;
    return null;
  }
  const mesh = buildMesh(32, 16);
  const geom = buildMiniGeometry(mesh);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const attrib = (name: string, data: Float32Array, size: number, usage: number) => {
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    const loc = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    return buf;
  };
  const positions = new Float32Array(geom.vertexCount * 3);
  const pos = attrib('aPos', positions, 3, gl.DYNAMIC_DRAW);
  attrib('aUvB', geom.uvBefore, 2, gl.STATIC_DRAW);
  attrib('aUvA', geom.uvAfter, 2, gl.STATIC_DRAW);
  const ibo = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.useProgram(program);
  const u = {
    half: gl.getUniformLocation(program, 'uHalf'),
    d: gl.getUniformLocation(program, 'uD'),
    depth: gl.getUniformLocation(program, 'uDepth'),
    mix: gl.getUniformLocation(program, 'uMix'),
    shade: gl.getUniformLocation(program, 'uShade'),
    alpha: gl.getUniformLocation(program, 'uAlpha'),
    face: gl.getUniformLocation(program, 'uFace'),
    radius: gl.getUniformLocation(program, 'uRadius'),
  };
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  canvas.addEventListener('webglcontextlost', () => {
    current?.cancel();
    shared = null;
  });
  shared = { canvas, gl, program, pos, tex, indexCount: mesh.indices.length, geom, positions, u };
  return shared;
}

/* ── The face: painted from the control, in its own coordinates ─────────── */

const transparent = (c: string) => c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);

function siteSurface(): string {
  const probe = document.createElement('span');
  probe.style.backgroundColor = 'var(--site-surface)';
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).backgroundColor;
  probe.remove();
  return transparent(c) ? '#808080' : c;
}

/** The control's fill: its state layer (`::before`, globals.css §7.3) when one shows, else its own, else the surface. */
function faceFill(el: Element): string {
  const before = getComputedStyle(el, '::before');
  if (before.content !== 'none' && !transparent(before.backgroundColor) && Number(before.opacity) > 0.5) {
    return before.backgroundColor;
  }
  const own = getComputedStyle(el).backgroundColor;
  return transparent(own) ? siteSurface() : own;
}

function paintFace(el: Element, rect: DOMRect, dpr: number): { face: HTMLCanvasElement; ready: Promise<void> } {
  const face = document.createElement('canvas');
  face.width = Math.max(1, Math.round(rect.width * dpr));
  face.height = Math.max(1, Math.round(rect.height * dpr));
  const ctx = face.getContext('2d');
  if (!ctx) return { face, ready: Promise.resolve() };
  ctx.scale(dpr, dpr);
  ctx.fillStyle = faceFill(el);
  ctx.fillRect(0, 0, rect.width, rect.height);

  // Backgrounds inside it (a badge, a chip), in document order.
  for (const child of el.querySelectorAll<HTMLElement>('*')) {
    const cs = getComputedStyle(child);
    if (cs.visibility === 'hidden' || cs.display === 'none' || transparent(cs.backgroundColor)) continue;
    const r = child.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    ctx.fillStyle = cs.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(r.left - rect.left, r.top - rect.top, r.width, r.height, parseFloat(cs.borderTopLeftRadius) || 0);
    ctx.fill();
  }

  // Text, where the browser put it.
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.replace(/\s+/g, ' ').trim();
    const parent = node.parentElement;
    if (!text || !parent) continue;
    const cs = getComputedStyle(parent);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width === 0) continue;
    const box = parent.getBoundingClientRect();
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.left - rect.left, box.top - rect.top, box.width, box.height);
    ctx.clip();
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ('letterSpacing' in ctx && cs.letterSpacing !== 'normal') {
      (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = cs.letterSpacing;
    }
    ctx.fillStyle = cs.color;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, r.left - rect.left, r.top - rect.top + r.height / 2);
    ctx.restore();
  }

  // Icons decode asynchronously; the run waits for them (briefly) so its first frame already has them.
  const icons: Promise<void>[] = [];
  for (const svg of el.querySelectorAll('svg')) {
    const r = svg.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(r.width));
    clone.setAttribute('height', String(r.height));
    clone.style.color = getComputedStyle(svg).color;
    const img = new Image();
    icons.push(
      new Promise<void>((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, r.left - rect.left, r.top - rect.top, r.width, r.height);
          resolve();
        };
        img.onerror = () => resolve();
      }),
    );
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  }
  return { face, ready: Promise.all(icons).then(() => undefined) };
}

/* ── One run ──────────────────────────────────────────────────────────── */

/** Play the eversion on `el`, in place. Returns whether it started. */
export function playMiniEversion(el: Element): boolean {
  if (!el.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width < MIN_SIDE || rect.height < MIN_SIDE || rect.width > MAX_W || rect.height > MAX_H) return false;
  if (rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) return false;
  const g = setUp();
  if (!g) return false;
  current?.cancel();

  const { canvas, gl, u } = g;
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  const a = rect.width / 2;
  const b = rect.height / 2;
  const padX = Math.ceil(a * MINI_PAD) + 2;
  const padY = Math.ceil(b * MINI_PAD) + 2;
  const cw = rect.width + 2 * padX;
  const ch = rect.height + 2 * padY;
  canvas.style.left = `${rect.left - padX}px`;
  canvas.style.top = `${rect.top - padY}px`;
  canvas.style.width = `${cw}px`;
  canvas.style.height = `${ch}px`;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  canvas.style.opacity = '1';

  const painted = paintFace(el, rect, dpr);
  const radius = Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, a, b);

  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform2f(u.half, cw / 2, ch / 2);
  const d = (MINI_CAMERA * Math.max(a, b));
  gl.uniform1f(u.d, d);
  gl.uniform1f(u.depth, 2 * Math.max(a, b) * 1.4);
  gl.uniform2f(u.face, rect.width, rect.height);
  gl.uniform1f(u.radius, radius);

  const stage = miniStage(0);
  let start = 0;
  let raf = 0;
  let shown = false;
  let ended = false;

  const draw = (t: number) => {
    miniPositions(t, g.geom, rect.width, rect.height, g.positions);
    gl.bindBuffer(gl.ARRAY_BUFFER, g.pos);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, g.positions);
    miniStage(t, stage);
    gl.uniform1f(u.mix, stage.afterMix);
    gl.uniform1f(u.shade, stage.shade);
    gl.uniform1f(u.alpha, t < HANDBACK ? 1 : Math.max(0, (1 - t) / (1 - HANDBACK)));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, g.indexCount, gl.UNSIGNED_INT, 0);
  };

  const end = () => {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(raf);
    el.removeAttribute('data-evert-mini');
    canvas.remove();
    if (current === run) current = null;
  };

  const frame = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - start) / MINI_MS));
    if (t >= 1 || document.visibilityState === 'hidden') return end();
    draw(t);
    if (!shown) {
      // The first frame is the flat face, exactly over the control: only now is it safe to hide the real one.
      shown = true;
      el.setAttribute('data-evert-mini', '');
    } else if (t >= HANDBACK) {
      el.removeAttribute('data-evert-mini');
    }
    raf = requestAnimationFrame(frame);
  };

  const begin = () => {
    if (ended) return;
    gl.bindTexture(gl.TEXTURE_2D, g.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, painted.face);
    start = performance.now();
    document.body.appendChild(canvas);
    draw(0);
    raf = requestAnimationFrame(frame);
  };

  const run = { cancel: end };
  current = run;
  // The face's icons are a few hundred bytes of SVG and decode in a frame or two; the navigation is not waiting on
  // this either way. Past ICON_WAIT_MS the run starts with whatever has decoded.
  let begun = false;
  const once = () => {
    if (begun) return;
    begun = true;
    begin();
  };
  void painted.ready.then(once);
  setTimeout(once, ICON_WAIT_MS);
  return true;
}
