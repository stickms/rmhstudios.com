/** Neon Driftway livery: base + two accents + a stripe pattern, shared as a short code. */
export const STRIPES = ['none', 'center', 'twin', 'chevron', 'side'] as const;
export type Stripe = (typeof STRIPES)[number];

export interface Livery {
  /** 6-digit hex without `#`. */
  base: string;
  accent1: string;
  accent2: string;
  stripe: Stripe;
}

export const DEFAULT_LIVERY: Livery = {
  base: '00c8ff',
  accent1: 'ffffff',
  accent2: 'ff3366',
  stripe: 'none',
};
export const LIVERY_CODE_RE = /^ND1-[0-9a-f]{6}-[0-9a-f]{6}-[0-9a-f]{6}-[0-4]$/;

const HEX = /^[0-9a-f]{6}$/i;
const hex = (v: unknown, fallback: string) =>
  typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : fallback;

export function sanitizeLivery(l: Partial<Livery>): Livery {
  const d = DEFAULT_LIVERY;
  return {
    base: hex(l.base, d.base),
    accent1: hex(l.accent1, d.accent1),
    accent2: hex(l.accent2, d.accent2),
    stripe: STRIPES.includes(l.stripe as Stripe) ? (l.stripe as Stripe) : d.stripe,
  };
}

export function encodeLivery(l: Livery): string {
  return `ND1-${l.base}-${l.accent1}-${l.accent2}-${STRIPES.indexOf(l.stripe)}`;
}

/** Null unless the code is exactly well-formed. */
export function decodeLivery(code: string): Livery | null {
  const c = code.trim().toLowerCase().replace(/^nd1/, 'ND1');
  if (!LIVERY_CODE_RE.test(c)) return null;
  const [, base, accent1, accent2, stripe] = c.split('-');
  return { base, accent1, accent2, stripe: STRIPES[Number(stripe)] };
}

/** Paint the livery onto a square canvas (bonnet texture and editor preview share this). */
export function drawLivery(ctx: CanvasRenderingContext2D, size: number, l: Livery): void {
  const s = size;
  ctx.fillStyle = `#${l.base}`;
  ctx.fillRect(0, 0, s, s);
  const a1 = `#${l.accent1}`;
  const a2 = `#${l.accent2}`;
  const band = (x: number, w: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * s, 0, w * s, s);
  };
  switch (l.stripe) {
    case 'center':
      band(0.4, 0.2, a1);
      band(0.47, 0.06, a2);
      break;
    case 'twin':
      band(0.3, 0.1, a1);
      band(0.6, 0.1, a1);
      band(0.42, 0.03, a2);
      band(0.55, 0.03, a2);
      break;
    case 'side':
      band(0, 0.12, a1);
      band(0.88, 0.12, a1);
      band(0.12, 0.03, a2);
      band(0.85, 0.03, a2);
      break;
    case 'chevron':
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = i % 2 ? a2 : a1;
        ctx.lineWidth = s * 0.07;
        ctx.beginPath();
        ctx.moveTo(0.1 * s, (0.3 + i * 0.2) * s);
        ctx.lineTo(0.5 * s, (0.1 + i * 0.2) * s);
        ctx.lineTo(0.9 * s, (0.3 + i * 0.2) * s);
        ctx.stroke();
      }
      break;
    default:
      break;
  }
}

const KEY = 'ndw.livery';
let current: Livery | null = null;
const listeners = new Set<() => void>();

export function getLivery(): Livery {
  if (current) return current;
  let stored = DEFAULT_LIVERY;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stored = sanitizeLivery(JSON.parse(raw) as Partial<Livery>);
  } catch {
    /* storage blocked or corrupt */
  }
  current = stored;
  return stored;
}

export function setLivery(next: Livery): void {
  current = sanitizeLivery(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
}

export function subscribeLivery(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** True once the player has picked something other than the stock car. */
export function isCustomLivery(l: Livery): boolean {
  return encodeLivery(l) !== encodeLivery(DEFAULT_LIVERY);
}
