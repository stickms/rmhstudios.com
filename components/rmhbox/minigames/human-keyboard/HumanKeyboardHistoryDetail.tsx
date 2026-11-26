/**
 * HumanKeyboardHistoryDetail — the expanded history view of a Human Keyboard
 * match: each round's sentence, whether the table finished it and how fast,
 * and every player's correct and wrong presses and points.
 */

import { useTranslation } from 'react-i18next';
import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

interface LoggedResult {
  userId: string;
  correct: number;
  wrong: number;
  points: number;
}

interface LoggedRound {
  roundIndex: number;
  sentenceId: string;
  sentence: string;
  completed: boolean;
  elapsedMs: number;
  results: LoggedResult[];
}

export default function HumanKeyboardHistoryDetail({ gameLog, currentUserId, players }: HistoryDetailProps) {
  const { t } = useTranslation('human-keyboard');
  const rounds = gameLog.actions
    .filter((a) => a.type === 'round_result')
    .map((a) => a.payload as unknown as LoggedRound);

  return (
    <div className="space-y-6" data-testid="hk-history-detail">
      {rounds.map((round) => (
        <section
          key={round.roundIndex}
          aria-label={t('history-round', { defaultValue: 'Round {{num}}', num: round.roundIndex + 1 })}
        >
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h4 className="text-sm font-semibold text-app-text">
              {t('history-round', { defaultValue: 'Round {{num}}', num: round.roundIndex + 1 })}
            </h4>
            <span className="font-mono text-xs tabular-nums text-app-text-muted">
              {round.completed
                ? t('history-finished', {
                    defaultValue: 'Finished in {{seconds}} s',
                    seconds: (round.elapsedMs / 1000).toFixed(1),
                  })
                : t('history-unfinished', { defaultValue: 'Not finished' })}
            </span>
          </div>
          <p className="mb-2 font-mono text-sm text-app-text-muted">{round.sentence}</p>
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
                  <span className="min-w-0 flex-1 truncate" dir="auto">
                    <bdi>{name}</bdi>
                  </span>
                  <span className="font-mono tabular-nums">
                    {t('history-presses', {
                      defaultValue: '{{correct}} correct, {{wrong}} wrong',
                      correct: r.correct,
                      wrong: r.wrong,
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
