import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MatchResultControls } from '@/components/tournaments/MatchResultControls';
import { MatchSchedule } from '@/components/tournaments/MatchSchedule';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

interface Props {
  tournament: SerializedTournament;
  canReport: boolean;
  reportingId: string | null;
  onReport: (matchId: string, winnerEntrantId: string) => void;
  /** The signed-in viewer (null signed out): players confirm, dispute or withdraw reports (s06-20). */
  viewerId?: string | null;
  /** Reload the tournament after a result step. */
  onChanged?: () => Promise<void> | void;
}

type Entrant = NonNullable<SerializedTournament['entrants']>[number];
type Match = NonNullable<SerializedTournament['matches']>[number];
type RoundColumn = [number, Match[]];

/** The sections a double-elimination bracket is drawn in: winners, losers, final. */
const DOUBLE_ELIM_SECTIONS = [
  { id: 'W', brackets: ['W'] },
  { id: 'L', brackets: ['L'] },
  { id: 'F', brackets: ['GF', 'GR'] },
] as const;

/** Matches grouped into round columns, in round order. */
function groupRounds(matches: Match[]): RoundColumn[] {
  const byRound = new Map<number, Match[]>();
  for (const m of matches) {
    const arr = byRound.get(m.round) ?? [];
    arr.push(m);
    byRound.set(m.round, arr);
  }
  return [...byRound.entries()].sort((a, b) => a[0] - b[0]);
}

