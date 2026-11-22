/**
 * Fetches school crests from Admit.org and writes them as static 96x96 WebP files:
 *   public/images/medschools/crests/<slug>.webp   (one per registry school)
 *   data/medschools/crests.json                   { generatedAt, source: 'admit', slugs }
 *
 * Source: Admit's `getAllCycleResults` school objects (schools only; no user field is selected). Each Admit school is
 * paired with a registry slug through data/medschools/admit-aliases.json; unmatched schools are listed and skipped.
 * Every request goes through a polite host (robots.txt, spacing, https only, the crest's own origin only).
 *
 * Rerunnable: it rewrites every file it can fetch and keeps (and keeps listing) a crest it cannot refetch this run.
 *
 * Usage: pnpm exec tsx scripts/medschools/fetch-admit-crests.ts
 */
/* eslint-disable no-console -- CLI script */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAdmitClient } from '../../features/medschools/scrape/adapters/admit';
import { fetchCrest, planCrests } from '../../features/medschools/scrape/crests';
import { createPoliteHost, type PoliteClient } from '../../features/medschools/scrape/http';
import type { AdmitAliasFile, RegistryFile } from '../../features/medschools/scrape/registry';
import { SOURCES } from '../../features/medschools/scrape/sources';

const ROOT = process.cwd();
const DATA = join(ROOT, 'data/medschools');
const OUT = join(ROOT, 'public/images/medschools/crests');
const read = <T>(name: string): T => JSON.parse(readFileSync(join(DATA, name), 'utf8')) as T;

async function main() {
  const session = createPoliteHost(SOURCES.ADMIT).session({ spacingMs: 1500 });
  const client = createAdmitClient(session, { secret: 'fetch-admit-crests-unused' });
  const admit = await client.listSchoolCrests();
  console.log(`admit: ${admit.length} schools (${session.requests} requests)`);

  const aliasFile = read<AdmitAliasFile>('admit-aliases.json');
  const plan = planCrests({
    admit,
    registry: read<RegistryFile>('schools.json').schools,
    aliases: aliasFile.aliases,
    ignoredSlugs: aliasFile.ignoredSlugs ?? [],
  });
  console.log(
    `matched ${plan.jobs.length + plan.noCrest.length + plan.badUrl.length}, unmatched ${plan.unmatched.length}, ` +
      `no crest ${plan.noCrest.length}, bad url ${plan.badUrl.length}`,
  );
  for (const s of plan.unmatched) console.log(`unmatched: ${s}`);

  mkdirSync(OUT, { recursive: true });
  // One polite host per crest origin: the host refuses any URL off its own origin.
  const sessions = new Map<string, PoliteClient>();
  const sessionFor = (url: string): PoliteClient => {
    const origin = new URL(url).origin;
    let s = sessions.get(origin);
    if (!s) {
      s = createPoliteHost({ ...SOURCES.ADMIT, origin, headers: {} }).session({ spacingMs: 1000 });
      sessions.set(origin, s);
    }
    return s;
  };

  const slugs = new Set<string>();
  const failures: string[] = [];
  let total = 0;
  let max = 0;
  for (const job of plan.jobs) {
    const result = await fetchCrest(sessionFor(job.url), job.url);
    const file = join(OUT, `${job.slug}.webp`);
    if (!result.ok) {
      failures.push(`${job.slug}: ${result.reason} (${job.url})`);
      if (existsSync(file)) slugs.add(job.slug);
      continue;
    }
    writeFileSync(file, result.webp);
    slugs.add(job.slug);
    total += result.webp.length;
    max = Math.max(max, result.webp.length);
  }
  for (const f of failures) console.log(`failed: ${f}`);
  for (const s of plan.noCrest) console.log(`no crest: ${s}`);

  const sorted = [...slugs].sort();
  writeFileSync(
    join(DATA, 'crests.json'),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), source: 'admit', slugs: sorted }, null, 2)}\n`,
  );
  console.log(`wrote ${sorted.length} crests, ${total} bytes this run, max ${max} bytes`);
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
