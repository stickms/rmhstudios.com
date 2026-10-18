import { describe, expect, it } from 'vitest';
import { createPackSchema, normalizePrompts, PACK_MIN_PROMPTS } from '../packs';
import { validateGameSettings } from '@/lib/rmhbox/game-settings';
import { WIT_WAR_SETTINGS } from '@/lib/rmhbox/minigame-registry';

describe('rmhbox packs', () => {
  it('dedupes prompts case-insensitively and enforces the minimum', () => {
    const base = Array.from({ length: PACK_MIN_PROMPTS }, (_, i) => `Prompt number ${i}`);
    expect(normalizePrompts(base)).toHaveLength(PACK_MIN_PROMPTS);
    expect(normalizePrompts([...base.slice(1), 'PROMPT NUMBER 1', base[1]])).toBeNull();
  });
  it('rejects short prompt lists', () => {
    expect(
      createPackSchema.safeParse({ name: 'abc', prompts: ['too short list item'] }).success,
    ).toBe(false);
  });
  it('sanitises the lobby pack code setting', () => {
    const v = validateGameSettings(WIT_WAR_SETTINGS, { packCode: ' ab-c1<2>3xyz ' });
    expect(v.packCode).toBe('ABC123');
  });
});
