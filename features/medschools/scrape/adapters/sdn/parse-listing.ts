import { parse } from 'node-html-parser';
import { SdnPageError } from './guard';

export interface ListingThread {
  threadId: number;
  slug: string;
  title: string;
  /** Null when the listing abbreviates the count ("1K"): treat the thread as changed. */
  replies: number | null;
  lastActivityAt: Date | null;
}

/** "12" parses; "1K"/"1.2K" are rounded by the site, so they are unknown, not approximated. */
function parseReplies(text: string): number | null {
  const t = text.trim().replace(/,/g, '');
  return /^\d+$/.test(t) ? Number(t) : null;
}

function parseDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Sticky rows (the school indexes and "previous years" notices) are not school threads and are dropped here. */
export function parseForumListing(html: string): {
  threads: ListingThread[];
  hasNext: boolean;
} {
  const root = parse(html);
  const rows = root
    .querySelectorAll('div.structItem--thread')
    .filter((r) => r.querySelector('.structItem-title a[data-tp-primary]'));
  if (rows.length === 0 && !/There are no (?:threads|messages)/i.test(html))
    throw new SdnPageError('listing: no thread rows');
  const threads: ListingThread[] = [];
  for (const row of rows) {
    if (row.querySelector('.structItem-status--sticky')) continue;
    const a = row.querySelector('.structItem-title a[data-tp-primary]');
    const m = /\/threads\/([^/]+)\.(\d+)\/?/.exec(a?.getAttribute('href') ?? '');
    const title = a?.text.replace(/\s+/g, ' ').trim() ?? '';
    if (!m || !title) continue;
    const pairs = row.querySelectorAll('.structItem-cell--meta dl.pairs');
    const repliesPair = pairs.find((p) => /^replies$/i.test(p.querySelector('dt')?.text.trim() ?? ''));
    const dd = repliesPair?.querySelector('dd')?.text ?? '';
    threads.push({
      threadId: Number(m[2]),
      slug: m[1] ?? '',
      title,
      replies: parseReplies(dd),
      lastActivityAt: parseDate(
        row.querySelector('.structItem-cell--latest time.structItem-latestDate')?.getAttribute('datetime'),
      ),
    });
  }
  const hasNext = !!root.querySelector('link[rel="next"]') || !!root.querySelector('a.pageNav-jump--next');
  return {
    threads,
    hasNext,
  };
}
