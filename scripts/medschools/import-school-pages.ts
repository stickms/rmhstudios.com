/**
 * Loads data/medschools/school-pages.json (the schools' own secondary and admissions pages, read once by hand on
 * 2026-11-23) into the database: `SCHOOL` prompt observations, one check per school and the rolling-admissions facts.
 * It reads a checked-in file and makes no request to any website. Idempotent: run it as often as you like.
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/medschools/import-school-pages.ts            # import
 *   DATABASE_URL=... pnpm exec tsx scripts/medschools/import-school-pages.ts --dry-run  # validate and count, write nothing
 *
 * In production (inside the web container, which carries the repo's data/): see features/medschools/CLAUDE.md.
 */
/* eslint-disable no-console -- a CLI: the report is its output. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { importSchoolPages, schoolPagesFileSchema } from '../../features/medschools/scrape/school-pages';
import type { MedPrisma } from '../../features/medschools/scrape/types';

async function main() {
  const raw: unknown = JSON.parse(readFileSync(join(process.cwd(), 'data/medschools/school-pages.json'), 'utf8'));
  const parsed = schoolPagesFileSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('school-pages.json is invalid:', JSON.stringify(parsed.error.issues.slice(0, 5)));
    process.exit(1);
  }
  const file = parsed.data;
  if (process.argv.includes('--dry-run')) {
    const prompts = file.schools.reduce((n, s) => n + s.secondary.prompts.length, 0);
    console.log(`dry run: ${file.schools.length} schools, ${prompts} prompts, nothing written`);
    return;
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL is not set');
    process.exit(1);
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, max: 2 }) });
  try {
    const sum = await importSchoolPages(prisma as unknown as MedPrisma, file, {
      info: (l) => console.log(l),
      warn: (l) => console.warn(l),
    });
    if (sum.rejected > 0)
      console.warn(`${sum.rejected} prompt(s) were not stored (too long or empty); see the log above`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
