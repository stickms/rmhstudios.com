// AssemblyScript. ABI: 12 scalar grids followed by the RGBA field, all Float32.
// Grid order matches lib/dough.ts; every intermediate uses f64 to preserve JS math.
const N: i32 = 48;
const CELLS: i32 = N * N;
const EXTENT: f64 = 1.3;
const H: f64 = 2 * EXTENT / (N - 1);
const CONTACT: f64 = 0.3;
const K: f64 = (2 * Math.PI / 0.42) ** 2;
const DAMP: f64 = 2 * 0.42 * (2 * Math.PI / 0.42);
const state = new Float32Array(CELLS * 16);

export function pointer(): usize { return state.dataStart; }

@inline function get(grid: i32, c: i32): f64 {
  return load<f32>(state.dataStart + usize((grid * CELLS + c) * 4));
}
@inline function put(grid: i32, c: i32, value: f64): void {
  store<f32>(state.dataStart + usize((grid * CELLS + c) * 4), f32(value));
}

function laplacian(gx: i32, gy: i32): void {
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const c = j * N + i;
      put(9, c, get(gx, c - 1) + get(gx, c + 1) + get(gx, c - N) + get(gx, c + N) - 4 * get(gx, c));
      put(10, c, get(gy, c - 1) + get(gy, c + 1) + get(gy, c - N) + get(gy, c + N) - 4 * get(gy, c));
    }
  }
}

// One call per substep. JS owns input, rest detection, and lifecycle.
export function substep(dt: f64, held: i32, gx: f64, gy: f64, vx: f64, vy: f64, pinch: f64): f64 {
  pinch += ((held != 0 ? 1 : 0) - pinch) * Math.min(1, (held != 0 ? 16 : 9) * dt);
  const gripE = held != 0 ? 0.28 * dt : 0;
  const gripP = held != 0 ? 0.5 * dt : 0;
  const flow = Math.min(1, 0.9 * dt);
  const decay = Math.exp(-dt / 1.4);
  const diffE = 0.0035 / (H * H) * dt;
  const diffP = 0.012 / (H * H) * dt;
  laplacian(0, 1);
  for (let j = 0; j < N; j++) {
    const y = -EXTENT + j * H;
    for (let i = 0; i < N; i++) {
      const c = j * N + i;
      const dx = -EXTENT + i * H - gx;
      const dy = y - gy;
      const d2 = dx * dx + dy * dy;
      let tx: f64 = 0, ty: f64 = 0, near: f64 = 0;
      if (pinch > 1e-3 && d2 < (4.2 * CONTACT) ** 2) {
        const r = Math.sqrt(d2);
        if (r >= 1e-6) {
          const s = r / CONTACT;
          const f = s * Math.exp(0.5 * (1 - s * s));
          tx = dx / r * f * 0.17 * pinch;
          ty = dy / r * f * 0.17 * pinch;
        }
        near = Math.exp(-d2 / (2 * CONTACT * CONTACT));
      }
      put(2, c, get(2, c) + (K * (tx - get(0, c)) - DAMP * get(2, c)) * dt);
      put(3, c, get(3, c) + (K * (ty - get(1, c)) - DAMP * get(3, c)) * dt);
      let ex = get(0, c) + get(2, c) * dt + diffE * get(9, c);
      let ey = get(1, c) + get(3, c) * dt + diffE * get(10, c);
      ex += vx * gripE * near;
      ey += vy * gripE * near;
      const fx = ex * flow, fy = ey * flow;
      ex -= fx;
      ey -= fy;
      put(4, c, (get(4, c) + fx + vx * gripP * near) * decay);
      put(5, c, (get(5, c) + fy + vy * gripP * near) * decay);
      put(0, c, ex);
      put(1, c, ey);
    }
  }
  laplacian(4, 5);
  for (let c = 0; c < CELLS; c++) {
    const mask = get(11, c);
    put(4, c, (get(4, c) + diffP * get(9, c)) * mask);
    put(5, c, (get(5, c) + diffP * get(10, c)) * mask);
    for (let g = 0; g < 4; g++) put(g, c, get(g, c) * mask);
    const pxx = get(4, c), pyy = get(5, c);
    const pm = Math.sqrt(pxx * pxx + pyy * pyy);
    if (pm > 0.6) {
      put(4, c, get(4, c) * 0.6 / pm);
      put(5, c, get(5, c) * 0.6 / pm);
    }
    const exx = get(0, c), eyy = get(1, c);
    const em = Math.sqrt(exx * exx + eyy * eyy);
    if (em > 0.6) {
      put(0, c, get(0, c) * 0.6 / em);
      put(1, c, get(1, c) * 0.6 / em);
    }
  }
  return pinch;
}

