/**
 * Builds data/medschools/msar-reports.json from the raw rows `msar_extract.py` read out of the AAMC MSAR PDFs.
 *
 *   python3 -I scripts/medschools/msar_extract.py <pdf-dir> <raw-dir>
 *   pnpm exec tsx scripts/medschools/parse-msar-reports.ts <raw-dir> <pdf-dir> [--out data/medschools/msar-reports.json]
 *   pnpm exec tsx scripts/medschools/check-msar-reports.ts <pdf-dir> <raw-dir>     # the verifier
 *
 * Makes no request: the PDFs are downloaded by hand and never committed. A name that has no entry in
 * data/medschools/msar-aliases.json is written to `unmatched` and gets no facts, never a guess. A value that does not
 * parse stops the run (it names the row), so nothing is stored that was not read.
 */
/* eslint-disable no-console -- a CLI: the report is its output. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MSAR_PAGE_URL,
  MSAR_REPORTS,
  msarReportUrl,
  type FactKindId,
  type MsarReportId,
} from '../../features/medschools/engine/school-facts';
import {
  msarReportsFileSchema,
  type MsarFactEntry,
  type MsarReportsFile,
} from '../../features/medschools/scrape/msar-reports';
import { parsePreview, parseDate, parseUsd } from './msar-parse';

interface RawRow {
  page: number;
  region: 'USA' | 'CAN';
  state: string;
  name: string;
  cells?: Record<string, string>;
  icons?: Record<string, string>;
  sub?: Array<Record<string, string>>;
}

const [rawDir, pdfDir] = process.argv.slice(2);
if (!rawDir || !pdfDir) throw new Error('usage: parse-msar-reports.ts <raw-dir> <pdf-dir> [--out file]');
const outPath = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]!
  : 'data/medschools/msar-reports.json';

const aliases = (
  JSON.parse(readFileSync('data/medschools/msar-aliases.json', 'utf8')) as { aliases: Record<string, string> }
).aliases;
/** The PREview report prints no state: its names are looked up on their own (they are unique across the registry). */
const byName = new Map<string, string>();
for (const [k, v] of Object.entries(aliases)) byName.set(k.slice(k.indexOf('|') + 1), v);
const rows = (id: number): RawRow[] =>
  (JSON.parse(readFileSync(join(rawDir, `r${id}.json`), 'utf8')) as { rows: RawRow[] }).rows;

/** The PDF's own title line, year and "Source:" line, from its first page. */
function pdfHeader(id: number): { cycleYear: number | null; pdfSource: string | null; pages: number } {
  const first = execFileSync('pdftotext', ['-layout', '-f', '1', '-l', '2', join(pdfDir, `r${id}.pdf`), '-'], {
    encoding: 'utf8',
  });
  const info = execFileSync('pdfinfo', [join(pdfDir, `r${id}.pdf`)], { encoding: 'utf8' });
  const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
  const year = /^.*\s(20\d\d)\s*$/m.exec(
    first
      .split('\n')
      .filter((l) => !l.includes('©'))
      .join('\n'),
  );
  const src = /^Source:\s*(.+?)\s*$/m.exec(first);
  return { cycleYear: year ? Number(year[1]) : null, pdfSource: src ? src[1]! : null, pages };
}

const reports: MsarReportsFile['reports'] = {};
for (const idStr of Object.keys(MSAR_REPORTS)) {
  const id = Number(idStr) as MsarReportId;
  if (!rows.length) continue;
  try {
    readFileSync(join(rawDir, `r${id}.json`));
  } catch {
    continue;
  }
  const h = pdfHeader(id);
  reports[idStr] = {
    name: MSAR_REPORTS[id],
    url: msarReportUrl(id),
    // The PREview PDF prints no year; the AAMC page lists it with the 2027 reports (owner, 2026-11-24).
    cycleYear: h.cycleYear ?? 2027,
    yearPrinted: h.cycleYear !== null,
    pdfSource: h.pdfSource,
    pages: h.pages,
  };
}

const unmatched: MsarReportsFile['unmatched'] = [];
const canadian = new Set<string>();
const bySlug = new Map<string, { names: Record<string, string>; facts: MsarFactEntry[] }>();

