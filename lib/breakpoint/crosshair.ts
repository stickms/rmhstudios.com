/** Crosshair settings: stored locally, shared as a short copy-paste code like `RO1-19f6c2-7-2-4-1-100`. */
export interface CrosshairSettings {
  /** 6-digit hex, no `#`. */
  color: string;
  length: number;
  thickness: number;
  gap: number;
  dot: boolean;
  /** 20..100 */
  opacity: number;
}

export const DEFAULT_CROSSHAIR: CrosshairSettings = {
  color: '19f6c2',
  length: 7,
  thickness: 2,
  gap: 4,
  dot: false,
  opacity: 100,
};

const KEY = 'bp.crosshair';
const PREFIX = 'RO1';
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

export function sanitizeCrosshair(c: Partial<CrosshairSettings>): CrosshairSettings {
  const d = DEFAULT_CROSSHAIR;
  return {
    color:
      typeof c.color === 'string' && /^[0-9a-f]{6}$/i.test(c.color)
        ? c.color.toLowerCase()
        : d.color,
    length: clamp(Number(c.length ?? d.length), 1, 20),
    thickness: clamp(Number(c.thickness ?? d.thickness), 1, 6),
    gap: clamp(Number(c.gap ?? d.gap), 0, 16),
    dot: !!c.dot,
    opacity: clamp(Number(c.opacity ?? d.opacity), 20, 100),
  };
}

export function encodeCrosshair(c: CrosshairSettings): string {
  return [PREFIX, c.color, c.length, c.thickness, c.gap, c.dot ? 1 : 0, c.opacity].join('-');
}

/** Returns null for anything that is not a well-formed code. */
export function decodeCrosshair(code: string): CrosshairSettings | null {
  const m = /^RO1-([0-9a-fA-F]{6})-(\d{1,2})-(\d)-(\d{1,2})-([01])-(\d{2,3})$/.exec(code.trim());
  if (!m) return null;
  return sanitizeCrosshair({
    color: m[1],
    length: +m[2],
    thickness: +m[3],
    gap: +m[4],
    dot: m[5] === '1',
    opacity: +m[6],
  });
}

let current: CrosshairSettings | null = null;
const listeners = new Set<() => void>();

export function getCrosshair(): CrosshairSettings {
  if (current) return current;
  let stored: CrosshairSettings = DEFAULT_CROSSHAIR;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) stored = sanitizeCrosshair(JSON.parse(raw) as Partial<CrosshairSettings>);
  } catch {
    /* storage blocked or corrupt */
  }
  current = stored;
  return stored;
}

export function setCrosshair(next: CrosshairSettings): void {
  current = sanitizeCrosshair(next);
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
}

export function subscribeCrosshair(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
