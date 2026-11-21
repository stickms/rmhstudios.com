/**
 * RMH PMC liquid mercury — a ray-marched liquid-metal body for the stage.
 *
 * Two shapes:
 *  - `orb`  droplets on slow orbits that merge and part (the reticle's hub);
 *  - `drip` a chrome sheet along the top edge that swells droplets, necks them
 *           through the smooth union and lets them fall.
 *
 * Lighting is the studio of the RMH Studios liquid globe
 * (`lib/liquid/globe-material.ts`): one softbox window up and to the left, a
 * hard chrome horizon, a needle key specular and a kicker, plus an R/G/B split
 * at grazing angles. The colours are the PMC chrome stops (`--c1` highlight,
 * `--c3` sky, `--c4` floor), resolved from the host at mount and on every
 * restart, so Day and Night both light it.
 *
 * Budget (CLAUDE.md B3: no frame callback pending at rest):
 *  - IDLE AT REST: the metal flows only on input (scroll, a nearby pointer,
 *    coming on screen), coasts ~1.5s and stops; no frame is scheduled while
 *    the page is still. Only on screen, in a visible tab;
 *  - it moves unless Globe motion is Still; then ONE still frame is drawn;
 *  - the drawing buffer follows the body's on-screen size (a scaled reticle
 *    stays crisp) and is capped at 1024px.
 * No WebGL → `is-fallback`, and the CSS draws a static chrome ball.
 */
import { motionStill } from '@/lib/appearance/prefs';

export type MercuryMode = 'orb' | 'drip';
export interface MercuryOptions {
  mode?: MercuryMode;
  /** Picks the orbit set / drip timings. */
  seed?: number;
  /** Droplet count, 2–6. */
  blobs?: number;
}

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG = `precision highp float;
uniform vec2 uRes;uniform float uT;uniform vec4 uB[7];
uniform vec3 uHi;uniform vec3 uSky;uniform vec3 uFloor;
uniform float uMode;uniform float uS;
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float map(vec3 p){
  p=vec3(p.x*(1.+uS*.4),p.y/(1.+uS),p.z);
  float d=1e3;float k=.44;
  if(uMode>.5){k=.26;d=max(.56-p.y+.05*sin(p.x*1.7+uT*.9)+.025*sin(p.x*4.3-uT*1.4)+.12*p.z,abs(p.z)-.4);}
  for(int i=0;i<7;i++){vec4 b=uB[i];if(b.w<=0.)continue;d=smin(d,length(p-b.xyz)-b.w,k);}
  return d+.014*sin(p.x*8.+uT*1.7)*sin(p.y*7.-uT*1.3)*sin(p.z*6.+uT*.9);
}
vec3 nrm(vec3 p){vec2 e=vec2(.0015,0.);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
float sb(vec2 q,vec2 c,vec2 h,float f){vec2 e=abs(q-c)-h;float d=length(max(e,0.))+min(max(e.x,e.y),0.);return 1.-smoothstep(-f,f,d);}
vec3 env(vec3 r){
  vec3 c=mix(uFloor,uSky,smoothstep(-.35,.7,r.y));
  c+=uHi*.42*exp(-abs(r.y+.03)*36.);
  c=mix(c,uFloor*.35,smoothstep(-.05,-.85,r.y));
  c+=uHi*1.3*sb(r.xy,vec2(-.52,.62),vec2(.16,.065),.045);
  c+=uHi*.75*sb(r.xy,vec2(.62,.22),vec2(.045,.3),.05);
  c+=uHi*.3*sb(r.xy,vec2(0.,.96),vec2(.7,.05),.12);
  return c;
}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  vec3 ro=vec3(0.,0.,3.2);vec3 rd=normalize(vec3(uv,-1.7));
  float t=0.,md=1e3,mt=0.;
  for(int i=0;i<88;i++){vec3 q=ro+rd*t;float d=map(q);if(d<md){md=d;mt=t;}if(d<.0007||t>6.)break;t+=d*.92;}
  float a=1.-smoothstep(0.,2.2/uRes.y,md);
  if(a<=0.){gl_FragColor=vec4(0.);return;}
  vec3 p=ro+rd*mt;vec3 n=nrm(p);vec3 v=-rd;
  float ndv=max(dot(n,v),0.);
  vec3 F=vec3(.74,.76,.79)+(1.-vec3(.74,.76,.79))*pow(1.-ndv,5.);
  vec3 col;
  col.r=env(reflect(rd,normalize(n+vec3(.03,.014,0.)))).r;
  col.g=env(reflect(rd,n)).g;
  col.b=env(reflect(rd,normalize(n-vec3(.03,.014,0.)))).b;
  col*=F;
  vec3 key=normalize(vec3(-.5,.62,.6));vec3 kick=normalize(vec3(.62,-.5,.6));
  float k=max(dot(n,normalize(key+v)),0.);
  col+=vec3(1.)*(pow(k,1400.)*1.6+pow(k,90.)*.1);
  col+=uHi*pow(max(dot(n,normalize(kick+v)),0.),180.)*.35;
  float ao=clamp(map(p+n*.09)/.09,0.,1.);col*=.5+.5*ao;
  col=col/(1.+col*.12);
  gl_FragColor=vec4(col*a,a);
}`;

