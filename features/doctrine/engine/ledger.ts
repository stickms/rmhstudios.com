/**
 * "Where your XP came from" (sprint 14 05), pure side: the action to label-key map, the 30-day summary, the day
 * bucketing for the profile heatmap and the keyset cursor. Client-safe; the reads are in `ledger.server.ts`.
 *
 * The stored `reason` is an English sentence and `metadata` carries puzzle and incident ids, so neither ever leaves
 * the server: a row is shown by its `action`, translated by `xp-ledger.tsx` from the label keys below.
 */
import { dayOf, isValidTimeZone } from '@/lib/calendar/tz';
import { XP_ACTIONS } from './constants';

/** Rows per page of the breakdown. */
export const LEDGER_PAGE_SIZE = 30;
/** The summary covers this many days. */
export const SUMMARY_DAYS = 30;
/** The heatmap's span. */
export const HEATMAP_WEEKS = 16;
/** The export's row ceiling. */
export const EXPORT_ROW_LIMIT = 5000;
/** A safety bound on rows read for one summary or heatmap. */
export const WINDOW_ROW_LIMIT = 20000;

/** The label key (a key of the `doctrine-ledger` namespace) of the action the weekly decay job writes. */
export const WEEKLY_DECAY_ACTION = 'WEEKLY_DECAY';
export const OTHER_LABEL = 'action-other';

/** One literal key per `XP_ACTIONS` key plus the decay; `xp-ledger.tsx` holds the literal `t()` call of each. */
export const ACTION_LABEL_KEYS: Readonly<Record<string, string>> = {
  PUZZLE_SOLVE: 'action-puzzle-solve',
  PUZZLE_SOLVE_STREAK_BONUS: 'action-puzzle-solve-streak-bonus',
  PUZZLE_TOP_10_PERCENT: 'action-puzzle-top-10-percent',
  PUZZLE_FIRST_SOLVE: 'action-puzzle-first-solve',
  PUZZLE_REPLAY_SOLVE: 'action-puzzle-replay-solve',
  SAFEHOUSE_POST_REACTION: 'action-safehouse-post-reaction',
  SAFEHOUSE_COMMENT: 'action-safehouse-comment',
  DISCLOSURE_EARLY_VIEW: 'action-disclosure-early-view',
  RECRUIT_SIGNUP: 'action-recruit-signup',
  RECRUIT_CONVERT_TO_PAID: 'action-recruit-convert-to-paid',
  INCIDENT_FIRST_REPORT: 'action-incident-first-report',
  INCIDENT_REACTION: 'action-incident-reaction',
  SAHUR_PARTICIPATION: 'action-sahur-participation',
  SAHUR_CHALLENGE_COMPLETE: 'action-sahur-challenge-complete',
  NIGHTFALL_ACHIEVEMENT: 'action-nightfall-achievement',
  STOA_SPACE_CREATED: 'action-stoa-space-created',
  [WEEKLY_DECAY_ACTION]: 'action-weekly-decay',
};

/** Every action that has a label (the `XP_ACTIONS` keys and the decay). */
export const LEDGER_ACTIONS: readonly string[] = [...Object.keys(XP_ACTIONS), WEEKLY_DECAY_ACTION];

/** The label key for a stored action; anything unknown (an action retired since) is "Other". */
export function labelKeyFor(action: string): string {
  return Object.hasOwn(ACTION_LABEL_KEYS, action) ? (ACTION_LABEL_KEYS[action] ?? OTHER_LABEL) : OTHER_LABEL;
}

export interface LedgerRowView {
  id: string;
  action: string;
  xpDelta: number;
  /** ISO instant. */
  at: string;
}

export interface LedgerSummary {
  /** Total of the positive changes in the last 30 days. */
  gained: number;
  /** Total of the negative changes in the last 30 days, as a positive magnitude. */
  lost: number;
  /** Net XP per action, the largest change (up or down) first. */
  byAction: { action: string; xp: number }[];
}

export interface LedgerPage {
  rows: LedgerRowView[];
  nextCursor: string | null;
  /** On the first page only. */
  summary: LedgerSummary | null;
}

export interface ActivityDays {
  /** `YYYY-MM-DD` to the number of XP-earning changes that day. */
  days: Record<string, number>;
}

/** The 30-day summary of a set of (action, change) pairs. */
export function summarize(rows: readonly { action: string; xpDelta: number }[]): LedgerSummary {
  let gained = 0;
  let lost = 0;
  const net = new Map<string, number>();
  for (const row of rows) {
    if (row.xpDelta > 0) gained += row.xpDelta;
    else if (row.xpDelta < 0) lost += -row.xpDelta;
    net.set(row.action, (net.get(row.action) ?? 0) + row.xpDelta);
  }
  const byAction = [...net.entries()]
    .filter(([, xp]) => xp !== 0)
    .map(([action, xp]) => ({ action, xp }))
    .sort((a, b) => Math.abs(b.xp) - Math.abs(a.xp) || a.action.localeCompare(b.action));
  return { gained, lost, byAction };
}

/** The time zone to bucket days in: the one the page sent when it is a real IANA name, else UTC. */
export function resolveTimeZone(tz: string | undefined): string {
  return tz && isValidTimeZone(tz) ? tz : 'UTC';
}

/** Earning rows per local day: only positive changes count, in `tz` (UTC when invalid). */
export function bucketDays(
  rows: readonly { xpDelta: number; createdAt: Date }[],
  tz: string | undefined,
): Record<string, number> {
  const zone = resolveTimeZone(tz);
  const days: Record<string, number> = {};
  for (const row of rows) {
    if (row.xpDelta <= 0) continue;
    const day = dayOf(row.createdAt.getTime(), zone);
    days[day] = (days[day] ?? 0) + 1;
  }
  return days;
}

export {
  type TimeIdCursor as LedgerCursor,
  encodeTimeIdCursor as encodeLedgerCursor,
  decodeTimeIdCursor as decodeLedgerCursor,
} from '@/lib/core/time-id-cursor';
