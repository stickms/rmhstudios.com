/* eslint-disable no-console */
/**
 * Writes `docs/_generated/db-census.md`: the table and product census (third-pass audit
 * DT1) of the database `DATABASE_URL` points at, as the evidence file for DT2.
 *
 *     pnpm db:census --origin local
 *     DATABASE_URL=<production url> pnpm db:census --origin production
 *
 * `--origin` is required and is printed as the file's first line, because the script cannot
 * tell which database it was given and a census of a development database says nothing
 * about real use. Reads only: nothing is written to the database. Tables are compared with
 * the newest stored monthly snapshot that is at least 90 days old, when there is one. The same census is on
 * /admin/census, where "Take snapshot now" stores it.
 */
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '@/lib/prisma.server';
import { renderCensusMarkdown, summarizeCensus } from '@/lib/admin/census';
import { findCensusBaseline, takeCensus } from '@/lib/admin/census.server';

const ORIGINS = {
  local:
    'LOCAL DEVELOPMENT SNAPSHOT. This is a census of a development database, not of production. It shows the shape of the report and nothing about real use: do not decide a tier or a drop (DT2) from it. Run `DATABASE_URL=<production url> pnpm db:census --origin production` and commit the result to replace this file.',
  production: 'Production snapshot (rmhstudios.com). Evidence for audit DT2.',
} as const;

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  '_generated',
  'db-census.md',
);

async function main(): Promise<void> {
  const at = process.argv.indexOf('--origin');
  const origin = at === -1 ? undefined : process.argv[at + 1];
  if (origin !== 'local' && origin !== 'production') {
    console.error('usage: pnpm db:census --origin <local|production>');
    process.exitCode = 2;
    return;
  }
  const census = await takeCensus();
  const baseline = await findCensusBaseline(census.takenAt);
  writeFileSync(OUT, renderCensusMarkdown(census, ORIGINS[origin], baseline));
  const s = summarizeCensus(census, baseline);
  console.log(
    `db-census.md: ${s.tables} tables (${s.quietTables} quiet, ${s.unknownTables} unknown), ${s.products} products (${s.activeProducts} with actives). Origin: ${origin}.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