/** Visible half-height of the scene plane at z=0 for the fixed camera above. */
const HALF_H = (3.2 / 1.7) * 0.5;

function compile(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error('shader');
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'compile');
  return s;
}

/** Any CSS colour → linear-ish [0..1] RGB, via the browser's own resolver. */
function resolveColour(
  host: HTMLElement,
  cssVar: string,
  fallback: [number, number, number],
): [number, number, number] {
  const probe = document.createElement('span');
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${cssVar})`;
  host.appendChild(probe);
  const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(probe).color);
  probe.remove();
  if (!m) return fallback;
  const p = m[1].split(/[ ,/]+/).map(Number.parseFloat);
  return p.length >= 3 && p.every((x) => Number.isFinite(x)) ? [p[0] / 255, p[1] / 255, p[2] / 255] : fallback;
}

/* The site's one motion switch (Appearance → Globe motion). No OS reduced-motion
   branch: components/CLAUDE.md, "Do not add reduced-motion preference branches". */
function motionAllowed(): boolean {
  return !motionStill();
}

/* Scroll speed → one vertical stretch every body shares: a damped spring, so it
   overshoots and jiggles back when the page stops. Fed by one passive listener. */
const scroll = { y: 0, t: 0, target: 0, s: 0, v: 0, listeners: 0 };
function onScroll(): void {
  const now = performance.now();
  const y = window.scrollY;
  const dt = Math.max(1, now - scroll.t) / 1000;
  scroll.target = Math.min(0.22, Math.abs(y - scroll.y) / dt / 9000);
  scroll.y = y;
  scroll.t = now;
}
function stepStretch(dt: number): void {
  scroll.v += ((scroll.target - scroll.s) * 120 - scroll.v * 11) * dt;
  scroll.s += scroll.v * dt;
  scroll.target *= Math.exp(-dt * 10);
}

export function mountMercury(host: HTMLElement, opts: MercuryOptions = {}): () => void {
  const mode = opts.mode ?? 'orb';
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);

  const built = ((): [WebGLRenderingContext, WebGLProgram] | null => {
    try {
      const ctx = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false, alpha: true });
      const program = ctx?.createProgram();
      if (!ctx || !program) return null;
      ctx.attachShader(program, compile(ctx, ctx.VERTEX_SHADER, VERT));
      ctx.attachShader(program, compile(ctx, ctx.FRAGMENT_SHADER, FRAG));
      ctx.linkProgram(program);
      return ctx.getProgramParameter(program, ctx.LINK_STATUS) ? [ctx, program] : null;
    } catch {
      return null;
    }
  })();
  if (!built) {
    canvas.remove();
    host.classList.add('is-fallback');
    return () => host.classList.remove('is-fallback');
  }
  const [g, prog] = built;
  g.useProgram(prog);
  const buf = g.createBuffer();
  g.bindBuffer(g.ARRAY_BUFFER, buf);
  g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
  const loc = g.getAttribLocation(prog, 'p');
  g.enableVertexAttribArray(loc);
  g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
  const U = (n: string) => g.getUniformLocation(prog, n);
  const uRes = U('uRes'),
    uT = U('uT'),
    uB = U('uB'),
    uHi = U('uHi'),
    uSky = U('uSky'),
    uFloor = U('uFloor'),
    uMode = U('uMode'),
    uS = U('uS');

  const seed = opts.seed ?? 1;
  const count = Math.max(2, Math.min(6, opts.blobs ?? 5));
  const rnd = (i: number, k: number) => {
    const x = Math.sin(seed * 97.13 + i * 13.7 + k * 3.1) * 43758.5453;
    return x - Math.floor(x);
  };
  const orbits = Array.from({ length: count }, (_, i) => ({
    rad: i === 0 ? 0.62 : 0.2 + rnd(i, 1) * 0.17,
    ax: i === 0 ? 0.12 : 0.32 + rnd(i, 2) * 0.25,
    ay: i === 0 ? 0.1 : 0.25 + rnd(i, 3) * 0.25,
    fx: 0.23 + rnd(i, 4) * 0.35,
    fy: 0.19 + rnd(i, 5) * 0.33,
    fz: 0.17 + rnd(i, 6) * 0.2,
    ph: rnd(i, 7) * Math.PI * 2,
  }));
  const probe = { x: 0, y: 0, r: 0, tx: 0, ty: 0, tr: 0, vx: 0, vy: 0 };
  const data = new Float32Array(28);
  let w = 0,
    h = 0,
    visible = false,
    raf = 0,
    last = 0,
    needsSize = true;
  // A seeded start so the first (still) frame is already a composed shape.
  let clock = 7 + seed * 3.1;
  let energy = 0;

  const colours = () => {
    g.uniform3fv(uHi, resolveColour(host, '--c1', [1, 1, 1]));
    g.uniform3fv(uSky, resolveColour(host, '--c3', [0.56, 0.6, 0.65]));
    g.uniform3fv(uFloor, resolveColour(host, '--c4', [0.1, 0.13, 0.16]));
  };
  /* The on-screen size includes the reticle's scroll-driven scale, so the buffer
     keeps up with it and the metal stays sharp as it flies at the viewer. */
  const size = () => {
    const b = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cw = Math.max(2, Math.min(1024, Math.round(b.width * dpr)));
    const ch = Math.max(2, Math.min(1024, Math.round(b.height * dpr)));
    if (Math.abs(cw - w) > 8 || Math.abs(ch - h) > 8) {
      w = canvas.width = cw;
      h = canvas.height = ch;
      g.viewport(0, 0, w, h);
    }
    needsSize = false;
  };

  const draw = (dt: number) => {
    if (needsSize) size();
    const t = clock;
    const halfW = HALF_H * (w / h);
    for (let i = 0; i < orbits.length; i++) {
      const o = orbits[i];
      if (mode === 'drip') {
        const ph = (t * (0.07 + o.fx * 0.12) + o.ph / (Math.PI * 2)) % 1;
        const x = (-1 + ((i + 0.5) / orbits.length) * 2) * halfW * 0.86 + Math.sin(i * 7.3 + seed) * 0.18;
        let y: number, r: number;
        if (ph < 0.64) {
          const q = ph / 0.64;
          y = 0.48 - 0.3 * q * q;
          r = 0.07 + 0.12 * q;
        } else {
          const f = (ph - 0.64) / 0.36;
          y = 0.18 - f * f * 2.4;
          r = 0.19 * (1 - 0.3 * f);
        }
        data.set([x, y, 0, r], i * 4);
        continue;
      }
      data.set(
        [
          Math.sin(t * o.fx + o.ph) * o.ax,
          Math.cos(t * o.fy + o.ph * 1.3) * o.ay,
          Math.sin(t * o.fz + o.ph * 0.7) * 0.25,
          o.rad * (1 + 0.04 * Math.sin(t * 1.1 + i)),
        ],
        i * 4,
      );
    }
    // The probe droplet: a damped spring toward the pointer.
    probe.vx += ((probe.tx - probe.x) * 42 - probe.vx * 9) * dt;
    probe.vy += ((probe.ty - probe.y) * 42 - probe.vy * 9) * dt;
    probe.x += probe.vx * dt;
    probe.y += probe.vy * dt;
    probe.r += (probe.tr - probe.r) * Math.min(1, dt * 6);
    const j = orbits.length * 4;
    data.set([probe.x, probe.y, 0.35, probe.r > 0.01 ? probe.r : 0], j);
    data.fill(0, j + 4);
    g.uniform2f(uRes, w, h);
    g.uniform1f(uT, t);
    g.uniform1f(uMode, mode === 'drip' ? 1 : 0);
    g.uniform1f(uS, mode === 'drip' ? scroll.s * 0.5 : scroll.s);
    g.uniform4fv(uB, data);
    g.drawArrays(g.TRIANGLES, 0, 3);
  };

  /* Idle at rest (Steel R5, lib/__tests__/raf-loop-allowlist.test.ts): the metal
     only moves on input. A scroll or a nearby pointer charges `energy`; the
     droplets' clock runs at that energy, which decays over ~1.5s, and the loop
     stops once the energy, the scroll stretch and the probe spring have all
     settled. Nothing is scheduled while the page is still. */
  const settled = () =>
    energy < 0.01 &&
    Math.abs(scroll.s) < 0.002 &&
    Math.abs(scroll.v) < 0.01 &&
    Math.abs(probe.r - probe.tr) < 0.002 &&
    Math.hypot(probe.vx, probe.vy) < 0.01 &&
    Math.hypot(probe.tx - probe.x, probe.ty - probe.y) < 0.004;
  const tick = (now: number) => {
    raf = 0;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    last = now;
    clock += dt * energy * 1.4;
    energy *= Math.exp(-dt * 2.2);
    stepStretch(dt);
    draw(dt);
    if (visible && !document.hidden && motionAllowed() && !settled()) raf = requestAnimationFrame(tick);
  };
  /** Wake the body; `charge` (0–1) is how much flow the input adds. */
  const start = (charge = 0) => {
    if (!visible || document.hidden) return;
    if (!motionAllowed()) {
      if (!raf) draw(0);
      return;
    }
    energy = Math.max(energy, charge);
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      visible = e.isIntersecting;
      if (visible) {
        needsSize = true;
        colours();
        // Arriving on screen is itself a little input: one short settle, then rest.
        start(0.35);
      } else stop();
    }
  });
  io.observe(host);

  const onVis = () => (document.hidden ? stop() : start());
  const onResize = () => {
    needsSize = true;
    if (!raf && visible) draw(0);
  };
  const onScrollLocal = () => {
    needsSize = true;
    start(1);
  };
  const onMove = (e: PointerEvent) => {
    const b = host.getBoundingClientRect();
    const nx = ((e.clientX - b.left) / b.width) * 2 - 1;
    const ny = -(((e.clientY - b.top) / b.height) * 2 - 1);
    const near = Math.hypot(nx, ny) < 1.15 && mode === 'orb';
    probe.tx = near ? nx * HALF_H * 0.92 * (b.width / b.height) : 0;
    probe.ty = near ? ny * HALF_H * 0.92 : 0;
    const wasNear = probe.tr > 0;
    probe.tr = near ? 0.24 : 0;
    if (near || wasNear) start(near ? 0.6 : 0);
  };

  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('scroll', onScrollLocal, { passive: true });
  if (scroll.listeners++ === 0) {
    scroll.y = window.scrollY;
    scroll.t = performance.now();
    window.addEventListener('scroll', onScroll, { passive: true });
  }
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (finePointer) window.addEventListener('pointermove', onMove, { passive: true });

  return () => {
    stop();
    io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('scroll', onScrollLocal);
    if (--scroll.listeners === 0) window.removeEventListener('scroll', onScroll);
    if (finePointer) window.removeEventListener('pointermove', onMove);
    g.getExtension('WEBGL_lose_context')?.loseContext();
    canvas.remove();
  };
}
