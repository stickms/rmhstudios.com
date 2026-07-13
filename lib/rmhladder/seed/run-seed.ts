/**
 * seedLadder — idempotent seed of companies, sources, and relevance rules.
 *
 * Extracted from scripts/seed-ladder.ts so the ladder worker can self-seed an
 * empty database on startup; the CLI script is now a thin wrapper around this.
 */

import { normalizeCompanyName } from '../normalize';
import { DEFAULT_RELEVANCE_RULES } from '../scoring';
import { MANUAL_EARLY_CAREER_URLS, SEED_COMPANIES } from './companies';

type AnyRow = Record<string, unknown>;

export interface SeedPrisma {
  ladderCompany: {
    upsert(args: { where: AnyRow; update: AnyRow; create: AnyRow }): Promise<{ id: string }>;
  };
  ladderSource: {
    upsert(args: { where: AnyRow; update: AnyRow; create: AnyRow }): Promise<unknown>;
    findFirst(args: { where: AnyRow }): Promise<unknown | null>;
    create(args: { data: AnyRow }): Promise<unknown>;
    count(): Promise<number>;
  };
  ladderRelevanceRule: {
    upsert(args: { where: AnyRow; update: AnyRow; create: AnyRow }): Promise<unknown>;
  };
}

const API_PLATFORMS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters'] as const;

/** Recorded, verified Workday tenant/site URLs. Add entries only after a live CXS fixture check. */
export const WORKDAY_SOURCES: Record<string, { slug: string; url: string; config: Record<string, string> }> = {
  Workday: {
    slug: 'workday:Workday',
    url: 'https://workday.wd5.myworkdayjobs.com/Workday',
    config: {
      origin: 'https://workday.wd5.myworkdayjobs.com',
      tenant: 'workday',
      site: 'Workday',
    },
  },
};

export async function seedLadder(
  prisma: SeedPrisma,
): Promise<{ companies: number; sources: number; rules: number }> {
  let companies = 0;
  for (const c of SEED_COMPANIES) {
    const normalizedName = normalizeCompanyName(c.name);
    const company = await prisma.ladderCompany.upsert({
      where: { normalizedName },
      // note: update intentionally omits name/URLs — re-seeding won't overwrite dashboard edits; refresh URLs via Plan 2 prober
      update: { industry: c.industry, firmType: c.firmType, priorityLevel: c.priorityLevel },
      create: {
        name: c.name, normalizedName, industry: c.industry,
        firmType: c.firmType, priorityLevel: c.priorityLevel,
        usEarlyCareerUrl: MANUAL_EARLY_CAREER_URLS[c.name],
      },
    });
    companies++;
    for (const platform of API_PLATFORMS) {
      await prisma.ladderSource.upsert({
        where: { companyId_platform_slug: { companyId: company.id, platform, slug: normalizedName.replace(/ /g, '') } },
        update: {},
        create: { companyId: company.id, platform, slug: normalizedName.replace(/ /g, ''), status: 'unconfigured' },
      });
    }
    const workday = WORKDAY_SOURCES[c.name];
    if (workday) {
      await prisma.ladderSource.upsert({
        where: {
          companyId_platform_slug: {
            companyId: company.id,
            platform: 'workday',
            slug: workday.slug,
          },
        },
        update: { url: workday.url, config: workday.config, status: 'active' },
        create: {
          companyId: company.id,
          platform: 'workday',
          slug: workday.slug,
          url: workday.url,
          config: workday.config,
          status: 'active',
        },
      });
    }
    const manualUrl = MANUAL_EARLY_CAREER_URLS[c.name];
    if (manualUrl) {
      const existing = await prisma.ladderSource.findFirst({ where: { companyId: company.id, platform: 'manual' } });
      if (!existing) {
        await prisma.ladderSource.create({
          data: { companyId: company.id, platform: 'manual', url: manualUrl, status: 'active' },
        });
      }
    }
  }
  for (const rule of DEFAULT_RELEVANCE_RULES) {
    await prisma.ladderRelevanceRule.upsert({ where: { key: rule.key }, update: {}, create: rule });
  }
  const sources = await prisma.ladderSource.count();
  return { companies, sources, rules: DEFAULT_RELEVANCE_RULES.length };
}
