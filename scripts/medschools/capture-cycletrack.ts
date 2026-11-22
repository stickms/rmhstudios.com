/**
 * FINDINGS (CycleTrack feasibility spike, 2026-11-20). Consulted by Tasks 5, 8, 9.
 * Politeness: robots.txt is `Allow: /` with `Disallow: /amcas/account/` and `/_internal/`; never touch those.
 * Fixtures live in features/medschools/scrape/adapters/cycletrack/__fixtures__/. Bodies only; the csrf-token meta and
 * the hidden `_csrf_token` form input are stripped (they are session-derived).
 *
 * (a) /explorer lists 238 school keys (`/explorer/school/<key>`) with logos only, NO city/state. Location comes from
 *     each school page <title>: "<Name> <MD|DO> Admissions Data (<City>, <ST>) | CycleTrack" (HTML-escaped, e.g.
 *     "Texas A&amp;M University MD Admissions Data (Bryan, TX)"). The registry builder must read each page title.
 *     /sitemap.xml lists 253 URLs (school + ?view=historical variants) and spells keys as CycleTrack does,
 *     including the typo "Massachussetts"; the key, not the name, is the identity.
 * (b) `Texas A&M`: both `/explorer/school/Texas%20A%26M` and the raw `/explorer/school/Texas%20A&M` return 200 with
 *     identical content (differences are only CSRF/Cloudflare nonces). sitemap.xml uses `Texas%20A&amp;M` (= `Texas%20A&M`).
 *     => Task 5 schoolUrl: encodeURIComponent(key) is SAFE (use it; it also covers `A.T.%20Still%20-%20Arizona`).
 * (c) /explorer/school/<key>?view=historical does NOT use the "daily milestone observations" tables. It is the embedded
 *     MDApplicants archive: a per-AMCAS-submission-year report-count table (class `timeline-table`, caption "Reported
 *     AMCAS submission year...", rows `<th scope=row>YYYY</th><td><span class=timeline-count>N</span>...`) plus
 *     aggregates. => SUPERSEDED by R14: no parseHistoricalPage; Task 8 backfills from school pages + summary.json instead. Years with <3 reporters are
 *     omitted, so the table is not gap-free.
 * (d) JSON endpoints:
 *     USE  /explorer/school/<key>/summary.json?program=reg|phd  Documented shape (schemaVersion 1):
 *          {availability, cycle:"2026-2027", daily:[{date:"YYYY-MM-DD", observationCounts:{Acceptance,Interview,
 *          Rejection,Secondary,Waitlist}}], observationCounts:{totals}, program:"MD", school:{key,name}, generatedAt,
 *          freshness:{staleAfterHours:2,status}, limitations, sourceUrl, definitionsUrl}. Counts only: NO GPA/MCAT/
 *          percent fields. Same data as the school-page daily tables (HTML stays primary; this is a cross-check).
 *     SKIP /static/explorer_graphs/mcat_gpa_<id>_reg.JSON  Plotly figure: 3 scatter traces (Applied / Interview
 *          Received / Accepted) of per-applicant x(GPA), y(MCAT) points (2578/190/55 for Yale). Individual-level, not
 *          medians or ranges. Not stored.
 *     SKIP /static/explorer_graphs/status_<id>_reg_curr.JSON  Plotly histogram traces (Secondary/Interview/Rejection/
 *          Waitlist/Acceptance) whose `x` is a raw array of per-event ISO dates (individual events). Redundant with
 *          the daily tables. No interview->acceptance percentage anywhere.
 *     => Task 5 parseStatsJson: SKIP; GPA/MCAT medians, ranges and interview->acceptance % stay null this phase.
 * (e) DO pages use the same markup as MD: program blocks `.md_info` (the regular MD/DO program) and `.phd_info`
 *     (MD/PhD), hidden via `.school-page[data-program=...]`. DO caption: "DO daily milestone observations,
 *     2026-2027. Dates retain the chart calendar; counts are not unique applicants." (MD: "MD daily ..."). The program
 *     label is the caption prefix / title, not a class. Fixture: atsu-arizona.html.
 * (f) USE (yearly counts only) /historical/mdapplicants/schools/<id>. Index mdapplicants-index.html lists 186 schools
 *     as `<a href=.../schools/N>Name</a> MD|DO`. A school page carries a per-AMCAS-year report-count table (same shape
 *     as (c)), total report count, outcome totals, median GPA/MCAT and aggregate demographics (groups <3 hidden).
 *     It carries NO per-event dates (only year buckets plus one "Profile snapshot" date) and NO usernames or
 *     per-applicant profiles. SUPERSEDED by R13: Task 9 is dropped from phase 1 (yearly totals only; R4 forbids placeholder dates). Fixture: mdapplicants-school.html
 *     (school 146, A.T. Still Kirksville, DO).
 * (g) Validators: HTML pages send no ETag or Last-Modified (cache-control: private, no-store, Vary: Cookie); only the
 *     static graph JSON has ETag/Last-Modified. Conditional GET is unavailable for pages; use the page's "Hourly update
 *     generated <time datetime=...>" stamp (and summary.json generatedAt) to skip unchanged work.
 * Fixture names are unchanged from the plan.
 *
 * Usage: pnpm exec tsx scripts/medschools/capture-cycletrack.ts [--force]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDSCHOOLS_USER_AGENT, SOURCES } from '../../features/medschools/scrape/sources';

const ORIGIN = SOURCES.CYCLETRACK.origin;
const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../features/medschools/scrape/adapters/cycletrack/__fixtures__',
);
const MAX_REQUESTS = 12;
const SPACING_MS = 1100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stripCsrf = (body: string) =>
  body
    .split('\n')
    .filter((l) => !l.includes('name="csrf-token"') && !l.includes('name="_csrf_token"'))
    .join('\n');

interface Target {
  path: string;
  file: string;
}

function stampFromYale(): string {
  const html = readFileSync(join(FIXTURES, 'yale.html'), 'utf8');
  const m = html.match(/explorer_graphs\/[a-z_0-9]+\.JSON\?v=([^"'&\s]+)/);
  if (!m?.[1]) throw new Error('no ?v= stamp in yale.html');
  return m[1];
}

function firstMdApplicantsSchool(): string {
  const html = readFileSync(join(FIXTURES, 'mdapplicants-index.html'), 'utf8');
  const m = html.match(/href="(\/historical\/mdapplicants\/schools\/\d+)"/);
  if (!m?.[1]) throw new Error('no school link in mdapplicants-index.html');
  return m[1];
}

function targets(): Target[] {
  const v = stampFromYale();
  return [
    { path: '/robots.txt', file: 'robots.txt' },
    { path: '/explorer/school/Yale?view=historical', file: 'yale-historical.html' },
    { path: '/explorer/school/A.T.%20Still%20-%20Arizona', file: 'atsu-arizona.html' },
    { path: '/explorer/school/Texas%20A%26M', file: 'texas-am-encoded.html' },
    { path: '/explorer/school/Texas%20A&M', file: 'texas-am-raw.html' },
    { path: '/explorer/school/Yale/summary.json?program=reg', file: 'yale-summary.json' },
    { path: '/explorer/school/Yale/summary.json?program=phd', file: 'yale-summary-phd.json' },
    { path: `/static/explorer_graphs/mcat_gpa_155_reg.JSON?v=${v}`, file: 'yale-mcat-gpa-reg.json' },
    { path: `/static/explorer_graphs/status_155_reg_curr.JSON?v=${v}`, file: 'yale-status-reg-curr.json' },
    { path: firstMdApplicantsSchool(), file: 'mdapplicants-school.html' },
  ];
}

async function main() {
  const force = process.argv.includes('--force');
  const list = targets();
  if (list.length > MAX_REQUESTS) throw new Error('target list exceeds --max-time guard');
  mkdirSync(FIXTURES, { recursive: true });
  let n = 0;
  for (const t of list) {
    const out = join(FIXTURES, t.file);
    if (existsSync(out) && !force) {
      console.log(`skip ${t.file} (exists; --force to overwrite)`);
      continue;
    }
    if (n > 0) await sleep(SPACING_MS);
    n++;
    const res = await fetch(`${ORIGIN}${t.path}`, {
      headers: { 'user-agent': MEDSCHOOLS_USER_AGENT },
      signal: AbortSignal.timeout(SOURCES.CYCLETRACK.timeoutMs),
    });
    console.log(
      `${res.status} ${t.path} etag=${res.headers.get('etag')} last-modified=${res.headers.get('last-modified')}`,
    );
    if (res.status === 403 || res.status === 429) {
      console.error('blocked; stopping without retry');
      process.exit(2);
    }
    const body = await res.text();
    writeFileSync(out, stripCsrf(body));
    if (!res.ok) console.warn(`  non-2xx body saved for inspection: ${t.file}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
