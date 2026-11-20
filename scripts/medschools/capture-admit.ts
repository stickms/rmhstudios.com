/**
 * FINDINGS (Admit.org feasibility spike, 2026-11-20). Consulted by Tasks 3, 5, 6.
 * Requests: robots.txt, two feeds, 4 profile lookups + 1 nonexistent, 3 stats, 2 interview pages, 3 school pages = 16
 * live POST/GET calls; plus 4 manual probes (op-name check, limit 101, offset 100) and static JS/HTML from med.admit.org
 * to read the web client's GraphQL documents. Real fixtures are all sanitised; the two *-hostile.json are hand-written.
 *
 * (a) api.admit.org/robots.txt is HTTP 404 ("Cannot GET /robots.txt", Express HTML): no robots file, so no Disallow;
 *     POST /graphql is permitted by absence. Spec's 1 req/s spacing, UA and Origin still apply. med.admit.org/ 307s to
 *     /community. The GraphQL op is POST https://api.admit.org/graphql with Origin: https://med.admit.org; reachable
 *     without login; responses are `cache-control: no-store`, HTTP 200 even for GraphQL errors.
 * (b) The feed op is `getRecentSchoolCycleUpdates($filterOwnSchools: Boolean!, $slug: String!)`; "all schools" is the
 *     literal slug "allSchools" (not null; `slug` is `String!`), per-school is the school slug. It returns the latest
 *     ~100 rows (all-schools) / 13 (Harvard), newest first. EVERY row carries school.slug (100/100). user_id is a
 *     uuid on every row (0 null); cycle_update_id is a uuid. current_status_date is ALWAYS full ISO-8601 UTC with
 *     milliseconds and Z (`2026-11-20T12:38:16.103Z`); 0 date-only values in 100 rows; it is a real timestamp, not
 *     midnight (the 04:00:05.573Z seen at the brief's capture was just a time of day), so the spec's local-midnight
 *     assumption does NOT hold; the adapter must not floor to a day boundary without a rule. current_status values seen:
 *     ACCEPTED, REJECTED, WAITLISTED, INTERVIEW, HOLD (the MedEventType mapping per P1 is therefore ACCEPTED->ACCEPTANCE,
 *     REJECTED->REJECTION, WAITLISTED->WAITLIST, INTERVIEW, HOLD; SECONDARY/WITHDRAWN were not seen in 100 rows, so map
 *     unknown statuses to a counted skip, never a throw). The web client's own query asks for user_display_name,
 *     user_profile_image_url, reactions and logged_in_user_reactions; ours omits them.
 * (c) md_phd: REVISES D1 slightly. The brief's op `getCycleTrackProfileByUserId(userId: String!){ md_phd }` EXISTS and
 *     works (the web client's own profile query is `getUserMedicalProfile`, which is auth-scoped to the viewer; use the
 *     brief's op). Shapes observed over 4 real feed users + 1 nonexistent id: `md_phd: true` (1), `md_phd: null` (3;
 *     profile object exists, flag unset), profile `null` (nonexistent uuid, no `errors`). `md_phd: false` and GraphQL
 *     `errors` were NOT observed for these (the capture is 5 lookups; false may exist). Treat null / false / profile-null
 *     identically as "not MD/PhD (unknown)"; only `=== true` flags the MD/PhD program.
 * (d) getSchoolStats takes no cycle/year argument and its rows carry no year field. total_interview_count on the
 *     interview overview equals interview_number in stats (Harvard 757 on both), so stats look CUMULATIVE across cycles
 *     (not the current cycle): treat the rows as an undated aggregate, not a per-cycle figure. Percent scale is 0-1
 *     (application_to_interview_pct max 0.63, interview_to_admitted_pct max 0.97, in-state application_to_interview_pct
 *     max 1); GPA is 0-4, MCAT 472-528 integer, hours are numbers (clinical_hours 712.5). `id` is a number (5102).
 *     residence_type is the lowercase `global` | `in_state` | `out_of_state` while the request enum is
 *     GLOBAL | IN_STATE | OUT_OF_STATE. Row counts at pageSize 999: GLOBAL 237, IN_STATE 236, OUT_OF_STATE 236 (page 1);
 *     0 null school.slug in any. Fixtures keep the first 5 rows.
 * (e) Interview overview (Harvard, the one captured): interview_format "STANDARD", interview_type "OPEN_FILE" (only
 *     these two enum values were observed; the full enum is unknown: store as free strings), most_common_interview_sessions
 *     1 (number). avg_interview_difficulty observed 1.5 to 6.89 over 129 schools (10 of 239 null): the scale looks like
 *     1-10, NOT 1-5; keep the number as published and do not clamp.
 * (f) GetInterviewsForSchool question `id` is a NUMBER (8368), `body` plain text (0 of 40 carried markup, entities or
 *     newlines), `votes` an integer. The web query also selects `user_vote` (the caller's vote): we omit it. Variable is
 *     `schoolSlug: String!` (the web client's other op GetMedicalInterviewQuestions is the logged-in user's own notes:
 *     not used). Feedback is three string arrays: positive, negative, before_interview.
 * (g) getMedicalInterviewSchoolsOverview: `limit` is `Int!` and is CAPPED AT 100: limit 101 returns HTTP 200 with
 *     errors[0].message "Limit must be an integer between 1 and 100" and no data. totalCount 239; pages 0/100/200 give
 *     100/100/39 rows. sortColumn SCHOOL_RANK (also DIFFICULTY), sortOrder "ASC"|"DESC". No rate-limit or Retry-After
 *     header appeared on any response across the run (headers checked: ratelimit*, retry-after, x-rate*).
 * (h) None of the 239 overview schools is Canadian: states are the 50 states, DC and Puerto Rico (4 PR schools:
 *     san-juan-bautista-school-of-medicine, university-of-puerto-rico-school-of-medicine, universidad-central-del-caribe,
 *     ponce-health-sciences-university). Whether those are in the registry is a Task 3/5 slug-matching question; the
 *     DO/MD split is not exposed. Admit slugs are long (e.g. university-of-california-los-angeles-david-geffen-school-of-medicine).
 *
 * Usage: pnpm exec tsx scripts/medschools/capture-admit.ts [--force]
 * Politeness: sequential, >=1.6 s apart, UA + Origin from sources.ts, hard cap 25 requests, never logs in. Nothing
 * person-shaped is saved or printed: user ids are replaced with user-001... placeholders (same id, same placeholder)
 * and any display-name / avatar / username key is deleted before every write.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type AdmitOperation,
  INTERVIEW_FEEDBACK,
  INTERVIEW_OVERVIEW,
  INTERVIEW_QUESTIONS,
  INTERVIEW_SCHOOLS,
  PROFILE_FLAG,
  RECENT_UPDATES,
  SCHOOL_STATS,
} from '../../features/medschools/scrape/adapters/admit/queries';
import { ADMIT_GRAPHQL_PATH, SOURCES } from '../../features/medschools/scrape/sources';

const SRC = SOURCES.ADMIT;
const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../features/medschools/scrape/adapters/admit/__fixtures__',
);
const MAX_REQUESTS = 25;
const SPACING_MS = 1600;
const MAX_PROFILE_LOOKUPS = 8;
const HARVARD = 'harvard-medical-school';
const NONEXISTENT_ID = '00000000-0000-4000-8000-000000000000';
const force = process.argv.includes('--force');

let requests = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const written: string[] = [];
const notes: string[] = [];

async function paced<T>(fn: () => Promise<T>): Promise<T> {
  if (requests >= MAX_REQUESTS) throw new Error(`request cap ${MAX_REQUESTS} reached; aborting`);
  if (requests > 0) await sleep(SPACING_MS);
  requests += 1;
  return fn();
}

const ids = new Map<string, string>();
const placeholder = (real: string) => {
  let p = ids.get(real);
  if (!p) {
    p = `user-${String(ids.size + 1).padStart(3, '0')}`;
    ids.set(real, p);
  }
  return p;
};

/** Replace user ids with stable placeholders and drop every person-shaped key. */
function sanitise(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sanitise);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) {
      if (/display_name|profile_image|avatar|username/i.test(k)) continue;
      out[k] = (k === 'user_id' || k === 'userId') && typeof val === 'string' ? placeholder(val) : sanitise(val);
    }
    return out;
  }
  return v;
}

