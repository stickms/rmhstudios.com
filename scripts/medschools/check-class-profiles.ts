/**
 * Re-checks every figure in data/medschools/class-profiles.json against the page it cites: each class url is fetched
 * again and each figure's evidence must still be on it, with the value inside the evidence, by the research verifier's
 * own rule: verbatim after folding whitespace, quotes and dashes (`text`); letters and digits in order for tables
 * (`text-alnum`, at least 8 of them); or, for an animated counter, the label in the page text and the number in an HTML
 * `data-*` attribute (`counter`). Run it by hand before changing the file, and now and then to catch a page that
 * changed; CI does not run it (CI has no network).
 *
 *   pnpm exec tsx scripts/medschools/check-class-profiles.ts [--only <slug,slug>] [--json <report.json>]
 *
 * Polite: one request at a time, 3 s plus 0-1 s jitter between requests, each URL once, a 25 s timeout, and the one
 * honest user agent the medschools worker sends. robots.txt is read once per host and a disallowed path is skipped. A
 * site that refuses (403, 429, 503, a challenge page) is reported as unreachable and is never retried with another
 * agent. A PDF is read with `pdftotext` (layout and raw). Exit 0 when every reachable figure is still found, 1 when one
 * is not, 2 on a usage or file error.
 */
/* eslint-disable no-console -- a CLI: the report is its output. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { evidenceHasValue } from '../../features/medschools/engine/school-facts';
import { classProfilesFileSchema } from '../../features/medschools/scrape/class-profiles';
import { MEDSCHOOLS_USER_AGENT } from '../../features/medschools/scrape/sources';

const FILE = 'data/medschools/class-profiles.json';
const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = opt('--only')?.split(',').filter(Boolean);
const jsonOut = opt('--json');

const parsed = classProfilesFileSchema.safeParse(JSON.parse(readFileSync(FILE, 'utf8')));
if (!parsed.success) {
  console.error(`${FILE} is invalid:`, parsed.error.issues.slice(0, 5));
  process.exit(2);
}

const norm = (s: string | null | undefined): string =>
  String(s ?? '')
    .normalize('NFKC')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−‐‑]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/[.]{3,}|…{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
const strip = (h: string): string =>
  h
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&rsquo;|&lsquo;|&#8217;|&#8216;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;|&#8220;|&#8221;/g, '"')
    .replace(/&ndash;|&mdash;|&#8211;|&#8212;/g, '-')
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)));

type Page = { text: string; raw: string } | { status?: number; error?: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function polite<T>(fn: () => Promise<T>): Promise<T> {
  const wait = last + 3000 + Math.random() * 1000 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  return fn();
}

/** Disallow rules of the `*` group (or a group naming our agent), one robots.txt per host. */
const robots = new Map<string, string[]>();
async function allowed(url: URL): Promise<boolean> {
  let rules = robots.get(url.host);
  if (!rules) {
    rules = [];
    try {
      const res = await polite(() =>
        fetch(`${url.origin}/robots.txt`, {
          headers: { 'user-agent': MEDSCHOOLS_USER_AGENT },
          signal: AbortSignal.timeout(15_000),
        }),
      );
      if (res.ok) {
        let applies = false;
        for (const line of (await res.text()).split('\n')) {
          const [k, ...rest] = line.replace(/#.*/, '').split(':');
          const key = k?.trim().toLowerCase();
          const v = rest.join(':').trim();
          if (key === 'user-agent') applies = v === '*' || /marlonjack/i.test(v);
          else if (applies && key === 'disallow' && v) rules.push(v);
        }
      }
    } catch {
      // No robots.txt reachable: nothing is disallowed.
    }
    robots.set(url.host, rules);
  }
  return !rules.some((r) => url.pathname.startsWith(r));
}

const cache = new Map<string, Page>();
async function page(url: string): Promise<Page> {
  const hit = cache.get(url);
  if (hit) return hit;
  let out: Page;
  try {
    if (!(await allowed(new URL(url)))) out = { error: 'disallowed by robots.txt' };
    else {
      const res = await polite(() =>
        fetch(url, {
          headers: { 'user-agent': MEDSCHOOLS_USER_AGENT },
          redirect: 'follow',
          signal: AbortSignal.timeout(25_000),
        }),
      );
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok) out = { status: res.status };
      else if (type.includes('pdf') || /\.pdf($|\?)/i.test(url)) {
        const dir = mkdtempSync(join(tmpdir(), 'check-class-profiles-'));
        try {
          const file = join(dir, 'page.pdf');
          writeFileSync(file, Buffer.from(await res.arrayBuffer()));
          const run = (mode: string) =>
            execFileSync('pdftotext', [mode, file, '-'], { encoding: 'utf8', maxBuffer: 64 << 20 });
          out = { text: norm(`${run('-layout')}\n${run('-raw')}`), raw: '' };
        } finally {
          rmSync(dir, { recursive: true, force: true });
        }
      } else {
        const html = await res.text();
        out = { text: norm(strip(html)), raw: norm(html) };
      }
    }
  } catch (e) {
    out = { error: e instanceof Error ? e.message : String(e) };
  }
  cache.set(url, out);
  return out;
}

const alnum = (s: string) => s.replace(/[^a-z0-9]+/g, '');
function onPage(p: { text: string }, evidence: string): 'text' | 'text-alnum' | null {
  const e = norm(evidence).replace(/^["']|["']$/g, '');
  if (p.text.includes(e)) return 'text';
  if (alnum(e).length >= 8 && alnum(p.text).includes(alnum(e))) return 'text-alnum';
  return null;
}
function counter(p: { text: string; raw: string }, value: string, evidence: string): 'counter' | null {
  const v = norm(value).replace(/,/g, '');
  const label = norm(evidence).replace(norm(value), '').trim();
  const attr = new RegExp(`data-[a-z-]*=["']${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`);
  return label.length >= 6 && p.text.includes(label) && attr.test(p.raw) ? 'counter' : null;
}

const report = { figures: 0, found: 0, missing: [] as string[], unreachable: [] as string[] };
for (const s of parsed.data.schools) {
  if (only && !only.includes(s.slug)) continue;
  for (const c of s.classes) {
    const p = await page(c.url);
    if (!('text' in p)) {
      report.unreachable.push(`${s.slug} ${c.url} ${JSON.stringify(p)}`);
      console.log(`?  ${s.slug} ${c.label}: unreachable ${JSON.stringify(p)}`);
      continue;
    }
    for (const st of c.stats) {
      report.figures += 1;
      const how = evidenceHasValue(st.value, st.evidence)
        ? (onPage(p, st.evidence) ?? counter(p, st.value, st.evidence))
        : null;
      if (how) {
        report.found += 1;
        console.log(`ok ${s.slug} ${c.label} ${st.kind} ${st.value} (${how})`);
      } else {
        report.missing.push(`${s.slug} ${c.label} ${st.kind} ${st.value} ${c.url}`);
        console.log(`✗  ${s.slug} ${c.label} ${st.kind} ${st.value}: not found on ${c.url}`);
      }
    }
  }
}
console.log(
  JSON.stringify({
    figures: report.figures,
    found: report.found,
    missing: report.missing.length,
    unreachable: report.unreachable.length,
  }),
);
if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
process.exit(report.missing.length > 0 ? 1 : 0);
