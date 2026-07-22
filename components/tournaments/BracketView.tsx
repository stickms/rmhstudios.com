'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SerializedTournament } from '@/lib/tournaments/tournament.server';

interface Props {
  tournament: SerializedTournament;
  canReport: boolean;
  reportingId: string | null;
  onReport: (matchId: string, winnerEntrantId: string) => void;
}

type Entrant = NonNullable<SerializedTournament['entrants']>[number];
type Match = NonNullable<SerializedTournament['matches']>[number];

export function BracketView({ tournament, canReport, reportingId, onReport }: Props) {
  const { t } = useTranslation('c-tournaments');
  const entrantsById = useMemo(() => {
    const map = new Map<string, Entrant>();
    for (const e of tournament.entrants ?? []) map.set(e.id, e);
    return map;
  }, [tournament.entrants]);

  const rounds = useMemo(() => {
    const byRound = new Map<number, Match[]>();
    for (const m of tournament.matches ?? []) {
      const arr = byRound.get(m.round) ?? [];
      arr.push(m);
      byRound.set(m.round, arr);
    }
    return [...byRound.entries()].sort((a, b) => a[0] - b[0]);
  }, [tournament.matches]);

  const name = (id: string | null) => {
    if (!id) return null;
    return entrantsById.get(id)?.user?.name ?? t('unknown', { defaultValue: 'TBD' });
  };

  const roundLabel = (round: number, total: number) => {
    if (tournament.format === 'ROUND_ROBIN') return t('matches', { defaultValue: 'Matches' });
    const fromEnd = total - round;
    if (fromEnd === 0) return t('final', { defaultValue: 'Final' });
    if (fromEnd === 1) return t('semis', { defaultValue: 'Semifinals' });
    if (fromEnd === 2) return t('quarters', { defaultValue: 'Quarterfinals' });
    return t('round-n', { defaultValue: 'Round {{n}}', n: round });
  };

  if (!tournament.matches || tournament.matches.length === 0) {
    return (
      <p className="text-site-text-dim text-sm py-6 text-center">
        {t('bracket-pending', { defaultValue: 'The bracket appears here once the host starts.' })}
      </p>
    );
  }

  return (
    <div
      role="region"
      aria-label={t('bracket', { defaultValue: 'Tournament bracket' })}
      tabIndex={0}
      className="glass-fill max-w-full overflow-x-auto rounded-site p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-site-accent"
    >
      <div className="flex gap-4 min-w-max">
        {rounds.map(([round, matches]) => (
          <div key={round} className="flex flex-col gap-3 min-w-[220px]">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-site-text-dim px-1">
              {roundLabel(round, rounds.length)}
            </h3>
            {matches.map((m) => {
              const aWon = m.winnerEntrantId && m.winnerEntrantId === m.entrantAId;
              const bWon = m.winnerEntrantId && m.winnerEntrantId === m.entrantBId;
              const ready = m.state === 'READY' || m.state === 'LIVE';
              return (
                <div key={m.id} className="glass-fill rounded-site p-2 space-y-1.5">
                  {[
                    { id: m.entrantAId, won: aWon },
                    { id: m.entrantBId, won: bWon },
                  ].map((side, i) => (
                    <div
                      key={i}
                      className={`flex items-center justify-between gap-2 rounded-[calc(var(--site-radius)-4px)] px-2 py-1.5 text-sm ${
                        side.won
                          ? 'bg-site-accent-dim text-site-accent font-semibold'
                          : 'text-site-text'
                      }`}
                    >
                      <span className="truncate">
                        {name(side.id) ?? (
                          <span className="text-site-text-dim italic">
                            {t('bye', { defaultValue: 'bye' })}
                          </span>
                        )}
                      </span>
                      {side.won && <Trophy className="size-3.5 shrink-0" />}
                    </div>
                  ))}
                  {canReport && ready && m.entrantAId && m.entrantBId && (
                    <div className="flex gap-1 pt-1">
                      <Button
                        size="xs"
                        variant="outline"
                        className="flex-1"
                        loading={reportingId === m.id}
                        onClick={() => onReport(m.id, m.entrantAId!)}
                      >
                        {name(m.entrantAId)}
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        className="flex-1"
                        loading={reportingId === m.id}
                        onClick={() => onReport(m.id, m.entrantBId!)}
                      >
                        {name(m.entrantBId)}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
