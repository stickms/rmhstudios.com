/**
 * Theme voting for game jams (s07-07): the pure rules. Client-safe, no I/O.
 *
 * Approval voting: a member marks up to three candidates between the voting opening time and `startsAt`.
 * Counts and the winner never leave the server before `startsAt`; at the start the candidate with the most
 * marks wins, ties go to the candidate the admin listed first, and with no marks the first candidate wins.
 */

export const MAX_THEME_MARKS = 3;
export const MIN_THEME_CANDIDATES = 3;
export const MAX_THEME_CANDIDATES = 12;
export const THEME_TEXT_MAX = 120;

/**
 * Every server path that reads a jam's theme, its candidates' counts or its winner. Each must withhold them
 * before `startsAt`; `jam-theme-read-paths.test.ts` scans these files for the guard. Add a path here when a new
 * reader appears (an OG card, a feed, the developer API).
 */
export const JAM_THEME_READ_PATHS = [
  // The jam list and one jam (page loader and `GET /api/jams/$slug`): `summary()` and `getJam`.
  'lib/competitive/jams.server.ts',
  'lib/competitive/api/jams.server.ts',
  'lib/competitive/api/jams.$slug.server.ts',
  // The vote view and the candidate editor.
  'lib/competitive/jam-themes.server.ts',
  'lib/competitive/api/jams.$slug.theme-vote.server.ts',
  'lib/competitive/api/jams.$slug.theme-candidates.server.ts',
  // Admin lookup resolves a jam by slug and selects no theme column.
  'lib/admin/lookup.server.ts',
] as const;

export type ThemeVotingPhase = 'none' | 'before' | 'open' | 'closed';

export interface ThemeVotingWindow {
  themeVoting: boolean;
  themeVoteOpensAt: Date | null;
  startsAt: Date;
}

/** none: not a voting jam; before: opens later; open: marks accepted; closed: the jam has started. */
export function themeVotingPhase(jam: ThemeVotingWindow, now: Date = new Date()): ThemeVotingPhase {
  if (!jam.themeVoting) return 'none';
  const t = now.getTime();
  if (t >= jam.startsAt.getTime()) return 'closed';
  if (jam.themeVoteOpensAt && t < jam.themeVoteOpensAt.getTime()) return 'before';
  return 'open';
}

export type CandidateProblem = 'count' | 'empty' | 'length' | 'duplicate';

/** Trim and validate a shortlist: 3 to 12 entries, each 1 to 120 characters, unique ignoring case. */
export function validateCandidates(raw: readonly string[]):
  | {
      ok: true;
      texts: string[];
    }
  | {
      ok: false;
      problem: CandidateProblem;
    } {
  const texts = raw.map((s) => s.trim());
  if (texts.length < MIN_THEME_CANDIDATES || texts.length > MAX_THEME_CANDIDATES)
    return {
      ok: false,
      problem: 'count',
    };
  if (texts.some((s) => s.length === 0))
    return {
      ok: false,
      problem: 'empty',
    };
  if (texts.some((s) => s.length > THEME_TEXT_MAX))
    return {
      ok: false,
      problem: 'length',
    };
  const seen = new Set(texts.map((s) => s.toLowerCase()));
  if (seen.size !== texts.length)
    return {
      ok: false,
      problem: 'duplicate',
    };
  return {
    ok: true,
    texts,
  };
}

/** Plain English for a refused shortlist (the server's error body; the form shows its own translated copy). */
export const CANDIDATE_PROBLEM_MESSAGE: Record<CandidateProblem, string> = {
  count: `Offer ${MIN_THEME_CANDIDATES} to ${MAX_THEME_CANDIDATES} themes`,
  empty: 'A theme cannot be empty',
  length: `A theme can be at most ${THEME_TEXT_MAX} characters`,
  duplicate: 'Each theme must be different',
};

/**
 * The winning candidate id: most marks, ties to the lowest `position` (listed first), no marks at all to the
 * first. Null only for an empty list.
 */
export function winnerOf(
  candidates: readonly {
    id: string;
    position: number;
  }[],
  counts: ReadonlyMap<string, number> | Readonly<Record<string, number>>,
): string | null {
  const countOf = (id: string): number =>
    counts instanceof Map ? (counts.get(id) ?? 0) : ((counts as Record<string, number>)[id] ?? 0);
  let best: {
    id: string;
    position: number;
  } | null = null;
  let bestN = -1;
  for (const c of candidates) {
    const n = countOf(c.id);
    if (n > bestN || (n === bestN && best !== null && c.position < best.position)) {
      best = c;
      bestN = n;
    }
  }
  return best?.id ?? null;
}

/** The marks a member may keep: de-duplicated, order kept, refused above the cap. */
export function normaliseMarks(ids: readonly string[]):
  | {
      ok: true;
      ids: string[];
    }
  | {
      ok: false;
    } {
  const unique = [...new Set(ids)];
  return unique.length > MAX_THEME_MARKS
    ? {
        ok: false,
      }
    : {
        ok: true,
        ids: unique,
      };
}

/** Voting opens now unless the admin chose a time; it must be before the start. */
export function resolveVoteOpensAt(
  opensAt: Date | null | undefined,
  startsAt: Date,
  now: Date = new Date(),
): Date | null {
  const at = opensAt ?? now;
  return at.getTime() < startsAt.getTime() ? at : null;
}

/** The English text of the reveal notice (stored as the notification preview). */
export function revealNoticeText(jamTitle: string, theme: string): string {
  return `The theme of ${jamTitle} is ${theme}`;
}
