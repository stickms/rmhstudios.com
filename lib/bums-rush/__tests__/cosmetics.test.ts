/**
 * Bum's Rush — the cosmetic catalog (design doc §2.4, §2.5).
 *
 * This is the allowlist the socket handler and the API routes validate a
 * client's cosmetics against, so the properties that matter are: every id is
 * unique across every slot (a head id must never also be a valid hat id — the
 * validator checks slot membership, and a collision would silently widen it),
 * the counts match the design doc, and the shipped defaults are themselves
 * valid entries in the catalog they default into.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_COSMETICS } from '@/lib/bums-rush/constants';
import {
  ALL_COSMETIC_IDS,
  GLOVES_IDS,
  HAT_IDS,
  HEAD_IDS,
  INK_IDS,
  LAUNCH_INK_IDS,
  STARTER_COSMETICS,
  isCosmeticId,
  isGlovesId,
  isHatId,
  isHeadId,
  isInkId,
  isValidCosmetics,
} from '@/lib/bums-rush/cosmetics';

function noDuplicates(ids: readonly string[]): boolean {
  return new Set(ids).size === ids.length;
}

describe("Bum's Rush cosmetics catalog", () => {
  it('has the §2.5 counts: 16 heads, 24 hats, 12 gloves, 10 launch inks + 1 secret', () => {
    expect(HEAD_IDS.length).toBe(16);
    expect(HAT_IDS.length).toBe(24);
    expect(GLOVES_IDS.length).toBe(12);
    expect(INK_IDS.length).toBe(11);
    expect(LAUNCH_INK_IDS.length).toBe(10);
    expect(LAUNCH_INK_IDS).not.toContain('gold-ink');
  });

  it('has no duplicate ids within any single slot', () => {
    expect(noDuplicates(HEAD_IDS)).toBe(true);
    expect(noDuplicates(HAT_IDS)).toBe(true);
    expect(noDuplicates(GLOVES_IDS)).toBe(true);
    expect(noDuplicates(INK_IDS)).toBe(true);
  });

  it('has no id shared across two different slots', () => {
    const total = HEAD_IDS.length + HAT_IDS.length + GLOVES_IDS.length + INK_IDS.length;
    expect(ALL_COSMETIC_IDS.size).toBe(total);
  });

  it('slot predicates only accept their own slot', () => {
    for (const id of HEAD_IDS) {
      expect(isHeadId(id)).toBe(true);
      expect(isHatId(id)).toBe(false);
      expect(isGlovesId(id)).toBe(false);
      expect(isInkId(id)).toBe(false);
    }
    for (const id of HAT_IDS) expect(isHatId(id)).toBe(true);
    for (const id of GLOVES_IDS) expect(isGlovesId(id)).toBe(true);
    for (const id of INK_IDS) expect(isInkId(id)).toBe(true);
  });

  it('isCosmeticId accepts every catalog id and rejects everything else', () => {
    for (const id of ALL_COSMETIC_IDS) expect(isCosmeticId(id)).toBe(true);
    expect(isCosmeticId('nonexistent')).toBe(false);
  });

  it('rejects an invented id — the injection case the socket handler exists to stop', () => {
    expect(isCosmeticId('<img src=x onerror=alert(1)>')).toBe(false);
    expect(
      isValidCosmetics({ head: '<img src=x>', hat: null, gloves: 'mitten', ink: 'seat-1' }),
    ).toBe(false);
  });

  it('validates a full equipped set slot-by-slot', () => {
    expect(
      isValidCosmetics({ head: 'biro', hat: 'party-hat', gloves: 'mitten', ink: 'seat-1' }),
    ).toBe(true);
    // A hat id worn in the gloves slot must fail, even though it is a real cosmetic.
    expect(isValidCosmetics({ head: 'biro', hat: null, gloves: 'party-hat', ink: 'seat-1' })).toBe(
      false,
    );
  });

  it('treats a null hat as always valid (bare head is a real look)', () => {
    expect(isValidCosmetics({ head: 'biro', hat: null, gloves: 'mitten', ink: 'seat-1' })).toBe(
      true,
    );
  });

  it("constants.ts's DEFAULT_COSMETICS is itself a valid, in-catalog equipped set", () => {
    expect(isValidCosmetics(DEFAULT_COSMETICS)).toBe(true);
  });

  it('§11.2 "first launch" grants only ids that exist in the catalog', () => {
    for (const id of STARTER_COSMETICS) expect(ALL_COSMETIC_IDS.has(id)).toBe(true);
  });
});
