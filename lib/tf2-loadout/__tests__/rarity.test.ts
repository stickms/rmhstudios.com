import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RARITIES } from '../catalog-types';
import { RARITY_STYLE, rarityBackground, rarityColor } from '../rarity';

const scheme = readFileSync('public/tf2-hud/base/resource/clientscheme.res', 'utf8');
const colorOf = (name: string): number[] => {
  const m = new RegExp(`"${name}"\\s+"(\\d+) (\\d+) (\\d+) 255"`).exec(scheme);
  if (!m) throw new Error(`${name} is not in the HUD's clientscheme.res`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
};

describe('item tiers', () => {
  it('uses the colours the HUD defines for each tier, and its dimmed variant', () => {
    for (const r of RARITIES) {
      const name = r[0].toUpperCase() + r.slice(1);
      expect([...RARITY_STYLE[r].rgb]).toEqual(colorOf(`ItemRarity${name}`));
      expect([...RARITY_STYLE[r].dim]).toEqual(colorOf(`ItemRarity${name}_GreyedOut`));
    }
  });

  it('formats colours for CSS', () => {
    expect(rarityColor('rare')).toBe('rgb(75 105 255)');
    expect(rarityColor('rare', 0.5)).toBe('rgb(75 105 255 / 0.5)');
    expect(rarityBackground('ancient')).toBe('rgb(78 25 25)');
  });
});
