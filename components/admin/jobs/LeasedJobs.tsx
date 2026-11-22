import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { LeasedKindSummary } from '@/lib/admin/jobs';

function Figure({ label, n, danger }: { label: string; n: number; danger?: boolean }) {
  return (
    <span className={cn(danger && n > 0 && 'text-site-danger')}>
      {label} {n}
    </span>
  );
}

/**
 * The three leased job kinds, one row each on a rule: running, waiting for a worker (re-queued and not yet
 * claimed) and failed in the last seven days (s09-13).
 */
export function LeasedJobs({ leased }: { leased: LeasedKindSummary[] }) {
  const { t } = useTranslation('durable-reclaims');
  return (
    <section aria-label={t('leased-heading', { defaultValue: 'Runs that wait for a worker' })}>
      <h2 className="t-label border-b border-site-border pb-2">
        {t('leased-heading', { defaultValue: 'Runs that wait for a worker' })}
      </h2>
      <ul>
        {leased.map((row) => (
          <li key={row.kind} className="t-meta flex flex-wrap items-center gap-x-4 border-b border-site-border py-2">
            <span className="t-body font-medium text-site-text">
              {row.kind === 'bulk'
                ? t('leased-bulk', { defaultValue: 'Bulk clean-ups' })
                : row.kind === 'fanout'
                  ? t('leased-fanout', { defaultValue: 'Fan-outs' })
                  : t('leased-sweep', { defaultValue: 'Spam sweeps' })}
            </span>
            <Figure label={t('leased-running', { defaultValue: 'Running' })} n={row.running} />
            <Figure label={t('leased-waiting', { defaultValue: 'Waiting for a worker' })} n={row.waiting} />
            <Figure label={t('leased-failed', { defaultValue: 'Failed in 7 days' })} n={row.failedLast7Days} danger />
          </li>
        ))}
      </ul>
    </section>
  );
}