function school(id: number, r: RawRow): { names: Record<string, string>; facts: MsarFactEntry[] } | null {
  if (r.region === 'CAN') {
    canadian.add(r.name);
    return null;
  }
  const slug = r.state ? aliases[`${r.state}|${r.name}`] : byName.get(r.name);
  if (!slug) {
    unmatched.push({ report: id, state: r.state, name: r.name });
    return null;
  }
  let s = bySlug.get(slug);
  if (!s) bySlug.set(slug, (s = { names: {}, facts: [] }));
  s.names[String(id)] = r.name;
  (s as { slug?: string }).slug = slug;
  return s;
}

const add = (
  s: { facts: MsarFactEntry[] },
  report: number,
  kind: FactKindId,
  page: number,
  v: Partial<MsarFactEntry>,
) => s.facts.push({ report, kind, page, ...v });

const accepts = (i: string | undefined): 'YES' | 'NO' | 'CASE_BY_CASE' | undefined =>
  i === 'yes' ? 'YES' : i === 'no' ? 'NO' : i === 'case' ? 'CASE_BY_CASE' : undefined;
const yesno = (i: string | undefined, at: string): 'YES' | 'NO' | undefined => {
  if (i === 'yes') return 'YES';
  if (i === 'no') return 'NO';
  if (i === 'blank' || i === undefined) return undefined;
  throw new Error(`${at}: ${i} where only yes or no is in the legend`);
};
const bad = (at: string, v: string): never => {
  throw new Error(`${at}: cannot read ${JSON.stringify(v)}`);
};

// 6996 Applications Accepted: four rows per school, a symbol and the school's sentence each.
const SUB: Record<string, FactKindId> = {
  'Out-of-state Applicants': 'ACCEPTS_OUT_OF_STATE',
  'Canadian Applicants': 'ACCEPTS_CANADIAN',
  'International Applicants': 'ACCEPTS_INTERNATIONAL',
  'DACA Status Applicants': 'ACCEPTS_DACA',
};
const dacaIcon = new Map<string, string>();
for (const r of rows(6996)) {
  const s = school(6996, r);
  if (!s) continue;
  for (const sub of r.sub ?? []) {
    const kind = SUB[sub.label ?? ''] ?? bad(`6996 ${r.name}`, sub.label ?? '');
    const code = accepts(sub.policy);
    if (kind === 'ACCEPTS_DACA') dacaIcon.set(r.name, sub.policy ?? '');
    if (!code) continue;
    add(s, 6996, kind, r.page, { code, ...(sub.info ? { note: sub.info } : {}) });
  }
}

// 7031 DACA details; its tick and cross must agree with 6996's DACA row (blank here is the yellow dot there).
for (const r of rows(7031)) {
  const s = school(7031, r);
  if (!s) continue;
  const mine = r.icons?.accepts;
  const theirs = dacaIcon.get(r.name);
  const agree =
    (mine === 'yes' && theirs === 'yes') ||
    (mine === 'no' && theirs === 'no') ||
    (mine === 'blank' && theirs === 'case');
  if (!agree) throw new Error(`DACA: 7031 says ${mine}, 6996 says ${theirs}, for ${r.name}`);
  if (r.cells?.details) add(s, 7031, 'DACA_DETAILS', r.page, { text: r.cells.details });
}

for (const r of rows(7036)) {
  const s = school(7036, r);
  if (!s) continue;
  for (const [key, kind] of [
    ['latest', 'MCAT_LATEST'],
    ['oldest', 'MCAT_OLDEST'],
  ] as const) {
    const text = r.cells?.[key];
    if (!text) continue;
    add(s, 7036, kind, r.page, { code: parseDate(text) ?? bad(`7036 ${r.name}`, text), text });
  }
}

for (const r of rows(7046)) {
  const s = school(7046, r);
  if (!s) continue;
  const p = parsePreview(r.cells?.policy ?? '') ?? bad(`7046 ${r.name}`, r.cells?.policy ?? '');
  add(s, 7046, 'PREVIEW_POLICY', r.page, { code: p.code, text: p.text });
}

const LETTER = { yes: 'ACCEPTED', case: 'PREFERRED', no: 'NOT_ACCEPTED' } as const;
for (const r of rows(7026)) {
  const s = school(7026, r);
  if (!s) continue;
  for (const [key, kind] of [
    ['committee', 'LETTER_COMMITTEE'],
    ['packets', 'LETTER_PACKETS'],
    ['individual', 'LETTER_INDIVIDUAL'],
  ] as const) {
    const i = r.icons?.[key] as keyof typeof LETTER | 'blank';
    if (i === 'blank') continue;
    add(s, 7026, kind, r.page, { code: LETTER[i] });
  }
}

