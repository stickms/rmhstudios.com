/**
 * The elliptic machinery behind the Peirce quincuncial projection — private to
 * `peirce.ts` (spec §5.1, §5.4; T06). Pure, allocation-free, importable from node.
 *
 * ## Why modulus 1/√2 and nothing else
 *
 * Peirce's map is the conformal map of the stereographic unit disc onto a square,
 * `w(ζ) = ∫₀^ζ dt / √(1 − t⁴)` (the lemniscatic integral). That is an elliptic
 * integral of the first kind with modulus `k = 1/√2`, the one value where the
 * modulus equals its complement (`k = k'`) and the lemniscate's four-fold
 * symmetry shows up as the square's. Fixing `k` here lets every constant (the
 * quarter period, the Landen ladder) be computed once at load.
 *
 * ## Forward: Carlson's `R_F` with complex arguments
 *
 * `∫₀^ζ dt/√((1−t²)(1+t²)) = ζ · R_F(1 − ζ², 1 + ζ², 1)`. Carlson's duplication
 * algorithm needs no branch bookkeeping: it only takes principal square roots of
 * arguments with `Re ≥ 0`, and for `|ζ| ≤ 1` both `1 ∓ ζ²` have `Re ≥ 0`. It
 * stays finite at the four singular points (`ζ⁴ = 1`), where one argument is 0,
 * and its truncation error after the `1e-3` stop is ≈ ε⁶/4 ≈ 1e-19 — below
 * double rounding.
 *
 * ## Inverse: Jacobi `cn` of a complex argument
 *
 * Substituting `ζ = cn(u, k)` in the integral gives `du = −√2 dζ / √(1 − ζ⁴)`,
 * hence `ζ = cn(K − √2·w, 1/√2)` with `K = K(1/√2)`. The argument is complex for
 * a general `w`; the addition theorem splits `cn(x + iy)` into REAL Jacobi
 * functions of `x` (modulus `k`) and of `y` (modulus `k' = k`). Those are
 * evaluated with the descending Landen/AGM ladder (Bulirsch's `sncndn`), whose
 * length is fixed for `k = 1/√2`, so the ladder is built once. No Newton
 * iteration, no initial guess, no failure mode near the corners.
 */

/** `K(1/√2) = Γ(1/4)² / (4√π)` — the real quarter period of `sn`, `cn`, `dn` at `k² = ½`. */
export const K_HALF = 1.8540746773013719;
/** `K / √2 = ϖ/2 = ∫₀¹ dt/√(1−t⁴)` — half the diagonal of the Peirce hemisphere diamond. */
export const LEMNISCATE_HALF = K_HALF / Math.SQRT2;

/* ── Real Jacobi functions at k² = ½ ─────────────────────────────────────── */

/** Landen ladder for `k'² = ½`, built once: `em` are the AGM means, `en` the geometric ones. */
const LADDER_MAX = 13;
const em = new Float64Array(LADDER_MAX);
const en = new Float64Array(LADDER_MAX);
let ladderTop = 0;
let ladderScale = 1;
{
  let a = 1;
  let emmc = 0.5; // k'^2
  let c = 1;
  for (let i = 0; i < LADDER_MAX; i++) {
    ladderTop = i;
    em[i] = a;
    emmc = Math.sqrt(emmc);
    en[i] = emmc;
    c = 0.5 * (a + emmc);
    if (Math.abs(a - emmc) <= 1e-16 * a) break;
    emmc *= a;
    a = c;
  }
  ladderScale = c;
}

/**
 * `sn, cn, dn` of real `u` at `k² = ½`, written to `out[0..2]`. Valid for the
 * `|u| ≤ 2K` the callers use; `sn` is odd and `cn`, `dn` even in `u`.
 */
export function jacobiHalf(u: number, out: Float64Array): void {
  const uu = u * ladderScale;
  let sn = Math.sin(uu);
  let cn = Math.cos(uu);
  let dn = 1;
  if (sn !== 0) {
    let a = cn / sn;
    let c = ladderScale * a;
    for (let i = ladderTop; i >= 0; i--) {
      const b = em[i]!;
      a *= c;
      c *= dn;
      dn = (en[i]! + a) / (b + a);
      a = c / b;
    }
    a = 1 / Math.sqrt(c * c + 1);
    sn = sn >= 0 ? a : -a;
    cn = c * sn;
  }
  out[0] = sn;
  out[1] = cn;
  out[2] = dn;
}

const jx = new Float64Array(3);
const jy = new Float64Array(3);

/**
 * `cn(x + iy)` at `k² = ½` → `out[0] + i·out[1]`.
 *
 * Addition theorem with the imaginary part in the complementary modulus (equal
 * to `k` here): `cn(x+iy) = (cn x·cn y − i·sn x dn x·sn y dn y) / (cn² y + k² sn² x sn² y)`.
 */
export function cnComplexHalf(x: number, y: number, out: Float64Array): void {
  jacobiHalf(x, jx);
  jacobiHalf(y, jy);
  const s = jx[0]!;
  const c = jx[1]!;
  const d = jx[2]!;
  const s1 = jy[0]!;
  const c1 = jy[1]!;
  const d1 = jy[2]!;
  const den = c1 * c1 + 0.5 * s * s * s1 * s1;
  out[0] = (c * c1) / den;
  out[1] = (-s * d * s1 * d1) / den;
}

