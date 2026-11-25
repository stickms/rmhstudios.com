/**
 * Verifies data/medschools/mcat-percentiles.json against the AAMC PDF it was read from ("Percentile Ranks for MCAT
 * Total and Section Scores", downloaded once by hand from the file's `sourceUrl`; never committed).
 *
 *   pnpm exec tsx scripts/medschools/check-mcat-percentiles.ts <pdf>
 *
 * Reads the PDF's text layer with `pdftotext -layout` and asserts:
 * 1. The "in effect" period and the title the file names are printed on page 1.
 * 2. The total table on page 1 (472-528, three column pairs per line) is exactly the file's `total`, rank strings as
 *    printed ("<1" or a whole number).
 * 3. Each section table on page 2 (118-132 under its section's heading) is exactly the file's `sections` entry.
 *
 * Exits 1 on any difference, printing the first few.
 */
/* eslint-disable no-console -- a CLI: the report is its output. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

interface Row {
  score: number;
  rank: string;
}
interface File {
  title: string;
  inEffect: string;
  total: Row[];
  sections: Record<string, Row[]>;
}

const pdf = process.argv[2];
if (!pdf) throw new Error('usage: check-mcat-percentiles.ts <pdf>');
const file = JSON.parse(readFileSync('data/medschools/mcat-percentiles.json', 'utf8')) as File;

const pageText = (page: number): string =>
  execFileSync('pdftotext', ['-layout', '-f', String(page), '-l', String(page), pdf, '-'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
const squeeze = (s: string): string => s.replace(/\s+/g, ' ').trim();

const failures: string[] = [];
const p1 = pageText(1);
const p2 = pageText(2);

// 1. Header.
if (!squeeze(p1).includes(squeeze(file.title))) failures.push(`title not on page 1: ${file.title}`);
if (!p1.includes(file.inEffect)) failures.push(`period not on page 1: ${file.inEffect}`);

// 2. The total table: every "score rank" pair after the column headings.
const total: Row[] = [];
let inTable = false;
for (const line of p1.split('\n')) {
  if (/Score\s+Rank\s+Score/.test(line)) {
    inTable = true;
    continue;
  }
  if (!inTable) continue;
  const pairs = [...line.matchAll(/\b(4[7-9]\d|5[0-2]\d)\s+(<1|\d{1,3})\b/g)];
  if (pairs.length === 0 && total.length > 0) break;
  for (const m of pairs) total.push({ score: Number(m[1]), rank: m[2]! });
}
total.sort((a, b) => a.score - b.score);

// 3. The section tables: "score rank" at a line's end, under the section's heading.
const HEADINGS: Record<string, string> = {
  'Chemical and Physical Foundations of Biological Systems': 'CPBS',
  'Critical Analysis and Reasoning Skills': 'CARS',
  'Biological and Biochemical Foundations of Living Systems': 'BBLS',
  'Psychological, Social, and Biological Foundations of Behavior': 'PSBB',
};
const sections: Record<string, Row[]> = {};
let current: string | null = null;
for (const line of p2.split('\n')) {
  const heading = HEADINGS[line.trim()];
  if (heading) {
    current = heading;
    sections[heading] = [];
    continue;
  }
  const m = /\b(11[89]|12\d|13[0-2])\s{2,}(\d{1,3})\s*$/.exec(line);
  if (m && current) sections[current]!.push({ score: Number(m[1]), rank: m[2]! });
}

function compare(name: string, fromPdf: readonly Row[], stored: readonly Row[]) {
  if (fromPdf.length !== stored.length)
    failures.push(`${name}: ${fromPdf.length} rows in the PDF, ${stored.length} stored`);
  const n = Math.max(fromPdf.length, stored.length);
  for (let i = 0; i < n; i++) {
    const a = fromPdf[i];
    const b = stored[i];
    if (!a || !b || a.score !== b.score || a.rank !== b.rank) {
      failures.push(
        `${name} row ${i}: PDF ${a ? `${a.score} ${a.rank}` : '-'} vs stored ${b ? `${b.score} ${b.rank}` : '-'}`,
      );
    }
  }
}
compare('total', total, file.total);
const keys = new Set([...Object.keys(sections), ...Object.keys(file.sections)]);
for (const k of keys) compare(k, sections[k] ?? [], file.sections[k] ?? []);

if (failures.length) {
  console.error(`${failures.length} difference(s):`);
  for (const f of failures.slice(0, 20)) console.error(`  ${f}`);
  process.exit(1);
}
const sectionRows = Object.values(file.sections).reduce((n, r) => n + r.length, 0);
console.log(`OK: ${file.total.length} total rows and ${sectionRows} section rows match the PDF (${file.inEffect}).`);
