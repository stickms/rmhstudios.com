import { describe, it, expect } from 'vitest';
import { parseLayout, moduleSchema, layoutSchema, MAX_MODULES } from '@/lib/profile/modules';

describe('moduleSchema', () => {
  it('validates known kinds', () => {
    expect(moduleSchema.safeParse({ kind: 'about', config: { text: 'hi' } }).success).toBe(true);
    expect(moduleSchema.safeParse({ kind: 'stats' }).success).toBe(true);
    expect(moduleSchema.safeParse({ kind: 'wishlist', config: {} }).success).toBe(true);
    expect(moduleSchema.safeParse({ kind: 'nope' }).success).toBe(false);
  });
});

describe('parseLayout (forward-safe)', () => {
  it('drops unknown entries and keeps valid ones', () => {
    const out = parseLayout([
      { kind: 'about', config: { text: 'hi' } },
      { kind: 'ghost', config: {} },
      { kind: 'stats' },
      'garbage',
    ]);
    expect(out.map((m) => m.kind)).toEqual(['about', 'stats']);
  });

  it('caps to MAX_MODULES', () => {
    const many = Array.from({ length: MAX_MODULES + 4 }, () => ({ kind: 'stats' as const }));
    expect(parseLayout(many).length).toBe(MAX_MODULES);
  });

  it('returns [] for non-arrays', () => {
    expect(parseLayout(null)).toEqual([]);
    expect(parseLayout({})).toEqual([]);
  });
});

describe('layoutSchema', () => {
  it('rejects too many modules', () => {
    const many = Array.from({ length: MAX_MODULES + 1 }, () => ({ kind: 'stats' }));
    expect(layoutSchema.safeParse({ modules: many }).success).toBe(false);
  });
});
