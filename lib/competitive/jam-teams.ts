/**
 * Game jam teams, the pure half (s05-15): the cap, who may rate, the one-entry rule, the refusal codes and
 * the shaping of the "by A, B and C" credit line. Client-safe: no Prisma, no server imports.
 */
import { JAM_CATEGORIES, type Averages, type JamCategory } from './jam';

/** The submitter invites at most this many teammates (invited and accepted together): a team of four. */
export const MAX_TEAMMATES = 3;

export type TeamStatus = 'invited' | 'accepted';

/** What the viewer is to an entry: its submitter, an accepted teammate, an invited (unaccepted) member, or nothing. */
export type ViewerTeamState = 'owner' | 'teammate' | 'invited' | null;

export interface TeamPersonDTO {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}

/** One team row as the submitter (all rows), a teammate (accepted rows) or the invitee (their own row) reads it. */
export interface TeamEntryDTO extends TeamPersonDTO {
  status: TeamStatus;
  invitedAt: string;
}

export function resolveTeamState(
  ownerId: string,
  viewerId: string | null,
  rowStatus: string | null | undefined,
): ViewerTeamState {
  if (!viewerId) return null;
  if (viewerId === ownerId) return 'owner';
  if (rowStatus === 'accepted') return 'teammate';
  if (rowStatus === 'invited') return 'invited';
  return null;
}

/** Whether another invitation fits: pending and accepted rows both count towards the cap. */
export const hasTeamRoom = (rows: number): boolean => rows < MAX_TEAMMATES;

/** The submitter and the accepted teammates of an entry may not rate it; an invited member is not on the team yet. */
export function mayRateEntry(
  entry: { userId: string; acceptedIds: readonly string[] },
  raterId: string,
): boolean {
  return raterId !== entry.userId && !entry.acceptedIds.includes(raterId);
}

/** The one-entry rule: the entry a member is already on in this jam (their own, or one they accepted), other than `entryId`. */
export function conflictingPlacement<T extends { entryId: string }>(
  placements: readonly T[],
  entryId: string | null,
): T | null {
  return placements.find((p) => p.entryId !== entryId) ?? null;
}

export type TeamRefusal =
  | 'not-found'
  | 'not-owner'
  | 'self'
  | 'full'
  | 'blocked'
  | 'banned'
  | 'user-not-found'
  | 'closed'
  | 'no-invite'
  | 'already-accepted'
  | 'already-on-entry';

const REFUSALS: Record<TeamRefusal, { status: number; message: string }> = {
  'not-found': { status: 404, message: 'Not found' },
  'not-owner': { status: 403, message: 'Only the submitter can do that' },
  self: { status: 400, message: 'You submitted this entry' },
  full: { status: 409, message: `A team can have at most ${MAX_TEAMMATES} teammates besides the submitter` },
  blocked: { status: 403, message: "That member can't be invited" },
  banned: { status: 403, message: "That member can't be invited right now" },
  'user-not-found': { status: 404, message: 'Member not found' },
  closed: { status: 409, message: 'Submissions are closed, so the team can no longer change' },
  'no-invite': { status: 404, message: 'There is no invitation to answer' },
  'already-accepted': { status: 409, message: 'You are already on this team. Leave it instead.' },
  'already-on-entry': { status: 409, message: 'You are already on another entry in this jam' },
};

export const teamRefusalStatus = (code: TeamRefusal): number => REFUSALS[code].status;
export const teamRefusalMessage = (code: TeamRefusal): string => REFUSALS[code].message;

/** The refusal for a member who is already on another entry of the jam, naming it. */
export const alreadyOnEntryMessage = (entryTitle: string): string => `You are already on ${entryTitle}`;

/** A person's display name for a sentence: their name, else their @handle, else nothing. */
export function personLabel(p: Pick<TeamPersonDTO, 'name' | 'handle'>): string | null {
  const name = p.name?.trim();
  if (name) return name;
  return p.handle ? `@${p.handle}` : null;
}

/** The credit names for "by A, B and C": the submitter first, then the accepted teammates; nameless members dropped. */
export function creditNames(
  owner: Pick<TeamPersonDTO, 'name' | 'handle'>,
  team: readonly Pick<TeamPersonDTO, 'name' | 'handle'>[],
): string[] {
  return [owner, ...team].flatMap((p) => {
    const label = personLabel(p);
    return label ? [label] : [];
  });
}

/** The names joined the way the reader's language joins a list ("A, B and C"). */
export function listNames(names: readonly string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(names);
  } catch {
    return names.join(', ');
  }
}

type Sums = Record<JamCategory, number>;

export interface RatingTotals {
  entryId: string;
  sum: Sums;
  count: number;
}

export interface RatingRow extends Sums {
  entryId: string;
  raterId: string;
}

/**
 * Per-entry category means with every rating from the entry's own team taken out. `rateEntry` refuses such a
 * rating and an accepted invitation deletes an earlier one, so none should exist; the leaderboard still does
 * not trust that, because a teammate's score would be worth the same as anyone else's. `teamPairs` holds
 * `entryId:raterId` for the submitter and every accepted teammate; `rows` are the ratings those raters left.
 */
export function discountTeamRatings(
  totals: readonly RatingTotals[],
  rows: readonly RatingRow[],
  teamPairs: ReadonlySet<string>,
): Map<string, { avg: Averages; count: number }> {
  const out = new Map<string, { avg: Averages; count: number }>();
  for (const t of totals) {
    const sum = { ...t.sum };
    let count = t.count;
    for (const r of rows) {
      if (r.entryId !== t.entryId || !teamPairs.has(`${r.entryId}:${r.raterId}`)) continue;
      for (const c of JAM_CATEGORIES) sum[c] -= r[c];
      count -= 1;
    }
    if (count <= 0) continue;
    const avg = Object.fromEntries(JAM_CATEGORIES.map((c) => [c, sum[c] / count])) as Averages;
    out.set(t.entryId, { avg, count });
  }
  return out;
}