// Bilinear sample of a scalar grid at rest position (x, y), clamped to the grid; same as `DoughBody` in lib/dough.ts.
@inline function sample(grid: i32, x: f64, y: f64): f64 {
  const fx = (x + EXTENT) / H;
  const fy = (y + EXTENT) / H;
  const i0 = max(0, min(N - 2, i32(Math.floor(fx))));
  const j0 = max(0, min(N - 2, i32(Math.floor(fy))));
  const tx = Math.min(1, Math.max(0, fx - f64(i0)));
  const ty = Math.min(1, Math.max(0, fy - f64(j0)));
  const c = j0 * N + i0;
  return (1 - tx) * (1 - ty) * get(grid, c) + tx * (1 - ty) * get(grid, c + 1) + (1 - tx) * ty * get(grid, c + N) + tx * ty * get(grid, c + N + 1);
}

// Same displacement, per-cell reach cap and pull-back inversion as `DoughBody.derive` in lib/dough.ts (LIMB_REACH 0.14,
// 16 passes damped by 0.8). Grids 6/7/8 stay indexed by rest position; the shader field is the inverse on the screen.
export function derive(): void {
  for (let c = 0; c < CELLS; c++) {
    let x = get(0, c) + get(4, c), y = get(1, c) + get(5, c);
    const m = Math.sqrt(x * x + y * y);
    if (m > 1e-9) {
      const gx = -EXTENT + f64(c % N) * H;
      const gy = -EXTENT + f64(c / N) * H;
      const r0 = Math.sqrt(gx * gx + gy * gy);
      // reachFor(r0): soft-min(0.36, 1.14 - r0), floored at 0.
      const reach = Math.max(0.0, -Math.log(Math.exp(-24 * 0.36) + Math.exp(-24 * (1.14 - r0))) / 24);
      let s = 0.0;
      if (reach > 1e-6) {
        const q = m / reach;
        const q2 = q * q;
        s = 1 / Math.sqrt(Math.sqrt(1 + q2 * q2));
      }
      x *= s;
      y *= s;
    }
    put(6, c, x);
    put(7, c, y);
    put(8, c, 0);
  }
  const inv2h = 1 / (2 * H);
  for (let j = 1; j < N - 1; j++) {
    for (let i = 1; i < N - 1; i++) {
      const c = j * N + i;
      const div = (get(6, c + 1) - get(6, c - 1)) * inv2h + (get(7, c + N) - get(7, c - N)) * inv2h;
      put(8, c, -0.12 * div);
    }
  }
  for (let j = 0; j < N; j++) {
    const gy = -EXTENT + f64(j) * H;
    for (let i = 0; i < N; i++) {
      const gx = -EXTENT + f64(i) * H;
      let X = gx, Y = gy, vx = 0.0, vy = 0.0;
      if (gx * gx + gy * gy <= 1.26 * 1.26) {
        for (let pass = 0; pass < 16; pass++) {
          vx = sample(6, X, Y);
          vy = sample(7, X, Y);
          const dx = 0.8 * (gx - vx - X);
          const dy = 0.8 * (gy - vy - Y);
          X += dx;
          Y += dy;
          if (Math.abs(dx) < 2e-4 && Math.abs(dy) < 2e-4) break;
        }
      }
      const address = state.dataStart + usize((12 * CELLS + 4 * (j * N + i)) * 4);
      store<f32>(address, f32(vx));
      store<f32>(address + 4, f32(vy));
      store<f32>(address + 8, f32(sample(8, X, Y)));
      store<f32>(address + 12, 0);
    }
  }
}
