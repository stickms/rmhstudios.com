import 'dotenv/config';
import { prisma } from '@/lib/prisma.server';
import { normalizeCompanyName } from '@/lib/rmhladder/normalize';
import { DEFAULT_RELEVANCE_RULES } from '@/lib/rmhladder/scoring';
import { MANUAL_EARLY_CAREER_URLS, SEED_COMPANIES } from '@/lib/rmhladder/seed/companies';

const API_PLATFORMS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters'] as const;

async function main() {
  let companies = 0;
  for (const c of SEED_COMPANIES) {
    const normalizedName = normalizeCompanyName(c.name);
    const company = await prisma.ladderCompany.upsert({
      where: { normalizedName },
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
  // eslint-disable-next-line no-console -- CLI seed script summary
  console.log(`Seeded ${companies} companies, ${sources} sources, ${DEFAULT_RELEVANCE_RULES.length} relevance rules.`);
}

main().finally(() => prisma.$disconnect());
