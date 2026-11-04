import { useEffect, useImperativeHandle, useRef } from 'react';

/**
 * The liquid globe in real 3D. A glass sphere holds two liquids split by a plane that sits where the expected
 * seat share says (blue, Democratic, on the left; red, Republican, on the right). Inside it hang a gauge arc and a
 * needle that points at the lean. The whole scene rotates: drag it, flick it, or use the arrow keys.
 *
 * Rendering is a small CPU ray-caster for the sphere (orthographic, one chord per pixel: how much of the way
 * through is blue, how much red, how thick, where the light catches it) with the needle, gauge and bubbles drawn
 * as projected polygons on top. Everything that depends only on the view is precomputed per pixel, so a frame is
 * two small matrix products per pixel.
 *
 * The animation loop ENDS (repo rule: no loop at rest). It runs for a few seconds when the globe comes into view,
 * when the lean changes, or when it is touched, and while a drag, a flick or a reset is moving; then it stops. It
 * also stops off screen or in a hidden tab, and draws one still frame under jelly motion Still.
 */

/** The Times' needle palette, deep to pale. Democratic blues on the left, Republican reds on the right. */
export const NEEDLE_STOPS: [number, number, number][] = [
  [19, 117, 183], // #1375b7
  [90, 159, 212],
  [168, 205, 230],
  [239, 233, 227], // the middle: too close to call
  [236, 177, 171],
  [220, 107, 102],
  [201, 49, 53], // #c93135
];

const BLUE_DEEP: V3 = [15, 95, 150];
const BLUE_LIGHT: V3 = [122, 190, 232];
const RED_DEEP: V3 = [160, 28, 38];
const RED_LIGHT: V3 = [238, 140, 132];
const GLASS: V3 = [232, 236, 244];

type V3 = [number, number, number];

const ACTIVE_MS = 7000;
const MAX_NEEDLE = (78 * Math.PI) / 180;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function gradient(stops: V3[], t: number): V3 {
  const x = clamp(t, 0, 1) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  return mix(stops[i], stops[i + 1], x - i);
}

export interface GlobeHandle {
  reset: () => void;
  rotate: (dYaw: number, dPitch: number) => void;
}

interface Props {
  /** Expected Democratic share of seats, 0–1 (0.5 = even). */
  share: number;
  /** Where the majority line sits in the same 0–1 share. */
  majority: number;
  /** How much is still undecided, 0–1: the needle shivers more the less is settled. */
  uncertainty: number;
  size: number;
  handle: React.Ref<GlobeHandle>;
}

const DEFAULT_YAW = -0.42;
const DEFAULT_PITCH = 0.2;

