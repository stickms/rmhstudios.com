/**
 * The battle pass is a coin faucet: the claim endpoint re-derives a tier from
 * `buildSeason` and pays it, so the definition must be deterministic, bounded,
 * and keep season 1's stored rows meaningful.
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_SEASON_XP,
  MAX_XP_SCALE,
  MIN_XP_SCALE,
  SEASON_EPOCH,
  TIER_COUNT,
  buildSeason,
  clampXpScale,
  currentSeasonId,
  seasonNumberAt,
  tierForXp,
} from '@/lib/battlepass/season';
import { getShopItem } from '@/lib/shop/catalog';

describe('battle pass seasons', () => {
  it('keeps season 1 on its original id and end date', () => {
    const s1 = buildSeason(1);
    expect(s1.id).toBe('S1');
    expect(s1.endsAt).toBe('2026-09-01T00:00:00.000Z');
    expect(seasonNumberAt(Date.UTC(2026, 7, 31, 23))).toBe(1);
    expect(seasonNumberAt(Date.UTC(2026, 8, 1))).toBe(2);
  });

  it('starts a new season by itself at each 8-week boundary', () => {
    expect(seasonNumberAt(SEASON_EPOCH - 1)).toBe(1);
    expect(currentSeasonId(Date.UTC(2026, 10, 19))).toBe('S3');
    const s3 = buildSeason(3);
    expect(seasonNumberAt(new Date(s3.startsAt))).toBe(3);
    expect(seasonNumberAt(new Date(s3.endsAt).getTime() - 1)).toBe(3);
    expect(buildSeason(4).startsAt).toBe(s3.endsAt);
  });

  it('is deterministic for a season and scale', () => {
    expect(buildSeason(7, 1.35)).toEqual(buildSeason(7, 1.35));
  });

  it('rotates cosmetics between seasons', () => {
    const items = (n: number) =>
      buildSeason(n)
        .tiers.flatMap((t) => [t.free, t.premium])
        .filter((r) => r?.type === 'item')
        .map((r) => r!.itemId)
        .join();
    expect(items(3)).not.toBe(items(4));
  });

  it('has rising XP thresholds and only real, unique shop items', () => {
    for (const n of [1, 2, 3, 10, 50]) {
      const season = buildSeason(n);
      expect(season.tiers).toHaveLength(TIER_COUNT);
      let last = 0;
      const seen = new Set<string>();
      for (const t of season.tiers) {
        expect(t.xpRequired).toBeGreaterThan(last);
        last = t.xpRequired;
        for (const r of [t.free, t.premium]) {
          expect(r).not.toBeNull();
          if (r?.type === 'item') {
            const item = getShopItem(r.itemId!);
            expect(item, r.itemId).toBeDefined();
            expect(item!.kind).not.toBe('SITE_THEME');
            expect(item!.requiresTier).toBeUndefined();
            expect(seen.has(r.itemId!)).toBe(false);
            seen.add(r.itemId!);
          } else {
            expect(r!.amount).toBeGreaterThan(0);
          }
        }
      }
      expect(last).toBe(BASE_SEASON_XP);
    }
  });

  it('bounds the automatic XP scale', () => {
    expect(clampXpScale(0)).toBe(MIN_XP_SCALE);
    expect(clampXpScale(99)).toBe(MAX_XP_SCALE);
    expect(clampXpScale(Number.NaN)).toBe(1);
    const scaled = buildSeason(5, 2);
    expect(scaled.tiers.at(-1)!.xpRequired).toBeCloseTo(BASE_SEASON_XP * 2, -2);
  });

  it('maps season XP to the highest tier reached', () => {
    const season = buildSeason(3);
    expect(tierForXp(season, 0)).toBe(0);
    expect(tierForXp(season, season.tiers[0]!.xpRequired)).toBe(1);
    expect(tierForXp(season, season.tiers[4]!.xpRequired - 1)).toBe(4);
    expect(tierForXp(season, Number.MAX_SAFE_INTEGER)).toBe(TIER_COUNT);
  });
});