for (const r of rows(15766)) {
  const s = school(15766, r);
  if (!s) continue;
  for (const [key, kind] of [
    ['upward', 'CC_UPWARD_TRANSFER'],
    ['accelerated', 'CC_ACCELERATED'],
    ['supplemental', 'CC_SUPPLEMENTAL'],
  ] as const) {
    const code = yesno(r.icons?.[key], `15766 ${r.name}`);
    if (code) add(s, 15766, kind, r.page, { code });
  }
  if (r.cells?.info) add(s, 15766, 'CC_INFO', r.page, { text: r.cells.info });
}

for (const r of rows(7011)) {
  const s = school(7011, r);
  if (!s) continue;
  const req = yesno(r.icons?.required, `7011 ${r.name}`);
  if (req) add(s, 7011, 'SECONDARY_REQUIRED', r.page, { code: req });
  const fee = r.cells?.fee;
  if (fee) add(s, 7011, 'SECONDARY_FEE', r.page, { num: parseUsd(fee) ?? bad(`7011 fee ${r.name}`, fee), text: fee });
  if (r.cells?.sent_to) add(s, 7011, 'SECONDARY_SENT_TO', r.page, { text: r.cells.sent_to });
  const waiver = yesno(r.icons?.waiver, `7011 ${r.name}`);
  if (waiver) add(s, 7011, 'SECONDARY_FEE_WAIVER', r.page, { code: waiver });
  if (r.cells?.deadline) add(s, 7011, 'SECONDARY_DEADLINE', r.page, { text: r.cells.deadline });
}

const text7051: Array<[string, FactKindId]> = [
  ['format', 'INTERVIEW_FORMAT'],
  ['invitations', 'INTERVIEW_INVITATIONS'],
  ['day', 'INTERVIEW_DAY'],
  ['regional', 'INTERVIEW_REGIONAL'],
  ['video', 'INTERVIEW_VIDEO'],
];
for (const r of rows(7051)) {
  const s = school(7051, r);
  if (!s) continue;
  for (const [key, kind] of text7051) if (r.cells?.[key]) add(s, 7051, kind, r.page, { text: r.cells[key]! });
}

const text7056: Array<[string, FactKindId]> = [
  ['positions', 'WAITLIST_POSITIONS'],
  ['offers', 'WAITLIST_OFFERS'],
  ['procedures', 'WAITLIST_PROCEDURES'],
];
for (const r of rows(7056)) {
  const s = school(7056, r);
  if (!s) continue;
  for (const [key, kind] of text7056) if (r.cells?.[key]) add(s, 7056, kind, r.page, { text: r.cells[key]! });
}

// 7066 Deposit Due Date (the PDF is labelled 2026).
for (const r of rows(7066)) {
  const s = school(7066, r);
  if (!s) continue;
  for (const [key, kind] of [
    ['in_state', 'DEPOSIT_IN_STATE'],
    ['out_state', 'DEPOSIT_OUT_OF_STATE'],
  ] as const) {
    const t = r.cells?.[key];
    if (t) add(s, 7066, kind, r.page, { num: parseUsd(t) ?? bad(`7066 ${r.name}`, t), text: t });
  }
  for (const [key, kind] of [
    ['required', 'DEPOSIT_REQUIRED'],
    ['refundable', 'DEPOSIT_REFUNDABLE'],
    ['applied', 'DEPOSIT_APPLIED_TO_TUITION'],
  ] as const) {
    const code = yesno(r.icons?.[key], `7066 ${r.name}`);
    if (code) add(s, 7066, kind, r.page, { code });
  }
  for (const [key, kind] of [
    ['refundable_by', 'DEPOSIT_REFUNDABLE_BY'],
    ['due', 'DEPOSIT_DUE'],
  ] as const) {
    const t = r.cells?.[key];
    if (t) add(s, 7066, kind, r.page, { code: parseDate(t) ?? bad(`7066 ${r.name}`, t), text: t });
  }
}

