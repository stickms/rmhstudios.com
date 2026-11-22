/**
 * Builds data/medschools/sdn-aliases.json: pairs the SDN school-thread titles of the current MD (1198) and DO
 * (1199) forums, and the school-index summary pages, with CycleTrack registry schools. A human settles whatever
 * lands in `review` through data/medschools/sdn-overrides.json ({ cycletrackKey } or { ignore: true }, keyed by the
 * stem or by `summary:<CODE>/<slug>`) and re-runs; exits 2 while `review` is non-empty.
 *
 * Politeness: sequential, forums at SOURCES.SDN_FORUMS.spacingMs, www at SOURCES.SDN_WWW.spacingMs, at most 12
 * listing pages per forum. SDN_ALIAS_CACHE=<file> keeps the fetched titles and school index, so reruns while
 * settling overrides cost no requests.
 *
 * Usage: pnpm exec tsx scripts/medschools/build-sdn-aliases.ts
 */
/* eslint-disable no-console -- CLI script */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertPage, forumListingUrl, parseForumListing } from '../../features/medschools/scrape/adapters/sdn';
import { matchSdnStems, type SdnOverride } from '../../features/medschools/engine/sdn-match';
import { parseThreadTitle } from '../../features/medschools/engine/sdn-title';
import { createPoliteHost } from '../../features/medschools/scrape/http';
import type { RegistryFile, SdnAliasFile } from '../../features/medschools/scrape/registry';
import { SOURCES } from '../../features/medschools/scrape/sources';

const DATA = join(process.cwd(), 'data/medschools');
const MAX_PAGES = 12;
const INDEX_PATH = '/schools-database/medical-school';
const read = <T>(name: string): T => JSON.parse(readFileSync(join(DATA, name), 'utf8')) as T;

interface Fetched {
  titles: Array<{
    title: string;
    degree: 'MD' | 'DO';
  }>;
  summaries: Array<{
    code: string;
    slug: string;
    name: string;
  }>;
}

/** The school index embeds its rows as positional arrays under `fields`; keep US schools only (Canada is out). */
export function parseSchoolIndex(html: string): Fetched['summaries'] {
  const m = /<script[^>]*id="schools-database-data"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) throw new Error('school index: data script not found');
  const data = JSON.parse(m[1]!) as {
    fields: string[];
    rows: unknown[][];
  };
  const at = (f: string) => data.fields.indexOf(f);
  const [iName, iUrl, iCountry] = [at('name'), at('url'), at('country')];
  if (iName < 0 || iUrl < 0 || iCountry < 0) throw new Error('school index: expected fields missing');
  const out: Fetched['summaries'] = [];
  for (const row of data.rows) {
    if (row[iCountry] !== 'US') continue;
    const parts = String(row[iUrl]).split('/').filter(Boolean);
    const slug = parts.at(-1);
    const code = parts.at(-2);
    if (!code || !slug) continue;
    out.push({
      code,
      slug,
      name: String(row[iName]),
    });
  }
  return out;
}

async function fetchAll(): Promise<Fetched> {
  const forums = createPoliteHost(SOURCES.SDN_FORUMS).session({
    spacingMs: SOURCES.SDN_FORUMS.spacingMs,
  });
  const www = createPoliteHost(SOURCES.SDN_WWW).session({
    spacingMs: SOURCES.SDN_WWW.spacingMs,
  });
  const cfg = read<{
    current: Array<{
      node: number;
      degree: 'MD' | 'DO';
    }>;
  }>('sdn-forums.json');
  const titles: Fetched['titles'] = [];
  for (const forum of cfg.current) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await forums.get(forumListingUrl(forum.node, page));
      const body = assertPage(res, forums, `listing ${forum.node} p${page}`);
      forums.noteSuccess();
      const { threads, hasNext } = parseForumListing(body);
      for (const t of threads)
        titles.push({
          title: t.title,
          degree: forum.degree,
        });
      if (!hasNext) break;
    }
  }
  const res = await www.get(INDEX_PATH);
  const summaries = parseSchoolIndex(assertPage(res, www, 'school index'));
  console.log(
    `fetched ${titles.length} titles, ${summaries.length} index rows (${forums.requests} forum + ${www.requests} www requests)`,
  );
  return {
    titles,
    summaries,
  };
}

async function main() {
  const cache = process.env.SDN_ALIAS_CACHE;
  let fetched: Fetched;
  if (cache && existsSync(cache)) {
    fetched = JSON.parse(readFileSync(cache, 'utf8')) as Fetched;
    console.log(`sdn: ${fetched.titles.length} titles (cached)`);
  } else {
    fetched = await fetchAll();
    if (cache) writeFileSync(cache, JSON.stringify(fetched));
  }

  const stems = new Map<string, 'MD' | 'DO'>();
  let unparsable = 0;
  for (const t of fetched.titles) {
    const parsed = parseThreadTitle(t.title);
    if (!parsed) {
      unparsable++;
      continue;
    }
    stems.set(parsed.stem, t.degree);
  }
  console.log(`stems ${stems.size}, unparsable titles skipped ${unparsable}`);

  const overrides = read<Record<string, SdnOverride>>('sdn-overrides.json');
  const { aliases, review, ignored } = matchSdnStems({
    stems: [...stems].map(([stem, degree]) => ({
      stem,
      degree,
    })),
    schools: read<RegistryFile>('schools.json').schools,
    summaries: fetched.summaries,
    overrides,
  });
  console.log(`matched ${aliases.length}, review ${review.length}, ignored ${ignored.length}`);
  for (const r of review) console.log(`review: ${r}`);
  if (review.length > 0) {
    process.exitCode = 2;
    return;
  }
  const out: SdnAliasFile = {
    generatedAt: new Date().toISOString(),
    ignoredStems: ignored,
    aliases,
  };
  writeFileSync(join(DATA, 'sdn-aliases.json'), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`wrote sdn-aliases.json (${aliases.length})`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
