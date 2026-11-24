/**
 * Re-checks every MD-PhD timeline in data/medschools/mdphd-programs.json against the page it cites: the page is fetched
 * again and its evidence must still be on it, by the research pass's own rule (`engine/mdphd-evidence.ts`: verbatim after
 * normalising whitespace, quotes and dashes, every piece around an ellipsis; letters and digits in order as the fallback
 * for tables). Run it by hand before changing the file, and now and then to catch a page that changed; CI does not run
 * it (CI has no network).
 *
 *   pnpm exec tsx scripts/medschools/check-mdphd.ts [--only <slug,slug>] [--json <report.json>]
 *
 * Polite: one request at a time, 3 s plus 0-1 s jitter between requests, each URL once, a 20 s timeout, and the one
 * honest user agent the medschools worker sends. A site that refuses (403, 503, a challenge page) is reported as
 * unreachable and is never retried with another agent. A PDF is read with `pdftotext -layout` when that tool exists.
 * Exit 0 when every reachable page still holds its evidence, 1 when a quote is gone, 2 on a usage or file error.
 */
/* eslint-disable no-console -- a CLI: the report is its output. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evidenceFound, normEvidence, stripHtml } from '../../features/medschools/engine/mdphd-evidence';
import { mdphdProgramsFileSchema } from '../../features/medschools/scrape/mdphd';
import { MEDSCHOOLS_USER_AGENT } from '../../features/medschools/scrape/sources';

const FILE = 'data/medschools/mdphd-programs.json';
const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = opt('--only')?.split(',').filter(Boolean);
const jsonOut = opt('--json');

const parsed = mdphdProgramsFileSchema.safeParse(JSON.parse(readFileSync(FILE, 'utf8')));
if (!parsed.success) {
  console.error(`${FILE} is invalid:`, parsed.error.issues.slice(0, 5));
  process.exit(2);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
const cache = new Map<string, string | { status?: number; error?: string }>();

async function pageText(url: string): Promise<string | { status?: number; error?: string }> {
  const hit = cache.get(url);
  if (hit !== undefined) return hit;
  const wait = last + 3000 + Math.random() * 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  let out: string | { status?: number; error?: string };
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': MEDSCHOOLS_USER_AGENT },
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok) out = { status: res.status };
    else if (type.includes('pdf') || /\.pdf($|\?)/i.test(url)) {
      const dir = mkdtempSync(join(tmpdir(), 'check-mdphd-'));
      try {
        const file = join(dir, 'page.pdf');
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        out = normEvidence(
          execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 32 << 20 }),
        );
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    } else out = normEvidence(stripHtml(await res.text()));
  } catch (e) {
    out = { error: e instanceof Error ? e.message : String(e) };
  }
  cache.set(url, out);
  return out;
}

const report = { checked: 0, found: [] as string[], missing: [] as string[], unreachable: [] as string[] };
for (const s of parsed.data.schools) {
  if (!s.timeline || (only && !only.includes(s.slug))) continue;
  report.checked += 1;
  const text = await pageText(s.timeline.url);
  if (typeof text !== 'string') {
    report.unreachable.push(`${s.slug} ${s.timeline.url} ${JSON.stringify(text)}`);
    console.log(`?  ${s.slug}: unreachable ${JSON.stringify(text)}`);
  } else if (evidenceFound(text, s.timeline.evidence)) {
    report.found.push(s.slug);
    console.log(`ok ${s.slug}`);
  } else {
    report.missing.push(`${s.slug} ${s.timeline.url}`);
    console.log(`✗  ${s.slug}: the evidence is no longer on ${s.timeline.url}`);
  }
}
console.log(
  JSON.stringify({
    checked: report.checked,
    found: report.found.length,
    missing: report.missing.length,
    unreachable: report.unreachable.length,
  }),
);
if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
process.exit(report.missing.length > 0 ? 1 : 0);
