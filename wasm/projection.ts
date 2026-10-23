import { lemniscateIntegral } from './.generated/elliptic';

// Only Peirce needs elliptic integration. Other projections keep their cheap JS path.
const HALF: f64 = 1.3110287771460598;
const EXTENT: f64 = 4;
const data = new Float32Array(1024 * 512 * 2);
const scratch = new Float64Array(2);
export function pointer(): usize { return data.dataStart; }

function clamp(v: f64): f64 { return Math.max(-EXTENT, Math.min(EXTENT, v)); }

function sample(theta: f64, phi: f64, halfW: f64, halfH: f64): void {
  const cp = Math.cos(phi);
  const px = cp * Math.sin(theta), pz = cp * Math.cos(theta);
  const front = pz >= 0;
  const inv = 1 / (front ? 1 + pz : 1 - pz);
  lemniscateIntegral(px * inv, Math.sin(phi) * inv, scratch);
  if (!front) {
    const x = scratch[0], y = scratch[1];
    scratch[0] = (x < 0 ? -1 : 1) * (HALF - Math.abs(y));
    scratch[1] = (y < 0 ? -1 : 1) * (HALF - Math.abs(x));
  }
  scratch[0] = clamp(0.5 + scratch[0] / (2 * halfW));
  scratch[1] = clamp(0.5 - scratch[1] / (2 * halfH));
}

@inline function put(k: i32, u: f64, v: f64): void {
  data[k] = f32(u);
  data[k + 1] = f32(v);
}

export function bake(w: i32, h: i32, halfW: f64, halfH: f64): void {
  const dTheta = 2 * Math.PI / w, dPhi = Math.PI / h;
  if (w % 2 == 0 && h % 2 == 0) {
    const hw = w >> 1, hh = h >> 1;
    const fold = w % 4 == 0;
    const frontEnd = fold ? (3 * w) >> 2 : w;
    for (let j = hh; j < h; j++) {
      const phi = -Math.PI / 2 + (j + 0.5) * dPhi;
      const jm = h - 1 - j;
      for (let i = hw; i < w; i++) {
        let u: f64 = 0, v: f64 = 0;
        let reflected = false;
        if (i >= frontEnd) {
          const src = (j * w + 3 * w / 2 - 1 - i) * 2;
          const fu: f64 = data[src], fv: f64 = data[src + 1];
          if (Math.abs(fu) < EXTENT - 0.01 && Math.abs(fv) < EXTENT - 0.01) {
            const x = (fu - 0.5) * 2 * halfW, y = (0.5 - fv) * 2 * halfH;
            const bx = (x < 0 ? -1 : 1) * (HALF - Math.abs(y));
            const by = (y < 0 ? -1 : 1) * (HALF - Math.abs(x));
            u = clamp(0.5 + bx / (2 * halfW));
            v = clamp(0.5 - by / (2 * halfH));
            reflected = true;
          }
        }
        if (!reflected) {
          sample(-Math.PI + (i + 0.5) * dTheta, phi, halfW, halfH);
          u = scratch[0]; v = scratch[1];
        }
        const im = w - 1 - i;
        put((j * w + i) * 2, u, v);
        put((j * w + im) * 2, 1 - u, v);
        put((jm * w + i) * 2, u, 1 - v);
        put((jm * w + im) * 2, 1 - u, 1 - v);
      }
    }
  } else {
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        sample(-Math.PI + (i + 0.5) * dTheta, -Math.PI / 2 + (j + 0.5) * dPhi, halfW, halfH);
        put((j * w + i) * 2, scratch[0], scratch[1]);
      }
    }
  }
}
