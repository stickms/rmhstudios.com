import { describe, expect, it } from 'vitest';
import { buildSeedSources, seedHomeSources, SEED_METROS, type SeedPrisma } from './seed';

describe('buildSeedSources', () => {
  const sources = buildSeedSources();

  it('produces a rent + sale source per metro', () => {
    expect(sources).toHaveLength(SEED_METROS.length * 2);
  });

  it('gives every source a unique, stable key', () => {
    const keys = sources.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain('craigslist:rochester:apa');
    expect(keys).toContain('craigslist:rochester:rea');
  });

  it('carries a default location for coordinate fallback', () => {
    for (const s of sources) {
      expect(s.provider).toBe('CRAIGSLIST');
      expect(s.defaultLat).toBeTypeOf('number');
      expect(s.defaultLng).toBeTypeOf('number');
      expect(s.defaultCity).toBeTruthy();
      expect(s.defaultState).toBeTruthy();
    }
  });
});

describe('seedHomeSources', () => {
  it('upserts every source by key and is idempotent', async () => {
    const store = new Map<string, unknown>();
    const prisma: SeedPrisma = {
      homeSource: {
        async upsert({ where, create }) {
          if (!store.has(where.key)) store.set(where.key, create);
          return {};
        },
        async count() {
          return store.size;
        },
      },
    };

    const first = await seedHomeSources(prisma);
    expect(first.sources).toBe(SEED_METROS.length * 2);
    // Re-seeding doesn't create duplicates.
    const second = await seedHomeSources(prisma);
    expect(second.sources).toBe(first.sources);
  });
});
