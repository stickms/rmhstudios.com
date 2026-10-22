/**
 * Edge refraction for glass surfaces. Pure math with no DOM, so it is unit-tested.
 *
 * The surface is a convex squircle bezel: height rises from 0 at the rim to 1 at
 * `bezel` px inside, h(t) = (1 - (1 - t)^4)^(1/4). A vertical ray meets the
 * surface at the slope's angle θ1 and bends to θ2 = asin(sin θ1 / IOR) (Snell,
 * air → glass; IOR matches the globe coat). It then travels the glass thickness,
 * so the lateral shift is thickness · tan(θ1 − θ2): zero in the flat interior,
 * strongest at the rim. The shift is normalised to 1 at its peak and written as
 * an inward vector into the R/G channels of a displacement map. Sampling inward
 * keeps every read inside the backdrop.
 */
export const GLASS_IOR = 1.45;
const LUT_SIZE = 128;
/** Slopes past this are clamped: the true profile is vertical at the rim. */
const MAX_SLOPE_ANGLE = Math.PI / 2 - 0.05;

const squircle = (t: number) => Math.pow(1 - Math.pow(1 - t, 4), 0.25);

let lut: Float32Array | null = null;

/** Normalised lateral displacement by depth fraction t ∈ [0,1] (0 = rim). */
export function displacementProfile(): Float32Array {
  if (lut) return lut;
  const out = new Float32Array(LUT_SIZE);
  const eps = 1e-3;
  let peak = 0;
  for (let i = 0; i < LUT_SIZE; i++) {
    const t = Math.min(1 - eps, Math.max(eps, i / (LUT_SIZE - 1)));
    const slope = (squircle(t + eps) - squircle(t - eps)) / (2 * eps);
    const theta1 = Math.min(MAX_SLOPE_ANGLE, Math.atan(Math.abs(slope)));
    const theta2 = Math.asin(Math.sin(theta1) / GLASS_IOR);
    // Thickness grows with height; a unit base keeps the flat interior at zero shift.
    const shift = (1 + squircle(t)) * Math.tan(theta1 - theta2);
    out[i] = shift;
    if (shift > peak) peak = shift;
  }
  for (let i = 0; i < LUT_SIZE; i++) out[i] = peak > 0 ? out[i] / peak : 0;
  out[LUT_SIZE - 1] = 0;
  return (lut = out);
}

/** Linear lookup; t outside [0,1] is clamped. */
export function sampleProfile(t: number): number {
  const table = displacementProfile();
  const f = Math.min(1, Math.max(0, t)) * (LUT_SIZE - 1);
  const i = Math.floor(f);
  const j = Math.min(LUT_SIZE - 1, i + 1);
  return table[i] + (table[j] - table[i]) * (f - i);
}

export interface SurfaceSpec {
  /** CSS px. */
  width: number;
  height: number;
  /** Corner radius in CSS px; clamped to half the short side. */
  radius: number;
  /** Refracting rim width in CSS px; clamped to the surface. */
  bezel: number;
}

export interface QuantizedSurface extends SurfaceSpec {
  key: string;
}

const STEP = 8;

/** Snap a measured surface to a coarse grid so resizes reuse cached maps. */
export function quantizeSurface(width: number, height: number, radius: number): QuantizedSurface {
  const w = Math.max(STEP, Math.round(width / STEP) * STEP);
  const h = Math.max(STEP, Math.round(height / STEP) * STEP);
  const r = Math.min(Math.round(Math.max(0, radius)), Math.floor(Math.min(w, h) / 2));
  const bezel = Math.max(4, Math.min(24, Math.round(Math.min(w, h) * 0.22), Math.max(r, 8)));
  return { width: w, height: h, radius: r, bezel, key: `${w}x${h}r${r}b${bezel}` };
}

/** Peak displacement in CSS px for the filter's `scale`. */
export function peakDisplacement(bezel: number): number {
  return Math.min(36, Math.max(8, bezel * 1.5));
}

