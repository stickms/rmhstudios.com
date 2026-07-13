import { describe, it, expect } from 'vitest';
import { seedLadder, WORKDAY_SOURCES, type SeedPrisma } from './run-seed';
import { SEED_COMPANIES, MANUAL_EARLY_CAREER_URLS } from './companies';
import { DEFAULT_RELEVANCE_RULES } from '../scoring';

type AnyRow = Record<string, unknown>;

function makeFakePrisma() {
  const companies = new Map<string, AnyRow>();
  const sources = new Map<string, AnyRow>();
  const rules = new Map<string, AnyRow>();

  const prisma: SeedPrisma = {
    ladderCompany: {
      async upsert({ where, update, create }) {
        const key = (where as AnyRow).normalizedName as string;
        const existing = companies.get(key);
        if (existing) {
          companies.set(key, { ...existing, ...update });
          return { id: existing.id as string };
        }
        const id = `c${companies.size + 1}`;
        companies.set(key, { id, ...create });
        return { id };
      },
    },
    ladderSource: {
      async upsert({ where, create }) {
        const w = (where as AnyRow).companyId_platform_slug as AnyRow;
        const key = `${w.companyId}:${w.platform}:${w.slug}`;
        if (!sources.has(key)) sources.set(key, { ...create });
        return sources.get(key)!;
      },
      async findFirst({ where }) {
        const w = where as AnyRow;
        for (const s of sources.values()) {
          if (s.companyId === w.companyId && s.platform === w.platform) return s;
        }
        return null;
      },
      async create({ data }) {
        sources.set(`${data.companyId}:${data.platform}:manual`, { ...data });
        return data;
      },
      async count() {
        return sources.size;
      },
    },
    ladderRelevanceRule: {
      async upsert({ where, create }) {
        const key = (where as AnyRow).key as string;
        if (!rules.has(key)) rules.set(key, { ...create });
        return rules.get(key)!;
      },
    },
  };

  return { prisma, companies, sources, rules };
}

describe('seedLadder', () => {
  it('seeds API sources, recorded Workday boards, and curated manual URLs', async () => {
    const { prisma, companies, sources, rules } = makeFakePrisma();

    const result = await seedLadder(prisma);

    expect(result.companies).toBe(SEED_COMPANIES.length);
    expect(companies.size).toBe(SEED_COMPANIES.length);
    const manualCount = Object.keys(MANUAL_EARLY_CAREER_URLS).filter((name) =>
      SEED_COMPANIES.some((c) => c.name === name),
    ).length;
    const workdayCount = Object.keys(WORKDAY_SOURCES).filter((name) =>
      SEED_COMPANIES.some((c) => c.name === name),
    ).length;
    expect(sources.size).toBe(SEED_COMPANIES.length * 4 + workdayCount + manualCount);
    expect(result.sources).toBe(sources.size);
    expect(rules.size).toBe(DEFAULT_RELEVANCE_RULES.length);

    // API sources start unconfigured; manual sources start active
    const statuses = new Set(Array.from(sources.values()).map((s) => s.status));
    expect(statuses.has('unconfigured')).toBe(true);
    if (manualCount > 0) expect(statuses.has('active')).toBe(true);
    expect([...sources.values()]).toContainEqual(expect.objectContaining({
      platform: 'workday',
      slug: 'workday:Workday',
      status: 'active',
      url: 'https://workday.wd5.myworkdayjobs.com/Workday',
    }));
  });

  it('is idempotent — re-running creates nothing new', async () => {
    const { prisma, companies, sources, rules } = makeFakePrisma();

    await seedLadder(prisma);
    const afterFirst = { c: companies.size, s: sources.size, r: rules.size };
    await seedLadder(prisma);

    expect({ c: companies.size, s: sources.size, r: rules.size }).toEqual(afterFirst);
  });
});
