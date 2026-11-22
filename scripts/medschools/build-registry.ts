/**
 * Builds data/medschools/schools.json from CycleTrack: the sitemap, the
 * /explorer/first table (degree) and each school page's <title> (location,
 * capture finding (a)). One-off and slow on purpose (backfill spacing through
 * the polite host). Settle anything in `review` via data/medschools/overrides.json
 * and re-run; exits 2 while `review` is non-empty.
 *
 * Usage: pnpm exec tsx scripts/medschools/build-registry.ts
 */
/* eslint-disable no-console -- CLI script */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFirstTable, parseSitemap, schoolUrl } from '../../features/medschools/scrape/adapters/cycletrack';
import { createPoliteHost } from '../../features/medschools/scrape/http';
import { buildRegistry, type RegistryFile, type RegistrySchool } from '../../features/medschools/scrape/registry';
import { SOURCES } from '../../features/medschools/scrape/sources';

const DATA = join(process.cwd(), 'data/medschools');

async function main() {
  const client = createPoliteHost(SOURCES.CYCLETRACK).session({
    spacingMs: SOURCES.CYCLETRACK.backfillSpacingMs,
  });
  const fetchOk = async (path: string): Promise<string> => {
    const res = await client.get(path);
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    client.noteSuccess();
    return res.body;
  };

  const { schoolKeys } = parseSitemap(await fetchOk('/sitemap.xml'));
  const { rows: first } = parseFirstTable(await fetchOk('/explorer/first'));
  console.log(`sitemap: ${schoolKeys.length} schools; first table: ${first.length} rows`);

  const titles: Record<string, string> = {};
  for (const [i, key] of schoolKeys.entries()) {
    try {
      titles[key] = await fetchOk(schoolUrl(key));
    } catch (e) {
      console.warn(`skip ${key}: ${(e as Error).message}`);
    }
    if ((i + 1) % 25 === 0) console.log(`fetched ${i + 1}/${schoolKeys.length}`);
  }

  const overrides = JSON.parse(readFileSync(join(DATA, 'overrides.json'), 'utf8')) as Record<
    string,
    Partial<RegistrySchool>
  >;
  const { schools, excluded, review } = buildRegistry({
    schoolKeys,
    first,
    titles,
    overrides,
  });

  const file: RegistryFile = {
    generatedAt: new Date().toISOString(),
    schools,
  };
  writeFileSync(join(DATA, 'schools.json'), `${JSON.stringify(file, null, 2)}\n`);
  console.log(`wrote ${schools.length} schools`);
  console.log('excluded:', JSON.stringify(excluded));
  console.log('review:', JSON.stringify(review));
  if (review.length > 0) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