/**
 * The hemisphere's stereographic point `ζ` under plane position `w = wx + i·wy`
 * of the diamond: `ζ = cn(K − √2·w)`, written to `out[0] + i·out[1]`.
 */
export function zetaOfPlane(wx: number, wy: number, out: Float64Array): void {
  cnComplexHalf(K_HALF - Math.SQRT2 * wx, -Math.SQRT2 * wy, out);
}

/* ── Carlson R_F, complex ────────────────────────────────────────────────── */

/**
 * Principal square root of `(re, im)`, written to `out[o], out[o+1]`. Handles the
 * slightly negative real parts rounding leaves on the unit circle.
 */
function csqrt(re: number, im: number, out: Float64Array, o: number): void {
  const m = Math.sqrt(re * re + im * im);
  if (m === 0) {
    out[o] = 0;
    out[o + 1] = 0;
    return;
  }
  if (re >= 0) {
    const t = Math.sqrt(0.5 * (m + re));
    out[o] = t;
    out[o + 1] = im / (2 * t);
  } else {
    const t = Math.sqrt(0.5 * (m - re));
    out[o] = Math.abs(im) / (2 * t);
    out[o + 1] = im >= 0 ? t : -t;
  }
}

const sq = new Float64Array(6);
const RF_TOL = 1e-3;

/**
 * `∫₀^ζ dt / √(1 − t⁴)` for `|ζ| ≤ 1`, written to `out[0] + i·out[1]` — the
 * Peirce plane position of the stereographic point `ζ` (hemisphere → diamond).
 */
export function lemniscateIntegral(zr: number, zi: number, out: Float64Array): void {
  // R_F(1 − ζ², 1 + ζ², 1)
  const z2r = zr * zr - zi * zi;
  const z2i = 2 * zr * zi;
  let xr = 1 - z2r;
  let xi = -z2i;
  let yr = 1 + z2r;
  let yi = z2i;
  let wr = 1;
  let wi = 0;
  let mr = 0;
  let mi = 0;
  for (let it = 0; it < 40; it++) {
    csqrt(xr, xi, sq, 0);
    csqrt(yr, yi, sq, 2);
    csqrt(wr, wi, sq, 4);
    const lr =
      sq[0]! * sq[2]! -
      sq[1]! * sq[3]! +
      (sq[2]! * sq[4]! - sq[3]! * sq[5]!) +
      (sq[4]! * sq[0]! - sq[5]! * sq[1]!);
    const li =
      sq[0]! * sq[3]! +
      sq[1]! * sq[2]! +
      (sq[2]! * sq[5]! + sq[3]! * sq[4]!) +
      (sq[4]! * sq[1]! + sq[5]! * sq[0]!);
    xr = 0.25 * (xr + lr);
    xi = 0.25 * (xi + li);
    yr = 0.25 * (yr + lr);
    yi = 0.25 * (yi + li);
    wr = 0.25 * (wr + lr);
    wi = 0.25 * (wi + li);
    mr = (xr + yr + wr) / 3;
    mi = (xi + yi + wi) / 3;
    const mm = Math.sqrt(mr * mr + mi * mi);
    const dev = Math.max(
      Math.hypot(mr - xr, mi - xi),
      Math.hypot(mr - yr, mi - yi),
      Math.hypot(mr - wr, mi - wi),
    );
    if (dev <= RF_TOL * mm) break;
  }
  // Deviations (μ − x)/μ, (μ − y)/μ, and (μ − z)/μ = −dx − dy since μ is the mean.
  const inv = 1 / (mr * mr + mi * mi);
  const dxr = ((mr - xr) * mr + (mi - xi) * mi) * inv;
  const dxi = ((mi - xi) * mr - (mr - xr) * mi) * inv;
  const dyr = ((mr - yr) * mr + (mi - yi) * mi) * inv;
  const dyi = ((mi - yi) * mr - (mr - yr) * mi) * inv;
  const dzr = -dxr - dyr;
  const dzi = -dxi - dyi;
  // e2 = dx·dy − dz², e3 = dx·dy·dz
  const pr = dxr * dyr - dxi * dyi;
  const pi = dxr * dyi + dxi * dyr;
  const e2r = pr - (dzr * dzr - dzi * dzi);
  const e2i = pi - 2 * dzr * dzi;
  const e3r = pr * dzr - pi * dzi;
  const e3i = pr * dzi + pi * dzr;
  // Series: 1 − e2/10 + e3/14 + e2²/24 − 3·e2·e3/44
  const e22r = e2r * e2r - e2i * e2i;
  const e22i = 2 * e2r * e2i;
  const e23r = e2r * e3r - e2i * e3i;
  const e23i = e2r * e3i + e2i * e3r;
  const sr = 1 - e2r / 10 + e3r / 14 + e22r / 24 - (3 * e23r) / 44;
  const si = -e2i / 10 + e3i / 14 + e22i / 24 - (3 * e23i) / 44;
  // R_F = series / √μ
  csqrt(mr, mi, sq, 0);
  const sd = sq[0]! * sq[0]! + sq[1]! * sq[1]!;
  const rr = (sr * sq[0]! + si * sq[1]!) / sd;
  const ri = (si * sq[0]! - sr * sq[1]!) / sd;
  // w = ζ · R_F
  out[0] = zr * rr - zi * ri;
  out[1] = zr * ri + zi * rr;
}