export function BracketView({ tournament, canReport, reportingId, onReport, viewerId = null, onChanged }: Props) {
  const { t } = useTranslation('c-tournaments');
  const entrantsById = useMemo(() => {
    const map = new Map<string, Entrant>();
    for (const e of tournament.entrants ?? []) map.set(e.id, e);
    return map;
  }, [tournament.entrants]);

  const rounds = useMemo(() => groupRounds(tournament.matches ?? []), [tournament.matches]);
  // Double elimination draws one section per bracket, each with its own rounds.
  const sections = useMemo(
    () =>
      tournament.format === 'DOUBLE_ELIM'
        ? DOUBLE_ELIM_SECTIONS.map((section) => ({
            id: section.id,
            rounds: groupRounds(
              (tournament.matches ?? []).filter((m) => (section.brackets as readonly string[]).includes(m.bracket)),
            ),
          })).filter((section) => section.rounds.length > 0)
        : [],
    [tournament.format, tournament.matches],
  );

  const name = (id: string | null) => {
    if (!id) return null;
    return (
      entrantsById.get(id)?.user?.name ??
      t('unknown', {
        defaultValue: 'TBD',
      })
    );
  };

  // Seed numbers next to names in the elimination brackets (round robin and Swiss rank by results).
  const showSeeds = tournament.format === 'SINGLE_ELIM' || tournament.format === 'DOUBLE_ELIM';
  const seedMark = (id: string | null) => {
    const seed = id ? entrantsById.get(id)?.seed : null;
    if (!showSeeds || seed == null) return null;
    return (
      <>
        <span className="t-meta mr-2 tabular-nums" aria-hidden>
          {seed}
        </span>
        <span className="sr-only">
          {t('seed-label', {
            ns: 'tournament-seeding',
            defaultValue: 'Seed {{seed}}',
            seed,
          })}
        </span>
      </>
    );
  };

  const roundLabel = (round: number, total: number) => {
    if (tournament.format === 'ROUND_ROBIN')
      return t('matches', {
        defaultValue: 'Matches',
      });
    if (tournament.format === 'SWISS')
      return t('round-n', {
        defaultValue: 'Round {{n}}',
        n: round,
      });
    const fromEnd = total - round;
    if (fromEnd === 0)
      return t('final', {
        defaultValue: 'Final',
      });
    if (fromEnd === 1)
      return t('semis', {
        defaultValue: 'Semifinals',
      });
    if (fromEnd === 2)
      return t('quarters', {
        defaultValue: 'Quarterfinals',
      });
    return t('round-n', {
      defaultValue: 'Round {{n}}',
      n: round,
    });
  };

  // Round labels inside a double-elimination section.
  const doubleLabel = (sectionId: string, column: RoundColumn, index: number, total: number) => {
    if (sectionId === 'F') {
      return column[1][0]?.bracket === 'GR'
        ? t('bracket-reset', { ns: 'double-elimination', defaultValue: 'Bracket reset' })
        : t('grand-final', { ns: 'double-elimination', defaultValue: 'Grand final' });
    }
    if (sectionId === 'W' && index === total - 1) {
      return t('winners-final', { ns: 'double-elimination', defaultValue: 'Winners final' });
    }
    if (sectionId === 'W') {
      return t('round-n', { defaultValue: 'Round {{n}}', n: column[0] });
    }
    return t('losers-round', { ns: 'double-elimination', defaultValue: 'Losers round {{n}}', n: index + 1 });
  };

  if (!tournament.matches || tournament.matches.length === 0) {
    return (
      <p className="text-site-text-muted text-sm py-6 text-center">
        {t('bracket-pending', {
          defaultValue: 'The bracket appears here once the host starts.',
        })}
      </p>
    );
  }

  const renderColumns = (
    columns: RoundColumn[],
    label: (column: RoundColumn, index: number, total: number) => string,
  ) => (
    <div className="flex gap-4 min-w-max">
      {columns.map((column, columnIndex) => (
        <div key={column[0]} className="flex flex-col gap-3 w-56 shrink-0">
          <h3 className="site-section-label px-1">{label(column, columnIndex, columns.length)}</h3>
          {column[1].map((m) => {
            const aWon = m.winnerEntrantId && m.winnerEntrantId === m.entrantAId;
            const bWon = m.winnerEntrantId && m.winnerEntrantId === m.entrantBId;
            const ready = m.state === 'READY' || m.state === 'LIVE';
            // Closed unplayed when the tournament was cancelled: muted, no winner, no report.
            const cancelled = m.state === 'CANCELLED';
            return (
              <div key={m.id} className="flex flex-col gap-2 p-4">
                {cancelled && (
                  <span className="px-1 text-xs text-site-text-muted">
                    {t('match-cancelled', {
                      defaultValue: 'Cancelled',
                    })}
                  </span>
                )}
                {[
                  {
                    id: m.entrantAId,
                    won: aWon,
                  },
                  {
                    id: m.entrantBId,
                    won: bWon,
                  },
                ].map((side, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between gap-2 rounded-site-sm px-3 py-2 text-sm ${
                      side.won
                        ? 'bg-site-bg-subtle text-site-accent font-semibold'
                        : cancelled
                          ? 'text-site-text-muted'
                          : 'text-site-text'
                    }`}
                  >
                    <span className="truncate">
                      {seedMark(side.id)}
                      {name(side.id) ?? (
                        <span className="text-site-text-muted italic">
                          {t('bye', {
                            defaultValue: 'bye',
                          })}
                        </span>
                      )}
                    </span>
                    {side.won && <Trophy className="size-3.5 shrink-0" aria-hidden />}
                  </div>
                ))}
                {canReport && ready && !cancelled && m.entrantAId && m.entrantBId && (
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      variant="default"
                      className="flex-1 min-w-0 truncate"
                      loading={reportingId === m.id}
                      aria-label={t('report-winner', {
                        ns: 'bracket-list',
                        defaultValue: 'Report {{name}} won',
                        name: name(m.entrantAId),
                      })}
                      onClick={() => onReport(m.id, m.entrantAId!)}
                    >
                      {name(m.entrantAId)}
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      className="flex-1 min-w-0 truncate"
                      loading={reportingId === m.id}
                      aria-label={t('report-winner', {
                        ns: 'bracket-list',
                        defaultValue: 'Report {{name}} won',
                        name: name(m.entrantBId),
                      })}
                      onClick={() => onReport(m.id, m.entrantBId!)}
                    >
                      {name(m.entrantBId)}
                    </Button>
                  </div>
                )}
                {onChanged && (
                  <MatchSchedule
                    tournamentId={tournament.id}
                    tournamentStatus={tournament.status}
                    match={m}
                    entrants={tournament.entrants ?? []}
                    viewerId={viewerId}
                    isManager={canReport}
                    onChanged={onChanged}
                    idScope="tree-"
                  />
                )}
                {onChanged && (
                  <MatchResultControls
                    tournamentId={tournament.id}
                    match={m}
                    entrants={tournament.entrants ?? []}
                    viewerId={viewerId}
                    isManager={canReport}
                    onChanged={onChanged}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );

  if (tournament.format === 'DOUBLE_ELIM') {
    const titles: Record<string, string> = {
      W: t('winners', { ns: 'double-elimination', defaultValue: 'Winners' }),
      L: t('losers', { ns: 'double-elimination', defaultValue: 'Losers' }),
      F: t('final', { ns: 'double-elimination', defaultValue: 'Final' }),
    };
    return (
      <div className="flex flex-col gap-8">
        {sections.map((section) => (
          <section
            key={section.id}
            aria-labelledby={`bracket-section-${section.id}`}
            className="flex flex-col gap-3 border-t border-site-border pt-4 first:border-t-0 first:pt-0"
          >
            <h2 id={`bracket-section-${section.id}`} className="t-heading">
              {titles[section.id]}
            </h2>
            <div role="region" aria-label={titles[section.id]} tabIndex={0} className="max-w-full overflow-x-auto p-1">
              {renderColumns(section.rounds, (column, index, total) => doubleLabel(section.id, column, index, total))}
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={t('bracket', {
        defaultValue: 'Tournament bracket',
      })}
      tabIndex={0}
      className="max-w-full overflow-x-auto p-5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent"
    >
      {renderColumns(rounds, (column, _index, total) => roundLabel(column[0], total))}
    </div>
  );
}