function save(name: string, body: unknown) {
  const file = join(FIXTURES, name);
  if (existsSync(file) && !force) throw new Error(`${name} exists; pass --force to overwrite`);
  writeFileSync(file, JSON.stringify(sanitise(body), null, 2) + '\n');
  written.push(name);
}

interface GqlResult {
  status: number;
  body: any;
  headers: Record<string, string>;
}

async function gql(op: AdmitOperation, variables?: Record<string, unknown>): Promise<GqlResult> {
  const res = await paced(() =>
    fetch(SRC.origin + ADMIT_GRAPHQL_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': SRC.userAgent, ...SRC.headers },
      body: JSON.stringify({ operationName: op.operationName, query: op.query, variables: variables ?? op.variables }),
      signal: AbortSignal.timeout(SRC.timeoutMs),
    }),
  );
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    if (/ratelimit|retry-after|x-rate/i.test(k)) headers[k] = v;
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { nonJson: text.slice(0, 200) };
  }
  if (Object.keys(headers).length) notes.push(`${op.operationName}: rate headers ${JSON.stringify(headers)}`);
  return { status: res.status, body, headers };
}

const truncRows = (body: any, field: string, n: number) => {
  const rows = body?.data?.[field];
  if (!Array.isArray(rows)) return { total: 0, body };
  const total = rows.length;
  return { total, body: { ...body, data: { ...body.data, [field]: rows.slice(0, n) } } };
};

