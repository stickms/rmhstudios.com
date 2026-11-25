/**
 * RoundResult — a finished round of Sequence Sam: the whole sequence, now that
 * it is over, and how every player did.
 */

import { useTranslation } from 'react-i18next';
import { padName } from './pad-names';

export interface SSResultPayload {
  roundIndex: number;
  length: number;
  sequence: number[];
  results: Array<{
    userId: string;
    userName: string;
    correctSteps: number;
    completed: boolean;
    points: number;
    bonus: number;
    out: boolean;
    newTotalScore: number;
  }>;
}

interface RoundResultProps {
  result: SSResultPayload;
  myPlayerId: string;
}

export default function RoundResult({ result, myPlayerId }: RoundResultProps) {
  const { t } = useTranslation('sequence-sam');

  return (
    <div className="flex w-full flex-col gap-4" data-testid="ss-result">
      <div>
        <h3 className="text-base font-semibold text-app-text">
          {t('result-title', { defaultValue: 'Round {{num}} result', num: result.roundIndex + 1 })}
        </h3>
        <p className="text-sm text-app-text-muted">
          {t('result-sequence', {
            defaultValue: 'The sequence: {{steps}}',
            steps: result.sequence.map((pad) => padName(t, pad)).join(', '),
          })}
        </p>
      </div>

      <ul className="border-t border-app-border" aria-label={t('result-players', { defaultValue: 'Player results' })}>
        {result.results.map((r) => (
          <li
            key={r.userId}
            className={`flex items-center justify-between gap-3 border-b border-app-border py-2 text-sm ${
              r.userId === myPlayerId ? 'font-semibold text-app-text' : 'text-app-text'
            }`}
          >
            <span className="min-w-0 flex-1 truncate" dir="auto">
              <bdi>{r.userName}</bdi>
              {r.out ? ` · ${t('result-out', { defaultValue: 'Out' })}` : ''}
            </span>
            <span className="font-mono text-xs tabular-nums text-app-text-muted">
              {t('result-steps', {
                defaultValue: '{{correct}} of {{length}} steps',
                correct: r.correctSteps,
                length: result.length,
              })}
            </span>
            <span className="w-16 text-end font-mono tabular-nums">+{r.points}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
