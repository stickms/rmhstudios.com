/**
 * The programming grid (L1) — what is on, and when. Pure and client-safe.
 *
 * ## Why the platform needs a "when" at all
 *
 * Every surface here is on-demand. Nothing happens AT a time, which is why
 * there is no reason to open the site at 8pm rather than never. The pieces
 * exist and are scattered: `DailyPuzzle` drops daily, `DailyWheelSpin` resets
 * daily, `Tournament` has a start, `CommunityEvent` has an RSVP,
 * `ScheduledPost` has a publish time, and none of them appear anywhere
 * together. A member cannot answer "what is on today" because nothing on the
 * site answers it.
 *
 * ## Why slots are a table and not derived
 *
 * The opposite call from ranked seasons, on purpose. A season is a pure
 * function of the date and needs no row; a schedule is editorial — somebody
 * decides that Thursday's featured build is this one — so it is rows, and
 * `lib/verticals.ts`-style derivation would be wrong.
 *
 * What IS derived is the recurring half: a daily puzzle drop does not need
 * 365 rows a year, so a slot carries a recurrence and the grid expands it over
 * the window being viewed.
 */

/** What kind of thing is on. Drives the icon, the colour and the link. */
export const SLOT_KINDS = [
  'daily-puzzle',
  'tournament',
  'community-event',
  'premiere',
  'featured-build',
  'company-report',
  'season',
  'maintenance',
] as const;
export type SlotKind = (typeof SLOT_KINDS)[number];

/** How a slot repeats. `once` is the default and needs no expansion. */
export const RECURRENCES = ['once', 'daily', 'weekly'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export interface SlotDefinition {
  id: string;
  kind: SlotKind;
  title: string;
  /** Where it happens. Relative, so the grid can render a link. */
  href: string | null;
  /** First (or only) occurrence, UTC. */
  startsAt: Date;
  /** Minutes. Zero for a moment rather than a window — a puzzle drop. */
  durationMinutes: number;
  recurrence: Recurrence;
  /** When a recurring slot stops. Null means indefinitely. */
  until: Date | null;
}

/** One concrete thing at one concrete time, after recurrence is expanded. */
export interface Occurrence {
  slotId: string;
  kind: SlotKind;
  title: string;
  href: string | null;
  startsAt: Date;
  endsAt: Date;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * Expand one slot across a window.
 *
 * Bounded by `maxOccurrences` as well as by the window: a daily slot with no
 * `until`, asked for a decade, would otherwise produce 3,650 rows for a page
 * that shows seven. The cap is a safety rail on the caller's arithmetic, not a
 * product rule.
 */
export function expand(
  slot: SlotDefinition,
  from: Date,
  to: Date,
  maxOccurrences = 400,
): Occurrence[] {
  const out: Occurrence[] = [];
  const step = slot.recurrence === 'daily' ? DAY_MS : slot.recurrence === 'weekly' ? WEEK_MS : 0;
  const duration = Math.max(0, slot.durationMinutes) * 60_000;
  const hardEnd = slot.until ? Math.min(to.getTime(), slot.until.getTime()) : to.getTime();

  if (step === 0) {
    const t = slot.startsAt.getTime();
    if (t >= from.getTime() && t <= hardEnd) out.push(occurrence(slot, t, duration));
    return out;
  }

  // Jump straight to the first occurrence at or after `from` rather than
  // walking from the slot's start — a daily slot that began a year ago would
  // otherwise cost 365 iterations to render this week.
  const start = slot.startsAt.getTime();
  const skipped = start >= from.getTime() ? 0 : Math.ceil((from.getTime() - start) / step);
  let t = start + skipped * step;

  while (t <= hardEnd && out.length < maxOccurrences) {
    out.push(occurrence(slot, t, duration));
    t += step;
  }
  return out;
}

function occurrence(slot: SlotDefinition, startMs: number, durationMs: number): Occurrence {
  return {
    slotId: slot.id,
    kind: slot.kind,
    title: slot.title,
    href: slot.href,
    startsAt: new Date(startMs),
    endsAt: new Date(startMs + durationMs),
  };
}

/** Expand many slots and return them in time order. */
export function buildGrid(slots: readonly SlotDefinition[], from: Date, to: Date): Occurrence[] {
  return slots
    .flatMap((s) => expand(s, from, to))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

/** Midnight UTC on the day containing `at`. */
export function startOfDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}

/**
 * Group occurrences by UTC day, for the week view.
 *
 * Every day in the window gets a bucket, including empty ones — a grid that
 * silently omits quiet days is a grid whose columns move, and a member reading
 * "nothing on Wednesday" is reading real information.
 */
export function groupByDay(
  occurrences: readonly Occurrence[],
  from: Date,
  days: number,
): { day: Date; occurrences: Occurrence[] }[] {
  const base = startOfDay(from);
  const buckets = Array.from({ length: days }, (_, i) => ({
    day: new Date(base.getTime() + i * DAY_MS),
    occurrences: [] as Occurrence[],
  }));

  for (const o of occurrences) {
    const index = Math.floor((startOfDay(o.startsAt).getTime() - base.getTime()) / DAY_MS);
    if (index >= 0 && index < days) buckets[index].occurrences.push(o);
  }
  return buckets;
}

/** The next occurrence at or after `at`, or null when the grid is empty. */
export function nextUp(occurrences: readonly Occurrence[], at: Date): Occurrence | null {
  return occurrences.find((o) => o.endsAt.getTime() >= at.getTime()) ?? null;
}
