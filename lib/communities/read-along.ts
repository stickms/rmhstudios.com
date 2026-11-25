/**
 * Read-alongs (s11-09), pure part: the limits, the split of a book into parts, the opening times, the text of a part's
 * thread and the data the page is built from. No dependencies beyond the calendar time-zone helpers and the recurring
 * threads' pure module, so a client can import it (nothing here touches a database or zod).
 *
 * A read-along is a library book cut into parts that open weekly. Part `n` (1-based) opens on the `n - 1`th occurrence
 * of the read-along's weekday and time, counted from the start date, in the read-along's time zone, so 09:00 stays 09:00
 * across a clock change.
 */
import { addDays, dayOf, parseDay, wallToUtcMs } from '@/lib/calendar/tz';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-limits';
import { nextThreadAt, type PauseReason } from '@/lib/communities/recurring';

export { PAUSE_REASONS, formatTime, parseTime, type PauseReason } from '@/lib/communities/recurring';

/** A community can have at most this many active read-alongs. */
export const MAX_ACTIVE = 2;
export const MIN_PARTS = 2;
export const MAX_PARTS = 20;
/** At most this many readers join one read-along. */
export const MAX_READERS = 2000;
/** The warning a part's thread carries is "Spoilers: <label>" and a content warning is 80 characters at most. */
export const WARNING_PREFIX = 'Spoilers: ';
export const CONTENT_WARNING_MAX = 80;
/** A part's label, short enough that the warning built from it still fits. */
export const LABEL_MAX = CONTENT_WARNING_MAX - WARNING_PREFIX.length;

export const STATUSES = ['active', 'paused', 'cancelled', 'done'] as const;
export type ReadAlongStatus = (typeof STATUSES)[number];

/** One part before it is stored: a label and a page range (1-based, inclusive). */
export interface PartDraft {
  label: string;
  startPage: number;
  endPage: number;
}

/** A chapter of a book's table of contents. */
export interface TocLike {
  title: string;
  page: number;
  depth?: number | undefined;
}

