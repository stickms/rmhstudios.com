/**
 * Builds the two MD-PhD data files from the research pass's records and NIH RePORTER replies (owner 2026-11-24):
 *
 *   pnpm exec tsx scripts/medschools/build-mdphd-data.ts --final <mdphd-final.json> --reporter <a.json> [--reporter <b.json> ...]
 *
 * - `data/medschools/mdphd-programs.json`: one entry per school whose program page decides it (exists true or false).
 *   A timeline is kept only when the research pass re-fetched its page and found the evidence verbatim
 *   (`verified === true`), and only when it names PhD research and a medical phase. A "no program" answer is kept only
 *   when it cites the page that was read and the pass did not flag it as low confidence; otherwise the school is unknown
 *   and shows nothing.
 * - `data/medschools/mstp-t32.json`: the active NIGMS T32 MSTP grants, matched to slugs by the hand-made
 *   `data/medschools/mstp-aliases.json`. Every core project in the RePORTER input must be named there (a grant or an
 *   exclusion with its reason), so a new grant is a decision, never a guess.
 *
 * The inputs are not committed (the research records live in a scratch folder); the outputs are, and the import
 * validates them again. Re-check the timelines with `scripts/medschools/check-mdphd.ts`.
 */
/* eslint-disable no-console -- a CLI: the report is its output. */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  normalisePattern,
  REPORTER_SEARCH_URL,
  timelineHasContent,
  type PhaseEntry,
} from '../../features/medschools/engine/mdphd';
import { mdphdProgramsFileSchema, mstpFileSchema, VETERINARY } from '../../features/medschools/scrape/mdphd';

const args = process.argv.slice(2);
const opt = (name: string): string[] => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]!] : []));
const [finalPath] = opt('--final');
const reporterPaths = opt('--reporter');
if (!finalPath || reporterPaths.length === 0) {
  console.error('usage: build-mdphd-data.ts --final <mdphd-final.json> --reporter <reply.json> [--reporter ...]');
  process.exit(2);
}

const CHECKED_ON = '2026-11-24';

interface FinalRecord {
  slug: string;
  checkedOn: string;
  program: { exists: boolean | null; name: string | null; url: string | null };
  timeline: {
    pattern: string | null;
    phases: PhaseEntry[];
    totalYears: number | null;
    evidence: string;
    url: string;
  } | null;
  notes?: string;
  verified?: boolean;
}

/**
 * Corrections made by hand after reading a record's evidence against its labels. Each names the record, the field and
 * why; nothing else in a record is changed.
 */
const LABEL_CORRECTIONS: Record<string, { index: number; label: string; why: string }[]> = {
  kentucky: [
    {
      index: 1,
      label: 'medical school through USMLE Step 1 in the spring of M2',
      why: 'The record labelled this phase "M1-M4"; the evidence says Track A students move to graduate school after Step 1 in M2.',
    },
  ],
};

const schools = (JSON.parse(readFileSync('data/medschools/schools.json', 'utf8')) as { schools: { slug: string }[] })
  .schools;
const known = new Set(schools.map((s) => s.slug));
const records = JSON.parse(readFileSync(finalPath, 'utf8')) as FinalRecord[];

