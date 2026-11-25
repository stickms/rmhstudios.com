import { globSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Phase D privacy pins, read from the source (the thing to hold is the absence of a call). The builder writes nothing,
 * caches nothing and logs no text; the stats are read only by their own module and the builder; no public reader can
 * reach them; and the candidate reader is public data only.
 */
const read = (f: string) => readFileSync(f, 'utf8');
const code = (f: string) =>
  read(f)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

const BUILDER = [
  ...globSync('features/medschools/api/builder/*.server.ts'),
  ...globSync('features/medschools/engine/builder/*.ts'),
  'features/medschools/api/medschools.me.list-builder.server.ts',
]
  .map(String)
  .filter((f) => !/\.test\.|fixtures\.ts$/.test(f))
  .sort();

describe('list builder privacy pins', () => {
  it('finds the files', () => {
    expect(BUILDER.length).toBeGreaterThanOrEqual(7);
  });

  it('writes nothing: no create, update, upsert or delete, no raw SQL', () => {
    for (const f of BUILDER) {
      expect(code(f), f).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/);
      expect(code(f), f).not.toMatch(/\$executeRaw|\$queryRaw/);
    }
  });

  it('caches nothing and declares no cache', () => {
    for (const f of BUILDER) expect(code(f), f).not.toMatch(/\bcached\w*\(|\blruL1\(|microCache|putL1\(|redis|\bcache\s*:/i);
    for (const f of ['features/medschools/api/medschools.me.stats.server.ts', 'features/medschools/api/medschools.me.list-builder.save.server.ts']) {
      expect(code(f), f).not.toMatch(/\bcache\s*:|cached\(/);
    }
  });

  it('logs no text: a console call never names the request, stats, facts, reasons or the member', () => {
    for (const f of [...BUILDER, 'features/medschools/api/stats.server.ts']) {
      for (const m of code(f).matchAll(/console\.\w+\(([^;]*)\)/g)) {
        expect(m[1], `${f}: ${m[0]}`).not.toMatch(/\b(request|stats?|member|facts?|text|reasons?|picks|raw|note)\b/i);
      }
    }
  });

  it('the stats module logs nothing at all', () => {
    expect(code('features/medschools/api/stats.server.ts')).not.toMatch(/console\./);
  });

  it('the candidate reader is public data only: no tracker, list, preference, stats or user module', () => {
    const src = code('features/medschools/api/builder/candidates.server.ts');
    expect(src).not.toMatch(/tracker|lists?\.server|prefs|stats|share-sync|userId|session/);
    expect(src).not.toMatch(/medTracker|medSchoolList|medUserPrefs|medApplicant|medMcat/);
  });

  it('the builder sends the model what statsForBuilder returns, which selects no note or activity title', () => {
    const src = code('features/medschools/api/stats.server.ts');
    const fn = /export async function statsForBuilder[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
    expect(fn).not.toMatch(/note|title|activities|cpbs|cars|bbls|psbb/);
  });
});

describe('the stats never reach a public path', () => {
  const STATS_MODELS = /medApplicantProfile|medMcatAttempt|medApplicantHours|medApplicantActivity/;
  /** The stats module or its schemas, by any relative or alias specifier. */
  const STATS_MODULE = /(?:medschools\/api\/|\.\/|\.\.\/)stats(?:\.server|-schemas)['"]/;
  const allowed = new Set([
    'features/medschools/api/stats.server.ts',
    'features/medschools/api/builder/build.server.ts',
    'features/medschools/api/export.server.ts',
    'features/medschools/api/medschools.me.stats.server.ts',
    'features/medschools/api/medschools.me.stats.onboarding.server.ts',
    'features/medschools/api/medschools.me.list-builder.server.ts',
    'features/medschools/api/medschools.me.list-builder.save.server.ts',
    'features/medschools/medschools.contract.ts',
    'lib/account/erasure-medschools.server.ts',
  ]);
  const sources = [
    ...globSync('features/medschools/**/*.{ts,tsx}'),
    ...globSync('lib/**/*.server.ts'),
    ...globSync('server/**/*.ts'),
    ...globSync('app/routes/**/*.{ts,tsx}'),
  ]
    .map(String)
    .filter((f) => !/\.test\.|__tests__|test-support|fixtures/.test(f));

  it('only the stats module, the builder, the export, the me/** routes and erasure read the stats models or module', () => {
    const hits = sources.filter((f) => !allowed.has(f) && (STATS_MODELS.test(code(f)) || STATS_MODULE.test(code(f))));
    // The UI reads them only through the me/** contract, never a server module.
    expect(hits.filter((f) => !f.startsWith('features/medschools/ui/') && !f.startsWith('app/routes/med'))).toEqual([]);
    for (const f of hits) expect(code(f), f).not.toMatch(/stats\.server['"]|prisma/);
  });

  it('no public reader or job imports them', () => {
    for (const f of [
      'features/medschools/api/read.server.ts',
      'features/medschools/api/school-facts.server.ts',
      'features/medschools/api/secondaries.server.ts',
      'features/medschools/api/live-summary.server.ts',
      ...globSync('features/medschools/scrape/run-*.ts').map(String),
      ...globSync('features/medschools/engine/stats/*.ts').map(String),
    ].filter((f) => !/\.test\./.test(f))) {
      expect(code(f), f).not.toMatch(STATS_MODELS);
      expect(code(f), f).not.toMatch(STATS_MODULE);
    }
  });
});
