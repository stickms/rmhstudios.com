/**
 * Verifies data/medschools/msar-reports.json against the AAMC PDFs it was read from.
 *
 *   pnpm exec tsx scripts/medschools/check-msar-reports.ts <pdf-dir> [<scratch-dir>]
 *
 * 1. Every stored text (a school's sentence, a printed date or amount, the school name as printed) must appear, after
 *    whitespace is removed from both sides, in the text layer of the PDF page the fact names (`pdftotext -raw` or
 *    `-layout`: a cell that wraps is contiguous in one and not always in the other).
 * 2. Every structured value must be what its own text says: a date code from the printed date, a number from the printed
 *    amount, a PREview code from the school's sentence, a percent in range.
 * 3. The file is reproducible: extracting the PDFs again and parsing them again gives the same data, so the
 *    symbols (images, which have no text layer) are tied to the PDFs by the extraction, not by anything stored.
 * 4. Each school's name as printed must be on the page of each of its facts, and the alias maps it to that slug.
 *
 * Exits 1 on the first kind of failure it counts, printing the first few of each.
 */
/* eslint-disable no-console -- a CLI: the report is its output. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FACT_KINDS, isFactKind } from '../../features/medschools/engine/school-facts';
import { msarReportsFileSchema } from '../../features/medschools/scrape/msar-reports';
import { parseDate, parsePreview, parseUsd } from './msar-parse';

const pdfDir = process.argv[2];
if (!pdfDir) throw new Error('usage: check-msar-reports.ts <pdf-dir> [<scratch-dir>]');
const scratch = process.argv[3] ?? mkdtempSync(join(tmpdir(), 'msar-check-'));
const FILE = 'data/medschools/msar-reports.json';
const raw = JSON.parse(readFileSync(FILE, 'utf8')) as unknown;
const file = msarReportsFileSchema.parse(raw);
const aliases = (
  JSON.parse(readFileSync('data/medschools/msar-aliases.json', 'utf8')) as { aliases: Record<string, string> }
).aliases;

const squeeze = (s: string): string => s.replace(/\s+/g, '');
const pageCache = new Map<string, { raw: string; layout: string }>();
function pageText(report: number, page: number) {
  const key = `${report}:${page}`;
  let hit = pageCache.get(key);
  if (!hit) {
    const run = (mode: string) =>
      squeeze(
        execFileSync('pdftotext', [mode, '-f', String(page), '-l', String(page), join(pdfDir, `r${report}.pdf`), '-'], {
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
        }),
      );
    hit = { raw: run('-raw'), layout: run('-layout') };
    pageCache.set(key, hit);
  }
  return hit;
}
const onPage = (report: number, page: number, text: string): boolean => {
  const needle = squeeze(text);
  const p = pageText(report, page);
  return p.raw.includes(needle) || p.layout.includes(needle);
};

const failures = new Map<string, string[]>();
const fail = (kind: string, msg: string) => {
  const l = failures.get(kind) ?? [];
  l.push(msg);
  failures.set(kind, l);
};
let facts = 0;
let texts = 0;

for (const s of file.schools) {
  for (const [id, name] of Object.entries(s.names)) {
    const mapped = Object.entries(aliases).find(([k, v]) => v === s.slug && k.endsWith(`|${name}`));
    if (!mapped) fail('alias', `${s.slug}: "${name}" is not an alias of this slug`);
  }
  for (const f of s.facts) {
    facts += 1;
    const at = `${s.slug} r${f.report} p${f.page} ${f.kind}`;
    if (!isFactKind(f.kind)) continue;
    const spec = FACT_KINDS[f.kind];
    const name = s.names[String(f.report)];
    if (!name) fail('name', `${at}: no printed name for this report`);
    else if (!onPage(f.report, f.page, name)) fail('name', `${at}: "${name}" is not on the page`);
    for (const t of [f.text, f.note]) {
      if (t === undefined) continue;
      texts += 1;
      if (!onPage(f.report, f.page, t)) fail('text', `${at}: "${t.slice(0, 80)}" is not on the page`);
    }
    if (spec.type === 'date' && parseDate(f.text ?? '') !== f.code) fail('structured', `${at}: ${f.code} vs ${f.text}`);
    if (spec.type === 'usd' && parseUsd(f.text ?? '') !== f.num) fail('structured', `${at}: ${f.num} vs ${f.text}`);
    if (spec.type === 'percent' && `${f.num}%` !== f.text) fail('structured', `${at}: ${f.num} vs ${f.text}`);
    if (spec.type === 'preview') {
      const p = parsePreview(f.text ?? '');
      if (!p || p.code !== f.code) fail('structured', `${at}: ${f.code} vs ${f.text}`);
    }
  }
}

// 3. Reproducible from the PDFs.
const rawDir = join(scratch, 'raw');
execFileSync('python3', ['-I', 'scripts/medschools/msar_extract.py', pdfDir, rawDir], { stdio: 'ignore' });
const again = join(scratch, 'again.json');
execFileSync('pnpm', ['exec', 'tsx', 'scripts/medschools/parse-msar-reports.ts', rawDir, pdfDir, '--out', again], {
  stdio: 'ignore',
});
const canon = (path: string): string => JSON.stringify(JSON.parse(readFileSync(path, 'utf8')));
if (canon(again) !== canon(FILE)) fail('reproduce', 'a fresh extraction differs from the file');

console.log(`${file.schools.length} schools, ${facts} facts, ${texts} texts checked against the PDF text layer`);
if (failures.size === 0) {
  console.log('OK: every text is on its page, every structured value matches its text, the file is reproducible');
} else {
  for (const [k, l] of failures) {
    console.log(`FAIL ${k}: ${l.length}`);
    for (const m of l.slice(0, 8)) console.log(`  ${m}`);
  }
  process.exit(1);
}