const clip = (text: string, max: number): string => {
  const chars = [...text];
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join('')}…`;
};

/** The most parts a book of `pages` pages can be cut into (each part has at least one page). */
export function maxPartsFor(pages: number): number {
  return Math.max(0, Math.min(MAX_PARTS, Math.floor(pages)));
}

/** Whether a book can be read together at all: it needs at least a page for each of two parts. */
export function canReadAlong(pages: number): boolean {
  return maxPartsFor(pages) >= MIN_PARTS;
}

/** How many parts a plan starts with when the moderator has not chosen: about 40 pages a part, between 2 and 12. */
export function suggestedPartCount(pages: number): number {
  const max = maxPartsFor(pages);
  if (max < MIN_PARTS) return 0;
  return Math.min(max, Math.max(MIN_PARTS, Math.min(12, Math.round(pages / 40))));
}

const labelOf = (word: string, n: number, title: string | null): string =>
  clip(title ? `${word} ${n}: ${title.trim()}` : `${word} ${n}`, LABEL_MAX);

/** Equal page ranges: the first `pages % count` parts carry one page more, so the ranges are contiguous and cover the book. */
export function splitByPages(pages: number, count: number, partWord = 'Part'): PartDraft[] {
  const total = Math.floor(pages);
  const n = Math.min(Math.max(Math.floor(count), 0), maxPartsFor(total));
  if (n < MIN_PARTS) return [];
  const parts: PartDraft[] = [];
  for (let i = 0; i < n; i++) {
    const startPage = Math.floor((i * total) / n) + 1;
    const endPage = Math.floor(((i + 1) * total) / n);
    parts.push({ label: labelOf(partWord, i + 1, null), startPage, endPage });
  }
  return parts;
}

/**
 * The chapters of a table of contents that can start a part: the outermost level, in page order, one per page, inside
 * the book. The first always starts on page 1 (front matter belongs to the first chapter).
 */
export function chaptersOf(toc: readonly TocLike[] | null | undefined, pages: number): TocLike[] {
  const valid = (toc ?? []).filter(
    (e) =>
      typeof e.title === 'string' &&
      e.title.trim() !== '' &&
      Number.isInteger(e.page) &&
      e.page >= 1 &&
      e.page <= pages,
  );
  if (valid.length === 0) return [];
  const top = Math.min(...valid.map((e) => e.depth ?? 0));
  const chapters: TocLike[] = [];
  for (const e of [...valid.filter((v) => (v.depth ?? 0) === top)].sort((a, b) => a.page - b.page)) {
    if (chapters.length > 0 && chapters[chapters.length - 1]!.page === e.page) continue;
    chapters.push(e);
  }
  const first = chapters[0];
  if (first && first.page !== 1) chapters[0] = { ...first, page: 1 };
  return chapters;
}

/**
 * Parts from a table of contents: the chapters grouped into `count` parts (fewer when the book has fewer chapters) of
 * roughly equal pages. Each part starts where one of its chapters starts, so a part never opens in the middle of a
 * chapter; the boundaries are the chapter starts nearest to the equal split. Falls back to equal page ranges when the
 * table of contents has fewer than two chapters. The ranges are contiguous and cover pages 1 to `pages`.
 */
export function splitFromToc(
  toc: readonly TocLike[] | null | undefined,
  pages: number,
  count: number,
  partWord = 'Part',
): PartDraft[] {
  const total = Math.floor(pages);
  const chapters = chaptersOf(toc, total);
  const wanted = Math.min(Math.max(Math.floor(count), 0), maxPartsFor(total));
  if (chapters.length < MIN_PARTS) return splitByPages(total, wanted, partWord);
  const n = Math.min(wanted, chapters.length);
  if (n < MIN_PARTS) return [];
  // `starts[j]` is the index of the chapter that opens part `j`.
  const starts: number[] = [0];
  for (let k = 1; k < n; k++) {
    const target = (k * total) / n;
    const lowest = starts[k - 1]! + 1;
    const highest = chapters.length - (n - k);
    let best = lowest;
    for (let i = lowest; i <= highest; i++) {
      if (Math.abs(chapters[i]!.page - target) < Math.abs(chapters[best]!.page - target)) best = i;
    }
    starts.push(best);
  }
  return starts.map((chapterIndex, j) => {
    const startPage = chapters[chapterIndex]!.page;
    const next = starts[j + 1];
    const endPage = next === undefined ? total : chapters[next]!.page - 1;
    return { label: labelOf(partWord, j + 1, chapters[chapterIndex]!.title), startPage, endPage };
  });
}

/** Why a list of parts is refused, or `null` when it can be used for a book of `pages` pages. */
export type PartsProblem = 'count' | 'label' | 'range' | 'order';

export function partsProblem(parts: readonly PartDraft[], pages: number): PartsProblem | null {
  if (parts.length < MIN_PARTS || parts.length > MAX_PARTS) return 'count';
  let previousEnd = 0;
  for (const p of parts) {
    const label = p.label.trim();
    if (label === '' || [...label].length > LABEL_MAX) return 'label';
    if (!Number.isInteger(p.startPage) || !Number.isInteger(p.endPage)) return 'range';
    if (p.startPage < 1 || p.endPage < p.startPage || p.endPage > pages) return 'range';
    if (p.startPage <= previousEnd) return 'order';
    previousEnd = p.endPage;
  }
  return null;
}

/** The weekly schedule of a read-along. */
export interface Schedule {
  /** 0 (Sunday) to 6. */
  weekday: number;
  /** Minutes after local midnight, 0 to 1439. */
  minuteOfDay: number;
  timeZone: string;
}

function weekdayOfDay(day: string): number {
  const p = parseDay(day);
  if (!p) throw new Error(`bad day: ${day}`);
  return new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay();
}

/** The first day on or after `startDay` (`YYYY-MM-DD`) that falls on `weekday`. */
export function firstOpeningDay(startDay: string, weekday: number): string {
  for (let i = 0; i < 7; i++) {
    const day = addDays(startDay, i);
    if (weekdayOfDay(day) === weekday) return day;
  }
  return startDay;
}

/** The opening instants of `count` weekly parts, the first on `firstDay`, at the schedule's wall time in its zone. */
export function openingsFromDay(schedule: Schedule, firstDay: string, count: number): number[] {
  const h = Math.floor(schedule.minuteOfDay / 60);
  const mi = schedule.minuteOfDay % 60;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const p = parseDay(addDays(firstDay, i * 7));
    if (!p) throw new Error(`bad day: ${firstDay}`);
    out.push(wallToUtcMs({ ...p, h, mi }, schedule.timeZone));
  }
  return out;
}

/** The opening instants of `count` parts for a start date: the first occurrence of the weekday on or after it, then weekly. */
export function openingsFor(schedule: Schedule, startDay: string, count: number): number[] {
  return openingsFromDay(schedule, firstOpeningDay(startDay, schedule.weekday), count);
}

/** The part that comes next after an instant: the first occurrence strictly after `afterMs`, then weekly. */
export function openingsAfter(schedule: Schedule, afterMs: number, count: number): number[] {
  const first = nextThreadAt(
    {
      cadence: 'weekly',
      weekday: schedule.weekday,
      dayOfMonth: null,
      minuteOfDay: schedule.minuteOfDay,
      timeZone: schedule.timeZone,
    },
    afterMs,
  );
  return openingsFromDay(schedule, dayOf(first, schedule.timeZone), count);
}

/** The warning a part's thread carries. */
export function spoilerWarning(label: string): string {
  return clip(`${WARNING_PREFIX}${label.trim()}`, CONTENT_WARNING_MAX);
}

/**
 * The text of a part's thread: the book, the part and its pages, and the link to the read-along page. The whole is one
 * post (280 characters), so a long book title is shortened to fit and never the link.
 */
export function composePartPost(args: {
  bookTitle: string;
  label: string;
  startPage: number;
  endPage: number;
  url: string;
}): string {
  const pages = args.startPage === args.endPage ? `page ${args.startPage}` : `pages ${args.startPage}-${args.endPage}`;
  const tail = `${args.label.trim()} (${pages})\n${args.url}`;
  const head = 'Read-along: ';
  const room = MAX_RMHARK_LENGTH - [...head].length - [...' - '].length - [...tail].length;
  const title = clip(args.bookTitle.trim(), Math.max(room, 1));
  return `${head}${title} - ${tail}`;
}

export interface PartDTO {
  id: string;
  position: number;
  label: string;
  startPage: number;
  endPage: number;
  opensAt: string;
  /** The part's thread, once posted. */
  postId: string | null;
  opened: boolean;
}

export interface PersonDTO {
  id: string;
  name: string | null;
  handle: string | null;
}

export interface ReaderDTO extends PersonDTO {
  lastPartDone: number;
}

/** A read-along as the list and the community page's "Reading together" line see it. No counts of replies or likes. */
export interface ReadAlongSummaryDTO {
  id: string;
  bookTitle: string;
  status: ReadAlongStatus;
  /** Moderators only; null for everyone else and while the read-along is not paused. */
  pausedReason: PauseReason | null;
  partCount: number;
  openedCount: number;
  nextOpensAt: string | null;
  readerCount: number;
}

/** The read-along page. */
export interface ReadAlongPageDTO {
  id: string;
  communitySlug: string;
  communityName: string;
  docSlug: string;
  bookTitle: string;
  status: ReadAlongStatus;
  pausedReason: PauseReason | null;
  weekday: number;
  /** `HH:MM`. */
  time: string;
  timeZone: string;
  startedBy: PersonDTO | null;
  parts: PartDTO[];
  readerCount: number;
  /** Members of the community only: names and each reader's last finished part. Null for everyone else. */
  readers: ReaderDTO[] | null;
  /** The viewer's own place; null when they have not joined. */
  me: { notify: boolean; lastPartDone: number } | null;
  canManage: boolean;
  canJoin: boolean;
  /** Whether the first part has not opened yet, so a moderator can still edit the parts. */
  editable: boolean;
}

/** One book the Start dialog can offer. */
export interface BookChoiceDTO {
  slug: string;
  title: string;
  pages: number;
  format: 'pdf' | 'epub';
}

/** The suggested parts for a book. */
export interface PlanDTO {
  book: BookChoiceDTO;
  hasToc: boolean;
  parts: PartDraft[];
  maxParts: number;
}