/** A page cited over http is cited over https (the same page; the checker fetches it there). */
const secure = (u: string): string => u.replace(/^http:\/\//, 'https://');

const skipped: string[] = [];
const out = [];
for (const r of [...records].sort((a, b) => a.slug.localeCompare(b.slug))) {
  if (!known.has(r.slug)) throw new Error(`${r.slug}: not a school in data/medschools/schools.json`);
  const p = r.program;
  if (p.exists === null) continue;
  if (!p.url) {
    skipped.push(`${r.slug}: no page cited`);
    continue;
  }
  if (p.exists === false && /confidence (is )?low/i.test(r.notes ?? '')) {
    skipped.push(`${r.slug}: "no program" flagged low confidence`);
    continue;
  }
  let timeline = null;
  const t = r.timeline;
  if (p.exists && t && r.verified === true) {
    const phases = t.phases.map((ph, i) => {
      const fix = LABEL_CORRECTIONS[r.slug]?.find((c) => c.index === i);
      return { phase: ph.phase, years: ph.years, label: fix ? fix.label : ph.label };
    });
    if (timelineHasContent({ phases, totalYears: t.totalYears, evidence: t.evidence })) {
      timeline = {
        pattern: normalisePattern(t.pattern),
        phases,
        totalYears: t.totalYears,
        evidence: t.evidence,
        url: secure(t.url),
        checkedOn: r.checkedOn,
      };
    } else skipped.push(`${r.slug}: verified timeline states no layout and no length; drawn as typical`);
  }
  out.push({
    slug: r.slug,
    exists: p.exists,
    name: p.exists ? p.name : null,
    url: secure(p.url),
    checkedOn: r.checkedOn,
    timeline,
  });
}

const programs = mdphdProgramsFileSchema.parse({
  source:
    "Each school's own MD-PhD (or DO-PhD) program page, read by hand; for a school with no combined program, the school's own degree or program page.",
  method:
    'One page set per school (at most about six requests, 3 s or more apart plus jitter, the user agent MarlonJack/1.0 (contact: admin@rmhstudios.com)). A timeline is kept only when its evidence was re-fetched and found on the cited page after normalising whitespace, quotes and dashes (or, for tables, letters and digits in order); phase lengths are only those the page states, and a range stays a range in the phase label. Built by scripts/medschools/build-mdphd-data.ts.',
  checkedOn: CHECKED_ON,
  ownerDecisions: [
    "Programs differ in layout (2-4-2, 3-4-1, 1.5-4-2.5 ...): show the school's own timeline where its page states it.",
    'A program that does not state its layout is drawn as the typical 2-4-2, labelled "Typical layout; the program does not publish its own", never as the school\'s statement.',
    'Not every school has a combined program: a school whose page shows none gets one quiet row; a school not decided here shows nothing.',
    'MSTP (NIH T32) status comes from NIH RePORTER (data/medschools/mstp-t32.json); a program not found there is "not listed", never "no".',
    'Every record cites its source: the program page for existence and the timeline, RePORTER for MSTP status.',
  ],
  verifier:
    'pnpm exec tsx scripts/medschools/check-mdphd.ts re-fetches every timeline url politely and asserts the evidence is on it (run by hand; CI has no network).',
  schools: out,
});

/* ----------------------------------------------- RePORTER ----------------------------------------------- */

interface ReporterRow {
  appl_id: number;
  fiscal_year: number;
  project_num: string;
  project_title: string;
  project_end_date: string | null;
  organization: { org_name: string };
}
const aliases = JSON.parse(readFileSync('data/medschools/mstp-aliases.json', 'utf8')) as {
  grants: Record<string, { slug: string; why?: string }>;
  excluded: Record<string, string>;
};
const core = (projectNum: string): string => projectNum.replace(/^\d/, '').split('-')[0]!;
const latest = new Map<string, ReporterRow>();
for (const path of reporterPaths) {
  for (const r of (JSON.parse(readFileSync(path, 'utf8')) as { results: ReporterRow[] }).results) {
    const c = core(r.project_num);
    const had = latest.get(c);
    if (!had || r.fiscal_year > had.fiscal_year || (r.fiscal_year === had.fiscal_year && r.appl_id > had.appl_id))
      latest.set(c, r);
  }
}
const unknownCores = [...latest.keys()].filter((c) => !aliases.grants[c] && !aliases.excluded[c]);
if (unknownCores.length > 0) throw new Error(`decide these grants in mstp-aliases.json: ${unknownCores.join(', ')}`);
const missingCores = [...Object.keys(aliases.grants), ...Object.keys(aliases.excluded)].filter((c) => !latest.has(c));
if (missingCores.length > 0)
  throw new Error(`mstp-aliases.json names projects not in the input: ${missingCores.join(', ')}`);

const grants = [];
const excluded = [];
for (const [c, r] of [...latest].sort(([a], [b]) => a.localeCompare(b))) {
  const g = aliases.grants[c];
  if (!g) {
    excluded.push({ core: c, organization: r.organization.org_name, reason: aliases.excluded[c]! });
    continue;
  }
  if (!known.has(g.slug)) throw new Error(`${c}: ${g.slug} is not a school`);
  if (VETERINARY.test(r.project_title)) throw new Error(`${c}: a DVM-PhD grant cannot map to a school`);
  grants.push({
    slug: g.slug,
    core: c,
    projectNum: r.project_num,
    applId: r.appl_id,
    organization: r.organization.org_name,
    title: r.project_title.trim(),
    fiscalYear: r.fiscal_year,
    projectEnd: String(r.project_end_date).slice(0, 10),
    ...(g.why ? { why: g.why } : {}),
  });
}
grants.sort((a, b) => a.slug.localeCompare(b.slug));

const mstp = mstpFileSchema.parse({
  source: 'NIH RePORTER API v2 (api.reporter.nih.gov/v2/projects/search)',
  sourceUrl: REPORTER_SEARCH_URL,
  query:
    'Activity code T32, agency NIGMS, fiscal years 2024-2026: (1) project title containing "Scientist Training" (210 project-year rows); (2) gap-fill by organisation name for schools with an MD-PhD program missing from (1), and abstract text "Medical Scientist Training Program", titles and abstracts read by hand.',
  fetchedOn: CHECKED_ON,
  method:
    'Reduced to the latest award per core project. Kept: active MD-PhD or DO-PhD MSTP grants, matched to slugs by hand in data/medschools/mstp-aliases.json (a multi-school institution only where the grant names the school). Excluded with reasons: veterinary DVM-PhD programs (Colorado State, Cornell Ithaca, UC Davis), non-MSTP training grants, earlier grants superseded by a newer award, and a grant whose project period has ended with no newer award. Fewer than 30 requests, 3 s or more apart, user agent MarlonJack/1.0 (contact: admin@rmhstudios.com). The RePORTER link of a grant is https://reporter.nih.gov/project-details/<applId>.',
  grants,
  excluded,
});

writeFileSync('data/medschools/mdphd-programs.json', `${JSON.stringify(programs, null, 2)}\n`);
writeFileSync('data/medschools/mstp-t32.json', `${JSON.stringify(mstp, null, 2)}\n`);
const yes = programs.schools.filter((s) => s.exists).length;
console.log(
  JSON.stringify(
    {
      programs: programs.schools.length,
      yes,
      no: programs.schools.length - yes,
      timelines: programs.schools.filter((s) => s.timeline).length,
      grants: grants.length,
      excluded: excluded.length,
      nihOnly: grants.filter((g) => !programs.schools.some((s) => s.slug === g.slug)).map((g) => g.slug),
      skipped,
    },
    null,
    2,
  ),
);
