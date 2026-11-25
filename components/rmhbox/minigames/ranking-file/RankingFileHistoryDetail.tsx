/**
 * RankingFileHistoryDetail — the expanded history view of a Ranking File
 * match: every round's prompt, the official order with its values, and each
 * player's distance from it.
 */

import { useTranslation } from 'react-i18next';
import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';
import { formatRankingValue } from '@/lib/rmhbox/ranking-file/format';

interface LoggedResult {
  userId: string;
  order: string[];
  distance: number;
  points: number;
  perfect: boolean;
  newTotalScore: number;
}

interface LoggedReveal {
  roundIndex: number;
  prompt: string;
  category: string;
  unit: string;
  source: string;
  official: Array<{ label: string; value: number }>;
  results: LoggedResult[];
}

export default function RankingFileHistoryDetail({ gameLog, currentUserId, players }: HistoryDetailProps) {
  const { t } = useTranslation('ranking-file');
  const rounds = gameLog.actions
    .filter((a) => a.type === 'round_reveal')
    .map((a) => a.payload as unknown as LoggedReveal);

  return (
    <div className="space-y-6" data-testid="rf-history-detail">
      {rounds.map((round) => (
        <section
          key={round.roundIndex}
          aria-label={t('history-round', { defaultValue: 'Round {{num}}', num: round.roundIndex + 1 })}
        >
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <h4 className="text-sm font-semibold text-app-text">
              {t('history-round', { defaultValue: 'Round {{num}}', num: round.roundIndex + 1 })}
            </h4>
            <span className="text-xs text-app-text-muted">{round.category}</span>
          </div>
          <p className="mb-2 text-sm text-app-text-muted">{round.prompt}</p>

          <ol
            className="border-t border-app-border"
            aria-label={t('official-order', { defaultValue: 'The official order' })}
          >
            {round.official.map((item, index) => (
              <li key={item.label} className="flex items-center gap-3 border-b border-app-border py-1.5 text-sm">
                <span className="w-6 shrink-0 text-center font-mono text-app-text-muted tabular-nums">{index + 1}</span>
                <span className="flex-1 text-app-text">{item.label}</span>
                <span className="font-mono text-xs tabular-nums text-app-text-muted">
                  {formatRankingValue(item.value, round.unit)}
                </span>
              </li>
            ))}
          </ol>

          <ul className="mt-2">
            {round.results.map((r) => {
              const name = players.find((p) => p.userId === r.userId)?.userName ?? r.userId;
              return (
                <li
                  key={r.userId}
                  className={`flex items-center justify-between gap-3 py-1 text-xs ${
                    r.userId === currentUserId ? 'font-semibold text-app-text' : 'text-app-text-muted'
                  }`}
                >
                  <span className="truncate">
                    <bdi>{name}</bdi>
                    {r.perfect ? ` · ${t('perfect', { defaultValue: 'Perfect order' })}` : ''}
                  </span>
                  <span className="font-mono tabular-nums">
                    {t('distance-places', {
                      defaultValue_one: '{{count}} place off',
                      defaultValue: '{{count}} places off',
                      count: r.distance,
                    })}{' '}
                    · +{r.points}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-xs text-app-text-muted">
            {t('source-line', { defaultValue: 'Source: {{source}}', source: round.source })}
          </p>
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
                <span>
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