async function main() {
  mkdirSync(FIXTURES, { recursive: true });

  const robots = await paced(() =>
    fetch(SRC.origin + '/robots.txt', {
      headers: { 'user-agent': SRC.userAgent, ...SRC.headers },
      signal: AbortSignal.timeout(SRC.timeoutMs),
    }),
  );
  const robotsText = (await robots.text()).slice(0, 400);
  save('robots.json', { status: robots.status, contentType: robots.headers.get('content-type'), body: robotsText });
  notes.push(`robots.txt status ${robots.status}`);

  // Feeds. The real user_ids stay in memory only; fixtures get placeholders.
  const all = await gql(RECENT_UPDATES);
  const rows: any[] = all.body?.data?.getRecentSchoolCycleUpdates ?? [];
  const realIds = [...new Set(rows.map((r) => r.user_id).filter((u): u is string => typeof u === 'string'))];
  const statuses = new Set(rows.map((r) => r.current_status));
  const dates = rows.map((r) => String(r.current_status_date));
  notes.push(
    `feed all: ${rows.length} rows, ${realIds.length} distinct users, statuses ${[...statuses].join('|')}, ` +
      `rows with school.slug ${rows.filter((r) => r.school?.slug).length}, ` +
      `date-only values ${dates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).length}, sample date ${dates[0]}, ` +
      `null user_id ${rows.filter((r) => r.user_id == null).length}`,
  );
  const allBody = all.body;
  save('recent-updates-all.json', allBody);

  const harvard = await gql(RECENT_UPDATES, { filterOwnSchools: false, slug: HARVARD });
  save('recent-updates-harvard.json', harvard.body);

  // Profile flags: walk distinct ids until one is md_phd true; keep one true and one null.
  let gotTrue = false;
  let gotNull = false;
  const shapes = new Map<string, number>();
  for (const real of realIds.slice(0, MAX_PROFILE_LOOKUPS)) {
    if (gotTrue && gotNull) break;
    const r = await gql(PROFILE_FLAG, { userId: real });
    const prof = r.body?.data?.getCycleTrackProfileByUserId;
    const shape = r.body?.errors ? `errors:${JSON.stringify(r.body.errors.map((e: any) => e.extensions?.code ?? e.message))}` :
      prof === null ? 'profile-null' : `md_phd=${JSON.stringify(prof?.md_phd)}`;
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    if (prof?.md_phd === true && !gotTrue) {
      save('profile-flag-true.json', r.body);
      gotTrue = true;
    } else if (prof && prof.md_phd == null && !gotNull) {
      save('profile-flag-null.json', r.body);
      gotNull = true;
    } else if (prof?.md_phd === false) notes.push('md_phd=false observed');
  }
  notes.push(`profile shapes seen: ${JSON.stringify([...shapes])}`);
  const missing = await gql(PROFILE_FLAG, { userId: NONEXISTENT_ID });
  save('profile-flag-missing.json', missing.body);
  if (!gotTrue) notes.push('NO md_phd:true found within the lookup cap');
  if (!gotNull) notes.push('NO md_phd:null profile found within the lookup cap');

  // School stats: three residence filters, truncated to 5 rows.
  for (const [filterBy, name] of [
    ['GLOBAL', 'global'],
    ['IN_STATE', 'in-state'],
    ['OUT_OF_STATE', 'out-of-state'],
  ] as const) {
    const r = await gql(SCHOOL_STATS, { ...SCHOOL_STATS.variables, filterBy });
    const t = truncRows(r.body, 'getSchoolStats', 5);
    const all2: any[] = r.body?.data?.getSchoolStats ?? [];
    notes.push(
      `stats ${filterBy}: totalRows ${t.total}, null slugs ${all2.filter((x) => !x.school?.slug).length}, ` +
        `max interview_to_admitted_pct ${Math.max(...all2.map((x) => Number(x.interview_to_admitted_pct) || 0))}, ` +
        `max application_to_interview_pct ${Math.max(...all2.map((x) => Number(x.application_to_interview_pct) || 0))}, ` +
        `residence_types ${[...new Set(all2.map((x) => x.residence_type))].join('|')}, ` +
        `max application_number ${Math.max(...all2.map((x) => Number(x.application_number) || 0))}`,
    );
    save(`school-stats-${name}.json`, t.body);
  }

  // Interview overview pages (limit 100 cap, 2 pages).
  for (const offset of [0, 200]) {
    const r = await gql(INTERVIEW_SCHOOLS, { ...INTERVIEW_SCHOOLS.variables, limit: 100, offset });
    const sch: any[] = r.body?.data?.getMedicalInterviewSchoolsOverview?.schools ?? [];
    notes.push(
      `interview-schools offset ${offset}: errors ${JSON.stringify(r.body?.errors?.map((e: any) => e.message) ?? null)}, ` +
        `totalCount ${r.body?.data?.getMedicalInterviewSchoolsOverview?.totalCount}, rows ${sch.length}, ` +
        `states ${[...new Set(sch.map((s) => s.school?.state))].join(',')}`,
    );
    save(`interview-schools-${offset}.json`, r.body);
  }

  const slugVars = { schoolSlug: HARVARD };
  const ov = await gql(INTERVIEW_OVERVIEW, slugVars);
  save('interview-overview-harvard.json', ov.body);
  const qs = await gql(INTERVIEW_QUESTIONS, slugVars);
  const questions: any[] = qs.body?.data?.getInterviewsForSchool?.questions ?? [];
  notes.push(
    `questions: ${questions.length}, id type ${typeof questions[0]?.id}, with markup ${questions.filter((q) => /<[a-z][^>]*>|&[a-z]+;|\*\*|\n/i.test(String(q.body))).length}`,
  );
  save('interview-questions-harvard.json', qs.body);
  const fb = await gql(INTERVIEW_FEEDBACK, slugVars);
  save('interview-feedback-harvard.json', fb.body);

  console.log(`${requests} requests`);
  console.log('fixtures:', written.join(', '));
  console.log('notes:\n  ' + notes.join('\n  '));
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  console.log(`${requests} requests before failure; written: ${written.join(', ')}`);
  process.exit(1);
});
