/**
 * RoundReveal — the official order of a round, with each item's value and
 * unit, and how every player did.
 */

import { useTranslation } from 'react-i18next';
import { formatRankingValue } from '@/lib/rmhbox/ranking-file/format';
import type { RFRevealPayload } from './reveal-types';

interface RoundRevealProps {
  reveal: RFRevealPayload;
  myPlayerId: string;
  /** The reader's own order at the end of the round, when they played it. */
  myOrder: readonly string[] | null;
}

export default function RoundReveal({ reveal, myPlayerId, myOrder }: RoundRevealProps) {
  const { t } = useTranslation('ranking-file');
  const mine = reveal.results.find((r) => r.userId === myPlayerId) ?? null;
  const order = mine?.order ?? myOrder ?? null;

  return (
    <div className="flex w-full flex-col gap-5" data-testid="rf-reveal">
      <div>
        <h3 className="text-base font-semibold text-app-text">
          {t('official-order', { defaultValue: 'The official order' })}
        </h3>
        <p className="text-sm text-app-text-muted">{reveal.prompt}</p>
      </div>

      <ol
        aria-label={t('official-order', { defaultValue: 'The official order' })}
        className="border-t border-app-border"
      >
        {reveal.official.map((item, index) => {
          const yourPlace = order ? order.indexOf(item.label) : -1;
          const off = yourPlace >= 0 ? Math.abs(yourPlace - index) : null;
          return (
            <li key={item.label} className="flex items-center gap-3 border-b border-app-border py-2">
              <span className="w-6 shrink-0 text-center font-mono text-sm text-app-text-muted tabular-nums">
                {index + 1}
              </span>
              <span className="flex-1 text-base font-medium text-app-text">{item.label}</span>
              <span className="font-mono text-sm tabular-nums text-app-text-muted">
                {formatRankingValue(item.value, item.unit)}
              </span>
              {off !== null && (
                <span className={`w-20 text-end text-xs ${off === 0 ? 'text-app-success' : 'text-app-text-muted'}`}>
                  {off === 0
                    ? t('place-right', { defaultValue: 'Right place' })
                    : t('place-off', { defaultValue: '{{count}} off', count: off })}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div>
        <h3 className="mb-1 text-base font-semibold text-app-text">
          {t('round-results', { defaultValue: 'This round' })}
        </h3>
        <ul className="border-t border-app-border">
          {reveal.results.map((r) => (
            <li
              key={r.userId}
              className={`flex items-center gap-3 border-b border-app-border py-2 ${r.userId === myPlayerId ? 'font-semibold' : ''}`}
            >
              <span className="flex-1 truncate text-sm text-app-text">
                <bdi>{r.userName}</bdi>
                {r.perfect && (
                  <span className="ms-2 text-xs text-app-success">
                    {t('perfect', { defaultValue: 'Perfect order' })}
                  </span>
                )}
              </span>
              <span className="text-xs text-app-text-muted">
                {t('distance-places', {
                  defaultValue_one: '{{count}} place off',
                  defaultValue: '{{count}} places off',
                  count: r.distance,
                })}
              </span>
              <span className="w-16 text-end font-mono text-sm tabular-nums text-app-text">+{r.points}</span>
              <span className="w-16 text-end font-mono text-sm tabular-nums text-app-text-muted">
                {r.newTotalScore}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-app-text-muted">
          {t('source-line', { defaultValue: 'Source: {{source}}', source: reveal.source })}
        </p>
      </div>
    </div>
  );
}
