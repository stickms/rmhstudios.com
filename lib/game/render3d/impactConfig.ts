export type Impact = { particles: number; speed: number; shake: number; flash: number };

const TABLE: Record<string, Impact> = {
  MARVELOUS: { particles: 40, speed: 11, shake: 0.9, flash: 1.0 },
  PERFECT:   { particles: 28, speed: 8,  shake: 0.6, flash: 0.8 },
  GREAT:     { particles: 18, speed: 6,  shake: 0.35, flash: 0.55 },
  GOOD:      { particles: 10, speed: 4,  shake: 0.15, flash: 0.35 },
  'HOLD OK': { particles: 20, speed: 6,  shake: 0.3, flash: 0.5 },
};

const NO_EMIT = new Set(['MISS', 'BAD', 'RELEASED']);

export function impactFor(judgment: string): Impact {
  return TABLE[judgment] ?? TABLE.GOOD;
}

export function shouldEmitImpact(text: string): boolean {
  return !NO_EMIT.has(text);
}
