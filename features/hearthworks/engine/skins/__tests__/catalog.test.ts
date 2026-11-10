import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SKIN,
  SKINS,
  SKIN_IDS,
  SKIN_TIERS,
  canAfford,
  validateSkinId,
} from '..';

describe('skin catalog', () => {
  it('has one entry per id, the starter is free and nothing else is', () => {
    expect(Object.keys(SKINS).sort()).toEqual([...SKIN_IDS].sort());
    expect(SKINS[DEFAULT_SKIN].price).toBe(0);
    for (const id of SKIN_IDS) if (id !== DEFAULT_SKIN) expect(SKINS[id].price).toBeGreaterThan(0);
  });

  it('prices strictly rise with tier: the cheapest of a tier beats the dearest of the one below', () => {
    const byTier = (t: string) => SKIN_IDS.filter((id) => SKINS[id].tier === t).map((id) => SKINS[id].price);
    for (let i = 1; i < SKIN_TIERS.length; i++) {
      const lower = byTier(SKIN_TIERS[i - 1]);
      const upper = byTier(SKIN_TIERS[i]);
      expect(upper.length, SKIN_TIERS[i]).toBeGreaterThan(0);
      expect(Math.min(...upper)).toBeGreaterThan(Math.max(...lower));
    }
  });

  it('makes the G-Man the single most expensive skin', () => {
    const max = Math.max(...SKIN_IDS.map((id) => SKINS[id].price));
    expect(SKINS.gman.price).toBe(max);
    expect(SKIN_IDS.filter((id) => SKINS[id].price === max)).toEqual(['gman']);
    expect(SKINS.gman.tier).toBe('legendary');
  });

  it('refuses unknown, malicious and non-string ids', () => {
    for (const bad of ['nuke', '__proto__', 'constructor', '', 7, null, undefined, {}, ['gman']])
      expect(validateSkinId(bad)).toBeNull();
    expect(validateSkinId('gman')).toBe('gman');
  });

  it('checks affordability against the price exactly', () => {
    expect(canAfford(SKINS.barney.price, 'barney')).toBe(true);
    expect(canAfford(SKINS.barney.price - 1, 'barney')).toBe(false);
  });
});

import { PALETTE } from '../../art/palette';
import { SKIN_LOOKS } from '..';

describe('skin stand-in looks', () => {
  it('has a look for every skin, using only palette colours', () => {
    for (const id of SKIN_IDS) {
      const look = SKIN_LOOKS[id];
      expect(look, id).toBeDefined();
      for (const key of [look.suit, look.trim, look.skin, ...(look.hat ? [look.hat.color] : [])])
        expect(Object.hasOwn(PALETTE, key), `${id}: ${key}`).toBe(true);
      expect(look.build).toBeGreaterThan(0.5);
      expect(look.height).toBeGreaterThan(0.8);
    }
  });

  it('keeps the signature cues that tell characters apart', () => {
    expect(SKIN_LOOKS.gman.prop).toBe('briefcase');
    expect(SKIN_LOOKS.heavy.build).toBeGreaterThan(SKIN_LOOKS.scout.build);
    expect(SKIN_LOOKS.engineer.hat?.kind).toBe('hardhat');
  });
});
