import { describe, expect, it } from 'vitest';
import { normalizePrompts, PACK_MIN_PROMPTS } from '../packs';
import { createPackSchema } from '../packs-schema';
import { validateGameSettings } from '@/lib/rmhbox/game-settings';
import { WIT_WAR_SETTINGS } from '@/lib/rmhbox/minigame-registry';
import { IDENTITY_CRISIS_SETTINGS } from '@/lib/rmhbox/identity-crisis/settings';
import { HUMAN_KEYBOARD_SETTINGS } from '@/lib/rmhbox/human-keyboard/settings';

describe('rmhbox packs', () => {
  it('dedupes prompts case-insensitively and enforces the minimum', () => {
    const base = Array.from(
      {
        length: PACK_MIN_PROMPTS,
      },
      (_, i) => `Prompt number ${i}`,
    );
    expect(normalizePrompts(base)).toHaveLength(PACK_MIN_PROMPTS);
    expect(normalizePrompts([...base.slice(1), 'PROMPT NUMBER 1', base[1]])).toBeNull();
  });
  it('rejects short prompt lists', () => {
    expect(
      createPackSchema.safeParse({
        name: 'abc',
        prompts: ['too short list item'],
      }).success,
    ).toBe(false);
  });
  it('sanitises the lobby pack code setting', () => {
    const v = validateGameSettings(WIT_WAR_SETTINGS, {
      packCode: ' ab-c1<2>3xyz ',
    });
    expect(v.packCode).toBe('ABC123');
  });
  it('sanitises the pack code setting of Identity Crisis and Human Keyboard the same way', () => {
    for (const schema of [IDENTITY_CRISIS_SETTINGS, HUMAN_KEYBOARD_SETTINGS]) {
      expect(validateGameSettings(schema, { packCode: ' ab-c1<2>3xyz ' }).packCode).toBe('ABC123');
      expect(validateGameSettings(schema, {}).packCode).toBe('');
    }
  });
});
