/**
 * Impersonation reports (J2) — the pure half.
 *
 * `ContentReport` covers content: one entity, one judgement. "This account is
 * pretending to be someone" is a different investigation — a *comparison* of
 * two accounts — and the evidence it needs is the id of the account being
 * impersonated. A free-text note ("this is fake, see @realalice") makes the
 * moderator do the lookup by hand and go looking for a handle that may since
 * have changed.
 *
 * No schema change was available, so the flow rides `ContentReport` with:
 *   - `entityType: 'impersonation'` — a distinct queue signal, not a `'user'`
 *     report with a note;
 *   - `entityId` / `targetUserId` — the accused account;
 *   - `details` — a **structured header line** naming the impersonated account,
 *     followed by the reporter's own words.
 *
 * The header is human-readable on purpose: the existing admin queue renders
 * `details` verbatim, so a moderator with no new UI still sees who is being
 * impersonated, while `parseImpersonationDetails` gives the comparison endpoint
 * something machine-readable to build a side-by-side from.
 */

import { z } from 'zod';
import { HANDLE_REGEX } from '@/lib/handle';

/** The `entityType` value that marks a report as an impersonation claim. */
export const IMPERSONATION_ENTITY_TYPE = 'impersonation';

/** Marker opening the structured header line inside `ContentReport.details`. */
const HEADER_PREFIX = '[impersonating]';

/** `ContentReport.details` is `VarChar(1000)`. */
export const MAX_IMPERSONATION_NOTE = 700;

export const impersonationReportSchema = z.object({
  /** The account doing the impersonating (the one being reported). */
  accusedUserId: z.string().min(1).max(64),
  /** The account being impersonated. May be the reporter themselves. */
  impersonatedUserId: z.string().min(1).max(64),
  note: z.string().trim().max(MAX_IMPERSONATION_NOTE).optional(),
});

export type ImpersonationReportInput = z.infer<typeof impersonationReportSchema>;

export interface ImpersonationDetails {
  impersonatedUserId: string;
  impersonatedHandle: string | null;
  note: string;
}

/**
 * Build the `details` string for an impersonation report.
 *
 * Layout — one header line, a blank line, then the reporter's note:
 *
 * ```
 * [impersonating] @alice (id: ckxy…)
 *
 * They copied my avatar and bio last week.
 * ```
 */
export function encodeImpersonationDetails(input: {
  impersonatedUserId: string;
  impersonatedHandle?: string | null;
  note?: string | null;
}): string {
  const handle = input.impersonatedHandle ? `@${input.impersonatedHandle} ` : '';
  const header = `${HEADER_PREFIX} ${handle}(id: ${input.impersonatedUserId})`;
  const note = (input.note ?? '').trim();
  return (note ? `${header}\n\n${note}` : header).slice(0, 1000);
}

/**
 * Read the structured header back out of a stored report.
 *
 * Returns `null` for anything that is not one of our headers, so a legacy
 * free-text report (or a reporter who typed the marker themselves into the
 * note body) can never be mistaken for structured evidence.
 */
export function parseImpersonationDetails(
  details: string | null | undefined,
): ImpersonationDetails | null {
  if (!details) return null;
  const [header, ...rest] = details.split('\n');
  if (!header.startsWith(HEADER_PREFIX)) return null;

  const idMatch = /\(id:\s*([^)]+)\)/.exec(header);
  const impersonatedUserId = idMatch?.[1]?.trim();
  if (!impersonatedUserId) return null;

  const handleMatch = /@([a-z0-9_]+)/i.exec(header);
  const handle = handleMatch?.[1]?.toLowerCase() ?? null;

  return {
    impersonatedUserId,
    impersonatedHandle: handle && HANDLE_REGEX.test(handle) ? handle : null,
    note: rest.join('\n').trim(),
  };
}

/**
 * Signals a moderator should see side by side.
 *
 * Deliberately factual — how similar the two names are, when each account was
 * created, whether either has proved a domain. It scores nothing: the queue
 * gets evidence, and a human decides.
 */
export interface ImpersonationComparisonSide {
  userId: string;
  handle: string | null;
  name: string | null;
  image: string | null;
  createdAt: string;
  /** Former handles inside the 30-day window. */
  previousHandles: { handle: string; changedAt: string }[];
  /** Hosts this account claims on its profile, and whether each is verified. */
  claimedHosts: { host: string; verified: boolean }[];
}

/**
 * Normalised edit distance between two display names, 0 (unrelated) to 1
 * (identical). Case- and whitespace-insensitive.
 *
 * Cheap Levenshtein — the strings are display names, so the quadratic cost is
 * bounded by the 50-character column. This exists so the comparison view can
 * say "these names are 95% the same" rather than making a moderator eyeball
 * `Аlice` against `Alice`.
 */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const left = (a ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const right = (b ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!left && !right) return 0;
  if (left === right) return 1;
  if (!left || !right) return 0;

  const rows = left.length + 1;
  const cols = right.length + 1;
  let prev = new Array<number>(cols);
  let curr = new Array<number>(cols);
  for (let j = 0; j < cols; j++) prev[j] = j;

  for (let i = 1; i < rows; i++) {
    curr[0] = i;
    for (let j = 1; j < cols; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  const distance = prev[cols - 1];
  return 1 - distance / Math.max(left.length, right.length);
}