/** Signed distance inside a rounded rect: positive inside. Also returns the inward unit normal. */
function insideDistance(
  px: number,
  py: number,
  w: number,
  h: number,
  r: number,
): { d: number; nx: number; ny: number } {
  const cx = w / 2;
  const cy = h / 2;
  const dx = px - cx;
  const dy = py - cy;
  const qx = Math.abs(dx) - (cx - r);
  const qy = Math.abs(dy) - (cy - r);
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  if (qx > 0 && qy > 0) {
    // Corner arc: normal points from the point back toward the arc's centre.
    const len = Math.hypot(qx, qy) || 1;
    return { d: r - len, nx: (-qx / len) * sx, ny: (-qy / len) * sy };
  }
  if (qx > qy) return { d: cx - Math.abs(dx), nx: -sx, ny: 0 };
  return { d: cy - Math.abs(dy), nx: 0, ny: -sy };
}

/**
 * RGBA displacement map. Pixel grid is `ceil(size · scale)`; coordinates are
 * evaluated in CSS px so a downscaled map describes the same surface. Neutral
 * (no displacement) is 128 in R and G.
 */
export function buildDisplacementMap(
  spec: SurfaceSpec,
  scale = 1,
): { width: number; height: number; data: Uint8ClampedArray<ArrayBuffer> } {
  const pw = Math.max(1, Math.ceil(spec.width * scale));
  const ph = Math.max(1, Math.ceil(spec.height * scale));
  const data = new Uint8ClampedArray(new ArrayBuffer(pw * ph * 4));
  const r = Math.min(Math.max(0, spec.radius), Math.min(spec.width, spec.height) / 2);
  const bezel = Math.max(1, Math.min(spec.bezel, Math.min(spec.width, spec.height) / 2));
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const i = (y * pw + x) * 4;
      const { d, nx, ny } = insideDistance(
        ((x + 0.5) / pw) * spec.width,
        ((y + 0.5) / ph) * spec.height,
        spec.width,
        spec.height,
        r,
      );
      const m = d >= bezel ? 0 : sampleProfile(Math.max(0, d) / bezel);
      data[i] = 128 + nx * m * 127;
      data[i + 1] = 128 + ny * m * 127;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return { width: pw, height: ph, data };
}

/** Largest map we rasterise; bigger surfaces render at a reduced scale. */
export const MAX_MAP_PIXELS = 90_000;

export function mapScaleFor(width: number, height: number): number {
  return Math.min(1, Math.sqrt(MAX_MAP_PIXELS / Math.max(1, width * height)));
}

export interface FilterOptions {
  id: string;
  width: number;
  height: number;
  /** Peak displacement in CSS px. */
  scale: number;
  /** `data:` URL of the displacement map. */
  href: string;
  /** Split R/G/B displacement for a prismatic edge. */
  dispersive?: boolean;
}

/** Spread of the red/blue channels around green when dispersive. */
export const DISPERSION = 0.18;

const attr = (n: number) => String(Math.round(n * 100) / 100);

/** SVG `<filter>` markup, parsed in an SVG context by the runtime. */
export function filterMarkup(o: FilterOptions): string {
  const region = `x="0" y="0" width="${attr(o.width)}" height="${attr(o.height)}"`;
  const map = `<feImage href="${o.href}" ${region} preserveAspectRatio="none" result="map"/>`;
  const disp = (scale: number, result: string) =>
    `<feDisplacementMap in="SourceGraphic" in2="map" scale="${attr(scale)}" xChannelSelector="R" yChannelSelector="G" result="${result}"/>`;
  const head = `<filter id="${o.id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" ${region} color-interpolation-filters="sRGB">`;
  if (!o.dispersive) return `${head}${map}${disp(o.scale, 'out')}</filter>`;
  const only = (src: string, r: number, g: number, b: number, result: string) =>
    `<feColorMatrix in="${src}" type="matrix" values="${r} 0 0 0 0 0 ${g} 0 0 0 0 0 ${b} 0 0 0 0 0 1 0" result="${result}"/>`;
  return (
    head +
    map +
    disp(o.scale * (1 + DISPERSION), 'dr') +
    disp(o.scale, 'dg') +
    disp(o.scale * (1 - DISPERSION), 'db') +
    only('dr', 1, 0, 0, 'r') +
    only('dg', 0, 1, 0, 'g') +
    only('db', 0, 0, 1, 'b') +
    `<feComposite in="r" in2="g" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="rg"/>` +
    `<feComposite in="rg" in2="b" operator="arithmetic" k1="0" k2="1" k3="1" k4="0"/>` +
    `</filter>`
  );
}