// 7071 Tuition, Fees and Insurance. A total cost of attendance printed as $0 is a school with no figure (a new school, or
// no out-of-state rate): its three cells are left out. A tuition of $0 beside a real total (a full waiver) is kept.
const COST: Array<[string, string, FactKindId, FactKindId, FactKindId]> = [
  ['in', 'in_total', 'COA_IN_STATE', 'TUITION_IN_STATE', 'INSURANCE_IN_STATE'],
  ['out', 'out_total', 'COA_OUT_OF_STATE', 'TUITION_OUT_OF_STATE', 'INSURANCE_OUT_OF_STATE'],
];
for (const r of rows(7071)) {
  const s = school(7071, r);
  if (!s) continue;
  for (const [p, totalKey, coa, tuition, insurance] of COST) {
    const total = r.cells?.[totalKey] ?? '';
    const totalNum = parseUsd(total) ?? bad(`7071 ${r.name}`, total);
    if (totalNum === 0) continue;
    for (const [key, kind] of [
      [totalKey, coa],
      [`${p}_tuition`, tuition],
      [`${p}_insurance`, insurance],
    ] as const) {
      const t = r.cells?.[key] ?? '';
      add(s, 7071, kind, r.page, { num: parseUsd(t) ?? bad(`7071 ${r.name}`, t), text: t });
    }
  }
}

// 7061 Debt. An average of $0 is a school with no graduating class (or none reported): left out, with the 0% beside it.
for (const r of rows(7061)) {
  const s = school(7061, r);
  if (!s) continue;
  const pct = r.cells?.aid_pct ?? '';
  const debt = r.cells?.debt ?? '';
  const debtNum = parseUsd(debt) ?? bad(`7061 ${r.name}`, debt);
  const m = /^(\d{1,3})%$/.exec(pct) ?? bad(`7061 ${r.name}`, pct);
  if (debtNum === 0) {
    if (Number(m[1]) !== 0) add(s, 7061, 'DEBT_AID_PERCENT', r.page, { num: Number(m[1]), text: pct });
    continue;
  }
  add(s, 7061, 'DEBT_AID_PERCENT', r.page, { num: Number(m[1]), text: pct });
  add(s, 7061, 'DEBT_AVERAGE', r.page, { num: debtNum, text: debt });
}

const schools = [...bySlug.entries()]
  .map(([slug, v]) => ({ slug, names: v.names, facts: v.facts }))
  .filter((s) => s.facts.length > 0)
  .sort((a, b) => a.slug.localeCompare(b.slug));

const file: MsarReportsFile = {
  source:
    'AAMC Medical School Admission Requirements (MSAR) Reports for Applicants and Advisors, the PDF reports linked from the page in sourceUrl. MD (AMCAS) schools only. Not the MSAR school profiles (mec.aamc.org/msar-ui), which are not covered and are not used.',
  sourceUrl: MSAR_PAGE_URL,
  permission:
    'The owner states that RMH has AAMC\'s permission to use anything on the reports page (2026-11-24). The PDFs carry the notice: "may be reproduced and distributed with attribution for individual, educational, and noncommercial purposes only". Every figure is attributed "Source: AAMC MSAR Report for Applicants and Advisors, <year> entering class, <report name>" with a link to the page.',
  method:
    'Each PDF was downloaded once by hand (one request at a time, at least 3 s apart, user agent MarlonJack/1.0 with a contact address). scripts/medschools/msar_extract.py read every table cell by cell from its ruled grid, and read the Yes / No / Case-by-Case symbols, which are images, from the pixels of their own cell (green tick = yes, red cross = no, yellow dot = case-by-case, nothing = blank). scripts/medschools/parse-msar-reports.ts turned the rows into facts; a school name with no entry in msar-aliases.json is listed in unmatched, never guessed. scripts/medschools/check-msar-reports.ts asserts that every text value appears in the PDF text and every structured value matches its row. A total cost of attendance printed as $0 and an average debt of $0 are left out as "no figure". Report 7066 (Deposit Due Date) is labelled 2026 in the PDF, so its facts carry 2026. Report 7046 (PREview) prints no year and is listed on the page with the 2027 reports.',
  fetchedOn: '2026-11-24',
  cycleLabel: '2027 entering class',
  reports,
  canadianSchoolsSkipped: canadian.size,
  unmatched,
  schools,
};
const checked = msarReportsFileSchema.parse(file);
writeFileSync(outPath, `${JSON.stringify(checked, null, 2)}\n`);

const perKind = new Map<string, number>();
for (const s of schools) for (const f of s.facts) perKind.set(f.kind, (perKind.get(f.kind) ?? 0) + 1);
console.log(
  `wrote ${outPath}: ${schools.length} schools, ${[...perKind.values()].reduce((a, b) => a + b, 0)} facts, ${canadian.size} Canadian schools skipped, ${unmatched.length} unmatched rows`,
);
for (const [k, n] of [...perKind.entries()].sort()) console.log(`  ${k}: ${n}`);
