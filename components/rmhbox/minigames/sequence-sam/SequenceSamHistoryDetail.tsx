/**
 * SequenceSamHistoryDetail — the expanded history view of a Sequence Sam match:
 * each round's length and every player's correct steps and points.
 */

import { useTranslation } from 'react-i18next';
import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';
import { padName } from './pad-names';

interface LoggedResult {
  userId: string;
  correctSteps: number;
  completed: boolean;
  points: number;
  out: boolean;
  newTotalScore: number;
}

interface LoggedRound {
  roundIndex: number;
  length: number;
  sequence: number[];
  results: LoggedResult[];
}

export default function SequenceSamHistoryDetail({ gameLog, currentUserId, players }: HistoryDetailProps) {
  const { t } = useTranslation('sequence-sam');
  const rounds = gameLog.actions
    .filter((a) => a.type === 'round_result')
    .map((a) => a.payload as unknown as LoggedRound);

  return (
    <div className="space-y-6" data-testid="ss-history-detail">
      {rounds.map((round) => (
        <section
          key={round.roundIndex}
          aria-label={t('history-round', { defaultValue: 'Round {{num}}', num: round.roundIndex + 1 })}
        >
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h4 className="text-sm font-semibold text-app-text">
              {t('history-round', { defaultValue: 'Round {{num}}', num: round.roundIndex + 1 })}
            </h4>
            <span className="text-xs text-app-text-muted">
              {t('history-length', {
                defaultValue_one: '{{count}} step',
                defaultValue: '{{count}} steps',
                count: round.length,
              })}
            </span>
          </div>
          <p className="mb-2 text-sm text-app-text-muted">{round.sequence.map((pad) => padName(t, pad)).join(', ')}</p>
          <ul className="border-t border-app-border">
            {round.results.map((r) => {
              const name = players.find((p) => p.userId === r.userId)?.userName ?? r.userId;
              return (
                <li
                  key={r.userId}
                  className={`flex items-center justify-between gap-3 border-b border-app-border py-1.5 text-xs ${
                    r.userId === currentUserId ? 'font-semibold text-app-text' : 'text-app-text-muted'
                  }`}
                >
                  <span className="truncate" dir="auto">
                    <bdi>{name}</bdi>
                    {r.out ? ` · ${t('history-out', { defaultValue: 'Out' })}` : ''}
                  </span>
                  <span className="font-mono tabular-nums">
                    {t('history-steps', {
                      defaultValue: '{{correct}} of {{length}} steps',
                      correct: r.correctSteps,
                      length: round.length,
                    })}{' '}
                    · +{r.points}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <section>
        <h4 className="mb-1 text-sm font-semibold text-app-text">
          {t('final-scores', { defaultValue: 'Final scores' })}
        </h4>
        <ul className="border-t border-app-border">
          {[...players]
            .sort((a, b) => a.rank - b.rank)
            .map((p) => (
              <li
                key={p.userId}
                className={`flex justify-between border-b border-app-border py-1.5 text-sm ${
                  p.userId === currentUserId ? 'font-semibold text-app-text' : 'text-app-text'
                }`}
              >
                <span dir="auto">
                  #{p.rank} <bdi>{p.userName}</bdi>
                </span>
                <span className="font-mono tabular-nums">{p.score}</span>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}
