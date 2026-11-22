/**
 * The Rounds view of a tournament bracket (sprint 08, feature 16): the same matches the tree draws, ordered as a list.
 *
 * Pure and client-safe. It returns data and label descriptors, never strings: the components translate the labels, so
 * the tree and the list name a round the same way. Both views derive from `groupRounds` here, so they never disagree.
 */

export type BracketViewChoice = 'rounds' | 'bracket';

/** The stored choice and the `?view=` value; anything else is no choice. */
export function parseBracketView(value: unknown): BracketViewChoice | null {
  return value === 'rounds' || value === 'bracket' ? value : null;
}

export interface RoundsMatch {
  id: string;
  round: number;
  slot: number;
  entrantAId: string | null;
  entrantBId: string | null;
  winnerEntrantId: string | null;
  state: string;
  bracket: string;
  disputed: boolean;
  claimedWinnerId: string | null;
}

export interface RoundsEntrant {
  id: string;
  user: { id?: string | null } | null;
}

export type TournamentFormat = 'SINGLE_ELIM' | 'DOUBLE_ELIM' | 'ROUND_ROBIN' | 'SWISS' | string;

/** How a round is named; the component picks the literal translation for each kind. */
export type RoundLabel =
  | { kind: 'matches' }
  | { kind: 'final' }
  | { kind: 'semis' }
  | { kind: 'quarters' }
  | { kind: 'round-n'; n: number }
  | { kind: 'winners-final' }
  | { kind: 'grand-final' }
  | { kind: 'bracket-reset' }
  | { kind: 'losers-round'; n: number };

export type SectionId = 'W' | 'L' | 'F' | 'all';

export interface RoundGroup<M extends RoundsMatch> {
  round: number;
  /** 1-based position among the section's rounds. */
  index: number;
  label: RoundLabel;
  /** Single elimination names its rounds "Round 2 · Quarterfinals"; the others are named by the label alone. */
  numbered: boolean;
  matches: M[];
}

export interface RoundSection<M extends RoundsMatch> {
  id: SectionId;
  rounds: RoundGroup<M>[];
}

export interface RoundsViewData<M extends RoundsMatch> {
  /** The viewer's own matches, most pressing first; empty unless the viewer is an entrant. */
  yours: M[];
  sections: RoundSection<M>[];
}

const DOUBLE_ELIM_SECTIONS: readonly { id: Exclude<SectionId, 'all'>; brackets: readonly string[] }[] = [
  { id: 'W', brackets: ['W'] },
  { id: 'L', brackets: ['L'] },
  { id: 'F', brackets: ['GF', 'GR'] },
];

/** Matches grouped by round number, rounds ascending, matches by slot. */
export function groupRounds<M extends { round: number; slot: number }>(matches: readonly M[]): [number, M[]][] {
  const byRound = new Map<number, M[]>();
  for (const m of matches) {
    const arr = byRound.get(m.round) ?? [];
    arr.push(m);
    byRound.set(m.round, arr);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, list]) => [round, [...list].sort((a, b) => a.slot - b.slot)]);
}

/** The label of round `round` of `total` in single elimination, round robin and Swiss. */
export function singleLabel(format: TournamentFormat, round: number, total: number): RoundLabel {
  if (format === 'ROUND_ROBIN') return { kind: 'matches' };
  if (format === 'SWISS') return { kind: 'round-n', n: round };
  const fromEnd = total - round;
  if (fromEnd === 0) return { kind: 'final' };
  if (fromEnd === 1) return { kind: 'semis' };
  if (fromEnd === 2) return { kind: 'quarters' };
  return { kind: 'round-n', n: round };
}

/** The label of a round inside a double-elimination section. */
export function doubleLabel(
  sectionId: SectionId,
  round: number,
  firstBracket: string | undefined,
  index: number,
  total: number,
): RoundLabel {
  if (sectionId === 'F') return firstBracket === 'GR' ? { kind: 'bracket-reset' } : { kind: 'grand-final' };
  if (sectionId === 'W' && index === total - 1) return { kind: 'winners-final' };
  if (sectionId === 'W') return { kind: 'round-n', n: round };
  return { kind: 'losers-round', n: index + 1 };
}

/** The entrant id the viewer plays as, or null (signed out, or not entered). */
export function viewerEntrantId(
  entrants: readonly RoundsEntrant[],
  viewerId: string | null | undefined,
): string | null {
  if (!viewerId) return null;
  return entrants.find((e) => e.user?.id === viewerId)?.id ?? null;
}

/** Lower is more pressing: playable first, then waiting, then done. */
function urgency(m: RoundsMatch): number {
  if (m.state === 'LIVE' || m.state === 'READY') return 0;
  if (m.state === 'PENDING') return 1;
  if (m.state === 'COMPLETE' || m.state === 'BYE') return 2;
  return 3;
}

/**
 * The Rounds view's data. `yours` holds the viewer's matches (a bye is not a match to act on, so it stays out); every
 * match, the viewer's included, also stays in its round, so a round always reads in full.
 */
export function roundsView<M extends RoundsMatch>(
  matches: readonly M[],
  format: TournamentFormat,
  myEntrantId: string | null,
): RoundsViewData<M> {
  const build = (id: SectionId, list: readonly M[]): RoundSection<M> => {
    const columns = groupRounds(list);
    return {
      id,
      rounds: columns.map(([round, ms], i) => ({
        round,
        index: i + 1,
        label:
          format === 'DOUBLE_ELIM'
            ? doubleLabel(id, round, ms[0]?.bracket, i, columns.length)
            : singleLabel(format, round, columns.length),
        numbered: format === 'SINGLE_ELIM',
        matches: ms,
      })),
    };
  };

  const sections: RoundSection<M>[] =
    format === 'DOUBLE_ELIM'
      ? DOUBLE_ELIM_SECTIONS.map((s) =>
          build(
            s.id,
            matches.filter((m) => s.brackets.includes(m.bracket)),
          ),
        ).filter((s) => s.rounds.length > 0)
      : [build('all', matches)];

  const yours = myEntrantId
    ? matches
        .filter(
          (m) =>
            (m.entrantAId === myEntrantId || m.entrantBId === myEntrantId) &&
            m.state !== 'BYE' &&
            m.state !== 'CANCELLED',
        )
        .sort((a, b) => urgency(a) - urgency(b) || a.round - b.round || a.slot - b.slot)
    : [];

  return { yours, sections };
}

export type MatchStatus = 'bye' | 'cancelled' | 'done' | 'disputed' | 'waiting-result' | 'live' | 'ready' | 'waiting';

/** The status word of a match row. */
export function matchStatus(m: RoundsMatch): MatchStatus {
  if (m.state === 'BYE') return 'bye';
  if (m.state === 'CANCELLED') return 'cancelled';
  if (m.state === 'COMPLETE') return 'done';
  if (m.disputed) return 'disputed';
  if (m.claimedWinnerId) return 'waiting-result';
  if (m.state === 'LIVE') return 'live';
  if (m.state === 'READY') return 'ready';
  return 'waiting';
}
