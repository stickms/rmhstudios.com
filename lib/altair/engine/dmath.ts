// =============================================================================
// ALTAIR ENGINE -- Deterministic math for replayable simulations
// =============================================================================
// Math.sin / cos / atan2 / exp / pow / hypot are NOT bit-identical between JS engines (V8 vs
// SpiderMonkey vs JavaScriptCore) or even between V8 versions: measured, Chromium 153 and Node 22
// disagree on sin/cos for the same inputs. A co-op run replayed on the server would drift from the
// host's browser and an honest run would fail verification.
//
// Inside a seeded simulation scope (engine/rng.ts withRng) these functions use software
// implementations built only from + - * / sqrt floor round and %, which IEEE-754 specifies exactly, so
// every engine computes the same bits. Outside that scope (single-player, the golden master) they ARE
// Math.*, so existing behaviour is untouched. Accuracy is ~1 ulp, which is all gameplay needs.
// =============================================================================

import { isSeeded } from './rng';

const PI = Math.PI;
const PIO2 = PI / 2;
const INV_PIO2 = 6.36619772367581382433e-1;
// fdlibm Cody-Waite split of pi/2 (first term has 33 significant bits, so n * P1 is exact for n < 2^20).
const P1 = 1.57079632673412561417;
const P1T = 6.0771005065061922e-11;

// fdlibm __kernel_sin / __kernel_cos minimax coefficients on [-pi/4, pi/4].
const S1 = -1.66666666666666324348e-1;
const S2 = 8.33333333332248946124e-3;
const S3 = -1.98412698298579493134e-4;
const S4 = 2.75573137070700676789e-6;
const S5 = -2.50507602534068634195e-8;
const S6 = 1.58969099521155010221e-10;
const C1 = 4.16666666666666019037e-2;
const C2 = -1.38888888888741095749e-3;
const C3 = 2.48015872894767294178e-5;
const C4 = -2.75573143513906633035e-7;
const C5 = 2.0875723212981748279e-9;
const C6 = -1.13596475577881948265e-11;

const TWO_PI = 2 * PI;
const BIG = 100000;

function ksin(x: number): number {
  const z = x * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  return x + z * x * (S1 + z * r);
}

function kcos(x: number): number {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  return 1 - (0.5 * z - z * r);
}

/** Reduce x to y in [-pi/4, pi/4] with quadrant q in 0..3 (x = y + q*pi/2 mod 2pi). */
function reduce(x: number): { y: number; q: number } {
  if (x > BIG || x < -BIG) x = x % TWO_PI; // fmod is exact
  const n = Math.round(x * INV_PIO2);
  const y = x - n * P1 - n * P1T;
  return { y, q: ((n % 4) + 4) % 4 };
}

export function sdsin(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const { y, q } = reduce(x);
  switch (q) {
    case 0:
      return ksin(y);
    case 1:
      return kcos(y);
    case 2:
      return -ksin(y);
    default:
      return -kcos(y);
  }
}

export function sdcos(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  const { y, q } = reduce(x);
  switch (q) {
    case 0:
      return kcos(y);
    case 1:
      return -ksin(y);
    case 2:
      return -kcos(y);
    default:
      return ksin(y);
  }
}

/** atan for any finite x by argument reduction + Newton on tan, using only the deterministic sin/cos. */
function satan(x: number): number {
  if (x !== x) return NaN;
  const neg = x < 0;
  let a = neg ? -x : x;
  if (a === Infinity) return neg ? -PIO2 : PIO2;
  const inv = a > 1;
  if (inv) a = 1 / a;
  let y = a / (1 + 0.28125 * a * a); // within ~0.005 rad on [0, 1]
  for (let i = 0; i < 3; i++) {
    const t = sdsin(y) / sdcos(y);
    y += (a - t) / (1 + a * t);
  }
  if (inv) y = PIO2 - y;
  return neg ? -y : y;
}

export function sdatan2(y: number, x: number): number {
  if (y !== y || x !== x) return NaN;
  if (x === 0) {
    if (y === 0) {
      const xNeg = Object.is(x, -0);
      const yNeg = Object.is(y, -0);
      return xNeg ? (yNeg ? -PI : PI) : yNeg ? -0 : 0;
    }
    return y > 0 ? PIO2 : -PIO2;
  }
  if (y === 0) {
    return x > 0 ? y : Object.is(y, -0) ? -PI : PI;
  }
  const a = satan(y / x);
  if (x > 0) return a;
  return y >= 0 ? a + PI : a - PI;
}

const LN2_HI = 6.9314718036912381649e-1;
const LN2_LO = 1.9082149292705877e-10;
const LOG2E = 1.4426950408889634;
const INV_FACT: number[] = [];
{
  let f = 1;
  for (let i = 0; i <= 16; i++) {
    if (i > 0) f *= i;
    INV_FACT.push(1 / f);
  }
}

export function sdexp(x: number): number {
  if (x !== x) return NaN;
  if (x > 709) return Infinity;
  if (x < -745) return 0;
  const k = Math.round(x * LOG2E);
  const r = x - k * LN2_HI - k * LN2_LO;
  let p = INV_FACT[16];
  for (let i = 15; i >= 0; i--) p = p * r + INV_FACT[i];
  let n = k;
  while (n > 0) {
    p *= 2;
    n--;
  }
  while (n < 0) {
    p *= 0.5;
    n++;
  }
  return p;
}

/** Integer exponents only (the sim never needs another); anything else falls back to Math.pow. */
export function sdpow(b: number, e: number): number {
  if (!Number.isInteger(e) || e > 64 || e < -64) return Math.pow(b, e);
  let r = 1;
  let base = b;
  let n = e < 0 ? -e : e;
  while (n > 0) {
    if (n & 1) r *= base;
    base *= base;
    n >>= 1;
  }
  return e < 0 ? 1 / r : r;
}

export function sdhypot(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

// ---- The functions the engine imports: Math.* normally, the software versions inside a seeded sim. ----

export const dsin = (x: number): number => (isSeeded() ? sdsin(x) : Math.sin(x));
export const dcos = (x: number): number => (isSeeded() ? sdcos(x) : Math.cos(x));
export const datan2 = (y: number, x: number): number => (isSeeded() ? sdatan2(y, x) : Math.atan2(y, x));
export const dexp = (x: number): number => (isSeeded() ? sdexp(x) : Math.exp(x));
export const dpow = (b: number, e: number): number => (isSeeded() ? sdpow(b, e) : Math.pow(b, e));
export const dhypot = (x: number, y: number): number => (isSeeded() ? sdhypot(x, y) : Math.hypot(x, y));
/** x squared: x ** 2 normally (bit-identical to before), x * x inside a seeded sim. */
export const dsq = (x: number): number => (isSeeded() ? x * x : x ** 2);
