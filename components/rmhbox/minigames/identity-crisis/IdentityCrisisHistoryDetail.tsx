/**
 * IdentityCrisisHistoryDetail — the expanded history view of an Identity Crisis
 * match: per player their identity, whether and when they guessed it, the
 * questions they asked and each question's counts. Who voted what is never
 * logged, so it is not here.
 */

import { useTranslation } from 'react-i18next';
import type { HistoryDetailProps } from '@/lib/rmhbox/history-display-registry';

interface LoggedQuestion {
  turnNumber: number;
  askerId: string;
  text: string;
}

interface LoggedResult {
  turnNumber: number;
  counts: { yes: number; no: number; maybe: number };
  plurality: 'yes' | 'no' | 'maybe' | 'split';
}

interface LoggedGuess {
  userId: string;
  kind: 'early' | 'final';
  correct: boolean;
  turnNumber: number;
  points: number;
}

interface LoggedReveal {
  userId: string;
  identity: string;
  category: string;
  outcome: 'early' | 'final' | 'missed';
}

export default function IdentityCrisisHistoryDetail({ gameLog, currentUserId, players }: HistoryDetailProps) {
  const { t } = useTranslation('identity-crisis');

  const payloads = <T,>(type: string): T[] =>
    gameLog.actions.filter((a) => a.type === type).map((a) => a.payload as unknown as T);
  const questions = payloads<LoggedQuestion>('question_asked');
  const results = payloads<LoggedResult>('vote_result');
  const guesses = payloads<LoggedGuess>('guess');
  const reveals = payloads<LoggedReveal>('identity_reveal');

  const answerWord = (p: LoggedResult['plurality']): string =>
    p === 'yes'
      ? t('plurality-yes', { defaultValue: 'Yes' })
      : p === 'no'
        ? t('plurality-no', { defaultValue: 'No' })
        : p === 'maybe'
          ? t('plurality-maybe', { defaultValue: 'Maybe' })
          : t('plurality-split', { defaultValue: 'Split' });

  return (
    <div className="space-y-6" data-testid="ic-history-detail">
      {[...players]
        .sort((a, b) => a.rank - b.rank)
        .map((player) => {
          const reveal = reveals.find((r) => r.userId === player.userId);
          const right = guesses.find((g) => g.userId === player.userId && g.correct);
          const asked = questions.filter((q) => q.askerId === player.userId);
          return (
            <section key={player.userId} aria-label={player.userName}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <h4 className="text-sm font-semibold text-app-text" dir="auto">
                  #{player.rank} <bdi>{player.userName}</bdi>
                  {player.userId === currentUserId ? ` · ${t('history-you', { defaultValue: 'You' })}` : ''}
                </h4>
                <span className="font-mono text-xs tabular-nums text-app-text-muted">{player.score}</span>
              </div>
              <p className="text-sm text-app-text-muted">
                {reveal ? t('history-identity', { defaultValue: 'Was {{identity}}', identity: reveal.identity }) : ''}
                {' · '}
                {right
                  ? right.kind === 'early'
                    ? t('history-early', { defaultValue: 'guessed it on turn {{turn}}', turn: right.turnNumber })
                    : t('history-final', { defaultValue: 'guessed it at the end' })
                  : t('history-missed', { defaultValue: 'did not guess it' })}
              </p>
              <ul className="mt-1 border-t border-app-border">
                {asked.length === 0 && (
                  <li className="border-b border-app-border py-1.5 text-xs text-app-text-muted">
                    {t('history-no-questions', { defaultValue: 'No questions asked' })}
                  </li>
                )}
                {asked.map((q) => {
                  const result = results.find((r) => r.turnNumber === q.turnNumber);
                  return (
                    <li
                      key={q.turnNumber}
                      className="flex items-start justify-between gap-3 border-b border-app-border py-1.5 text-xs text-app-text"
                    >
                      <span className="min-w-0 flex-1" dir="auto">
                        {q.text}
                      </span>
                      {result && (
                        <span className="shrink-0 font-mono tabular-nums text-app-text-muted">
                          {answerWord(result.plurality)} {result.counts.yes}-{result.counts.no}-{result.counts.maybe}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
    </div>
  );
}
