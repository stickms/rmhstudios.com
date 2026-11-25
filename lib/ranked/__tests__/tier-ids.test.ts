import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RANK_TIERS, tierForRating, tierIdForRating, type TierId } from '@/lib/ranked/tiers';

/**
 * s14-20 (g): ranked tiers have a stable id the client translates. The English label stays for the developer API, and
 * every id has a literal key in `ranked-standing` (the computed-key gate cannot see a key built at run time).
 */

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const IDS: TierId[] = ['master', 'diamond', 'platinum', 'gold', 'silver', 'bronze'];

describe('tier ids', () => {
  it('every tier has a unique id, and the six ids are the set the client translates', () => {
    expect(RANK_TIERS.map((t) => t.key)).toEqual(IDS);
  });

  it('maps ratings to ids at the thresholds, and keeps the English label beside it', () => {
    expect(tierIdForRating(1500)).toBe('master');
    expect(tierIdForRating(1499)).toBe('diamond');
    expect(tierIdForRating(1050)).toBe('gold');
    expect(tierIdForRating(0)).toBe('bronze');
    expect(tierForRating(1200).label).toBe('Platinum');
    expect(tierForRating(1200).key).toBe(tierIdForRating(1200));
  });
});

describe('tier-names.ts (the components layer is not imported from lib/, so the source is read)', () => {
  const names = read('components/feed/tier-names.ts');

  it('has a literal call for each id with its own key, namespace and English default', () => {
    for (const id of IDS) {
      const label = RANK_TIERS.find((x) => x.key === id)?.label;
      expect(names).toContain(`case '${id}':`);
      expect(names).toContain(`t('tier-${id}', { ns: 'ranked-standing', defaultValue: '${label}' })`);
    }
  });

  it('falls back to the label the server sent for an id it does not know', () => {
    expect(names).toMatch(/default:\s+return fallback \?\? '';/);
  });

  it('has all six keys in the English catalogue', () => {
    const en = JSON.parse(read('locales/en/ranked-standing.json')) as Record<string, string>;
    for (const id of IDS) expect(en[`tier-${id}`]).toBe(RANK_TIERS.find((x) => x.key === id)?.label);
  });
});

describe('what the server sends and the components read', () => {
  it('standing and ladder rows carry tierId beside the old tier', () => {
    const season = read('lib/ranked/season.server.ts');
    expect(season).toContain('tierId: shown.rating === null ? null : tierIdForRating(shown.rating)');
    expect(season).toContain('tierId: tierIdForRating(rating)');
    expect(season).toContain('tier: shown.rating === null ? null : tierForRating(shown.rating).label');
  });

  it('both components translate through tierName instead of printing the label', () => {
    const standing = read('components/feed/RankedStanding.tsx');
    expect(standing).toContain('tierName(t, g.tierId, g.tier)');
    expect(standing).not.toMatch(/\$\{g\.tier\}/);
    const column = read('components/feed/RankedColumn.tsx');
    expect(column).toContain('tierName(t, tier.key, tier.label)');
    expect(column).not.toContain('{tier.label}');
  });
});