export function GlobeCanvas({ share, majority, uncertainty, size, handle }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const target = useRef(share);
  const maj = useRef(majority);
  const unc = useRef(uncertainty);
  const kickRef = useRef<(ms?: number) => void>(() => {});
  const view = useRef({ yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH, vy: 0, vp: 0, ty: DEFAULT_YAW, tp: DEFAULT_PITCH, dragging: false, homing: false });
  target.current = share;
  maj.current = majority;
  unc.current = uncertainty;

  useImperativeHandle(handle, () => ({
    reset: () => {
      const v = view.current;
      v.ty = DEFAULT_YAW;
      v.tp = DEFAULT_PITCH;
      v.homing = true;
      kickRef.current(3000);
    },
    rotate: (dYaw, dPitch) => {
      const v = view.current;
      v.homing = false;
      v.vy += dYaw;
      v.vp += dPitch;
      kickRef.current(2500);
    },
  }));

  useEffect(() => {
    kickRef.current();
  }, [share, majority]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);

    // The sphere is shaded at a lower resolution and scaled up (smoothed): the liquid is soft anyway.
    const N = Math.round(Math.min(300, size * Math.min(dpr, 1.25)));
    const off = document.createElement('canvas');
    off.width = N;
    off.height = N;
    const octx = off.getContext('2d');
    if (!octx) return;
    const img = octx.createImageData(N, N);
    const px = img.data;

    // ── per-pixel, view-only precompute ──
    const count = N * N;
    const U = new Float32Array(count);
    const Vv = new Float32Array(count);
    const ZF = new Float32Array(count);
    const COV = new Float32Array(count); // edge coverage, 0 outside the sphere
    const RIM = new Float32Array(count); // fresnel rim
    const SPEC = new Float32Array(count); // main highlight
    const LIGHT = new Float32Array(count); // soft top-left light, bottom-right shade
    const L = (() => {
      const l = [-0.45, -0.6, 0.66];
      const n = Math.hypot(l[0], l[1], l[2]);
      return [l[0] / n, l[1] / n, l[2] / n];
    })();
    const H = (() => {
      const h = [L[0], L[1], L[2] + 1];
      const n = Math.hypot(h[0], h[1], h[2]);
      return [h[0] / n, h[1] / n, h[2] / n];
    })();
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const u = ((i + 0.5) / N) * 2 - 1;
        const v = ((j + 0.5) / N) * 2 - 1;
        const r2 = u * u + v * v;
        const r = Math.sqrt(r2);
        const cov = clamp((1 - r) * (N / 2), 0, 1);
        U[k] = u;
        Vv[k] = v;
        COV[k] = cov;
        if (cov <= 0) continue;
        const z = Math.sqrt(Math.max(0, 1 - r2));
        ZF[k] = z;
        RIM[k] = Math.pow(1 - z, 2.6);
        SPEC[k] = Math.pow(Math.max(0, u * H[0] + v * H[1] + z * H[2]), 54);
        LIGHT[k] = 0.5 - 0.5 * (u * -0.45 + v * -0.6); // 1 at top-left, 0 at bottom-right
      }
    }

    // ── scene state ──
    let cur = target.current;
    let vel = 0;
    let amp = 0.03;
    let t = 0;
    let last = performance.now();
    let raf = 0;
    let visible = false;
    let activeUntil = 0;
    const isStill = () => document.documentElement.getAttribute('data-jelly-motion') === 'still';
    const bubbles = Array.from({ length: 26 }, (_, i) => {
      const a = i * 2.399963; // golden angle
      const rr = Math.sqrt(((i * 37) % 100) / 100) * 0.82;
      return { x: Math.cos(a) * rr, y: -0.9 + ((i * 53) % 180) / 100, z: Math.sin(a) * rr * 0.9, r: 0.012 + ((i * 31) % 5) * 0.0045, v: 0.05 + ((i * 17) % 9) * 0.012, ph: i * 1.3 };
    });

    const kick = (ms = ACTIVE_MS) => {
      activeUntil = Math.max(activeUntil, performance.now() + ms);
      if (visible && !raf && document.visibilityState === 'visible') {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    kickRef.current = kick;

    // ── pointer: drag to rotate (vertical swipes still scroll the page on touch), flick for inertia ──
    let lastX = 0;
    let lastY = 0;
    let pid = -1;
    const onDown = (e: PointerEvent) => {
      pid = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      const v = view.current;
      v.dragging = true;
      v.homing = false;
      v.vy = 0;
      v.vp = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      kick(5000);
    };
    const onMove = (e: PointerEvent) => {
      const v = view.current;
      if (!v.dragging || e.pointerId !== pid) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      v.yaw += dx * 0.0085;
      v.pitch = clamp(v.pitch + dy * 0.0085, -1.25, 1.25);
      v.vy = dx * 0.0085 * 60;
      v.vp = dy * 0.0085 * 60;
      kick(5000);
    };
    const onUp = (e: PointerEvent) => {
      const v = view.current;
      if (e.pointerId !== pid) return;
      v.dragging = false;
      pid = -1;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      kick(4000);
    };
    const onWheelLess = () => {};
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    void onWheelLess;

    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) kick();
    });
    io.observe(canvas);
    const onVis = () => {
      if (document.visibilityState === 'visible') kick();
    };
    document.addEventListener('visibilitychange', onVis);

    // ── drawing ──
    function frame(now: number) {
      raf = 0;
      if (!visible || document.visibilityState !== 'visible') return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const still = isStill();
      const v = view.current;

      if (still) {
        cur = target.current;
        vel = 0;
        amp = 0.012;
        v.vy = 0;
        v.vp = 0;
        v.dragging = false;
      } else {
        t += dt;
        // the liquid level springs to the lean; its speed stirs the surface
        vel += (38 * (target.current - cur) - 6.5 * vel) * dt;
        cur += vel * dt;
        const calm = activeUntil - now < 1500 ? 0.006 : 0.028;
        amp += (calm + Math.min(0.12, Math.abs(vel) * 0.9) - amp) * Math.min(1, dt * 2.2);
        // view: inertia after a flick, or a spring home after a reset
        if (!v.dragging) {
          if (v.homing) {
            v.yaw += (v.ty - v.yaw) * Math.min(1, dt * 7);
            v.pitch += (v.tp - v.pitch) * Math.min(1, dt * 7);
          } else {
            v.yaw += v.vy * dt;
            v.pitch = clamp(v.pitch + v.vp * dt, -1.25, 1.25);
            const decay = Math.exp(-dt * 3.2);
            v.vy *= decay;
            v.vp *= decay;
          }
        }
      }

      render(now);

      const viewMoving = v.dragging || Math.abs(v.vy) > 0.02 || Math.abs(v.vp) > 0.02 || (v.homing && (Math.abs(v.ty - v.yaw) > 0.003 || Math.abs(v.tp - v.pitch) > 0.003));
      const settled = Math.abs(target.current - cur) < 0.0005 && Math.abs(vel) < 0.002 && !viewMoving;
      if (still || (now > activeUntil && settled)) return;
      raf = requestAnimationFrame(frame);
    }

    function render(now: number) {
      const still = isStill();
      const v = view.current;
      // M maps view space to object space: Ry(-yaw) · Rx(-pitch)
      const cy = Math.cos(v.yaw);
      const sy = Math.sin(v.yaw);
      const cp = Math.cos(v.pitch);
      const sp = Math.sin(v.pitch);
      // Rx(-pitch): [1,0,0; 0,cp,sp; 0,-sp,cp]; Ry(-yaw): [cy,0,-sy; 0,1,0; sy,0,cy]
      const M = [
        [cy, -sy * -sp, -sy * cp],
        [0, cp, sp],
        [sy, cy * -sp, cy * cp],
      ];
      // (row-major: object = M · view)
      const bxo = -1 + 2 * clamp(cur, 0, 1);
      const mxo = -1 + 2 * clamp(maj.current, 0, 1);
      const w1 = t * 2.2;
      const w2 = t * 3.1;
      const w3 = t * 1.7;
      const wave = (y: number, z: number) => amp * (Math.sin(y * 5 + w1) + 0.45 * Math.sin(y * 9 - w2)) + amp * 0.7 * Math.sin(z * 4.5 + w3);

      for (let k = 0; k < count; k++) {
        const o = k * 4;
        const cov = COV[k];
        if (cov <= 0) {
          px[o + 3] = 0;
          continue;
        }
        const u = U[k];
        const vv = Vv[k];
        const z = ZF[k];
        // front and back chord ends, in object space
        const ax = M[0][0] * u + M[0][1] * vv;
        const ay = M[1][0] * u + M[1][1] * vv;
        const az = M[2][0] * u + M[2][1] * vv;
        const fx = ax + M[0][2] * z;
        const fy = ay + M[1][2] * z;
        const fz = az + M[2][2] * z;
        const bx = ax - M[0][2] * z;
        const by = ay - M[1][2] * z;
        const bz = az - M[2][2] * z;
        const bw = bxo + (wave(fy, fz) + wave(by, bz)) * 0.5;
        // how much of the chord is blue (x < boundary)
        const d = bx - fx;
        let fB: number;
        if (Math.abs(d) < 1e-5) fB = fx < bw ? 1 : 0;
        else {
          const ts = clamp((bw - fx) / d, 0, 1);
          fB = fx < bw ? (bx < bw ? 1 : ts) : bx >= bw ? 0 : 1 - ts;
        }
        const g = clamp(0.5 + 0.5 * ((fy + by) / 2), 0, 1); // lighter toward the top of the liquid
        const blue = mix(BLUE_DEEP, BLUE_LIGHT, g * 0.9);
        const red = mix(RED_DEEP, RED_LIGHT, g * 0.9);
        // the liquid seen from the front dominates; what lies behind tints it
        const frontBlue = fx < bw ? 1 : 0;
        const wFront = 0.62;
        const mixF = wFront * frontBlue + (1 - wFront) * fB;
        let col = mix(red, blue, mixF);
        // thin edges are mostly glass; the middle is deep liquid
        const L2 = 2 * z;
        const body = clamp(0.3 + 0.7 * Math.pow(L2, 0.7), 0, 1);
        col = mix(GLASS, col, body);
        // gradient: lit from the top-left, deeper toward the bottom-right
        const lit = 0.78 + 0.34 * LIGHT[k];
        col = [col[0] * lit, col[1] * lit, col[2] * lit];
        // meniscus (where the front surface crosses the boundary) and the dashed majority line
        const mn = clamp(1 - Math.abs(fx - bw) / 0.014, 0, 1);
        const mj = Math.abs(fx - mxo) < 0.011 && (Math.floor((fy + 3) * 9) & 1) === 0 ? 0.9 : 0;
        const white = Math.max(mn * 0.7, mj, RIM[k] * 0.55, SPEC[k] * 0.95);
        px[o] = clamp(col[0] + (255 - col[0]) * white, 0, 255);
        px[o + 1] = clamp(col[1] + (255 - col[1]) * white, 0, 255);
        px[o + 2] = clamp(col[2] + (255 - col[2]) * white, 0, 255);
        px[o + 3] = cov * 255;
      }
      octx!.putImageData(img, 0, 0);

      const W = canvas!.width;
      ctx!.setTransform(1, 0, 0, 1, 0, 0);
      ctx!.clearRect(0, 0, W, W);
      const pad = 8 * dpr;
      const Rpx = W / 2 - pad; // sphere radius in canvas pixels
      const cxp = W / 2;
      ctx!.imageSmoothingEnabled = true;
      ctx!.imageSmoothingQuality = 'high';
      ctx!.drawImage(off, cxp - Rpx, cxp - Rpx, 2 * Rpx, 2 * Rpx);

      // object → canvas
      const proj = (x: number, y: number, zc: number) => {
        // view = Mᵀ · object
        const vx = M[0][0] * x + M[1][0] * y + M[2][0] * zc;
        const vy = M[0][1] * x + M[1][1] * y + M[2][1] * zc;
        const vz = M[0][2] * x + M[1][2] * y + M[2][2] * zc;
        return { x: cxp + vx * Rpx, y: cxp + vy * Rpx, z: vz };
      };

      // clip to the sphere: nothing inside draws outside the glass
      ctx!.save();
      ctx!.beginPath();
      ctx!.arc(cxp, cxp, Rpx, 0, Math.PI * 2);
      ctx!.clip();

      // bubbles
      for (const b of bubbles) {
        if (!still) {
          b.y += b.v * 0.016;
          if (b.y > 0.95) b.y = -0.95;
        }
        const bwAt = bxo + wave(b.y, b.z);
        const p = proj(b.x + Math.sin(t * 1.3 + b.ph) * 0.015, b.y, b.z);
        ctx!.fillStyle = b.x < bwAt ? 'rgba(220,240,255,0.42)' : 'rgba(255,225,220,0.42)';
        ctx!.beginPath();
        ctx!.arc(p.x, p.y, b.r * Rpx, 0, Math.PI * 2);
        ctx!.fill();
        ctx!.fillStyle = 'rgba(255,255,255,0.75)';
        ctx!.beginPath();
        ctx!.arc(p.x - b.r * Rpx * 0.3, p.y - b.r * Rpx * 0.3, b.r * Rpx * 0.32, 0, Math.PI * 2);
        ctx!.fill();
      }

      // ── gauge arc: a flat band with the Times' blue-to-red gradient, in the globe's xy plane ──
      type Poly = { pts: { x: number; y: number }[]; z: number; fill: string; stroke?: string };
      const polys: Poly[] = [];
      const SEG = 56;
      const rOut = 0.9;
      const rIn = 0.84;
      const half = 0.03; // half-thickness (z)
      for (let s = 0; s < SEG; s++) {
        const a0 = (-1 + (2 * s) / SEG) * (88 * Math.PI) / 180;
        const a1 = (-1 + (2 * (s + 1)) / SEG) * (88 * Math.PI) / 180;
        const c = gradient(NEEDLE_STOPS, (s + 0.5) / SEG);
        const mk = (r: number, a: number, zz: number) => proj(Math.sin(a) * r, Math.cos(a) * r, zz);
        // front face, and the outer rim for depth
        const f = [mk(rOut, a0, half), mk(rOut, a1, half), mk(rIn, a1, half), mk(rIn, a0, half)];
        const zAvg = (f[0].z + f[1].z + f[2].z + f[3].z) / 4;
        polys.push({ pts: f, z: zAvg, fill: `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` });
        const o2 = [mk(rOut, a0, half), mk(rOut, a1, half), mk(rOut, a1, -half), mk(rOut, a0, -half)];
        const zO = (o2[0].z + o2[1].z + o2[2].z + o2[3].z) / 4;
        polys.push({ pts: o2, z: zO, fill: `rgb(${(c[0] * 0.62) | 0},${(c[1] * 0.62) | 0},${(c[2] * 0.62) | 0})` });
        const bk = [mk(rOut, a0, -half), mk(rOut, a1, -half), mk(rIn, a1, -half), mk(rIn, a0, -half)];
        const zB = (bk[0].z + bk[1].z + bk[2].z + bk[3].z) / 4;
        polys.push({ pts: bk, z: zB, fill: `rgb(${(c[0] * 0.8) | 0},${(c[1] * 0.8) | 0},${(c[2] * 0.8) | 0})` });
      }
      // ticks every 22.5 degrees, and a taller one at the middle
      for (let a = -88; a <= 88; a += 22) {
        const rad = (a * Math.PI) / 180;
        const mid = a === 0;
        const p0 = proj(Math.sin(rad) * (rIn - 0.01), Math.cos(rad) * (rIn - 0.01), 0);
        const p1 = proj(Math.sin(rad) * (rIn - (mid ? 0.1 : 0.05)), Math.cos(rad) * (rIn - (mid ? 0.1 : 0.05)), 0);
        polys.push({ pts: [p0, p1], z: p0.z - 0.001, fill: 'none', stroke: 'rgba(255,255,255,0.8)' });
      }

      // ── the needle: two pyramids (blade and tail) about the pivot, pointing at the lean ──
      const lean = (clamp(cur, 0, 1) - 0.5) * 2; // +1 all Democratic
      const shiver = still ? 0 : Math.sin(t * 7.3) * Math.sin(t * 2.9 + 1) * 0.012 * (0.3 + unc.current) * Math.min(1, (activeUntil - now) / 1500 + 0.2);
      const phi = -lean * MAX_NEEDLE + shiver; // angle from straight up; negative points left (blue)
      const dir: V3 = [Math.sin(phi), Math.cos(phi), 0];
      const perp: V3 = [Math.cos(phi), -Math.sin(phi), 0];
      const zax: V3 = [0, 0, 1];
      const pyramid = (tipLen: number, baseR: number, color: V3, baseOff: number) => {
        const tip: V3 = [dir[0] * tipLen, dir[1] * tipLen, 0];
        const base: V3 = [dir[0] * baseOff, dir[1] * baseOff, 0];
        const ring: V3[] = [];
        const SIDES = 6;
        for (let i = 0; i < SIDES; i++) {
          const a = (i / SIDES) * Math.PI * 2;
          ring.push([base[0] + (perp[0] * Math.cos(a) + zax[0] * Math.sin(a)) * baseR, base[1] + (perp[1] * Math.cos(a) + zax[1] * Math.sin(a)) * baseR, base[2] + (perp[2] * Math.cos(a) + zax[2] * Math.sin(a)) * baseR]);
        }
        for (let i = 0; i < SIDES; i++) {
          const a = ring[i];
          const b = ring[(i + 1) % SIDES];
          const mid = (i + 0.5) / SIDES * Math.PI * 2;
          // face normal (object space), roughly: perpendicular direction blended with the axis
          const nrm: V3 = [perp[0] * Math.cos(mid) + zax[0] * Math.sin(mid) + dir[0] * 0.35, perp[1] * Math.cos(mid) + zax[1] * Math.sin(mid) + dir[1] * 0.35, perp[2] * Math.cos(mid) + zax[2] * Math.sin(mid) + dir[2] * 0.35];
          const nl = Math.hypot(nrm[0], nrm[1], nrm[2]) || 1;
          // to view space for lighting
          const vx = (M[0][0] * nrm[0] + M[1][0] * nrm[1] + M[2][0] * nrm[2]) / nl;
          const vy = (M[0][1] * nrm[0] + M[1][1] * nrm[1] + M[2][1] * nrm[2]) / nl;
          const vz = (M[0][2] * nrm[0] + M[1][2] * nrm[1] + M[2][2] * nrm[2]) / nl;
          const lam = clamp(vx * L[0] + vy * L[1] + vz * L[2], -0.2, 1);
          const sh = 0.45 + 0.75 * Math.max(0, lam);
          const pts = [proj(tip[0], tip[1], tip[2]), proj(a[0], a[1], a[2]), proj(b[0], b[1], b[2])];
          const col = `rgb(${clamp(color[0] * sh, 0, 255) | 0},${clamp(color[1] * sh, 0, 255) | 0},${clamp(color[2] * sh, 0, 255) | 0})`;
          polys.push({ pts, z: (pts[0].z + pts[1].z + pts[2].z) / 3 + 0.05, fill: col, stroke: 'rgba(255,255,255,0.22)' });
        }
      };
      pyramid(0.82, 0.05, [34, 38, 46], 0.0); // the blade
      pyramid(-0.24, 0.035, [54, 58, 66], 0.0); // the counterweight tail

      polys.sort((a, b) => a.z - b.z);
      for (const p of polys) {
        ctx!.beginPath();
        ctx!.moveTo(p.pts[0].x, p.pts[0].y);
        for (let i = 1; i < p.pts.length; i++) ctx!.lineTo(p.pts[i].x, p.pts[i].y);
        if (p.fill === 'none') {
          ctx!.strokeStyle = p.stroke ?? '#fff';
          ctx!.lineWidth = Math.max(1, 1.4 * dpr);
          ctx!.stroke();
        } else {
          ctx!.closePath();
          ctx!.fillStyle = p.fill;
          ctx!.fill();
          if (p.stroke) {
            ctx!.strokeStyle = p.stroke;
            ctx!.lineWidth = Math.max(0.6, 0.8 * dpr);
            ctx!.stroke();
          }
        }
      }

      // hub: a small metal ball at the pivot
      const hub = proj(0, 0, 0);
      const hr = 0.075 * Rpx;
      const hg = ctx!.createRadialGradient(hub.x - hr * 0.35, hub.y - hr * 0.4, hr * 0.1, hub.x, hub.y, hr);
      hg.addColorStop(0, '#ffffff');
      hg.addColorStop(0.45, '#c9ced6');
      hg.addColorStop(1, '#3c424c');
      ctx!.fillStyle = hg;
      ctx!.beginPath();
      ctx!.arc(hub.x, hub.y, hr, 0, Math.PI * 2);
      ctx!.fill();
      ctx!.restore();

      // glass over everything: a specular arc and the rim
      ctx!.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx!.lineWidth = 5 * dpr;
      ctx!.lineCap = 'round';
      ctx!.beginPath();
      ctx!.arc(cxp, cxp, Rpx * 0.88, Math.PI * 1.08, Math.PI * 1.32);
      ctx!.stroke();
      ctx!.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx!.lineWidth = 3 * dpr;
      ctx!.beginPath();
      ctx!.arc(cxp, cxp, Rpx * 0.9, Math.PI * 0.12, Math.PI * 0.26);
      ctx!.stroke();
      ctx!.strokeStyle = '#0b0b0c';
      ctx!.lineWidth = 4 * dpr;
      ctx!.beginPath();
      ctx!.arc(cxp, cxp, Rpx, 0, Math.PI * 2);
      ctx!.stroke();
    }

    visible = true;
    kick();

    return () => {
      cancelAnimationFrame(raf);
      raf = 0;
      kickRef.current = () => {};
      io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
    };
  }, [size]);

  return (
    <canvas
      ref={ref}
      className="el-globe__canvas"
      style={{ width: size, height: size }}
      role="img"
      aria-label="A 3D globe of red and blue liquid with a needle showing which way the chamber leans. Drag to rotate."
      tabIndex={0}
      onKeyDown={(e) => {
        const step = 0.12;
        const k = e.key;
        const h = (handle as React.RefObject<GlobeHandle | null>).current;
        if (!h) return;
        if (k === 'ArrowLeft') h.rotate(-step * 4, 0);
        else if (k === 'ArrowRight') h.rotate(step * 4, 0);
        else if (k === 'ArrowUp') h.rotate(0, -step * 4);
        else if (k === 'ArrowDown') h.rotate(0, step * 4);
        else if (k === 'Home' || k === 'Escape') h.reset();
        else return;
        e.preventDefault();
      }}
      onDoubleClick={() => (handle as React.RefObject<GlobeHandle | null>).current?.reset()}
    />
  );
}
