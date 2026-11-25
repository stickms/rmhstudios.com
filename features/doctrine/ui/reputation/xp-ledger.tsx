/**
 * "Where your XP came from" (sprint 14 05): the last 30 days by action, then every change newest first, each in
 * words. The stored `reason` is English and is never shown; a row is translated from its `action` through the
 * literal keys below (a literal key per `XP_ACTIONS` key, the weekly decay, and "Other" for anything retired).
 */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { cn } from '@/lib/utils';
import { labelKeyFor } from '@features/doctrine/engine/ledger';
import { useDoctrineLedger } from '@features/doctrine/ui/hooks/useDoctrineLedger';

type T = (key: string, options: { defaultValue: string }) => string;

/** The literal `t()` call of each label key in `ACTION_LABEL_KEYS`; `ledger.product.test.ts` holds the two in step. */
function actionLabel(t: T, action: string): string {
  switch (labelKeyFor(action)) {
    case 'action-puzzle-solve':
      return t('action-puzzle-solve', { defaultValue: 'Puzzle solved' });
    case 'action-puzzle-solve-streak-bonus':
      return t('action-puzzle-solve-streak-bonus', { defaultValue: 'Streak bonus' });
    case 'action-puzzle-top-10-percent':
      return t('action-puzzle-top-10-percent', { defaultValue: 'Top 10 percent finish' });
    case 'action-puzzle-first-solve':
      return t('action-puzzle-first-solve', { defaultValue: 'First solve of the day' });
    case 'action-puzzle-replay-solve':
      return t('action-puzzle-replay-solve', { defaultValue: 'Replay solved' });
    case 'action-safehouse-post-reaction':
      return t('action-safehouse-post-reaction', { defaultValue: 'Reacted in the Safehouse' });
    case 'action-safehouse-comment':
      return t('action-safehouse-comment', { defaultValue: 'Commented in the Safehouse' });
    case 'action-disclosure-early-view':
      return t('action-disclosure-early-view', { defaultValue: 'Early disclosure view' });
    case 'action-recruit-signup':
      return t('action-recruit-signup', { defaultValue: 'Recruit signed up' });
    case 'action-recruit-convert-to-paid':
      return t('action-recruit-convert-to-paid', { defaultValue: 'Recruit became a member' });
    case 'action-incident-first-report':
      return t('action-incident-first-report', { defaultValue: 'First incident report' });
    case 'action-incident-reaction':
      return t('action-incident-reaction', { defaultValue: 'Reacted to an incident' });
    case 'action-sahur-participation':
      return t('action-sahur-participation', { defaultValue: 'Sahur participation' });
    case 'action-sahur-challenge-complete':
      return t('action-sahur-challenge-complete', { defaultValue: 'Sahur challenge completed' });
    case 'action-nightfall-achievement':
      return t('action-nightfall-achievement', { defaultValue: 'Nightfall achievement' });
    case 'action-stoa-space-created':
      return t('action-stoa-space-created', { defaultValue: 'Created a Stoa space' });
    case 'action-weekly-decay':
      return t('action-weekly-decay', { defaultValue: 'Weekly inactivity decay' });
    default:
      return t('action-other', { defaultValue: 'Other' });
  }
}

const RULE = { borderColor: 'rgba(255,255,255,0.06)' } as const;

function signed(n: number, format: (n: number) => string): string {
  return n > 0 ? `+${format(n)}` : format(n);
}

export function XpLedger() {
  const { t } = useTranslation('doctrine-ledger');
  const fmt = useLocaleFormat();
  const query = useDoctrineLedger();
  const arrival = useArrival(!query.isLoading);

  if (query.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-10 animate-pulse" style={{ background: 'var(--doctrine-bg-secondary)' }} />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        title={t('error-title', { defaultValue: 'Could not load your XP breakdown' })}
        action={<Button onClick={() => void query.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>}
      />
    );
  }

  const pages = query.data?.pages ?? [];
  const summary = pages[0]?.summary ?? null;
  const rows = pages.flatMap((p) => p.rows);

  if (rows.length === 0) {
    return (
      <EmptyState
        title={t('empty-title', { defaultValue: 'No XP yet' })}
        description={t('empty-body', {
          defaultValue: 'Solve a puzzle and each change to your XP will be listed here.',
        })}
      />
    );
  }

  return (
    <div className={cn('space-y-8', arrival)}>
      {summary ? (
        <section aria-labelledby="xp-summary-heading" className="space-y-3">
          <h2 id="xp-summary-heading" className="text-sm font-semibold text-white/80">
            {t('summary-heading', { defaultValue: 'Last 30 days' })}
          </h2>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-white/50">{t('gained', { defaultValue: 'Gained' })}</dt>
              <dd className="font-mono text-base tabular-nums" style={{ color: 'var(--doctrine-accent)' }}>
                {signed(summary.gained, fmt.number)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-white/50">{t('lost', { defaultValue: 'Lost' })}</dt>
              <dd className="font-mono text-base tabular-nums text-white/80">
                {summary.lost > 0 ? `-${fmt.number(summary.lost)}` : fmt.number(0)}
              </dd>
            </div>
          </dl>
          {summary.byAction.length > 0 ? (
            <ul>
              {summary.byAction.map((a) => (
                <li
                  key={a.action}
                  className="flex min-h-11 items-center justify-between gap-3 border-b text-sm md:min-h-9"
                  style={RULE}
                >
                  <span className="text-white/80">{actionLabel(t, a.action)}</span>
                  <span className="font-mono tabular-nums text-white/60">{signed(a.xp, fmt.number)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="xp-history-heading" className="space-y-3">
        <h2 id="xp-history-heading" className="text-sm font-semibold text-white/80">
          {t('history-heading', { defaultValue: 'Every change' })}
        </h2>
        <ul>
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex min-h-11 items-center justify-between gap-3 border-b text-sm md:min-h-9"
              style={RULE}
            >
              <div className="min-w-0">
                <p className="truncate text-white/80">{actionLabel(t, row.action)}</p>
                <p className="font-mono text-xs text-white/50">{fmt.date(row.at, { dateStyle: 'medium' })}</p>
              </div>
              <span
                className="font-mono tabular-nums"
                style={{ color: row.xpDelta > 0 ? 'var(--doctrine-accent)' : undefined }}
              >
                {signed(row.xpDelta, fmt.number)}
              </span>
            </li>
          ))}
        </ul>
        {query.hasNextPage ? (
          <Button disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {t('load-more', { defaultValue: 'Show more' })}
          </Button>
        ) : null}
      </section>
    </div>
  );
}
